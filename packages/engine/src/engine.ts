// @rhema/engine — the `Engine` interface (ledger G15; REQ-ARCH-7) and the run-model value types.
//
// The orchestrator (P0.08) depends ONLY on `Engine`; a second engine is a test away (REQ-ARCH-7). The
// interface is `startPhase(req): AsyncIterable<EngineEvent>`, `abort(reason)`, `usage()` (§12.2). One phase
// runs per `startPhase` call (the phase-split hybrid, §12.2); the yielded events are the mapper's typed
// §12.5 run events plus engine-level result/usage markers the orchestrator needs for the completion oracle
// and the running-Σ (REQ-SPEC-13; review 13 F4).

import type { EventDensity, EventVisibility, RunEventType } from "@rhema/contracts";
import type { PhaseManifest } from "@rhema/protocols";
import type { UrlPolicy } from "@rhema/hooks";

/**
 * SDK token usage rolled up for one phase. The proxy is the meter of record (§12.7); this SDK-side figure
 * is the cross-check written as `usage_records{source:'sdk_stream'|'sdk_estimate'}`. `costUsd` is the SDK's
 * own estimate — the orchestrator reconciles it against the proxy rows (a >2% divergence raises a flag).
 */
export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  webSearchRequests: number;
  webFetchRequests: number;
  /** SDK-reported cost estimate in USD (the cross-check, not the meter of record). */
  costUsd: number;
}

export function emptyUsage(): UsageSnapshot {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
    costUsd: 0,
  };
}

/** The phase-result file (`.rhema/phase-result.json`) a ported skill writes (§12.2; REQ-SPEC-13 leg b). */
export type PhaseResultStatus = "done" | "blocked" | "replan";

/**
 * How the phase ended, from the SDK `result` message (REQ-SPEC-13 leg a). `success` is the only subtype the
 * completion oracle accepts; every other subtype is incomplete regardless of the files on disk. `budget` and
 * `aborted` are engine-synthesised (the proxy 402 → `budget`; `abort()` → `aborted`).
 */
export type ResultSubtype =
  | "success"
  | "error_max_turns"
  | "error_during_execution"
  | "budget"
  | "aborted"
  | "refusal";

/**
 * One item the engine yields. Either a typed §12.5 run event (already whitelist-validated and carrying its
 * visibility so the orchestrator can route it — `internal` rows never hit the SSE user route, REQ-ARCH-12),
 * a provisional per-tick usage snapshot (persisted as `sdk_stream` so the running Σ includes this phase —
 * review 13 F4), or the terminal result marker the completion oracle reads.
 */
export type EngineEvent =
  | {
      kind: "event";
      type: RunEventType;
      payload: unknown;
      visibility: EventVisibility;
      density: EventDensity;
      /** the subagent/agent this event is attributed to, when known (for `requester only` routing). */
      agentLabel?: string;
    }
  | { kind: "usage"; snapshot: UsageSnapshot }
  | { kind: "result"; subtype: ResultSubtype; usage: UsageSnapshot };

/** The seat + phase the engine runs, with just what the engine (not the whole run) needs. */
export interface PhaseRequest {
  runId: string;
  /** the run attempt (rotated on every re-enqueue; stamps events/usage — §12.4). */
  attempt: number;
  /** the working directory the SDK runs in (`/work/project`), passed as `cwd` (§12.2). */
  cwd: string;
  /** the phase to run, from the workflow manifest (§12.2). */
  phase: PhaseManifest;
  /** k of n, for `step.started`/`agent.note` ordinals. */
  ordinal: number;
  of: number;
  /** the ported skill slug (`editorial-review`) and its harness inputs (phase, scope, sidecar, …). */
  skill: string;
  inputs: Readonly<Record<string, unknown>>;
  /** the seat this phase runs as (for agent-label attribution and env). */
  seat: string;
  /** hard budget ceiling for the phase in USD → SDK `maxBudgetUsd` (the inner brake; §12.4). */
  maxBudgetUsd: number;
  maxTurns: number;
  /** the run's URL policy (hold-outs) — passed to the hook the engine wires (§12.6). */
  urlPolicy?: UrlPolicy;
}

/**
 * The engine abstraction (ledger G15; §12.2). Implementations: `AgentSdkEngine` (the self-hosted SDK, MVP),
 * the `ManagedAgentsEngine` stub (REQ-ARCH-7 — the second engine is a test away), and `FakeEngine` (replays
 * recorded fixtures for P0.15's integration suite — ledger G21).
 */
export interface Engine {
  /** Run exactly one phase, yielding mapped events until the terminal `result`. */
  startPhase(req: PhaseRequest): AsyncIterable<EngineEvent>;
  /** Abort the in-flight phase (cancellation, cap). Idempotent. */
  abort(reason: string): void;
  /** The phase's SDK-side usage so far (the cross-check figure; §12.7). */
  usage(): UsageSnapshot;
}
