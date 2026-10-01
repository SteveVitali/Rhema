// SqlHoldLedger — the SOLE real implementation of the orchestrator's `HoldLedger` port (P0.11; §12.4 steps
// 2/8/9, §14.4). Every method runs inside the caller-provided transaction so the ledger effect commits with
// the run-state transition it belongs to. The orchestrator's `TestHoldLedger` stub records calls; this writes
// the real `credit_ledger` rows and maintains `credit_balances` in the same transaction (REQ-SPEC-24.1).
//
//  • hold(cap): reserve the cap across buckets in consumption order UNDER a row lock on the billing account, so
//    two concurrent sheets cannot both fit one balance (REQ-SPEC-24.2; §12.4 step 2).
//  • debit(actual): per phase, debit `min(actual, cap − Σ debits)` UNDER the run row's lock; the remainder is
//    booked `adjustment(absorbed)` into the variance reserve — the cap is never exceeded (REQ-BILL-3; §14.4).
//  • release: return the unused reservation at a terminal state (≤ 60 s; REQ-RUN-13).
//  • refund: give back a run's debits on a failed/refused/cancelled run (§12.4 step 9).
//
// Idempotent at the CALL level: each op's rows carry `${idempotencyKey}#${bucket}` keys and the op returns
// early if any already exist, so an at-least-once queue or a re-enqueue never double-charges (REQ-DATA-34).

import type {
  SqlClient,
  HoldLedger,
  HoldArgs,
  HoldResult,
  DebitArgs,
  ReleaseArgs,
  RefundArgs,
  AbsorbArgs,
  LedgerEntryRef,
} from "@rhema/orchestrator";
import { InsufficientBalanceError, AccountSuspendedError } from "@rhema/orchestrator";
import { ALL_BUCKETS, CONSUMPTION_ORDER, drawFromBuckets, type HoldBucket } from "./buckets.js";
import { applyLedgerEntry, type EntryDeps } from "./entries.js";
import { recordTrialSpend, TrialKilledError } from "./trial.js";

interface OpRow {
  readonly id: string;
  readonly bucket: string;
  readonly kind: string;
}

/** A trial-entitlement run whose entitlement is already spent (by another run) or missing — never run free. */
export class EntitlementUnavailableError extends Error {
  constructor(readonly entitlementId: string) {
    super(`trial entitlement ${entitlementId} is unavailable (already consumed or missing)`);
    this.name = "EntitlementUnavailableError";
  }
}

// The canonical class lives in @rhema/orchestrator (the orchestrator's creation/consent paths must catch it
// without a ledger import); re-exported here so @rhema/ledger callers keep one import site.
export { AccountSuspendedError } from "@rhema/orchestrator";

export class SqlHoldLedger implements HoldLedger {
  constructor(private readonly deps: EntryDeps) {}

  async hold(tx: SqlClient, args: HoldArgs): Promise<HoldResult> {
    // A trial entitlement run holds against the entitlement, not credits (§14.3; REQ-SPEC-8). P1.16 completes
    // the lifecycle: the entitlement must be `unused` (still `locked` ⇒ the unlock gate hasn't run — refuse),
    // the kill switch (`billing_accounts.trial_killed_at`) is read live under the same lock, and a FRESH claim
    // charges the run's estimate to the global daily trial-spend ceiling (a refused hold rolls it back).
    // The conditional update remains the concurrency guard — a second run can never consume it twice
    // (REQ-SPEC-24.2); a retry of THIS run is idempotent.
    if (args.entitlementId) {
      const account = (
        await tx.query("select trial_killed_at from billing_accounts where id = $1 for update", [
          args.billingAccountId,
        ])
      ).rows[0] as { trial_killed_at: string | null } | undefined;
      if (account?.trial_killed_at) throw new TrialKilledError(args.billingAccountId);
      const fresh = await tx.query(
        `update trial_entitlements set state = 'consumed', consumed_by_run_id = $2, consumed_at = now()
           where id = $1 and state = 'unused' returning id`,
        [args.entitlementId, args.runId],
      );
      if (fresh.rows.length === 0) {
        const retry = (
          await tx.query("select 1 from trial_entitlements where id = $1 and consumed_by_run_id = $2", [
            args.entitlementId,
            args.runId,
          ])
        ).rows[0];
        if (!retry) throw new EntitlementUnavailableError(args.entitlementId);
      } else {
        // a fresh claim counts against the global daily trial-spend ceiling (REQ-GROWTH-15 amended) — the
        // increment is in this tx, so a refused hold rolls it back.
        await recordTrialSpend(tx, args.credits, this.deps.clock.now(), {
          workspaceId: args.workspaceId,
        });
        await tx.query(
          "update billing_accounts set trial_state = 'trial_used' where id = $1 and trial_state = 'trial_active'",
          [args.billingAccountId],
        );
      }
      return { ledgerId: `ent_${args.runId}`, bucket: "trial_pocket" };
    }

    // Row-lock the billing account (REQ-SPEC-24.2; §12.4 step 2) BEFORE the idempotency check, so a concurrent
    // redelivery serializes here and re-checks under the lock — never re-reading a balance the winner reduced
    // and spuriously failing a hold that already succeeded.
    const account = (
      await tx.query("select suspended_at from billing_accounts where id = $1 for update", [args.billingAccountId])
    ).rows[0] as { suspended_at: string | null } | undefined;
    const prior = await this.opRows(tx, args.idempotencyKey, false);
    if (prior.length > 0) {
      // Deterministic primary bucket on replay: the first-drawn bucket in consumption order (not row order).
      // Idempotency outranks suspension: replaying a hold that already succeeded is not a NEW hold — a
      // redelivered run.start must not spuriously fail just because a chargeback landed in the gap.
      const first = prior
        .slice()
        .sort((a, b) => CONSUMPTION_ORDER.indexOf(a.bucket as HoldBucket) - CONSUMPTION_ORDER.indexOf(b.bucket as HoldBucket))[0]!;
      return { ledgerId: first.id, bucket: first.bucket as HoldBucket };
    }
    // A chargeback-suspended account takes no NEW holds (REQ-SPEC-24.7) — running phases still debit their
    // held reservation (already-incurred COGS); new spend is the thing suspended.
    if (account?.suspended_at) throw new AccountSuspendedError(args.billingAccountId);
    const available = await this.availableByBucket(tx, args.billingAccountId);
    const draw = drawFromBuckets(available, args.credits);
    if (draw.shortfall > 0) throw new InsufficientBalanceError(args.credits);

    let primary: { id: string; bucket: HoldBucket } | undefined;
    for (const d of draw.draws) {
      const res = await applyLedgerEntry(tx, this.deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "hold",
        credits: d.credits,
        bucket: d.bucket,
        runId: args.runId,
        source: "hold",
        // Held credits are protected from expiry: the `expire` sweep reduces `available` only, so a hold
        // effectively extends the held credits' life for the run (REQ-SPEC-24.3).
        expiresAt: null,
        idempotencyKey: `${args.idempotencyKey}#${d.bucket}`,
      });
      if (!primary) primary = { id: res.ledgerId, bucket: d.bucket };
    }
    // `draw.shortfall === 0` and `credits > 0` guarantee at least one draw; the fallback is unreachable.
    if (!primary) return { ledgerId: `hold_${args.runId}`, bucket: "included" };
    return { ledgerId: primary.id, bucket: primary.bucket };
  }

  async debit(tx: SqlClient, args: DebitArgs): Promise<LedgerEntryRef> {
    return this.writeDebit(tx, args);
  }

  /**
   * The debit path shared by the port `debit` (a committed phase) and the resume re-debit (`reDebitRefundedPhases`,
   * REQ-SPEC-24.6, which passes `reason: "re-debit"`). Clamps to the run's cap under its row lock, draws the
   * clamped amount from the run's held buckets in consumption order, and absorbs any overrun.
   */
  async writeDebit(tx: SqlClient, args: DebitArgs, reason?: string): Promise<LedgerEntryRef> {
    // Row-lock the run FIRST (REQ-BILL-3; §14.4) so the idempotency check + cap-clamp read a consistent state
    // under one lock — a concurrent redelivery serializes here rather than racing the clamp.
    const runRow = (
      await tx.query("select cap_credits, hold_bucket, entitlement_id from runs where id = $1 for update", [args.runId])
    ).rows[0] as { cap_credits: number | string; hold_bucket: string | null; entitlement_id: string | null } | undefined;
    // A trial-entitlement run is "Included" — it never touches the credit ledger (§14.3; REQ-SPEC-8). Booking
    // its phases as `absorbed` would also pollute the circuit breaker, so skip the ledger entirely. Full trial
    // pricing (against the entitlement's word cap) is P1.16.
    if (runRow?.entitlement_id) return { ledgerId: `ent_debit_${args.runId}` };

    const prior = await this.opRows(tx, args.idempotencyKey, true);
    if (prior.length > 0) return { ledgerId: prior[0]!.id };

    // Net charge so far: Σ debits − Σ refunds. A refund lowers it, so a re-debited phase fits under the cap.
    const netDebited = Number(
      (
        (
          await tx.query(
            `select coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as s
               from credit_ledger where run_id = $1 and kind in ('debit','refund')`,
            [args.runId],
          )
        ).rows[0] as { s: number }
      ).s,
    );
    const actual = Math.max(0, Math.trunc(args.credits));
    // The cap-clamp: never debit past the run's cap. An unknown run (no row) is not cap-bound.
    const cap = runRow ? Number(runRow.cap_credits) : netDebited + actual;
    const clamped = Math.max(0, Math.min(actual, cap - netDebited));

    // Draw the clamped debit from the run's own held buckets in consumption order.
    const held = await this.heldByBucket(tx, args.runId);
    const draw = drawFromBuckets(held, clamped);
    let primary: string | undefined;
    for (const d of draw.draws) {
      const res = await applyLedgerEntry(tx, this.deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "debit",
        credits: d.credits,
        bucket: d.bucket,
        runId: args.runId,
        phaseId: args.phaseId,
        source: "run",
        reason,
        idempotencyKey: `${args.idempotencyKey}#${d.bucket}`,
      });
      if (!primary) primary = res.ledgerId;
    }

    // Everything the user was NOT charged (the cap overrun, plus any reservation shortfall) is booked
    // `adjustment(absorbed)` into the variance reserve — never a charge (REQ-BILL-3 amended; REQ-RUN-12).
    const overrun = actual - draw.drawn;
    if (overrun > 0) {
      const bucket = (runRow?.hold_bucket as HoldBucket | null) ?? draw.draws[0]?.bucket ?? "included";
      const res = await applyLedgerEntry(tx, this.deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "adjustment",
        credits: overrun,
        bucket,
        runId: args.runId,
        phaseId: args.phaseId,
        source: "system",
        reason: "absorbed",
        idempotencyKey: `${args.idempotencyKey}#absorbed`,
      });
      if (!primary) primary = res.ledgerId;
    }
    return { ledgerId: primary ?? `debit_${args.runId}` };
  }

  async release(tx: SqlClient, args: ReleaseArgs): Promise<LedgerEntryRef> {
    // Lock the run so a concurrent debit and release cannot both move the same held credits (there is no
    // `check(held >= 0)`; the run lock is the guard). The orchestrator serializes a run's phases, but the
    // ledger enforces it too rather than trusting that.
    await tx.query("select id from runs where id = $1 for update", [args.runId]);
    const prior = await this.opRows(tx, args.idempotencyKey, false);
    if (prior.length > 0) return { ledgerId: prior[0]!.id };

    const held = await this.heldByBucket(tx, args.runId);
    let primary: string | undefined;
    for (const bucket of ALL_BUCKETS) {
      const amount = held[bucket] ?? 0;
      if (amount <= 0) continue;
      const res = await applyLedgerEntry(tx, this.deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "release",
        credits: amount,
        bucket,
        runId: args.runId,
        source: "run",
        idempotencyKey: `${args.idempotencyKey}#${bucket}`,
      });
      if (!primary) primary = res.ledgerId;
    }
    return { ledgerId: primary ?? `rel_${args.runId}` };
  }

  async refund(tx: SqlClient, args: RefundArgs): Promise<LedgerEntryRef> {
    await tx.query("select id from runs where id = $1 for update", [args.runId]);
    const prior = await this.opRows(tx, args.idempotencyKey, false);
    if (prior.length > 0) return { ledgerId: prior[0]!.id };

    const netDebited = await this.debitedByBucket(tx, args.runId);
    const draw = drawFromBuckets(netDebited, args.credits);
    let primary: string | undefined;
    for (const d of draw.draws) {
      const res = await applyLedgerEntry(tx, this.deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "refund",
        credits: d.credits,
        bucket: d.bucket,
        runId: args.runId,
        source: "run",
        // RES.2 — `platform_fault:<cause>` marks the platform-fault class (`isPlatformFaultRefund`);
        // undefined stays an ordinary run refund.
        ...(args.reason ? { reason: args.reason } : {}),
        idempotencyKey: `${args.idempotencyKey}#${d.bucket}`,
      });
      if (!primary) primary = res.ledgerId;
    }
    return { ledgerId: primary ?? `ref_${args.runId}` };
  }

  /**
   * Book metered burn the user did not pay — an `adjustment(absorbed)` row (DEF.2/F5; REQ-SPEC-24.8's
   * "carried in the reserve"; the REQ-SPEC-24.5 circuit breaker reads Σ absorbed). No balance effect —
   * `adjustment` is the pure accounting-record kind, so this never touches credits the run still holds.
   */
  async absorb(tx: SqlClient, args: AbsorbArgs): Promise<LedgerEntryRef> {
    await tx.query("select id from runs where id = $1 for update", [args.runId]);
    const prior = await this.opRows(tx, args.idempotencyKey, true);
    if (prior.length > 0) return { ledgerId: prior[0]!.id };

    const runRow = (
      await tx.query("select hold_bucket from runs where id = $1", [args.runId])
    ).rows[0] as { hold_bucket: string | null } | undefined;
    const bucket = (runRow?.hold_bucket as HoldBucket | null) ?? "included";
    const res = await applyLedgerEntry(tx, this.deps, {
      workspaceId: args.workspaceId,
      billingAccountId: args.billingAccountId,
      kind: "adjustment",
      credits: args.credits,
      bucket,
      runId: args.runId,
      source: "system",
      reason: "absorbed",
      idempotencyKey: `${args.idempotencyKey}#absorbed`,
    });
    return { ledgerId: res.ledgerId };
  }

  // ---- shared reads -------------------------------------------------------------------------------------

  private async opRows(tx: SqlClient, baseKey: string, includeAbsorbed: boolean): Promise<OpRow[]> {
    const keys = ALL_BUCKETS.map((b) => `${baseKey}#${b}`);
    if (includeAbsorbed) keys.push(`${baseKey}#absorbed`);
    return (
      await tx.query(
        "select id, bucket, kind from credit_ledger where idempotency_key = any($1) order by at, id",
        [keys],
      )
    ).rows as OpRow[];
  }

  private async availableByBucket(tx: SqlClient, accountId: string): Promise<Partial<Record<HoldBucket, number>>> {
    const rows = (
      await tx.query("select bucket, available::int as available from credit_balances where billing_account_id = $1", [
        accountId,
      ])
    ).rows as { bucket: string; available: number }[];
    const out: Partial<Record<HoldBucket, number>> = {};
    for (const r of rows) out[r.bucket as HoldBucket] = Number(r.available);
    return out;
  }

  /** Per-bucket credits this run still holds: Σ hold − Σ debit − Σ release, by bucket. */
  private async heldByBucket(tx: SqlClient, runId: string): Promise<Partial<Record<HoldBucket, number>>> {
    const rows = (
      await tx.query(
        `select bucket,
                coalesce(sum(case kind when 'hold' then credits when 'debit' then -credits when 'release' then -credits else 0 end), 0)::int as held
           from credit_ledger where run_id = $1 and kind in ('hold','debit','release') group by bucket`,
        [runId],
      )
    ).rows as { bucket: string; held: number }[];
    const out: Partial<Record<HoldBucket, number>> = {};
    for (const r of rows) out[r.bucket as HoldBucket] = Number(r.held);
    return out;
  }

  /** Per-bucket credits this run has debited and not yet refunded: Σ debit − Σ refund, by bucket. */
  private async debitedByBucket(tx: SqlClient, runId: string): Promise<Partial<Record<HoldBucket, number>>> {
    const rows = (
      await tx.query(
        `select bucket,
                coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as net
           from credit_ledger where run_id = $1 and kind in ('debit','refund') group by bucket`,
        [runId],
      )
    ).rows as { bucket: string; net: number }[];
    const out: Partial<Record<HoldBucket, number>> = {};
    for (const r of rows) out[r.bucket as HoldBucket] = Number(r.net);
    return out;
  }
}
