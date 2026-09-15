import type { RubricDimension } from "@rhema/contracts";

// The rubric view model (§5.7; REQ-IDE-30). Eight dimensions scored 1–5, each a FIVE-DOT scale with any
// entailment cap's reason inline, laid out as a list — NEVER an aggregate (no total, no score-out-of-40). This
// view model deliberately exposes no sum; the surface cannot read it as a score. Framework-free.

export const RUBRIC_MAX = 5 as const;

export interface RubricCap {
  /** the score ceiling the cap imposes. */
  readonly at: number;
  readonly reason: string;
  /** the finding ordinal that entailed the cap (§5.7). */
  readonly entailedByFindingOrdinal?: number;
}

export interface RubricRowInput {
  readonly dimension: RubricDimension;
  readonly score: number;
  readonly cap?: RubricCap;
}

export interface RubricDotRow {
  readonly dimension: RubricDimension;
  readonly score: number;
  /** length-5 fill mask for the dot scale — index i filled iff i < score. */
  readonly dots: readonly boolean[];
  readonly cap?: RubricCap;
}

/** The rubric view — rows only. There is intentionally NO total/aggregate field (REQ-IDE-30). */
export interface RubricView {
  readonly rows: readonly RubricDotRow[];
  /** protocols may swap at most one dimension and add at most one (§6.7) — surfaced for the row label. */
  readonly swaps?: readonly { readonly from: string; readonly to: RubricDimension }[];
}

function dotMask(score: number): boolean[] {
  const s = Math.max(0, Math.min(RUBRIC_MAX, Math.round(score)));
  return Array.from({ length: RUBRIC_MAX }, (_, i) => i < s);
}

/** Build the rubric view (five-dot rows + inline caps, no aggregate) from the rubric sidecar's rows (§5.7). */
export function buildRubricView(
  rows: readonly RubricRowInput[],
  swaps?: readonly { readonly from: string; readonly to: RubricDimension }[],
): RubricView {
  return {
    rows: rows.map((r) => ({
      dimension: r.dimension,
      score: r.score,
      dots: dotMask(r.score),
      ...(r.cap != null ? { cap: r.cap } : {}),
    })),
    ...(swaps != null ? { swaps } : {}),
  };
}
