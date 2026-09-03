// Wave cadence hooks (REQ-EVAL-17): pilot wave at Phase-0 exit (machinery, dev set); wave 1 before launch gates
// launch claims; quarterly waves thereafter (full or lean per budget); a major frontier release triggers a
// re-steelmanned MINI-wave within 30 days, escalating to a FULL wave if the measured gap halves — "the bar the
// company must clear moves with the frontier." This module is the deterministic cadence logic the scheduler/operator
// drives; it schedules nothing itself (no cron here — the hooks are pure).

export type CadenceKind = "pilot" | "wave_1" | "quarterly" | "frontier_mini" | "frontier_full";

/** Days within which a re-steelmanned mini-wave must run after a major frontier release (REQ-EVAL-17). */
export const FRONTIER_MINI_WAVE_DAYS = 30;
/** Days between quarterly waves (REQ-EVAL-17). */
export const QUARTERLY_DAYS = 91;

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** The deadline by which a re-steelmanned mini-wave must run after a major frontier release (REQ-EVAL-17). */
export function frontierMiniWaveDeadline(releaseDate: Date): Date {
  return addDays(releaseDate, FRONTIER_MINI_WAVE_DAYS);
}

/** The next quarterly wave date after the last wave (REQ-EVAL-17). */
export function nextQuarterlyWave(lastWaveAt: Date): Date {
  return addDays(lastWaveAt, QUARTERLY_DAYS);
}

/**
 * Whether a frontier-triggered mini-wave escalates to a FULL wave (REQ-EVAL-17): "escalating to a full wave if the
 * measured gap halves." `priorGapPp` is the Rhema-over-A1 recall gap (pp) at the last full wave; `miniGapPp` the gap
 * measured in the mini-wave. The gap HALVING (or more) — the frontier closing on Rhema — triggers the full wave.
 */
export function shouldEscalateToFullWave(priorGapPp: number, miniGapPp: number): boolean {
  if (priorGapPp <= 0) return false; // no prior lead to halve
  return miniGapPp <= priorGapPp / 2;
}

/** A frontier release is "major" enough to trigger a mini-wave — the operator's call; a thin explicit predicate. */
export interface FrontierRelease {
  readonly provider: string;
  readonly model: string;
  readonly releasedAt: Date;
  readonly major: boolean;
}

/** The mini-wave obligation a major frontier release creates (REQ-EVAL-17), or null for a non-major release. */
export function frontierTrigger(release: FrontierRelease): { kind: "frontier_mini"; deadline: Date } | null {
  if (!release.major) return null;
  return { kind: "frontier_mini", deadline: frontierMiniWaveDeadline(release.releasedAt) };
}
