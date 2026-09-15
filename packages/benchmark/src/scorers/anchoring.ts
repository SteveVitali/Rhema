import type { Finding } from "../types.js";

// Anchoring / specificity scorer (REQ-EVAL-11, deterministic). Measures how specifically an arm LOCATES its
// findings — the §5.7 anchor ladder: the canonical anchor is `(blockId, quote, startOffset, endOffset)` in the
// frozen draft's canonical markdown, resolved exact → normalized → fuzzy with a confidence, or unanchored ("Whole
// piece"). A vague baseline comment stays vague under the verbatim-substance rule (REQ-EVAL-7), so a low
// specificity score is a real property of the arm's output, not a scoring artifact.

/** The rungs of the §5.7 anchor ladder, most specific → least. */
export type AnchorTier = "exact" | "normalized" | "fuzzy" | "unanchored";

/** Confidence thresholds separating the ladder rungs. `exact` requires confidence ≥ exactFloor (default 1.0 —
 *  an exact resolution has full confidence); `normalized` ≥ normalizedFloor; below that, `fuzzy`. */
export interface AnchorThresholds {
  readonly exactFloor: number;
  readonly normalizedFloor: number;
}
export const DEFAULT_ANCHOR_THRESHOLDS: AnchorThresholds = { exactFloor: 1, normalizedFloor: 0.75 };

/** Per-tier specificity weight — the aggregate specificity is the mean of these over all findings. */
export const TIER_WEIGHT: Record<AnchorTier, number> = {
  exact: 1,
  normalized: 0.5,
  fuzzy: 0.25,
  unanchored: 0,
};

/** Classify one finding's anchor onto the ladder. A null anchor, or one flagged `unanchored`, is "Whole piece". */
export function classifyAnchor(
  finding: Pick<Finding, "anchor">,
  thresholds: AnchorThresholds = DEFAULT_ANCHOR_THRESHOLDS,
): AnchorTier {
  const a = finding.anchor;
  if (!a || a.unanchored === true) return "unanchored";
  // A degenerate anchor (empty quote or zero-width span) is not a real location — treat as unanchored.
  if (a.quote.length === 0 || a.endOffset <= a.startOffset) return "unanchored";
  if (a.confidence >= thresholds.exactFloor) return "exact";
  if (a.confidence >= thresholds.normalizedFloor) return "normalized";
  return "fuzzy";
}

export interface AnchoringScore {
  readonly total: number;
  readonly byTier: Record<AnchorTier, number>;
  /** fraction of findings that resolve to a real location (any tier but unanchored). */
  readonly anchoredRate: number;
  /** mean anchor confidence over ANCHORED findings (0 when none are anchored). */
  readonly meanConfidence: number;
  /** aggregate specificity: mean tier weight over ALL findings, in [0,1]. */
  readonly specificity: number;
}

/** Score an arm's findings for anchoring/specificity. */
export function anchoringScore(
  findings: readonly Finding[],
  thresholds: AnchorThresholds = DEFAULT_ANCHOR_THRESHOLDS,
): AnchoringScore {
  const byTier: Record<AnchorTier, number> = { exact: 0, normalized: 0, fuzzy: 0, unanchored: 0 };
  let weightSum = 0;
  let confSum = 0;
  let anchored = 0;
  for (const f of findings) {
    const tier = classifyAnchor(f, thresholds);
    byTier[tier] += 1;
    weightSum += TIER_WEIGHT[tier];
    if (tier !== "unanchored") {
      anchored += 1;
      confSum += f.anchor ? f.anchor.confidence : 0;
    }
  }
  const total = findings.length;
  return {
    total,
    byTier,
    anchoredRate: total === 0 ? 0 : anchored / total,
    meanConfidence: anchored === 0 ? 0 : confSum / anchored,
    specificity: total === 0 ? 0 : weightSum / total,
  };
}
