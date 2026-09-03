import { pairedDifference, fixSampleSize, type BenchmarkArm, type BenchmarkDeps, type SqlExecutor } from "@rhema/benchmark";
import type { WaveReport } from "./report.js";

// The Phase-0 pilot-wave power estimate (REQ-EVAL-5, REQ-EVAL-17; §17 exit criterion "σ_d estimated and benchmark
// n fixed"). The pilot wave runs on the dev set to estimate the variance of the paired per-draft recall difference
// between a Rhema arm (default A5, Full board) and the steelmanned frontier baseline (A1); n for the scored waves is
// fixed from that sd at ≥80% power for a 10-point difference, floor 24.
//
// This is the missing connector between the wave report (which computes each arm's `recallByDraft`) and the power
// module (which turns a paired-difference sd into a fixed n). Everything upstream (`generateWaveReport`) and
// downstream (`pairedDifference`/`fixSampleSize`) already exists; this wires them and records the result.

/** The default arms the pilot pairs: Rhema Full board (A5) vs the steelmanned frontier one-shot (A1). */
export const DEFAULT_PILOT_RHEMA_ARM: BenchmarkArm = "A5";
export const DEFAULT_PILOT_BASELINE_ARM: BenchmarkArm = "A1";

export interface PilotPowerOptions {
  /** the Rhema arm to score (default A5, Full board — the arm the LIFT criterion is about). */
  readonly rhemaArm?: BenchmarkArm;
  /** the baseline arm to pair against (default A1, the steelmanned frontier). */
  readonly baselineArm?: BenchmarkArm;
  /** the effect to power for, as a recall fraction (default 0.10 — REQ-EVAL-5). */
  readonly effect?: number;
  /** the hard floor on n (default 24 — REQ-EVAL-5). */
  readonly floor?: number;
}

export interface PilotPowerEstimate {
  readonly rhemaArm: BenchmarkArm;
  readonly baselineArm: BenchmarkArm;
  /** the shared dev-set draft ids the two arms were both scored on (sorted, deterministic). */
  readonly drafts: readonly string[];
  /** number of paired drafts the sd was estimated from. */
  readonly pairedN: number;
  /** σ_d — the sample sd of the per-draft paired recall difference (rhema − baseline). */
  readonly sigmaD: number;
  /** the mean paired recall difference, in percentage points (rhema − baseline). */
  readonly meanDeltaPp: number;
  /** n required for ≥80% power to detect `effect` at σ_d (before the floor). */
  readonly requiredN: number;
  /** the n actually fixed for the scored waves: max(requiredN, floor). */
  readonly fixedN: number;
  /** the smallest recall difference detectable at `fixedN` (percentage points). */
  readonly detectableEffectAtFixedNPp: number;
  /** false when there were < 2 shared drafts (a variance needs ≥ 2 observations) — n was NOT fixed. */
  readonly sufficient: boolean;
}

function recallVector(arms: WaveReport["arms"], arm: BenchmarkArm, drafts: readonly string[]): number[] {
  const m = arms.find((a) => a.arm === arm);
  if (!m) throw new Error(`estimatePilotPower: arm ${arm} not present in the wave report`);
  return drafts.map((d) => {
    const r = m.recallByDraft[d];
    if (r == null) throw new Error(`estimatePilotPower: arm ${arm} has no recall for draft ${d}`);
    return r;
  });
}

/**
 * Estimate the pilot's paired-difference variance and fix n (REQ-EVAL-5). Pairs the Rhema arm's per-draft recalls
 * against the baseline's over the drafts BOTH arms were scored on. With < 2 shared drafts the variance is undefined,
 * so it returns `sufficient: false` with `fixedN` left at the floor rather than fabricating an estimate.
 */
export function estimatePilotPower(report: WaveReport, opts: PilotPowerOptions = {}): PilotPowerEstimate {
  const rhemaArm = opts.rhemaArm ?? DEFAULT_PILOT_RHEMA_ARM;
  const baselineArm = opts.baselineArm ?? DEFAULT_PILOT_BASELINE_ARM;
  const effect = opts.effect ?? 0.1;
  const floor = opts.floor ?? 24;

  const rhema = report.arms.find((a) => a.arm === rhemaArm);
  const baseline = report.arms.find((a) => a.arm === baselineArm);
  if (!rhema) throw new Error(`estimatePilotPower: Rhema arm ${rhemaArm} not present in the wave report`);
  if (!baseline) throw new Error(`estimatePilotPower: baseline arm ${baselineArm} not present in the wave report`);

  // shared drafts = the intersection of the two arms' scored drafts (a paired analysis needs both), sorted so the
  // vectors — and thus σ_d — are deterministic regardless of insertion order.
  const shared = Object.keys(rhema.recallByDraft)
    .filter((d) => d in baseline.recallByDraft)
    .sort();

  if (shared.length < 2) {
    return {
      rhemaArm,
      baselineArm,
      drafts: shared,
      pairedN: shared.length,
      sigmaD: 0,
      meanDeltaPp: 0,
      requiredN: 0,
      fixedN: floor,
      detectableEffectAtFixedNPp: 0,
      sufficient: false,
    };
  }

  const pd = pairedDifference(recallVector(report.arms, rhemaArm, shared), recallVector(report.arms, baselineArm, shared));
  const ss = fixSampleSize(pd.sd, { effect, floor });

  return {
    rhemaArm,
    baselineArm,
    drafts: shared,
    pairedN: pd.n,
    sigmaD: pd.sd,
    meanDeltaPp: pd.meanDifference * 100,
    requiredN: ss.requiredN,
    fixedN: ss.fixedN,
    detectableEffectAtFixedNPp: ss.detectableEffectAtFixedN * 100,
    sufficient: true,
  };
}

/**
 * Persist the pilot power estimate onto the wave (REQ-EVAL-5 "σ_d estimated and benchmark n fixed and recorded";
 * migration 0015). Records σ_d and the fixed n so a scored wave can trace which pilot fixed its sample size.
 */
export async function recordPilotPower(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  waveId: string,
  est: PilotPowerEstimate,
): Promise<void> {
  await exec.query(
    `update benchmark_waves
        set pilot_sigma_d = $2, pilot_fixed_n = $3, pilot_recorded_at = $4
      where id = $1`,
    [waveId, est.sigmaD, est.fixedN, deps.clock.now()],
  );
}
