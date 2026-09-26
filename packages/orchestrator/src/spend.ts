// `runs.spent_credits` reconciliation (PRB.16b — the PRB.16 carry-over finding). The field accumulates
// each committed step's credits (`commitStep`), so a run that reaches a terminal state MID-phase — a
// cancel, a cap-402, a terminal failure — leaves the row at its last committed figure (0 when nothing
// committed) while `usage_records` already holds the real spend. Every terminal settle reconciles the
// field from the usage rows of record: the proxy's `{source:'proxy'}` rows are the meter of record
// (§12.7); `sdk_estimate` (the crosscheck's SDK side) stands in next, then the display rows
// (`sdk_stream`, `provider_report`) — never summed together, they measure the same tokens. `greatest()`
// makes the write monotone — a reconciled figure is never lowered by a second settle and a mid-flight
// call can only fold usage IN.

import type { SqlClient } from "./tx.js";
import type { HoldLedger } from "./ledger.js";

/**
 * Fold the run's recorded usage into `runs.spent_credits` and return the reconciled figure. Safe to
 * call inside any tenant-scoped terminal transaction; idempotent and monotone (greatest).
 */
export async function reconcileRunSpend(exec: SqlClient, runId: string): Promise<number> {
  const sums = (
    await exec.query(
      `select source, coalesce(sum(credits), 0) as credits
         from usage_records where run_id = $1 group by source`,
      [runId],
    )
  ).rows as { source: string; credits: number | string }[];
  let proxy = 0;
  let estimate = 0;
  let other = 0;
  for (const r of sums) {
    const n = Number(r.credits);
    if (r.source === "proxy") proxy += n;
    else if (r.source === "sdk_estimate") estimate += n;
    else other += n;
  }
  // the meter of record wins; the SDK figure of record (`sdk_estimate` — the crosscheck's SDK side)
  // stands in next, then the display rows (`sdk_stream`/`provider_report`). Never sum the SDK twins —
  // stream and estimate measure the same phase's tokens.
  const usage = proxy > 0 ? proxy : estimate > 0 ? estimate : other;
  const res = await exec.query(
    "update runs set spent_credits = greatest(spent_credits, $2) where id = $1 returning spent_credits",
    [runId, usage],
  );
  return (res.rows[0] as { spent_credits: number } | undefined)?.spent_credits ?? 0;
}

// ---------------------------------------------------------------------------------------------------------
// DEF.2/F5 — committed vs metered (§12.4 step 9; REQ-SPEC-24.6/24.8). The proxy's `source:'proxy'` rows are
// the meter of record; the ledger's `debit` rows are the charge. The two channels diverge when a phase's
// commit never lands (cancel, terminal failure mid-phase) or when the pod's step rollup under-counts burn
// the proxy saw (subagent fan-out, server-tool fees — PRB.25's measured gap). The terminal-settle policies
// below make the accounting explicit — committed == metered where money moved, and every metered credit
// the user did NOT pay is booked `adjustment(absorbed)` (the platform-COGS record REQ-SPEC-24.8 names —
// "carried in the reserve" is the circuit breaker's Σ absorbed, REQ-SPEC-24.5):
//
//   completed  — charge: a catch-up debit of `attempt metered − attempt debited` before the hold releases.
//   cancelled  — release-only: committed debits stand (the partials are kept and resumable; REQ-SPEC-24.6
//                offers refunds only on failed-with-no-resume); the in-flight burn absorbs as COGS.
//   failed     — refund: net debits return, then the WHOLE metered burn absorbs (user paid nothing).
// ---------------------------------------------------------------------------------------------------------

/** Σ proxy-metered credits — the meter of record. Attempt-scoped when `attempt` is given. */
export async function meteredCredits(exec: SqlClient, runId: string, attempt?: number): Promise<number> {
  const rows = await exec.query(
    `select coalesce(sum(credits), 0)::int as s from usage_records
       where run_id = $1 and source = 'proxy'${attempt === undefined ? "" : " and attempt = $2"}`,
    attempt === undefined ? [runId] : [runId, attempt],
  );
  return Number((rows.rows[0] as { s: number } | undefined)?.s ?? 0);
}

/** The run's net committed charge: Σ debit − Σ refund (whole run, all attempts). */
export async function netDebitedCredits(exec: SqlClient, runId: string): Promise<number> {
  const r = (
    await exec.query(
      `select coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as s
         from credit_ledger where run_id = $1 and kind in ('debit','refund')`,
      [runId],
    )
  ).rows[0] as { s: number };
  return Number(r.s);
}

/** Σ debits keyed to one attempt — commit debits (`debit:<run>:<step>:<attempt>`) + the settle debit. */
async function attemptDebitedCredits(exec: SqlClient, runId: string, attempt: number): Promise<number> {
  const rows = (
    await exec.query(
      `select idempotency_key, credits::int as credits from credit_ledger
         where run_id = $1 and kind = 'debit' and idempotency_key like $2`,
      [runId, `debit:${runId}:%`],
    )
  ).rows as { idempotency_key: string; credits: number }[];
  return rows
    .filter((r) => r.idempotency_key.split("#")[0]!.split(":")[3] === String(attempt))
    .reduce((s, r) => s + Number(r.credits), 0);
}

/**
 * The charge target for one commit (REQ-SPEC-11: proxy rows drive debits). The pod's reconciled figure is
 * the FLOOR (`fallbackCredits` — also the whole story when no proxy rows exist yet); the attempt's
 * cumulative metered total minus what this attempt's commits already debited is the catch-up — a lagged
 * metered row or under-reported subagent burn lands in the NEXT phase's debit instead of leaking. Never
 * returns less than the pod's figure: a short commit debits nothing extra and the settle catches it.
 */
export async function incrementalMeteredDebit(
  exec: SqlClient,
  runId: string,
  attempt: number,
  fallbackCredits: number,
): Promise<number> {
  const metered = await meteredCredits(exec, runId, attempt);
  if (metered <= 0) return Math.max(0, Math.trunc(fallbackCredits));
  const debited = await attemptDebitedCredits(exec, runId, attempt);
  return Math.max(0, Math.trunc(fallbackCredits), metered - debited);
}

export interface MeteredSettleArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
}

/**
 * The completed-run settle (§12.4 step 9 "reconcile cost" — the charge leg): debit the attempt's metered
 * total the phase commits never reached (`attempt metered − attempt debited`), cap-clamped by the ledger's
 * own clamp. MUST run before the hold release — the debit draws from the run's held buckets; a released
 * hold draws nothing and the gap would book absorbed instead of charged. Returns the catch-up amount.
 */
export async function settleMeteredDebit(
  tx: SqlClient,
  deps: { ledger: HoldLedger },
  args: MeteredSettleArgs & { attempt: number },
): Promise<number> {
  const metered = await meteredCredits(tx, args.runId, args.attempt);
  if (metered <= 0) return 0;
  const debited = await attemptDebitedCredits(tx, args.runId, args.attempt);
  const gap = Math.max(0, metered - debited);
  if (gap <= 0) return 0;
  await deps.ledger.debit(tx, {
    billingAccountId: args.billingAccountId,
    workspaceId: args.workspaceId,
    runId: args.runId,
    credits: gap,
    idempotencyKey: `debit:${args.runId}:settle:${args.attempt}`,
  });
  return gap;
}

/**
 * Book the metered burn the user did NOT pay as `adjustment(absorbed)` — the platform-COGS record
 * (REQ-SPEC-24.8 "carried in the reserve"; the REQ-SPEC-24.5 circuit breaker reads this Σ). Call AFTER
 * the settle's charge side: post-refund on a failure (the whole burn absorbs), post-nothing on a cancel
 * (only the uncommitted residue absorbs — committed debits paid for the kept partials). Episode-scoped
 * keys (`absorb:<run>:<n>`) so a fail→resume→fail saga absorbs each episode's burn exactly once.
 */
export async function absorbMeteredGap(
  tx: SqlClient,
  deps: { ledger: HoldLedger },
  args: MeteredSettleArgs,
): Promise<number> {
  const metered = await meteredCredits(tx, args.runId);
  if (metered <= 0) return 0;
  const rows = (
    await tx.query(
      `select kind, reason, coalesce(sum(credits), 0)::int as s
         from credit_ledger where run_id = $1 and kind in ('debit','refund','adjustment')
         group by kind, reason`,
      [args.runId],
    )
  ).rows as { kind: string; reason: string | null; s: number }[];
  let debited = 0;
  let absorbed = 0;
  for (const r of rows) {
    const n = Number(r.s);
    if (r.kind === "debit") debited += n;
    else if (r.kind === "refund") debited -= n;
    else if (r.reason === "absorbed") absorbed += n;
  }
  const gap = Math.max(0, metered - debited - absorbed);
  if (gap <= 0) return 0;
  const episode =
    Number(
      (
        (
          await tx.query("select count(*)::int as n from credit_ledger where idempotency_key like $1", [
            `absorb:${args.runId}:%`,
          ])
        ).rows[0] as { n: number }
      ).n,
    ) + 1;
  await deps.ledger.absorb(tx, {
    billingAccountId: args.billingAccountId,
    workspaceId: args.workspaceId,
    runId: args.runId,
    credits: gap,
    idempotencyKey: `absorb:${args.runId}:${episode}`,
  });
  return gap;
}
