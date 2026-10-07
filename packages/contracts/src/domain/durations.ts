// @rhema/contracts — the shared duration-band shape + the flat per-phase prior every pre-run and
// initial-ETA surface falls back to when the calibration store has no measured cell (EST.1;
// REQ-SPEC-32(b) — one duration vocabulary, never a per-surface derivation). PURE and protocols-free:
// this leaf carries the shape + the prior constant; the CALIBRATED bands come from `cost_card_cells`
// (ECON.1's store — `packages/ledger`), and the estimator-side composition lives in
// `@rhema/run-sheet`'s surface API.

/** A wall-clock duration band in whole minutes (low ≈ p10, high ≈ p95; gate waits excluded). */
export interface DurationBand {
  readonly lowMinutes: number;
  readonly highMinutes: number;
}

/**
 * The flat per-phase duration prior (minutes): the ORIGINAL sheet/card priors both measured ≈5 min a
 * phase on the 2026-09-30 incident run — one constant both surfaces now share until a calibrated cell
 * covers the bucket. Provisional by definition; a calibrated cell always outranks it.
 */
export const PHASE_DURATION_PRIOR_MINUTES = 5 as const;

/** The prior's uncertainty spread — ± a little under/over the mean (the same [0.8, 1.5] the run card
 *  has always used for its parametric band). */
export const DURATION_PRIOR_LOW_FRACTION = 0.8 as const;
export const DURATION_PRIOR_HIGH_FRACTION = 1.5 as const;

/**
 * The fallback duration band for a run of `phases` active phases: `phases × 5 min × [0.8, 1.5]`,
 * whole minutes, low ≥ 1 and high > low. Every surface that has no calibrated cell renders THIS —
 * the sheet, the protocol card, the Timeline chip and the run card's initial ETA all agree because
 * the prior is shared here.
 */
export function durationPriorForPhases(phases: number): DurationBand {
  const n = Math.max(1, phases);
  const low = Math.max(1, Math.round(n * PHASE_DURATION_PRIOR_MINUTES * DURATION_PRIOR_LOW_FRACTION));
  const high = Math.max(low + 1, Math.round(n * PHASE_DURATION_PRIOR_MINUTES * DURATION_PRIOR_HIGH_FRACTION));
  return { lowMinutes: low, highMinutes: high };
}
