// Refund and resume-re-debit semantics (§12.4 step 9; REQ-SPEC-24.6). Two flows beyond the port's run-level
// `refund`:
//  • `refundPhases` — refund SPECIFIC committed phases (per-phase rows carrying `phase_id`), for a stop that
//    keeps some phases and for the completed-run 7-day refund window (§14.4 fairness rules).
//  • `reDebitRefundedPhases` — at resume, a refunded partial "re-debits the refunded phases first"
//    (REQ-SPEC-24.6) BEFORE any new phase is debited, so the refunded work is paid for again from the resume's
//    fresh hold. Re-debit rows carry `reason = 're-debit'`; the op is idempotent (a phase already fully
//    re-debited contributes nothing on a repeat).

import type { SqlClient } from "@rhema/orchestrator";
import { applyLedgerEntry, type EntryDeps } from "./entries.js";
import { drawFromBuckets, type HoldBucket } from "./buckets.js";
import type { SqlHoldLedger } from "./sql-ledger.js";

export interface RefundPhasesArgs {
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly runId: string;
  /** The committed phases to refund (each is a `steps.id` / `credit_ledger.phase_id`). */
  readonly phaseIds: readonly string[];
  /**
   * An episode discriminator, unique per refund episode (e.g. `refund:${runId}:${attempt}`). A run can be
   * refunded, resumed (re-debited) and refunded AGAIN; without a per-episode key the second refund would dedupe
   * against the first and silently not return the re-debited credits (a money-loss bug).
   */
  readonly idempotencyKey: string;
}

export interface PhaseRefund {
  readonly phaseId: string;
  readonly credits: number;
}

/**
 * Refund each named phase's outstanding net debit (Σ debit − Σ refund for that phase), returning the credits to
 * the buckets they were debited from in consumption order. Writes one refund row per (phase, bucket), keyed so
 * a repeat is a no-op. Returns what each phase was refunded.
 */
export async function refundPhases(
  tx: SqlClient,
  deps: EntryDeps,
  args: RefundPhasesArgs,
): Promise<PhaseRefund[]> {
  const out: PhaseRefund[] = [];
  for (const phaseId of args.phaseIds) {
    const netByBucket = await netDebitedByBucketForPhase(tx, args.runId, phaseId);
    const total = Object.values(netByBucket).reduce((a, b) => a + (b ?? 0), 0);
    if (total <= 0) {
      out.push({ phaseId, credits: 0 });
      continue;
    }
    const draw = drawFromBuckets(netByBucket, total);
    let refunded = 0;
    for (const d of draw.draws) {
      const res = await applyLedgerEntry(tx, deps, {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        kind: "refund",
        credits: d.credits,
        bucket: d.bucket,
        runId: args.runId,
        phaseId,
        source: "run",
        idempotencyKey: `${args.idempotencyKey}:${phaseId}#${d.bucket}`,
      });
      // Only count credits this call actually applied — a replay (applied=false) returns the existing row and
      // must NOT be reported as a fresh refund (review #1).
      if (res.applied) refunded += d.credits;
    }
    out.push({ phaseId, credits: refunded });
  }
  return out;
}

/**
 * Re-debit the run's previously-refunded phases FIRST at resume (REQ-SPEC-24.6). For each phase that carries a
 * refund, re-debit the not-yet-recharged remainder (Σ refund − Σ re-debit) through the ledger's cap-clamped
 * debit path, in committed order. Returns what each phase was re-debited.
 */
export async function reDebitRefundedPhases(
  tx: SqlClient,
  ledger: SqlHoldLedger,
  args: { workspaceId: string; billingAccountId: string; runId: string; idempotencyKey: string },
): Promise<PhaseRefund[]> {
  const phases = await refundedPhasesInOrder(tx, args.runId);
  const out: PhaseRefund[] = [];
  for (const phaseId of phases) {
    const refunded = await sumForPhase(tx, args.runId, phaseId, "refund");
    const alreadyReDebited = await sumReDebitedForPhase(tx, args.runId, phaseId);
    const remaining = refunded - alreadyReDebited;
    if (remaining <= 0) {
      out.push({ phaseId, credits: 0 });
      continue;
    }
    await ledger.writeDebit(
      tx,
      {
        workspaceId: args.workspaceId,
        billingAccountId: args.billingAccountId,
        runId: args.runId,
        phaseId,
        credits: remaining,
        // Episode-scoped so a second resume of a repeatedly-refunded phase re-debits again (review #2).
        idempotencyKey: `${args.idempotencyKey}:${phaseId}`,
      },
      "re-debit",
    );
    // Confirm what actually re-debited (the clamp fits since the refund lowered the net, but read it back).
    const reDebited = (await sumReDebitedForPhase(tx, args.runId, phaseId)) - alreadyReDebited;
    out.push({ phaseId, credits: reDebited });
  }
  return out;
}

// ---- reads ----------------------------------------------------------------------------------------------

async function netDebitedByBucketForPhase(
  tx: SqlClient,
  runId: string,
  phaseId: string,
): Promise<Partial<Record<HoldBucket, number>>> {
  const rows = (
    await tx.query(
      `select bucket,
              coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as net
         from credit_ledger where run_id = $1 and phase_id = $2 and kind in ('debit','refund') group by bucket`,
      [runId, phaseId],
    )
  ).rows as { bucket: string; net: number }[];
  const out: Partial<Record<HoldBucket, number>> = {};
  for (const r of rows) out[r.bucket as HoldBucket] = Number(r.net);
  return out;
}

/** Phases that carry a refund, in committed order (earliest debit first), so they re-debit before new phases. */
async function refundedPhasesInOrder(tx: SqlClient, runId: string): Promise<string[]> {
  const rows = (
    await tx.query(
      `select phase_id, min(at) as first_at
         from credit_ledger
        where run_id = $1 and phase_id is not null and kind in ('debit','refund')
        group by phase_id
        having sum(case when kind = 'refund' then credits else 0 end) > 0
        order by first_at, phase_id`,
      [runId],
    )
  ).rows as { phase_id: string }[];
  return rows.map((r) => r.phase_id);
}

async function sumForPhase(tx: SqlClient, runId: string, phaseId: string, kind: string): Promise<number> {
  const r = (
    await tx.query(
      "select coalesce(sum(credits), 0)::int as s from credit_ledger where run_id = $1 and phase_id = $2 and kind = $3",
      [runId, phaseId, kind],
    )
  ).rows[0] as { s: number };
  return Number(r.s);
}

async function sumReDebitedForPhase(tx: SqlClient, runId: string, phaseId: string): Promise<number> {
  const r = (
    await tx.query(
      "select coalesce(sum(credits), 0)::int as s from credit_ledger where run_id = $1 and phase_id = $2 and kind = 'debit' and reason = 're-debit'",
      [runId, phaseId],
    )
  ).rows[0] as { s: number };
  return Number(r.s);
}
