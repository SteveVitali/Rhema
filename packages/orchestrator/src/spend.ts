// `runs.spent_credits` reconciliation (PRB.16b — the PRB.16 carry-over finding). The field accumulates
// each committed step's credits (`commitStep`), so a run that reaches a terminal state MID-phase — a
// cancel, a cap-402, a terminal failure — leaves the row at its last committed figure (0 when nothing
// committed) while `usage_records` already holds the real spend. Every terminal settle reconciles the
// field from the usage rows of record: the proxy's `{source:'proxy'}` rows are the meter of record
// (§12.7); `sdk_estimate` (the crosscheck's SDK side) stands in next, then the display rows
// (`sdk_stream`, `provider_report`) — never summed together, they measure the same tokens. `greatest()`
// makes the write monotone — a reconciled figure is never lowered by a second settle and a mid-flight
// call can only fold usage IN.

import type { DebitMode } from "@rhema/contracts";
import type { SqlClient } from "./tx.js";
import type { HoldLedger } from "./ledger.js";

export type { DebitMode } from "@rhema/contracts";

// ---------------------------------------------------------------------------------------------------------
// ECON.1 — `debitMode` (REQ-SPEC-32(a) "charge what we meter"; ADR-031 burn classification). The mode is a
// DEPLOY flag (`DEBIT_MODE` env → `OrchestratorDeps.debitMode`), default `committed`:
//
//   committed — the launched semantics: a commit debits max(pod claim, metered catch-up); a completed run
//               tops up to metered (`settleMeteredDebit`); a cancel keeps committed debits (partials are
//               kept/resumable); a failed run refunds its debits and the whole metered burn absorbs.
//   metered   — the charge IS the proxy meter, `min(metered, cap)`, on every terminal path that charges at
//               all: commits debit only the metered remainder (the pod claim is never a floor — its excess
//               would be refunded at settle anyway); a completed run's over-debit REFUNDS
//               (`reason: metered_over_debit`); a user-cancelled run settles to metered the same way (the
//               burn happened and the partials are kept). Failed runs are unchanged: refund + absorb.
//
// Both modes share the invariant `Σ debits − Σ refunds ≤ cap` (the ledger clamps) and every metered credit
// the user did not pay is `adjustment(absorbed)` — platform COGS (REQ-SPEC-24.8). The type itself lives in
// `@rhema/contracts` (`parseDebitMode` fails closed to `committed`).

/** The burn classification for a metered-mode over-debit return (ADR-031): the committed channel's
 *  pod-claim floor debited MORE than the proxy metered — the excess is the user's, not COGS. */
export const METERED_OVER_DEBIT_REASON = "metered_over_debit" as const;

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
 * The charge target for one commit (REQ-SPEC-11: proxy rows drive debits). Under `committed` the pod's
 * reconciled figure is the FLOOR (`fallbackCredits` — also the whole story when no proxy rows exist yet);
 * the attempt's cumulative metered total minus what this attempt's commits already debited is the
 * catch-up — a lagged metered row or under-reported subagent burn lands in the NEXT phase's debit instead
 * of leaking. Under `metered` (ECON.1) the claim is advisory only: the commit is exactly the metered
 * remainder, and any lagged over-debit is returned by `refundMeteredExcess` at settle.
 */
export async function incrementalMeteredDebit(
  exec: SqlClient,
  runId: string,
  attempt: number,
  fallbackCredits: number,
  mode: DebitMode = "committed",
): Promise<number> {
  const metered = await meteredCredits(exec, runId, attempt);
  if (metered <= 0) return Math.max(0, Math.trunc(fallbackCredits));
  const debited = await attemptDebitedCredits(exec, runId, attempt);
  // ECON.1: under `metered` the pod claim is never a floor — the commit charges exactly the metered
  // remainder (D-F: the floor over-debits vs the final meter, e.g. 634 vs 632 on 01M3SK62…). Under
  // `committed` the claim stands as the floor and the excess stays the charge (the committed figure).
  return mode === "metered"
    ? Math.max(0, metered - debited)
    : Math.max(0, Math.trunc(fallbackCredits), metered - debited);
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

/**
 * ECON.1/`debitMode=metered` — the mirror of `settleMeteredDebit`: when the attempt's committed debits
 * EXCEED its metered total (the pod-claim floor over-debited, or committed-mode commits ran under a flag
 * flip), the charge is still exactly `min(metered, cap)` — refund the excess with the
 * `metered_over_debit` classification (ADR-031: the user's money, never platform COGS). Idempotent on
 * `refund:<run>:settle:<attempt>`; a no-op under `committed` (the committed figure is the charge there).
 */
export async function refundMeteredExcess(
  tx: SqlClient,
  deps: { ledger: HoldLedger },
  args: MeteredSettleArgs & { attempt: number },
): Promise<number> {
  const metered = await meteredCredits(tx, args.runId, args.attempt);
  if (metered <= 0) return 0;
  const debited = await attemptDebitedCredits(tx, args.runId, args.attempt);
  const excess = Math.max(0, debited - metered);
  if (excess <= 0) return 0;
  await deps.ledger.refund(tx, {
    billingAccountId: args.billingAccountId,
    workspaceId: args.workspaceId,
    runId: args.runId,
    credits: excess,
    reason: METERED_OVER_DEBIT_REASON,
    idempotencyKey: `refund:${args.runId}:settle:${args.attempt}`,
  });
  return excess;
}

/**
 * ECON.1 D-E — the late-arrival re-settle. Proxy usage rows can land AFTER a run's terminal settle
 * (async flush; prod `01M3DQ4A…` reconciled to 0 then metered 6; `01M3DJ5V…` froze at 182 of 185).
 * Idempotent by construction: `reconcileRunSpend` is `greatest`-monotone and `absorbMeteredGap` computes
 * `metered − debited − absorbed` fresh, so a re-run books ONLY the residue. Safe for the stranded sweep
 * to call on recently-terminal runs. A `completed` run's re-settle tops up the metered gap through
 * `settleMeteredDebit` (and refunds the over-debit under `metered` mode); cancelled/failed runs only
 * absorb — the terminal refund already ran.
 */
export async function resettleRun(
  tx: SqlClient,
  deps: { ledger: HoldLedger; debitMode?: DebitMode },
  args: MeteredSettleArgs & { state: string; attempt: number },
): Promise<{ debited: number; refunded: number; absorbed: number; spent: number }> {
  const debited =
    args.state === "completed" || (args.state === "cancelled" && deps.debitMode === "metered")
      ? await settleMeteredDebit(tx, deps, args)
      : 0;
  const refunded =
    deps.debitMode === "metered" && (args.state === "completed" || args.state === "cancelled")
      ? await refundMeteredExcess(tx, deps, args)
      : 0;
  const absorbed = await absorbMeteredGap(tx, deps, args);
  const spent = await reconcileRunSpend(tx, args.runId);
  return { debited, refunded, absorbed, spent: Number(spent) };
}
