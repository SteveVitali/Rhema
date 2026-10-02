// The platform circuit breaker (REQ-SPEC-24.5; §14.4, §13.5). If absorbed cap-overruns in the last 24 h
// exceed X% of gross usage, the estimator has drifted badly enough that the platform is eating margin on new
// runs: the cap multiplier for NEW runs rises to 2× (widening the safety band while the estimator re-fits) and
// on-call is paged. Absorbed adjustments and debits both come from the proxy's metered rows (the meter of
// record, REQ-SPEC-11), so this reads the ledger — the record of what was charged and what was absorbed.

import type { SqlClient } from "@rhema/orchestrator";

/** Default trip threshold: absorbed > 5% of gross usage over the window (§13.5 "X% of gross usage"). */
export const DEFAULT_ABSORBED_THRESHOLD_PCT = 0.05;
export const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The multiplier applied to `ceil(1.5 × estimate)` when sizing a NEW run's cap. Only the FLOOR (1.5×) is
 * constrained by REQ-BILL-7; the breaker may double it. */
export const NORMAL_CAP_MULTIPLIER = 1 as const;
export const TRIPPED_CAP_MULTIPLIER = 2 as const;

export interface CircuitBreakerState {
  readonly absorbedCredits: number;
  readonly grossCredits: number;
  /** absorbed / gross, or 0 when there is no gross usage yet. */
  readonly ratio: number;
  readonly tripped: boolean;
  /** The cap multiplier a new run should apply (1 normally, 2 when tripped). */
  readonly capMultiplier: 1 | 2;
  /** True the moment the breaker trips — the caller pages on-call (§14.4). */
  readonly page: boolean;
}

/**
 * Compute the breaker state from the ledger over the trailing window ending at `now`. Gross usage is the total
 * cost the run cost the platform (what was charged + what was absorbed); absorbed is the overrun the platform
 * ate. A tripped breaker returns `capMultiplier: 2` for new-run cap sizing.
 */
export async function circuitBreakerState(
  exec: SqlClient,
  now: Date,
  opts: { thresholdPct?: number; windowMs?: number } = {},
): Promise<CircuitBreakerState> {
  const threshold = opts.thresholdPct ?? DEFAULT_ABSORBED_THRESHOLD_PCT;
  const since = new Date(now.getTime() - (opts.windowMs ?? DEFAULT_WINDOW_MS));
  // ACT.1 (ADR-014 §1): a trial-entitlement run's burn is the "trial" absorbed class — a deliberate,
  // separately-bounded subsidy (the $50/day kill switch), NOT cap-overrun drift. Excluding it keeps
  // the breaker measuring what it exists for: estimator drift on charged runs. The entitlement's own
  // $15/run bound already lives in the claim path.
  const row = (
    await exec.query(
      `select
         coalesce(sum(case when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0)::int as absorbed,
         coalesce(sum(case when kind = 'debit' then credits when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0)::int as gross
       from credit_ledger cl
       where at >= $1 and at <= $2
         and not exists (select 1 from runs r where r.id = cl.run_id and r.entitlement_id is not null)`,
      [since, now],
    )
  ).rows[0] as { absorbed: number; gross: number };

  const absorbedCredits = Number(row.absorbed);
  const grossCredits = Number(row.gross);
  const ratio = grossCredits > 0 ? absorbedCredits / grossCredits : 0;
  const tripped = grossCredits > 0 && ratio > threshold;
  return {
    absorbedCredits,
    grossCredits,
    ratio,
    tripped,
    capMultiplier: tripped ? TRIPPED_CAP_MULTIPLIER : NORMAL_CAP_MULTIPLIER,
    page: tripped,
  };
}
