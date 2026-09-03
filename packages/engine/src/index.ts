// @rhema/engine — the Engine interface (ledger G15; REQ-ARCH-7), skeleton for P0.01.
//
// The orchestrator depends ONLY on `Engine`; a second engine is a test away. P0.06 fills in
// `AgentSdkEngine`. Here we fix the interface and a not-yet-implemented stub so the dependency graph
// (run-task -> engine -> protocols) builds now.

import type { PhaseManifest } from "@rhema/protocols";

export interface PhaseRequest {
  runId: string;
  phase: PhaseManifest;
  cwd: string;
  /** Hard budget ceiling for the phase in USD (maps to the SDK `maxBudgetUsd`). */
  maxBudgetUsd: number;
  maxTurns: number;
}

export type EngineEvent =
  | { type: "step"; key: string; at: string }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "result"; subtype: "success" | "error" | "aborted" };

export interface UsageSnapshot {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface Engine {
  startPhase(req: PhaseRequest): AsyncIterable<EngineEvent>;
  abort(reason: string): void;
  usage(): UsageSnapshot;
}

/** Placeholder engine so the interface has a concrete, buildable implementor. Wired in P0.06. */
export class AgentSdkEngine implements Engine {
  // eslint-disable-next-line require-yield
  async *startPhase(_req: PhaseRequest): AsyncIterable<EngineEvent> {
    throw new Error("AgentSdkEngine.startPhase not implemented until P0.06");
  }
  abort(_reason: string): void {
    throw new Error("AgentSdkEngine.abort not implemented until P0.06");
  }
  usage(): UsageSnapshot {
    return { inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
}
