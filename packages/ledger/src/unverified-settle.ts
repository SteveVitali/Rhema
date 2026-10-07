// RES.2 (REQ-SPEC-31(3); ADR-024) — the platform-fault settlement for an Unverified delivery. `deliverRun`
// persists the write-once `runs.delivery` label atomically with `finalizing → completed`; THIS settles the
// money + the page AFTER that commit, in its own tenant transaction, so a settlement failure can never roll
// back a delivered dossier. The delivery blob's markers make every leg idempotent:
//
//   1. `refundPhases` over the manifest's research-class phase keys → `platform_fault:zero_coverage` rows
//      (never re-debited on resume — resume.ts excludes the class).
//   2. `absorbMeteredGap` — the metered research burn the user did not pay books as platform COGS.
//   3. The consumed trial entitlement restores to `unused` EXACTLY ONCE (consumed_by_run_id guard +
//      `trial_restorations` unique row), so the trial Review is claimable again.
//   4. `cost.refunded` emits for the refunded total; `delivery.platformFaultSettledAt` marks the money done.
//   5. The ops page sends AFTER commit and `delivery.alerted` marks only on sink success — send-then-mark,
//      retried by the stranded sweep's leg E while either marker is unset. IDs + counts only (invariant 10).

import {
  PLATFORM_FAULT_ZERO_COVERAGE,
  deliveryLabelFromRow,
} from "@rhema/contracts";
import type {
  EventWriter,
  HoldLedger,
  TxRunner,
  UnverifiedSettleArgs,
} from "@rhema/orchestrator";
import { absorbMeteredGap } from "@rhema/orchestrator";
import type { EntryDeps } from "./entries.js";
import { refundPhases } from "./resume.js";

export interface UnverifiedSettleDeps extends EntryDeps {
  readonly txRunner: TxRunner;
  readonly ledger: HoldLedger;
  readonly eventWriter: EventWriter;
  /** the ops page sink (worker: pgboss `ops.alert`; api/tests: a recording stub). */
  alert?(a: unknown): void | Promise<void>;
}

export interface UnverifiedSettleResult {
  /** false when the run is not (or no longer) labelled Unverified — a replay-safe no-op. */
  readonly settled: boolean;
  readonly refundedCredits: number;
  readonly trialRestored: boolean;
  readonly alerted: boolean;
}

/**
 * Settle one Unverified run. Called by `deliverRun` post-commit (best-effort) and by the stranded sweep's
 * leg E (the durable retry). Every write is guarded so a replay is a strict no-op: refund rows dedupe on
 * their idempotency keys, the entitlement restore keys on `consumed_by_run_id`, and the markers land once.
 */
export async function settleUnverifiedDelivery(
  deps: UnverifiedSettleDeps,
  args: UnverifiedSettleArgs,
): Promise<UnverifiedSettleResult> {
  const none: UnverifiedSettleResult = { settled: false, refundedCredits: 0, trialRestored: false, alerted: false };

  // ---- TX1: the money + audit legs, guarded by the persisted label. ----
  const money = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const run = (
      await tx.query(
        `select id, delivery, entitlement_id, workspace_id
           from runs where id = $1 for update`,
        [args.runId],
      )
    ).rows[0] as
      | { id: string; delivery: unknown; entitlement_id: string | null; workspace_id: string }
      | undefined;
    if (!run || deliveryLabelFromRow(run.delivery) !== "unverified") return none;
    const delivery = (typeof run.delivery === "string"
      ? (JSON.parse(run.delivery) as Record<string, unknown>)
      : run.delivery) as Record<string, unknown>;
    if (delivery.platformFaultSettledAt != null) {
      // the money legs already committed once — replay nothing; the alert arm below still runs.
      return { ...none, settled: true, refundedCredits: Number(delivery.refundedCredits ?? 0), trialRestored: delivery.trialRestoredAt != null };
    }

    // the committed research-class step rows are what `credit_ledger.phase_id` references (the debit
    // writes `phaseId: stepId` at commitStep) — resolve the manifest keys to this run's step ids.
    const stepIds = (
      await tx.query(
        `select id from steps where run_id = $1 and phase = any($2::text[]) and state = 'done'`,
        [args.runId, [...args.phaseKeys]],
      )
    ).rows.map((r) => (r as { id: string }).id);

    const refunds = await refundPhases(tx, deps, {
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      runId: args.runId,
      phaseIds: stepIds,
      // one refund episode per run — a replay dedupes against it (per-phase per-bucket keys inside).
      idempotencyKey: `platform-fault:${args.runId}`,
      reason: PLATFORM_FAULT_ZERO_COVERAGE,
    });
    const refundedCredits = refunds.reduce((a, r) => a + r.credits, 0);

    // the metered burn the refund returned to the user books as absorbed platform COGS (REQ-SPEC-24.8).
    await absorbMeteredGap(tx, deps, {
      runId: args.runId,
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
    });

    // trial restore — exactly once: the conditional update can only fire while THIS run still holds the
    // entitlement consumed; `trial_restorations` (unique on entitlement+run) is the durable audit.
    let trialRestoredAt: string | null = null;
    if (run.entitlement_id != null) {
      const restored = await tx.query(
        `update trial_entitlements
            set state = 'unused', consumed_by_run_id = null, consumed_at = null
          where id = $1 and consumed_by_run_id = $2 and state = 'consumed'
          returning id`,
        [run.entitlement_id, args.runId],
      );
      if (restored.rows.length > 0) {
        const now = deps.clock.now();
        trialRestoredAt = now.toISOString();
        await tx.query(
          `insert into trial_restorations (id, entitlement_id, run_id, workspace_id, billing_account_id, restored_at)
             values ($1,$2,$3,$4,$5,$6)
             on conflict (entitlement_id, run_id) do nothing`,
          [deps.ids("tres"), run.entitlement_id, args.runId, args.workspaceId, args.billingAccountId, now],
        );
        // the account's trial machine returns to claimable while the window is still open.
        await tx.query(
          `update billing_accounts set trial_state = 'trial_active' where id = $1 and trial_state = 'trial_used'`,
          [args.billingAccountId],
        );
      }
    }

    if (refundedCredits > 0) {
      await deps.eventWriter.append(tx, {
        runId: args.runId,
        type: "cost.refunded",
        payload: { credits: refundedCredits, reason: "zero_coverage" },
        at: deps.clock.now(),
      });
    }

    // persist the settlement markers into the write-once blob (jsonb merge — the label + counts stay).
    await tx.query(
      `update runs
          set delivery = delivery || $2::jsonb
        where id = $1 and delivery ->> 'label' = 'unverified'`,
      [
        args.runId,
        JSON.stringify({
          platformFaultSettledAt: deps.clock.now().toISOString(),
          refundedCredits,
          ...(trialRestoredAt ? { trialRestoredAt } : {}),
        }),
      ],
    );
    return { settled: true, refundedCredits, trialRestored: trialRestoredAt != null, alerted: false };
  });
  if (!money.settled) return none;

  // ---- post-commit: page the ops sink, THEN mark (send-then-mark; leg E retries while unmarked). ----
  const alreadyAlerted = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const r = (
      await tx.query(`select delivery ->> 'alerted' as alerted from runs where id = $1`, [args.runId])
    ).rows[0] as { alerted: string | null } | undefined;
    return r?.alerted != null;
  });
  // An UNBOUND sink never marks `alerted` — leg E on a bound deploy (the worker) pages it next pass.
  // A throwing sink propagates: the marker stays unset and the sweep retries — exactly one page.
  if (!alreadyAlerted && deps.alert) {
    await deps.alert({
      kind: "unverified_delivery",
      runId: args.runId,
      workspaceId: args.workspaceId,
      checkableClaims: args.checkableClaims,
      coveredClaims: args.coveredClaims,
      refundedCredits: money.refundedCredits,
    });
    await deps.txRunner.run(args.workspaceId, (tx) =>
      tx.query(
        `update runs set delivery = jsonb_set(delivery, '{alerted}', 'true'::jsonb)
          where id = $1 and delivery ->> 'label' = 'unverified'`,
        [args.runId],
      ),
    );
  }
  return { ...money, alerted: alreadyAlerted || deps.alert != null };
}
