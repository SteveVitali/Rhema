// Retry classes by `error_class` (§12.4 "Cancellation, retries, partials"; REQ-RUN-16).
//
// A failed phase is classified, and the class decides whether the orchestrator retries, opens a gate, or ends
// the step — never a silent overrun, never a silent partial. This is the pure policy; the phase loop and the
// reaper apply it.

import type { ResultSubtype } from "@rhema/engine";

export type ErrorClass =
  | "infra" //               infra failure (launch, network to api) — ≤2 with backoff
  | "provider_transient" //  provider 5xx/529 — engine retry then ≤2; a provider outage pauses new launches ≤2 h
  | "budget" //              proxy 402 / cap reached — borrow once within cap, else resume_partial
  | "artifact_missing" //    completion oracle failed (maxTurns/incomplete file/predicate) — one guided retry
  | "refusal" //             provider refusal or validation failure — → refusal gate
  | "boundary" //            a boundary denial — NOT a failure; warning badge; quarantine past a threshold
  | "stale_task"; //         a call from a superseded attempt — the task exits

export type ExhaustAction =
  | "failed" //              terminal failed
  | "failed_with_partials" // failed for the step, delivered partials kept
  | "resume_partial" //      open a resume_partial gate (waiting_gate)
  | "refusal_gate" //        open a refusal gate (waiting_gate)
  | "quarantine" //          quarantine the run's artifacts pending review
  | "exit"; //               the task self-terminates (no orchestrator retry)

export interface RetryPolicy {
  /** Max orchestrator re-enqueues for a step in this class (0 = never retry). */
  readonly maxRetries: number;
  /** Apply exponential backoff between attempts. */
  readonly backoff: boolean;
  /** Let the engine retry once before the orchestrator re-enqueues. */
  readonly engineRetryFirst: boolean;
  /** The retry carries the phase report as guidance (`artifact_missing`). */
  readonly guided: boolean;
  /** A boundary denial is a warning, not a step failure. */
  readonly isFailure: boolean;
  /** What happens once retries are exhausted. */
  readonly onExhaust: ExhaustAction;
}

export const RETRY_POLICIES: Readonly<Record<ErrorClass, RetryPolicy>> = {
  infra: { maxRetries: 2, backoff: true, engineRetryFirst: false, guided: false, isFailure: true, onExhaust: "failed" },
  provider_transient: {
    maxRetries: 2,
    backoff: true,
    engineRetryFirst: true,
    guided: false,
    isFailure: true,
    onExhaust: "failed",
  },
  // borrow once from remaining phases within the cap, else resume_partial (§12.4).
  budget: { maxRetries: 1, backoff: false, engineRetryFirst: false, guided: false, isFailure: true, onExhaust: "resume_partial" },
  // one guided retry with the phase report, then failed for the step with partials kept (REQ-SPEC-13).
  artifact_missing: {
    maxRetries: 1,
    backoff: false,
    engineRetryFirst: false,
    guided: true,
    isFailure: true,
    onExhaust: "failed_with_partials",
  },
  refusal: { maxRetries: 0, backoff: false, engineRetryFirst: false, guided: false, isFailure: true, onExhaust: "refusal_gate" },
  // NOT a failure; >5 violations or a write to an immutable artifact quarantines (§12.4). Threshold in phase-loop.
  boundary: { maxRetries: 0, backoff: false, engineRetryFirst: false, guided: false, isFailure: false, onExhaust: "quarantine" },
  stale_task: { maxRetries: 0, backoff: false, engineRetryFirst: false, guided: false, isFailure: true, onExhaust: "exit" },
};

/** >5 boundary violations, or any write to an immutable artifact, quarantines the run's artifacts (§12.4). */
export const BOUNDARY_QUARANTINE_THRESHOLD = 5;

/** Provider outage pauses new launches for at most this long without failing queued runs (§12.4). */
export const PROVIDER_OUTAGE_PAUSE_MS = 2 * 60 * 60 * 1000;

/**
 * Map an SDK result subtype (the completion oracle's leg (a)) to an error class. `success` and `aborted`
 * return null — `success` is complete; `aborted` is an orchestrator-initiated cancel/cap handled by the caller.
 */
export function subtypeToErrorClass(subtype: ResultSubtype): ErrorClass | null {
  switch (subtype) {
    case "success":
      return null;
    case "aborted":
      return null; // cancel / cap — the caller already knows why it aborted
    case "budget":
      return "budget";
    case "refusal":
      return "refusal";
    case "error_max_turns":
      return "artifact_missing"; // a maxTurns stop leaves a plausible partial — incomplete, one guided retry
    case "error_during_execution":
      return "infra";
    default: {
      const _exhaustive: never = subtype;
      return _exhaustive;
    }
  }
}

export function retryPolicyFor(cls: ErrorClass): RetryPolicy {
  return RETRY_POLICIES[cls];
}
