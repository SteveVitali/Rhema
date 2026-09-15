import { mean, sampleVariance } from "./stats.js";

// Power machinery (REQ-EVAL-5, deterministic). "The primary analysis is paired per-draft. A pilot wave on the dev
// set estimates the variance of the paired recall difference; final n is fixed from that estimate at ≥80% power for a
// 10-point recall difference, floor n=24." The design: for each dev-set draft, recall(Rhema) − recall(A1) is a paired
// difference; its sample sd across drafts drives the sample-size calculation for the scored waves.

/** z-quantiles (standard normal) for the sample-size formula. two-sided α = 0.05 → z_{α/2}; power 0.80 → z_β. */
const Z_ALPHA_TWO_SIDED_05 = 1.959963984540054; // Φ⁻¹(0.975)
const Z_POWER_80 = 0.8416212335729143; // Φ⁻¹(0.80)

/** The paired per-draft differences (Rhema recall − A1 recall) and their summary statistics. */
export interface PairedDifference {
  readonly differences: number[];
  readonly meanDifference: number;
  readonly sd: number;
  readonly variance: number;
  readonly n: number;
}

/**
 * Compute the paired per-draft recall differences from aligned per-draft recalls. `rhema[i]` and `baseline[i]` are
 * the two arms' recalls on draft i (in [0,1]); the difference is rhema − baseline. Requires ≥2 drafts (a variance
 * needs at least two observations).
 */
export function pairedDifference(
  rhema: readonly number[],
  baseline: readonly number[],
): PairedDifference {
  if (rhema.length !== baseline.length) throw new Error("pairedDifference: arms differ in draft count");
  if (rhema.length < 2) throw new Error("pairedDifference: need ≥2 paired drafts for a variance estimate");
  const differences = rhema.map((r, i) => r - baseline[i]!);
  const variance = sampleVariance(differences);
  return {
    differences,
    meanDifference: mean(differences),
    sd: Math.sqrt(variance),
    variance,
    n: differences.length,
  };
}

export interface SampleSizeOptions {
  /** the effect to detect, in recall points as a fraction (default 0.10 — a 10-point difference; REQ-EVAL-5). */
  readonly effect?: number;
  /** the hard floor on n (default 24 — REQ-EVAL-5). */
  readonly floor?: number;
  /** z for the two-sided α (default α = 0.05). */
  readonly zAlpha?: number;
  /** z for the target power (default 0.80). */
  readonly zPower?: number;
}

export interface SampleSizeResult {
  /** sd of the paired difference the calculation used. */
  readonly sd: number;
  /** the effect size targeted (fraction). */
  readonly effect: number;
  /** n required for ≥80% power to detect `effect` at the paired difference's sd (before the floor). */
  readonly requiredN: number;
  /** the n actually fixed: max(requiredN, floor) (REQ-EVAL-5). */
  readonly fixedN: number;
  readonly floor: number;
  /** the smallest effect detectable at `fixedN` and this sd, at 80% power (the "n=30 detects 8–10 pts" check). */
  readonly detectableEffectAtFixedN: number;
}

/**
 * Fix the final n from a pilot's paired-difference sd (REQ-EVAL-5). Paired-difference sample size for a normal
 * approximation: n = ((z_{α/2} + z_β)·sd / effect)². Rounded UP, then floored at `floor` (24). A zero-variance pilot
 * (every draft moved identically) needs only the floor.
 */
export function fixSampleSize(sd: number, opts: SampleSizeOptions = {}): SampleSizeResult {
  const effect = opts.effect ?? 0.1;
  const floor = opts.floor ?? 24;
  const zAlpha = opts.zAlpha ?? Z_ALPHA_TWO_SIDED_05;
  const zPower = opts.zPower ?? Z_POWER_80;
  if (effect <= 0) throw new Error("fixSampleSize: effect must be > 0");
  const zSum = zAlpha + zPower;
  const requiredN = sd <= 0 ? 0 : Math.ceil(((zSum * sd) / effect) ** 2);
  const fixedN = Math.max(requiredN, floor);
  // Invert the formula at fixedN to report the minimum detectable effect there.
  const detectableEffectAtFixedN = fixedN > 0 ? (zSum * sd) / Math.sqrt(fixedN) : 0;
  return { sd, effect, requiredN, fixedN, floor, detectableEffectAtFixedN };
}
