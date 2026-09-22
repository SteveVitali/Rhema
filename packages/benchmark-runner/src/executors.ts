import type { ArmConfig, ArmExecutor, BenchmarkArm, RawArmOutput } from "./types.js";
import { isRhemaArm } from "./arms.js";

// The LIVE `ArmExecutor` bindings (D-P0.14-1) — the real per-arm runners that produce each arm's raw output:
//   A1  steelmanned frontier   — best-of-two, native search, max reasoning (a frontier model client)
//   A2  generic recipe         — one generic-model completion of a published recipe
//   A4  Rhema Standard         — drive the production engine at the pinned protocol@version (Standard rigor)
//   A5  Rhema Full board       — the same engine at Full-board rigor
//   A3  Grammarly-class        — craft-only results entered out-of-band (intake, not executed)
//   A6  human editors          — the human-editor intake path (results entered, not executed)
//
// Every heavy binding (frontier/generic model calls, the production engine, the human intake store) is a DI
// seam, so the executors are deterministic in tests + the dev-set dry run. The LIVE bindings of those seams
// (real model calls, the live engine, the workshop intake surface) are the operator-gated Stage-B work; this
// module is the executor logic those seams plug into. Provider no-training gating (REQ-EVAL-3) is enforced by
// `runWave` before it calls `.run` — an executor is only reached for a transmissible provider.

/** A model completion returned by a frontier/generic client (A1/A2). */
export interface ModelCompletion {
  readonly text: string;
  readonly model?: string;
  readonly latencyMs?: number;
}

/** The frontier/generic model seam (A1/A2). `settings` carries the frozen config (search, reasoning, recipe…). */
export interface ArmModelClient {
  complete(input: {
    readonly draftId: string;
    readonly model?: string;
    readonly settings?: Readonly<Record<string, unknown>>;
    readonly prompt?: string;
  }): Promise<ModelCompletion>;
}

/** The result of driving the Rhema production engine for one draft (A4/A5). Carries the run-ledger `runId`. */
export interface EngineReviewResult {
  readonly text: string;
  /** The run-ledger run_id — joins `usage_records` for the economics metric (REQ-EVAL-14/20). */
  readonly runId: string;
  readonly model?: string;
  readonly latencyMs?: number;
}

/** The production-engine seam (A4/A5) — runs a real Review at a pinned build + protocol@version. */
export interface EngineArmRunner {
  runReview(input: {
    readonly waveId: string;
    readonly draftId: string;
    readonly engineBuild: string;
    readonly protocolVersion: string;
    readonly rigor?: string;
  }): Promise<EngineReviewResult>;
}

/** The out-of-band intake seam (A3 craft results, A6 human-editor results) — pre-entered, keyed by draft. */
export interface HumanEditorIntake {
  load(input: {
    readonly waveId: string;
    readonly draftId: string;
    readonly arm: BenchmarkArm;
  }): Promise<{ readonly text: string; readonly latencyMs?: number } | null>;
}

export interface ArmExecutorDeps {
  /** The A1/A2 model client. Required if the wave runs A1 or A2. */
  readonly modelClient?: ArmModelClient;
  /** The A4/A5 production-engine runner. Required if the wave runs a Rhema arm. */
  readonly engineRunner?: EngineArmRunner;
  /** The A3/A6 intake store. Required if the wave runs A3 or A6. */
  readonly intake?: HumanEditorIntake;
  /**
   * Best-of-two selector for A1 (REQ-EVAL-6). Given the two candidate completions, return the chosen one.
   * Default: the longer text (more substance) — a blind, arm-agnostic heuristic; a wave may inject a
   * pairwise judge instead. Selection happens BEFORE normalization, so it never sees a de-branded finding set.
   */
  readonly selectBestOf?: (candidates: readonly ModelCompletion[]) => ModelCompletion;
}

class MissingBindingError extends Error {
  constructor(arm: BenchmarkArm, seam: string) {
    super(`benchmark-runner: arm ${arm} needs the '${seam}' binding but none was provided`);
    this.name = "MissingBindingError";
  }
}

const defaultSelectBestOf = (candidates: readonly ModelCompletion[]): ModelCompletion =>
  candidates.reduce((best, c) => (c.text.length > best.text.length ? c : best));

/**
 * Build the live `ArmExecutor` for a wave from its frozen arm configs + the runtime bindings. Dispatches each
 * (arm, draft) to the right runner; returns `null` for an arm with no config in the wave (it does not run that
 * draft). A1 runs best-of-two; A4/A5 drive the engine and stamp the `runId`; A3/A6 read pre-entered results.
 */
export function createArmExecutor(configs: readonly ArmConfig[], deps: ArmExecutorDeps): ArmExecutor {
  const byArm = new Map<BenchmarkArm, ArmConfig>(configs.map((c) => [c.arm, c]));
  const selectBestOf = deps.selectBestOf ?? defaultSelectBestOf;

  return {
    async run({ waveId, draftId, arm }): Promise<RawArmOutput | null> {
      const config = byArm.get(arm);
      if (!config) return null; // this arm does not run in this wave

      // --- Rhema arms (A4/A5): drive the production engine at the pinned build + protocol@version. ---
      if (isRhemaArm(arm)) {
        if (!deps.engineRunner) throw new MissingBindingError(arm, "engineRunner");
        // assertArmConfigValid (arms.ts) guarantees these at freeze; assert again to fail loud if bypassed.
        if (!config.engineBuild || !config.protocolVersion)
          throw new MissingBindingError(arm, "engineBuild+protocolVersion");
        const result = await deps.engineRunner.runReview({
          waveId,
          draftId,
          engineBuild: config.engineBuild,
          protocolVersion: config.protocolVersion,
          rigor: typeof config.settings?.rigor === "string" ? (config.settings.rigor as string) : undefined,
        });
        return {
          arm,
          draftId,
          text: result.text,
          runId: result.runId, // the join into usage_records (economics metric)
          model: result.model ?? config.model,
          latencyMs: result.latencyMs,
        };
      }

      // --- Offline arms (A3 craft, A6 human editors): read pre-entered results. ---
      if (arm === "A3" || arm === "A6") {
        if (!deps.intake) throw new MissingBindingError(arm, "intake");
        const entered = await deps.intake.load({ waveId, draftId, arm });
        if (!entered) return null; // no result entered for this draft yet
        return { arm, draftId, text: entered.text, model: config.model, latencyMs: entered.latencyMs };
      }

      // --- Model arms (A1 frontier best-of-two, A2 generic recipe). ---
      if (!deps.modelClient) throw new MissingBindingError(arm, "modelClient");
      const callOnce = () =>
        deps.modelClient!.complete({ draftId, model: config.model, settings: config.settings, prompt: config.prompt });

      let chosen: ModelCompletion;
      if (arm === "A1") {
        // Best-of-two (REQ-EVAL-6): two independent completions, blind selection.
        const candidates = await Promise.all([callOnce(), callOnce()]);
        chosen = selectBestOf(candidates);
      } else {
        chosen = await callOnce();
      }
      return { arm, draftId, text: chosen.text, model: chosen.model ?? config.model, latencyMs: chosen.latencyMs };
    },
  };
}
