// The chargeback path (REQ-SPEC-24.7; §14.6 failure states). A `charge.dispute.created` event drives
// `applyChargeback`: the account is suspended (new holds refuse — `SqlHoldLedger.hold` guards), the disputed
// amount's credits are clawed back from `available` (any already-spent remainder becomes `clawback_debt`),
// the account's queued/parked runs are cancelled with their holds released, and in-flight runs are marked
// `delivery_withheld_at` so a finished phase's delivery is withheld until the balance is non-negative.
//
// A `charge.dispute.closed` with `status: "won"` drives `applyDisputeWon`: the clawed credits are re-granted,
// the debt cleared, the suspension lifted, and the withheld run ids returned so the caller re-drives their
// stashed deliveries (the `run.deliver` job — the pod's original POST was refused).
//
// Both are idempotent on the Stripe dispute id (`stripe:dispute:<id>:*` keys / `stripe_ref` rows), so a
// replayed webhook is a no-op.

import { applyTransition, type EventWriter, type RunState, type SqlClient } from "@rhema/orchestrator";
import type { HoldLedger } from "@rhema/orchestrator";
import { applyLedgerEntry, type EntryDeps } from "./entries.js";
import type { HoldBucket } from "./buckets.js";

/** Deps the chargeback path needs — a `runTx` per workspace + the ledger's `release` + event appends. */
export interface ChargebackDeps extends EntryDeps {
  readonly ledger: Pick<HoldLedger, "release">;
  /** Open one tenant-scoped transaction for a workspace (the orchestrator's `TxRunner.run`). */
  readonly runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
  /** The orchestrator's event writer — `run.state_changed` rows ride the transitions (REQ-DATA-33). */
  readonly eventWriter: EventWriter;
}

/** The states a chargeback cancels outright (queued + parked; §14.6 "queued/parked runs cancelled with release"). */
const CANCEL_STATES: readonly RunState[] = ["queued", "awaiting_consent", "waiting_gate"];
/** In-flight states whose delivery is withheld (the phase's COGS is already incurred — it may finish). */
const WITHHOLD_STATES: readonly RunState[] = ["provisioning", "running", "cancelling", "orphaned", "finalizing"];

/** Buckets are clawed back newest-money-first: the purchased top-up, then promo, then included. */
const CLAWBACK_ORDER: readonly HoldBucket[] = ["topup", "promo", "included", "trial_pocket", "daily"];

export interface ChargebackArgs {
  readonly billingAccountId: string;
  /** the Stripe dispute id — the idempotency anchor and the `stripe_ref` on the clawback rows. */
  readonly disputeId: string;
  /** the disputed amount in credits (amount_cents at the 1¢ = 1 credit peg). */
  readonly credits: number;
}

export interface ChargebackResult {
  readonly suspended: boolean;
  /** credits actually removed from `available` (clamped per bucket — never below zero). */
  readonly clawed: number;
  /** the un-clawable remainder (already spent) now owed before the account can be reinstated. */
  readonly debt: number;
  /** runs cancelled with release (queued/parked). */
  readonly cancelled: readonly string[];
  /** in-flight runs whose delivery is withheld. */
  readonly withheld: readonly string[];
}

/**
 * Suspend + claw back + cancel queued/parked (release) + withhold in-flight deliveries. The account-level
 * effects (suspend, clawback rows, debt) commit in the account's first workspace's transaction; each run's
 * cancel+release commits in ITS workspace's transaction (the run row is tenant-keyed).
 */
export async function applyChargeback(
  exec: SqlClient,
  deps: ChargebackDeps,
  args: ChargebackArgs,
): Promise<ChargebackResult> {
  const workspaces = (
    await exec.query("select id from workspaces where billing_account_id = $1 order by created_at, id", [
      args.billingAccountId,
    ])
  ).rows.map((r) => (r as { id: string }).id);
  if (workspaces.length === 0) throw new Error(`chargeback: no workspace for ${args.billingAccountId}`);
  const home = workspaces[0]!;

  // ---- account-level: suspend + claw back, one transaction in the home workspace ------------------------
  let clawed = 0;
  let debt = 0;
  let suspended = false;
  await deps.runTx(home, async (tx) => {
    const prior = (
      await tx.query("select suspended_at, clawback_debt::int as debt from billing_accounts where id = $1 for update", [
        args.billingAccountId,
      ])
    ).rows[0] as { suspended_at: string | null; debt: number } | undefined;
    if (!prior) throw new Error(`chargeback: unknown billing account ${args.billingAccountId}`);
    suspended = true;
    debt = Number(prior.debt);
    if (!prior.suspended_at) {
      await tx.query("update billing_accounts set suspended_at = $2 where id = $1", [
        args.billingAccountId,
        deps.clock.now(),
      ]);
    }

    // Whole-dispute idempotency (a replayed `charge.dispute.created` is a no-op): the clawback rows' shared
    // key prefix is the marker — replay ⇒ suspend stays, but balances and the debt are never re-touched.
    const applied = (
      await tx.query("select 1 from credit_ledger where idempotency_key like $1 limit 1", [
        `stripe:dispute:${args.disputeId}:claw:%`,
      ])
    ).rows[0];
    if (applied) return;

    let remaining = Math.max(0, Math.trunc(args.credits));
    for (const bucket of CLAWBACK_ORDER) {
      if (remaining <= 0) break;
      const row = (
        await tx.query(
          "select available::int as a from credit_balances where billing_account_id = $1 and bucket = $2",
          [args.billingAccountId, bucket],
        )
      ).rows[0] as { a: number } | undefined;
      const take = Math.min(remaining, Number(row?.a ?? 0));
      if (take <= 0) continue;
      // an `expire` row IS the clawback (unspent credits leave `available`), stamped with the dispute id on
      // `stripe_ref` so `applyDisputeWon` can sum exactly what was taken.
      const res = await applyLedgerEntry(tx, deps, {
        workspaceId: home,
        billingAccountId: args.billingAccountId,
        kind: "expire",
        credits: take,
        bucket,
        source: "stripe",
        reason: "chargeback_clawback",
        stripeRef: args.disputeId,
        idempotencyKey: `stripe:dispute:${args.disputeId}:claw:${bucket}`,
      });
      const removed = res.applied ? take : 0; // a replayed dispute id never re-claws
      clawed += removed;
      remaining -= removed;
    }
    debt = Number(prior.debt) + remaining;
    if (remaining > 0) {
      // the already-spent remainder is owed before reinstatement — `clawback_debt` (never a negative
      // `available`, which `check(available >= 0)` forbids).
      await tx.query("update billing_accounts set clawback_debt = clawback_debt + $2 where id = $1", [
        args.billingAccountId,
        remaining,
      ]);
    }
  });

  // ---- cancel queued/parked runs with release; withhold in-flight deliveries ----------------------------
  const runRows = (
    await exec.query(
      `select r.id, r.workspace_id, r.state, r.hold_ledger_id
         from runs r join workspaces w on w.id = r.workspace_id
        where w.billing_account_id = $1 and r.state = any($2)`,
      [args.billingAccountId, [...CANCEL_STATES, ...WITHHOLD_STATES]],
    )
  ).rows as { id: string; workspace_id: string; state: RunState; hold_ledger_id: string | null }[];

  const cancelled: string[] = [];
  const withheld: string[] = [];
  // group by workspace so each run's cancel commits in its own tenant tx
  for (const ws of workspaces) {
    const wsRuns = runRows.filter((r) => r.workspace_id === ws);
    if (wsRuns.length === 0) continue;
    await deps.runTx(ws, async (tx) => {
      for (const r of wsRuns) {
        const current = (
          await tx.query("select state from runs where id = $1 for update", [r.id])
        ).rows[0] as { state: RunState } | undefined;
        if (!current) continue;
        if ((CANCEL_STATES as readonly string[]).includes(current.state)) {
          await applyTransition(
            tx,
            { eventWriter: deps.eventWriter, clock: deps.clock },
            { runId: r.id, from: current.state, to: "cancelled", reason: "chargeback" },
          );
          if (r.hold_ledger_id) {
            await deps.ledger.release(tx, {
              billingAccountId: args.billingAccountId,
              workspaceId: ws,
              runId: r.id,
              holdLedgerId: r.hold_ledger_id,
              idempotencyKey: `release:${r.id}`,
            });
          }
          cancelled.push(r.id);
        } else if ((WITHHOLD_STATES as readonly string[]).includes(current.state)) {
          await tx.query("update runs set delivery_withheld_at = $2 where id = $1 and delivery_withheld_at is null", [
            r.id,
            deps.clock.now(),
          ]);
          withheld.push(r.id);
        }
      }
    });
  }

  return { suspended, clawed, debt, cancelled, withheld };
}

export interface DisputeWonResult {
  /** the credits re-granted (what the clawback had actually removed). */
  readonly restored: number;
  readonly reinstated: boolean;
  /** runs whose delivery was withheld — the caller re-drives each (`run.deliver`). */
  readonly withheldRuns: readonly string[];
}

/**
 * `charge.dispute.closed` won: re-grant the clawed credits (an ordinary `grant` row — the platform has its
 * money back), clear the debt + suspension, and hand back the withheld runs for the delivery re-drive.
 */
export async function applyDisputeWon(
  exec: SqlClient,
  deps: ChargebackDeps,
  args: { billingAccountId: string; disputeId: string },
): Promise<DisputeWonResult> {
  const workspaces = (
    await exec.query("select id from workspaces where billing_account_id = $1 order by created_at, id", [
      args.billingAccountId,
    ])
  ).rows.map((r) => (r as { id: string }).id);
  if (workspaces.length === 0) return { restored: 0, reinstated: false, withheldRuns: [] };
  const home = workspaces[0]!;

  const clawed = Number(
    (
      (
        await exec.query(
          "select coalesce(sum(credits),0)::int as s from credit_ledger where stripe_ref = $1 and reason = 'chargeback_clawback'",
          [args.disputeId],
        )
      ).rows[0] as { s: number }
    ).s,
  );

  let restored = 0;
  let withheldRuns: string[] = [];
  await deps.runTx(home, async (tx) => {
    if (clawed > 0) {
      const res = await applyLedgerEntry(tx, deps, {
        workspaceId: home,
        billingAccountId: args.billingAccountId,
        kind: "grant",
        credits: clawed,
        bucket: "topup",
        source: "stripe",
        reason: "chargeback_reversed",
        stripeRef: `${args.disputeId}:won`,
        idempotencyKey: `stripe:dispute:${args.disputeId}:won`,
      });
      restored = res.applied ? clawed : 0;
    }
    await tx.query("update billing_accounts set suspended_at = null, clawback_debt = 0 where id = $1", [
      args.billingAccountId,
    ]);
    withheldRuns = (
      await tx.query(
        `update runs set delivery_withheld_at = null
          where delivery_withheld_at is not null
            and workspace_id in (select id from workspaces where billing_account_id = $1)
          returning id`,
        [args.billingAccountId],
      )
    ).rows.map((r) => (r as { id: string }).id);
  });
  return { restored, reinstated: true, withheldRuns };
}
