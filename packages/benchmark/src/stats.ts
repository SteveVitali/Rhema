// Deterministic statistics shared by the scorers + power machinery (REQ-EVAL-9(b): report chance-corrected
// agreement (κ), never raw). Every function here is pure and hand-computable — the (deterministic) ACs pin the
// scorers against hand-computed values, so these primitives must be exact and dependency-free.

/**
 * Cohen's κ for two raters over a shared list of categorical labels (unweighted). `a[i]` and `b[i]` are the two
 * raters' labels for unit i; κ = (p_o − p_e) / (1 − p_e). Returns 1 for perfect agreement, 0 for chance-level,
 * negative below chance. When there is no disagreement possible (a single observed category, p_e = 1) κ is
 * defined as 1 iff observed agreement is perfect, else 0 (the standard degenerate convention).
 */
export function cohenKappa(a: readonly string[], b: readonly string[]): number {
  if (a.length !== b.length) throw new Error("cohenKappa: rater arrays differ in length");
  const n = a.length;
  if (n === 0) return 1;
  const cats = new Set<string>([...a, ...b]);
  let agree = 0;
  const countA = new Map<string, number>();
  const countB = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    countA.set(a[i]!, (countA.get(a[i]!) ?? 0) + 1);
    countB.set(b[i]!, (countB.get(b[i]!) ?? 0) + 1);
  }
  const po = agree / n;
  let pe = 0;
  for (const c of cats) pe += ((countA.get(c) ?? 0) / n) * ((countB.get(c) ?? 0) / n);
  if (pe >= 1) return po >= 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/**
 * Weighted Cohen's κ for ordinal labels (severity calibration — REQ-EVAL-11). `levels` is the ordinal scale
 * (index = rank); `weights` is 'quadratic' (default, the standard for ordinal severity) or 'linear'. Off-diagonal
 * disagreements are penalized by their distance on the scale, so a blocking↔major disagreement costs less than a
 * blocking↔note one.
 */
export function weightedKappa(
  a: readonly string[],
  b: readonly string[],
  levels: readonly string[],
  weights: "quadratic" | "linear" = "quadratic",
): number {
  if (a.length !== b.length) throw new Error("weightedKappa: rater arrays differ in length");
  const n = a.length;
  if (n === 0) return 1;
  const k = levels.length;
  const idx = new Map(levels.map((l, i) => [l, i] as const));
  const rank = (label: string): number => {
    const r = idx.get(label);
    if (r === undefined) throw new Error(`weightedKappa: label "${label}" not in the ordinal scale`);
    return r;
  };
  const w = (i: number, j: number): number => {
    const d = Math.abs(i - j);
    return weights === "quadratic" ? (d * d) / ((k - 1) * (k - 1)) : d / (k - 1);
  };
  const rowA = new Array<number>(k).fill(0);
  const colB = new Array<number>(k).fill(0);
  const obs: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  for (let m = 0; m < n; m++) {
    const i = rank(a[m]!);
    const j = rank(b[m]!);
    obs[i]![j]! += 1;
    rowA[i]! += 1;
    colB[j]! += 1;
  }
  let numObs = 0;
  let numExp = 0;
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const wij = w(i, j);
      numObs += wij * (obs[i]![j]! / n);
      numExp += wij * ((rowA[i]! / n) * (colB[j]! / n));
    }
  }
  if (numExp === 0) return numObs === 0 ? 1 : 0;
  return 1 - numObs / numExp;
}

/** Arithmetic mean (0 for an empty list — callers that need a guard check length first). */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample variance (Bessel-corrected, n−1). Requires ≥2 observations (the pilot's paired-difference variance). */
export function sampleVariance(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 2) throw new Error("sampleVariance: need at least 2 observations");
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) * (x - m), 0) / (n - 1);
}

/** Dice overlap coefficient 2|A∩B| / (|A|+|B|) — the descriptive match overlap between two annotators. */
export function diceOverlap(intersection: number, sizeA: number, sizeB: number): number {
  const denom = sizeA + sizeB;
  if (denom === 0) return 1;
  return (2 * intersection) / denom;
}

/** Jaccard similarity |A∩B| / |A∪B| between two id sets (inter-arm finding diversity — C-f). */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}
