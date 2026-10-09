// Where a committed phase sends the run (§12.4 steps 6–7). The pod/harness commit loop (P0.15e; D-P0.15d-4)
// needs to turn a just-committed `PhaseManifest` into the `CommitNext` the internal commit route executes —
// advance (self-edge, run the next phase), open a gate (`gateAfter`), or finalize (the last active phase).
// This is the wiring the manifest's `gateAfter` field always described but nothing consumed: consult
// `resolveGatePolicy` (the R3 defaults + the run's policy/overrides) for a `gateAfter` phase, else finalize
// when it is the last active phase, else advance. Pure — the caller reports the decision, the server commits it.

import type { GateKind } from "@rhema/contracts";
import type { PhaseManifest } from "@rhema/protocols";
import { resolveGatePolicy, type GatePolicyContext } from "./gate-policy.js";
import type { CommitNext } from "./internal-api.js";

export interface CommitDecisionArgs {
  /** the phase that just committed (from the workflow manifest / the run spec's `request.phase`). */
  readonly phase: PhaseManifest;
  /** true when this is the last phase of the run's ACTIVE phase set (→ finalize, not advance). */
  readonly isLastPhase: boolean;
  /** gate-policy context (policy, overrides, approve_scope blocking/cap) for a `gateAfter` phase. */
  readonly gate: GatePolicyContext;
}

/**
 * Decide the run's next transition after `args.phase` commits (§12.4). A phase with a `gateAfter` gate that
 * `resolveGatePolicy` OPENS becomes a `gate` (the pod exits; the worker resumes on resolution). A gate that
 * policy SKIPS (Run-to-completion / autonomous) falls through to advance/finalize — the skip is a `by:'policy'`
 * decision the resolution path records, never a park. Otherwise the last active phase finalizes and any other
 * phase advances (self-edge; the harness re-fetches the run spec for the next phase). Pure.
 */
export function decideCommitNext(args: CommitDecisionArgs): CommitNext {
  const gateAfter = args.phase.gateAfter;
  if (gateAfter) {
    const resolution = resolveGatePolicy(gateAfter as GateKind, args.gate);
    if (resolution.action === "open") {
      return {
        kind: "gate",
        gateKind: gateAfter as GateKind,
        blocking: resolution.blocking,
        onExpiry: resolution.onExpiry,
        deadlineAt: resolution.deadlineAt,
        // RUN.1 (ADR-050) — an informational gate (blocking:false — the default approve_scope) records
        // the card but never parks: `then` carries the transition the run would have taken had the
        // gate not opened — advance into the next phase or finalize after the last one. Blocking
        // gates carry no `then` (the run waits for the decision).
        ...(resolution.blocking ? {} : { then: args.isLastPhase ? ("finalize" as const) : ("advance" as const) }),
      };
    }
    // action === "skip": the gate is turned off by policy; the run keeps moving (advance/finalize below).
  }
  return args.isLastPhase ? { kind: "finalize" } : { kind: "advance" };
}
