// The nightly balances = sum-of-ledger assertion (REQ-SPEC-24.1; review 13 F25). credit_balances is a TABLE
// maintained in each ledger transaction, not a materialized view -- so a bug that writes a balance without a
// ledger row (or vice versa) would silently corrupt the money. This job rebuilds every account's per-bucket
// balance by folding balanceEffect over its ledger rows (the SAME function the write path uses) and compares
// it to the maintained table; any mismatch is a divergence to page on. Deterministic and read-only.

import type { SqlClient } from "@rhema/orchestrator";
import { balanceEffect, type LedgerKind } from "./balance-effect.js";
import type { EntryDeps } from "./entries.js";

export interface BalanceDivergence {
  readonly billingAccountId: string;
  readonly bucket: string;
  readonly expectedAvailable: number;
  readonly actualAvailable: number;
  readonly expectedHeld: number;
  readonly actualHeld: number;
}

export interface AssertionResult {
  readonly ok: boolean;
  readonly divergences: readonly BalanceDivergence[];
  readonly accountsChecked: number;
}

interface Acc {
  available: number;
  held: number;
}

/**
 * Rebuild balances from the ledger and diff against credit_balances. Pass billingAccountId to check one
 * account (the hot path after a suspicious run); omit it for the whole-fleet nightly sweep.
 */
export async function assertBalances(
  exec: SqlClient,
  opts: { billingAccountId?: string } = {},
): Promise<AssertionResult> {
  const filter = opts.billingAccountId ? " where billing_account_id = $1" : "";
  const params = opts.billingAccountId ? [opts.billingAccountId] : [];

  const ledgerRows = (
    await exec.query(`select billing_account_id, bucket, kind, credits from credit_ledger${filter}`, params)
  ).rows as { billing_account_id: string; bucket: string; kind: LedgerKind; credits: number | string }[];

  // Rebuild per (account, bucket). The key delimiter "#" never appears in an account id or a bucket name.
  const expected = new Map<string, Acc>();
  const key = (account: string, bucket: string): string => `${account}#${bucket}`;
  const accounts = new Set<string>();
  for (const r of ledgerRows) {
    accounts.add(r.billing_account_id);
    const { availableDelta, heldDelta } = balanceEffect(r.kind, Number(r.credits));
    const k = key(r.billing_account_id, r.bucket);
    const cur = expected.get(k) ?? { available: 0, held: 0 };
    cur.available += availableDelta;
    cur.held += heldDelta;
    expected.set(k, cur);
  }

  const balanceRows = (
    await exec.query(
      `select billing_account_id, bucket, available::int as available, held::int as held from credit_balances${filter}`,
      params,
    )
  ).rows as { billing_account_id: string; bucket: string; available: number; held: number }[];

  const actual = new Map<string, Acc>();
  for (const r of balanceRows) {
    accounts.add(r.billing_account_id);
    actual.set(key(r.billing_account_id, r.bucket), { available: Number(r.available), held: Number(r.held) });
  }

  const divergences: BalanceDivergence[] = [];
  for (const k of new Set([...expected.keys(), ...actual.keys()])) {
    const hash = k.indexOf("#");
    const billingAccountId = k.slice(0, hash);
    const bucket = k.slice(hash + 1);
    const e = expected.get(k) ?? { available: 0, held: 0 };
    const a = actual.get(k) ?? { available: 0, held: 0 };
    if (e.available !== a.available || e.held !== a.held) {
      divergences.push({
        billingAccountId,
        bucket,
        expectedAvailable: e.available,
        actualAvailable: a.available,
        expectedHeld: e.held,
        actualHeld: a.held,
      });
    }
  }
  divergences.sort((x, y) => (x.billingAccountId + x.bucket).localeCompare(y.billingAccountId + y.bucket));
  return { ok: divergences.length === 0, divergences, accountsChecked: accounts.size };
}

// ---------------------------------------------------------------------------------------------------------
// reconcileBalances — the deterministic correction path behind `assertBalances` (DEF.2/F4; REQ-SPEC-24).
//
// The assertion is read-only by design. When it reports a divergence, the operator runs this reconcile,
// which repairs ONE account in a documented two-step order, inside one tenant transaction:
//
//   1. NORMALIZE THE LEDGER — a fold that nets `held < 0` means the account carries debits that never had
//      a hold (the in-tree bypass DEF.2 repaired, or an out-of-band write). The append-only fix is the
//      missing reservation itself: one `hold` row per bucket covering the shortfall, `source:'reconcile'`,
//      keyed `reconcile:held-backfill:<acct>:<bucket>:<n>` (n = next serial for that bucket's backfills —
//      deterministic, replay-safe). The fold then nets `held = 0` and `available` drops to the true
//      spent figure — matching the `credit_balances.held >= 0` invariant (0044) and the user's real
//      charge (the debits DID cost the account; the backfill admits they were reserved, post facto).
//   2. REWRITE THE COUNTER — `credit_balances` is a denormalized cache of the fold; it is upserted to
//      the (post-backfill) expected values. Orphan counter rows with no ledger presence go to 0/0.
//
// DEF.4 (D-DEF.2-1): the two steps must write in exactly this order WITH the backfill's counter
// maintenance suppressed — `credit_balances_held_nonnegative` (0044, validated by 0055) rejects any
// write that leaves `held < 0`, and a CHECK cannot be DEFERRABLE, so the incremental update the
// canonical `applyLedgerEntry` performs would land an illegal intermediate (−897 + 180 = −717) before
// step 2. The backfill therefore appends the ledger row only, and each counter row is written once —
// directly at the post-backfill fold, which is `held = 0` by construction.
//
// `apply: false` (the default) is a dry-run — it reports the divergences + planned backfills and writes
// nothing, so an operator sees the repair plan before executing it. With `apply: true` the writes land
// in one tx and an `admin_actions('balance_recompute')` row audits actor + before-state (REQ-DATA-34's
// append-only posture: the audit, not the rewrite, is the record of intervention).
//
// Reads are cross-tenant by necessity: `credit_ledger` is RLS-forced, so the fold runs per-workspace
// (each tenant tx sees only its own rows) and unions. The repair itself runs inside the account's first
// workspace's transaction — the only writes it makes are ledger appends + the counter cache.

export interface ReconcileBackfill {
  readonly bucket: string;
  /** the reservation appended so the fold nets held ≥ 0 — the orphan debits' unaccounted reservation. */
  readonly credits: number;
  /** the appended ledger row id when applied; null in a dry-run / when deduped by a prior repair. */
  readonly ledgerId: string | null;
}

export interface ReconcileBalancesResult {
  readonly billingAccountId: string;
  /** counter-vs-fold divergences the repair addresses (computed against the post-backfill fold). */
  readonly divergences: readonly BalanceDivergence[];
  /** the fold position after backfill normalization — what the counter is rewritten to. */
  readonly expected: readonly { readonly bucket: string; readonly available: number; readonly held: number }[];
  readonly backfills: readonly ReconcileBackfill[];
  /** false ⇒ dry-run: the plan was computed, nothing written. */
  readonly applied: boolean;
  readonly auditId: string | null;
}

export interface ReconcileBalancesDeps extends EntryDeps {
  /** open a tenant-scoped tx (the fold is per-workspace under FORCE RLS). */
  readonly runTx: <T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>) => Promise<T>;
  /** every workspace the account's ledger rows may be keyed under (a beta account is usually one). */
  readonly workspacesForAccount: (billingAccountId: string) => Promise<readonly string[]>;
  /** the operator id — required when `apply: true` (the audit row's actor). */
  readonly actor?: string;
}

export async function reconcileBalances(
  deps: ReconcileBalancesDeps,
  args: { billingAccountId: string; apply?: boolean },
): Promise<ReconcileBalancesResult> {
  const workspaces = await deps.workspacesForAccount(args.billingAccountId);
  if (workspaces.length === 0) {
    throw new Error(`no workspace for billing account ${args.billingAccountId}`);
  }

  // ---- fold the ledger, per-workspace then unioned (RLS: each tenant tx sees only its own rows) ----
  const fold = new Map<string, Acc>();
  for (const ws of workspaces) {
    await deps.runTx(ws, async (tx) => {
      const rows = (
        await tx.query(`select bucket, kind, credits from credit_ledger where billing_account_id = $1`, [
          args.billingAccountId,
        ])
      ).rows as { bucket: string; kind: LedgerKind; credits: number | string }[];
      for (const r of rows) {
        const { availableDelta, heldDelta } = balanceEffect(r.kind, Number(r.credits));
        const cur = fold.get(r.bucket) ?? { available: 0, held: 0 };
        cur.available += availableDelta;
        cur.held += heldDelta;
        fold.set(r.bucket, cur);
      }
    });
  }

  // The repair runs atomically inside the account's first workspace's transaction.
  return deps.runTx(workspaces[0]!, async (tx): Promise<ReconcileBalancesResult> => {
    const balanceRows = (
      await tx.query(
        `select bucket, available::int as available, held::int as held
           from credit_balances where billing_account_id = $1`,
        [args.billingAccountId],
      )
    ).rows as { bucket: string; available: number; held: number }[];
    const actual = new Map<string, Acc>();
    for (const r of balanceRows) {
      actual.set(r.bucket, { available: Number(r.available), held: Number(r.held) });
    }

    // Step 1 — normalize the fold: every negative-held bucket gets a `reconcile` hold backfill of the
    // exact shortfall (the reservation its orphan debits never placed).
    const backfillPlans: { bucket: string; credits: number }[] = [];
    for (const [bucket, e] of [...fold.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      if (e.held < 0) backfillPlans.push({ bucket, credits: -e.held });
    }
    const expected = new Map(fold);
    for (const b of backfillPlans) {
      const e = expected.get(b.bucket)!;
      e.available -= b.credits;
      e.held = 0;
    }

    const divergences: BalanceDivergence[] = [];
    for (const bucket of new Set([...expected.keys(), ...actual.keys()])) {
      const e = expected.get(bucket) ?? { available: 0, held: 0 };
      const a = actual.get(bucket) ?? { available: 0, held: 0 };
      if (e.available !== a.available || e.held !== a.held) {
        divergences.push({
          billingAccountId: args.billingAccountId,
          bucket,
          expectedAvailable: e.available,
          actualAvailable: a.available,
          expectedHeld: e.held,
          actualHeld: a.held,
        });
      }
    }
    divergences.sort((x, y) => x.bucket.localeCompare(y.bucket));
    const expectedRows = [...expected.entries()]
      .map(([bucket, e]) => ({ bucket, available: e.available, held: e.held }))
      .sort((a, b) => a.bucket.localeCompare(b.bucket));

    if (!args.apply) {
      return {
        billingAccountId: args.billingAccountId,
        divergences,
        expected: expectedRows,
        backfills: backfillPlans.map((b) => ({ bucket: b.bucket, credits: b.credits, ledgerId: null })),
        applied: false,
        auditId: null,
      };
    }
    if (!deps.actor) throw new Error("reconcileBalances(apply) requires deps.actor (the audit's operator id)");
    if (divergences.length === 0 && backfillPlans.length === 0) {
      // nothing divergent — don't write an audit row for a verify-only apply.
      return {
        billingAccountId: args.billingAccountId,
        divergences,
        expected: expectedRows,
        backfills: [],
        applied: true,
        auditId: null,
      };
    }

    // apply step 1 — append the backfill holds (idempotent per serialized key).
    //
    // DEF.4 / D-DEF.2-1 — these rows must NOT go through `applyLedgerEntry`: that seam maintains the
    // denormalized counter in the same call (`held += credits`), which on a negative-fold repair writes
    // an INTERMEDIATE `credit_balances` row — held −897 + 180 = −717 on prod (DEF.2 §F4) — violating
    // `credit_balances_held_nonnegative` before step 2 can land the fold. A CHECK constraint cannot be
    // DEFERRABLE, so the fix is ordering: append the ledger rows untouched by a counter write, then
    // land each divergent counter at its post-backfill fold in the single upsert of step 2 — every
    // counter write commits a `held >= 0` value, and the ledger stays append-only throughout.
    const backfills: ReconcileBackfill[] = [];
    for (const b of backfillPlans) {
      const prefix = `reconcile:held-backfill:${args.billingAccountId}:${b.bucket}:`;
      const n = Number(
        (
          (
            await tx.query(
              "select count(*)::int as n from credit_ledger where idempotency_key like $1",
              [`${prefix}%`],
            )
          ).rows[0] as { n: number }
        ).n,
      );
      const idempotencyKey = `${prefix}${n + 1}`;
      const ledgerId = deps.ids("led");
      const inserted = await tx.query(
        `insert into credit_ledger
           (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
         values ($1,$2,$3,'hold',$4,$5,'reconcile',$6,$7,$8)
         on conflict (idempotency_key) do nothing
         returning id`,
        [
          ledgerId,
          workspaces[0]!,
          args.billingAccountId,
          b.credits,
          b.bucket,
          "hold backfill for unheld debit (balances reconcile)",
          idempotencyKey,
          deps.clock.now(),
        ],
      );
      const row = inserted.rows[0] as { id: string } | undefined;
      if (row) {
        backfills.push({ bucket: b.bucket, credits: b.credits, ledgerId: row.id });
      } else {
        // the serialized key already exists — a prior apply appended the row (it is already inside
        // the fold, so the counter rewrite below stays correct); report its id for the audit.
        const prior = (
          await tx.query("select id from credit_ledger where idempotency_key = $1", [idempotencyKey])
        ).rows[0] as { id: string } | undefined;
        backfills.push({ bucket: b.bucket, credits: b.credits, ledgerId: prior?.id ?? null });
      }
    }

    // apply step 2 — rewrite the divergent counters to the post-backfill fold (upsert; orphans → 0/0).
    for (const d of divergences) {
      await tx.query(
        `insert into credit_balances (billing_account_id, bucket, available, held, updated_at)
           values ($1,$2,$3,$4,$5)
           on conflict (billing_account_id, bucket)
           do update set available = excluded.available, held = excluded.held, updated_at = excluded.updated_at`,
        [args.billingAccountId, d.bucket, d.expectedAvailable, d.expectedHeld, deps.clock.now()],
      );
    }

    // the audit row — the intervention's record (actor + before-state, in the same tx).
    const auditId = deps.ids("adm");
    await tx.query(
      `insert into admin_actions (id, actor, action, billing_account_id, workspace_id, note, at)
         values ($1,$2,'balance_recompute',$3,$4,$5,$6)`,
      [
        auditId,
        deps.actor,
        args.billingAccountId,
        workspaces[0],
        JSON.stringify({ divergences, backfills: backfillPlans }),
        deps.clock.now(),
      ],
    );
    return {
      billingAccountId: args.billingAccountId,
      divergences,
      expected: expectedRows,
      backfills,
      applied: true,
      auditId,
    };
  });
}
