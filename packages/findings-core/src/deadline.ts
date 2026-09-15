// Gate deadline math (§6.4, §5.5; REQ-SPEC-18). Pure, clock-injected — the beta reading surface renders a
// gate's remaining time (the countdown goes amber at 5 min); the write path (approve/steer) is PRB.05.
// Framework-free.

/** Amber threshold: the gate countdown turns amber at 5 minutes (§5.9 motion; §6.4). */
export const AMBER_MS = 5 * 60 * 1000;

export interface DeadlineState {
  readonly deadlineAt: string | null;
  readonly remainingMs: number | null;
  readonly expired: boolean;
  /** true when a live deadline is within the amber threshold (≤ 5 min) but not yet expired. */
  readonly amber: boolean;
}

/** Compute a gate's deadline state relative to `now`. A null/absent deadline = "waiting for you" (no timer). */
export function gateDeadlineState(deadlineAt: string | null | undefined, now: Date): DeadlineState {
  if (deadlineAt == null) {
    return { deadlineAt: null, remainingMs: null, expired: false, amber: false };
  }
  const ms = Date.parse(deadlineAt);
  if (Number.isNaN(ms)) {
    return { deadlineAt, remainingMs: null, expired: false, amber: false };
  }
  const remainingMs = ms - now.getTime();
  const expired = remainingMs <= 0;
  return {
    deadlineAt,
    remainingMs,
    expired,
    amber: !expired && remainingMs <= AMBER_MS,
  };
}

/**
 * Humanize a remaining duration for the card ("~12 min", "~2 h 5 min", "under a minute"), or the expired label.
 * Returns the localizable *shape* via a small parts object so the app supplies vocabulary; the number math is here.
 */
export interface RemainingParts {
  readonly expired: boolean;
  readonly hours: number;
  readonly minutes: number;
  /** true when 0 < remaining < 1 min. */
  readonly underAMinute: boolean;
}

export function remainingParts(remainingMs: number | null): RemainingParts {
  if (remainingMs == null || remainingMs <= 0) {
    return { expired: remainingMs != null && remainingMs <= 0, hours: 0, minutes: 0, underAMinute: false };
  }
  const totalMinutes = Math.floor(remainingMs / 60000);
  return {
    expired: false,
    hours: Math.floor(totalMinutes / 60),
    minutes: totalMinutes % 60,
    underAMinute: totalMinutes === 0,
  };
}
