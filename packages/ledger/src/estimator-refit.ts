// The weekly estimator re-fit (P1.16; REQ-BILL-7 amended; §14.6). The per-run cap is `estimate ×
// cap_multiplier`; the multiplier starts at 1.5 and steps DOWN toward a 1.25 floor as completed-run
// evidence shows estimates landing at/above actual spend, and steps back UP toward 1.5 when runs
// overrun (the absorbed-overrun circuit breaker in circuit-breaker.ts still overrides to 2× on a spike —
// this is the slow evidence loop, that is the fast protection). Every re-fit writes an `estimator_fits`
// evidence row; the live multiplier lives in `estimator_config` (singleton 'current').

import type { SqlClient, Clock, IdFactory } from "@rhema/orchestrator";
import { PRICING } from "@rhema/contracts";

export const CAP_MULTIPLIER_FLOOR = 1.25;
export const CAP_MULTIPLIER_CEILING = PRICING.controls.perRunCapMultiplier; // 1.5
export const REFIT_STEP_DOWN = 0.05;
export const REFIT_STEP_UP = 0.1;
/** Below this many completed runs in the window, the multiplier does not move (insufficient evidence). */
export const REFIT_MIN_SAMPLE = 20;
export const REFIT_WINDOW_DAYS = 28;

export interface EstimatorFitResult {
  readonly sampleRuns: number;
  readonly medianRatio: number | null;
  readonly previousMultiplier: number;
  readonly capMultiplier: number;
  readonly moved: "down" | "up" | "held" | "insufficient";
}

/** The multiplier a NEW run's cap uses (estimate-routes / run-creation read this). */
export async function currentCapMultiplier(exec: SqlClient): Promise<number> {
  const row = (
    await exec.query("select cap_multiplier::float as m from estimator_config where id = 'current'")
  ).rows[0] as { m: number } | undefined;
  return row?.m ?? CAP_MULTIPLIER_CEILING;
}

/**
 * Re-fit the cap multiplier from the trailing `REFIT_WINDOW_DAYS` of completed runs. Ratio = Σ estimate /
 * Σ actual per run (a ratio ≥ 1 means estimates covered spend — headroom to tighten the band; < 0.85
 * means real overruns — widen back). Writes the evidence row and updates the singleton.
 */
export async function weeklyEstimatorRefit(
  exec: SqlClient,
  deps: { ids: IdFactory; clock: Clock },
  now: Date,
): Promise<EstimatorFitResult> {
  const since = new Date(now.getTime() - REFIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = (
    await exec.query(
      `select estimate_credits::float as est, spent_credits::float as act
         from runs
        where state = 'completed' and ended_at >= $1 and ended_at <= $2
          and spent_credits > 0 and estimate_credits > 0 and entitlement_id is null`,
      [since, now],
    )
  ).rows as { est: number; act: number }[];

  const previous = await currentCapMultiplier(exec);
  const sample = rows.length;
  if (sample < REFIT_MIN_SAMPLE) {
    await exec.query(
      `insert into estimator_fits (id, computed_at, sample_runs, median_ratio, cap_multiplier, note)
         values ($1,$2,$3,$4,$5,$6)`,
      [deps.ids("fit"), now, sample, null, previous, `insufficient sample (${sample} < ${REFIT_MIN_SAMPLE})`],
    );
    return { sampleRuns: sample, medianRatio: null, previousMultiplier: previous, capMultiplier: previous, moved: "insufficient" };
  }

  const ratios = rows.map((r) => r.est / r.act).sort((a, b) => a - b);
  const median = ratios[Math.floor(ratios.length / 2)]!;
  let next = previous;
  let moved: EstimatorFitResult["moved"] = "held";
  if (median >= 1.0) {
    next = Math.max(CAP_MULTIPLIER_FLOOR, previous - REFIT_STEP_DOWN);
    moved = next < previous ? "down" : "held";
  } else if (median < 0.85) {
    next = Math.min(CAP_MULTIPLIER_CEILING, previous + REFIT_STEP_UP);
    moved = next > previous ? "up" : "held";
  }
  if (next !== previous) {
    await exec.query(
      "update estimator_config set cap_multiplier = $1, updated_at = $2 where id = 'current'",
      [next, now],
    );
  }
  await exec.query(
    `insert into estimator_fits (id, computed_at, sample_runs, median_ratio, cap_multiplier, note)
       values ($1,$2,$3,$4,$5,$6)`,
    [deps.ids("fit"), now, sample, median, next, `median estimate/actual ${median.toFixed(3)} → ${moved}`],
  );
  return { sampleRuns: sample, medianRatio: median, previousMultiplier: previous, capMultiplier: next, moved };
}
