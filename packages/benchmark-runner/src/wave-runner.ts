import type { ArmConfig, ArmExecutor, BenchmarkArm, BenchmarkDeps, SqlExecutor } from "./types.js";
import { recordArmRun, waveManifest, assertProviderTransmissible } from "@rhema/benchmark";
import { freezeArmConfig } from "./arms.js";
import { normalizeArmOutput, type BlindExtractor } from "./normalization.js";
import { createMatchTask, type AutomatedMatcher } from "./matching.js";
import { loadGold } from "@rhema/benchmark";

// The wave runner (deliverable 6): runs all arms over a wave's admitted manifest, normalizes their outputs, records
// the run-ledger join, and seeds the blind human matching tasks. It drives the P0.13 data layer + this ticket's
// normalization/matching layers; scoring + the report are `report.ts`. Running the pilot wave itself is P0.15 — this
// is the machinery + the dev-set dry run (AC1). A Rhema arm (A4/A5) is validated to pin its production engine build
// + protocol@version at freeze (REQ-EVAL-6); its ArmExecutor binding to the live engine is wired in P0.15.

export interface RunWaveInput {
  readonly waveId: string;
  /** the arm configs to run this wave (frozen + hashed here). */
  readonly arms: readonly ArmConfig[];
  /** the arm-execution seam (fake in tests / dev-set dry run; live engine in P0.15). */
  readonly executor: ArmExecutor;
  /** the blind, de-branding extractor that normalizes each arm output (REQ-EVAL-7). */
  readonly extractor: BlindExtractor;
  /** an optional automated matcher to SEED blind match-task suggestions (suggest-only — REQ-EVAL-8). */
  readonly matcher?: AutomatedMatcher;
  /**
   * Enforce the REQ-EVAL-3 provider-transmission gate before running any arm that transmits a corpus draft to a
   * model provider (an arm with a `modelFamily`): the provider's no-training/retention terms must be verified in
   * writing (`recordProviderVerification`), else the arm is refused. Default ON — "nothing is transmitted until it
   * is." Offline arms (A3/A6, no model family) never transmit and are never gated. (D-P0.13-2 call-site.)
   */
  readonly enforceProviderVerification?: boolean;
}

export interface ArmRunSummary {
  readonly arm: BenchmarkArm;
  readonly draftId: string;
  readonly armRunId: string;
  readonly normalizedFindings: number;
  readonly matchTasks: number;
}

export interface RunWaveResult {
  readonly runs: ArmRunSummary[];
  readonly armsRun: BenchmarkArm[];
  readonly drafts: string[];
}

/**
 * Run every arm over a wave's admitted manifest. For each arm × draft: execute the arm (skipped when the executor
 * returns null — e.g. an A6 draft with no entered result yet), record the arm run with its frozen config hash +
 * (for Rhema arms) the run-ledger run_id, normalize the raw output through the blind de-branding extractor, and
 * create a blind match task per normalized finding (seeded with an automated suggestion if a matcher is given).
 * Returns a per-run summary. Freezes each arm config first (REQ-EVAL-6/10/20).
 */
export async function runWave(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: RunWaveInput,
): Promise<RunWaveResult> {
  // 1. freeze + hash each arm config (REQ-EVAL-6/20). A Rhema arm without a pinned engine build/protocol throws.
  const configHash = new Map<BenchmarkArm, string>();
  for (const config of input.arms) {
    configHash.set(config.arm, await freezeArmConfig(exec, deps, { waveId: input.waveId, config }));
  }

  const drafts = await waveManifest(exec, input.waveId);
  const runs: ArmRunSummary[] = [];
  const armsRun = new Set<BenchmarkArm>();

  const enforceProvider = input.enforceProviderVerification ?? true;

  // 2. run each arm over each admitted draft.
  for (const config of input.arms) {
    const arm = config.arm;
    // REQ-EVAL-3 gate: an arm that transmits a corpus draft to a provider (any arm with a model family) may run
    // only if that provider's no-training/retention terms are verified in writing (D-P0.13-2). Checked once per arm.
    // The gate keys on the API PROVIDER (config.provider), which may differ from the model family (a model family
    // can be served by a different provider); it falls back to modelFamily when the two coincide.
    const provider = config.provider ?? config.modelFamily;
    if (enforceProvider && provider) {
      await assertProviderTransmissible(exec, provider, deps.clock.now());
    }
    for (const draftId of drafts) {
      const raw = await input.executor.run({ waveId: input.waveId, draftId, arm });
      if (raw === null) continue; // arm did not run this draft (e.g. A6 intake not yet entered)
      armsRun.add(arm);

      // record the arm run (run-ledger join for Rhema arms — REQ-EVAL-14/20)
      const armRunId = await recordArmRun(exec, deps, {
        waveId: input.waveId,
        draftId,
        arm,
        configHash: configHash.get(arm)!,
        // any arm may carry a run_id; a Rhema arm's engine build/protocol pin is validated at freeze (REQ-EVAL-6/20)
        runId: raw.runId,
        model: raw.model,
        latencyMs: raw.latencyMs,
      });

      // normalize (de-brand → blind extract → verbatim-substance → persist) — REQ-EVAL-7
      const normalized = await normalizeArmOutput(exec, deps, {
        armRunId,
        rawText: raw.text,
        draftId,
        extractor: input.extractor,
      });

      // seed blind human match tasks (REQ-EVAL-8) — one per normalized finding
      const gold = await loadGold(exec, draftId);
      for (const nf of normalized) {
        await createMatchTask(exec, deps, {
          waveId: input.waveId,
          draftId,
          arm,
          armFindingId: nf.id,
          armFinding: nf.finding,
          goldFindings: gold,
          matcher: input.matcher,
        });
      }

      runs.push({ arm, draftId, armRunId, normalizedFindings: normalized.length, matchTasks: normalized.length });
    }
  }

  return { runs, armsRun: [...armsRun].sort(), drafts };
}
