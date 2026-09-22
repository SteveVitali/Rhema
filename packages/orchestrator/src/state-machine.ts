// The §12.4 run lifecycle state machine, encoded as data (REQ-RUN-10 — guarded transitions).
//
// State is COMPUTED and TRANSACTED, never stored opinion; every transition is made only by the orchestrator
// in a transaction that also appends the `run.state_changed` event (REQ-DATA-33) — see transition.ts. This
// module is the pure guard: which (from → to) edges the diagram permits, and which states are terminal.

import { RUN_STATES } from "@rhema/contracts";

export type RunState = (typeof RUN_STATES)[number];

/**
 * The §12.4 state diagram as an adjacency map. Each edge is a transition the orchestrator may make; anything
 * not listed is a bug and `assertTransition` throws. Comments name the diagram's trigger for the edge.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  created: [
    "queued", //           sheet-launched (consent client-side; hold placed)
    "awaiting_consent", //  created without a sheet → confirm_cost gate
  ],
  awaiting_consent: [
    "queued", //     confirmed (hold placed)
    "cancelled", //  declined / 7 days
  ],
  queued: [
    "provisioning", // lock set acquired, concurrency slot free, worker claims run.start
    "cancelled", //    stop before a task exists (no partials to keep)
  ],
  provisioning: [
    "running", //  first heartbeat
    "failed", //   launch fails 3×
    "cancelled", // stop before the first heartbeat
  ],
  running: [
    "running", //          phase i/n committed (self-edge)
    "waiting_gate", //     gateAfter → gate opened, task exits
    "cancelling", //       stop requested
    "orphaned", //         heartbeat stale > 3 min
    "finalizing", //       final phase committed
    "failed", //           terminal error, retries exhausted; boundary/validation with nothing deliverable
    "completed_partial", // cap reached / step failed after ≥1 delivered artifact
  ],
  waiting_gate: [
    "queued", //            approved / expired-proceed → run.resume
    "cancelled", //         stop / expired-cancel
    "completed_partial", // resume_partial accepted
  ],
  cancelling: [
    "cancelled", // phase quiesced, partials committed
  ],
  orphaned: [
    "queued", //        reaper re-enqueues run.resume (≤ 2)
    "waiting_gate", //  resumes exhausted → resume_partial gate
  ],
  finalizing: [
    "completed", // delivery transaction committed
    "failed", //    delivery validation (cited ⇒ fetched, parse) unrecoverable
  ],
  completed: [],
  completed_partial: [],
  failed: [],
  cancelled: [],
};

/**
 * The §12.4 terminal states (absorbing). The complement — NON_TERMINAL_RUN_STATES — is the beta's
 * "run in progress" set (D-PRB.20-1 / PRB.21: at most ONE non-terminal run per project). `orphaned`
 * is deliberately non-terminal here: the reaper re-enqueues it (it still holds its lock set + hold).
 */
export const TERMINAL_RUN_STATES = ["completed", "completed_partial", "failed", "cancelled"] as const;

/** Every run state that still occupies the project (the one-active-run guard's blocking set). */
export const NON_TERMINAL_RUN_STATES: readonly RunState[] = RUN_STATES.filter(
  (s) => !(TERMINAL_RUN_STATES as readonly string[]).includes(s),
);

const TERMINAL: ReadonlySet<RunState> = new Set(TERMINAL_RUN_STATES);

/** A parked run (`waiting_gate`) or a queued run consumes no compute; waiting is free (Q-7). */
const PARKED: ReadonlySet<RunState> = new Set(["queued", "awaiting_consent", "waiting_gate"]);

export function isTerminal(state: RunState): boolean {
  return TERMINAL.has(state);
}

/** True when the run holds no running sandbox — waiting/queued/parked consume no compute (§6.4). */
export function isParked(state: RunState): boolean {
  return PARKED.has(state);
}

export function canTransition(from: RunState, to: RunState): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Illegal-transition guard. Terminal states are absorbing: no edge leaves them. */
export class IllegalTransitionError extends Error {
  constructor(
    readonly from: RunState,
    readonly to: RunState,
  ) {
    super(`illegal run transition ${from} → ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export function assertTransition(from: RunState, to: RunState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}
