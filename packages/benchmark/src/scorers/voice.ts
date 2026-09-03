// Voice-preservation scorer — the band-conformance half (REQ-EVAL-12, deterministic). "Measured with the product's
// own measurement service: post-revision voice-feature band conformance against the author's measured ranges, drift
// direction, and cross-arm convergence (the homogenization signal)." The feature EXTRACTION is @rhema/measure's
// job (a skeleton today); this scorer consumes the measured feature vectors + the author's measured bands and
// computes conformance / drift / convergence over them. The claim-inventory meaning diff (the other half of
// REQ-EVAL-12) is `meaning-diff.ts`.

/** A feature vector: measured value per named voice feature (e.g. sentence-length mean, subordination rate). */
export type FeatureVector = Readonly<Record<string, number>>;
/** The author's measured band per feature: an inclusive [lo, hi] range. */
export type VoiceBands = Readonly<Record<string, readonly [number, number]>>;

export type DriftDirection = "in_band" | "below" | "above";

export interface FeatureConformance {
  readonly feature: string;
  readonly value: number;
  readonly band: readonly [number, number];
  readonly inBand: boolean;
  readonly direction: DriftDirection;
  /** signed distance outside the band (0 when in band; negative below lo, positive above hi). */
  readonly drift: number;
}

export interface VoiceConformance {
  readonly perFeature: FeatureConformance[];
  /** fraction of measured features that fall within the author's band, in [0,1]. */
  readonly conformance: number;
  readonly inBand: number;
  readonly total: number;
}

/** Score one arm's post-revision feature vector against the author's bands. Only features present in BOTH the
 *  vector and the bands are scored (a feature with no author band cannot be judged for conformance). */
export function voiceConformance(features: FeatureVector, bands: VoiceBands): VoiceConformance {
  const perFeature: FeatureConformance[] = [];
  for (const feature of Object.keys(bands).sort()) {
    const value = features[feature];
    if (value === undefined) continue;
    const [lo, hi] = bands[feature]!;
    let direction: DriftDirection = "in_band";
    let drift = 0;
    if (value < lo) {
      direction = "below";
      drift = value - lo;
    } else if (value > hi) {
      direction = "above";
      drift = value - hi;
    }
    perFeature.push({ feature, value, band: [lo, hi], inBand: direction === "in_band", direction, drift });
  }
  const inBand = perFeature.filter((f) => f.inBand).length;
  const total = perFeature.length;
  return { perFeature, conformance: total === 0 ? 1 : inBand / total, inBand, total };
}

export interface ConvergenceResult {
  readonly perFeature: Readonly<Record<string, number>>;
  /** mean cross-arm range over features — a LOW value is the homogenization signal (arms converging on one voice). */
  readonly meanRange: number;
  readonly features: number;
}

/**
 * Cross-arm convergence (REQ-EVAL-12 "cross-arm convergence — the homogenization signal"): given several arms'
 * feature vectors, the per-feature spread (max − min) across arms. When multiple arms drive an author's prose toward
 * the same values, the spread collapses — the anti-hivemind signal. Only features present in ≥2 arms are measured.
 */
export function crossArmConvergence(vectors: readonly FeatureVector[]): ConvergenceResult {
  const byFeature = new Map<string, number[]>();
  for (const v of vectors) {
    for (const [feature, value] of Object.entries(v)) {
      const arr = byFeature.get(feature) ?? [];
      arr.push(value);
      byFeature.set(feature, arr);
    }
  }
  const perFeature: Record<string, number> = {};
  const ranges: number[] = [];
  for (const [feature, values] of [...byFeature.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (values.length < 2) continue;
    const range = Math.max(...values) - Math.min(...values);
    perFeature[feature] = range;
    ranges.push(range);
  }
  const meanRange = ranges.length === 0 ? 0 : ranges.reduce((s, x) => s + x, 0) / ranges.length;
  return { perFeature, meanRange, features: ranges.length };
}
