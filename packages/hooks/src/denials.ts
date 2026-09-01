// @rhema/hooks — denial thresholds (§12.6).
//
// Three denials of ONE target abort the step as `failed(boundary)`; more than 20 denials in a phase raise
// a `run.hiccup` and one guided retry. The hook only *emits* these signals as data on the decision; the
// orchestrator (P0.08) is what acts on them (aborts the step, or retries the phase with guidance).

import type { ControlSignal } from "./types.js";

/** Denials of a single target that abort the step (§12.6). The 3rd denial fires. */
export const ABORT_PATH_DENIALS = 3;
/** Denials in a phase that trigger a hiccup + one guided retry (§12.6). The 21st denial fires. */
export const HICCUP_PHASE_DENIALS = 20;

/** Mutable per-phase denial counters. One is created per phase run and threaded through every evaluation. */
export interface DenialState {
  /** Denial count keyed by target (resolved path, normalized URL, or `Agent:<label>`). */
  readonly perTarget: Map<string, number>;
  /** Total denials seen this phase. */
  phaseTotal: number;
}

export function newDenialState(): DenialState {
  return { perTarget: new Map(), phaseTotal: 0 };
}

/**
 * Record one denial against `target` and return the control signal it triggers, if any. Step-fatal abort
 * (3rd denial of one target) takes precedence over the phase-wide hiccup (>20 denials this phase).
 */
export function recordDenial(state: DenialState, target: string): ControlSignal | undefined {
  state.phaseTotal += 1;
  const count = (state.perTarget.get(target) ?? 0) + 1;
  state.perTarget.set(target, count);
  if (count >= ABORT_PATH_DENIALS) return "abort_failed_boundary";
  if (state.phaseTotal > HICCUP_PHASE_DENIALS) return "hiccup_retry";
  return undefined;
}
