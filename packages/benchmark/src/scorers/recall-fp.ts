import type { Finding, GoldFinding, MatchRecord, Severity } from "../types.js";

// Recall + false-positive + novelty scorer (REQ-EVAL-11, deterministic — the HEADLINE metric, REQ-EVAL-15). The
// matching itself is human-adjudicated (REQ-EVAL-8; P0.14's tooling); this computes the metrics over those match
// records. Headline scoring is reference-based against gold, never pairwise (REQ-EVAL-11).
//
//   material-issue recall (primary: major+blocking): matched material major/blocking gold findings ÷ all of them.
//   false-positive rate: arm findings adjudicated `invalid` ÷ total arm findings — an unmatched finding the panel
//     rules `valid_but_missed_by_gold` is NOT a false positive; it earns NOVELTY credit instead.

const MATERIAL_SEVERITIES: ReadonlySet<Severity> = new Set<Severity>(["major", "blocking"]);

export interface RecallFp {
  /** denominator: material major/blocking gold findings. */
  readonly materialGold: number;
  /** matched material major/blocking gold findings. */
  readonly materialHits: number;
  /** primary material-issue recall in [0,1] (1 when there are no material gold findings — nothing to miss). */
  readonly recall: number;
  readonly armFindings: number;
  /** arm findings adjudicated `invalid`. */
  readonly falsePositives: number;
  readonly falsePositiveRate: number;
  /** arm findings adjudicated `valid_but_missed_by_gold` (novelty credit). */
  readonly novel: number;
}

/**
 * Compute recall / FP / novelty for one arm on one draft.
 * @param armFindings the arm's normalized findings (indexed by id).
 * @param goldFindings the adjudicated gold set (with the `material` flag).
 * @param matches the human match records for this arm × draft.
 */
export function recallFp(
  armFindings: readonly Finding[],
  goldFindings: readonly GoldFinding[],
  matches: readonly MatchRecord[],
): RecallFp {
  const materialGoldIds = new Set(
    goldFindings
      .filter((g) => g.material && MATERIAL_SEVERITIES.has(g.finding.severity))
      .map((g) => g.finding.id),
  );
  const hitGoldIds = new Set<string>();
  let falsePositives = 0;
  let novel = 0;
  for (const m of matches) {
    if (m.verdict === "matched" && m.goldFindingId && materialGoldIds.has(m.goldFindingId)) {
      hitGoldIds.add(m.goldFindingId);
    } else if (m.verdict === "invalid") {
      falsePositives += 1;
    } else if (m.verdict === "valid_but_missed_by_gold") {
      novel += 1;
    }
  }
  const materialGold = materialGoldIds.size;
  const materialHits = hitGoldIds.size;
  const armCount = armFindings.length;
  return {
    materialGold,
    materialHits,
    recall: materialGold === 0 ? 1 : materialHits / materialGold,
    armFindings: armCount,
    falsePositives,
    falsePositiveRate: armCount === 0 ? 0 : falsePositives / armCount,
    novel,
  };
}
