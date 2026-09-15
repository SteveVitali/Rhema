import { cohenKappa, diceOverlap, weightedKappa } from "./stats.js";
import { SEVERITY_LEVELS } from "./types.js";

// Inter-annotator agreement per draft (REQ-EVAL-4): "an editorial ground truth two professionals cannot roughly
// agree on is not ground truth." IAA is computed per draft and reported with results; drafts below the
// pre-registered agreement floor are re-adjudicated or dropped (AC3). Chance-corrected (κ), never raw (REQ-EVAL-9b).
//
// The two annotators' findings are ALIGNED into cells before agreement is computed — a cell is a matched pair, an
// A-only finding, or a B-only finding. The alignment (which of A's findings is "the same issue" as which of B's) is
// the caller's / P0.14 tooling's job; this scorer computes the chance-corrected agreement over a given alignment.

/** One alignment cell: a matched pair, or one annotator's unmatched finding (the other side null). */
export interface AlignmentCell {
  /** annotator A's finding on this issue — its `material` flag and `severity`; null if A did not raise it. */
  readonly a: { material: boolean; severity: string } | null;
  /** annotator B's finding on this issue; null if B did not raise it. */
  readonly b: { material: boolean; severity: string } | null;
}

export interface IaaResult {
  /** issues both annotators raised. */
  readonly matched: number;
  /** issues only annotator A / only annotator B raised. */
  readonly aOnly: number;
  readonly bOnly: number;
  /** Dice overlap 2·matched / (|A|+|B|) — descriptive existence agreement. */
  readonly overlap: number;
  /**
   * The headline IAA: chance-corrected Cohen's κ over every cell, where each annotator's label per cell is
   * `material` / `immaterial` / `absent`. This folds BOTH whether they identified the same issue and whether they
   * agreed it is material into one κ — the number the agreement floor gates on.
   */
  readonly kappa: number;
  /** quadratic-weighted κ on severity over the MATCHED cells only (ordinal blocking>major>minor>note). */
  readonly severityKappa: number | null;
  /** true when κ is below the pre-registered floor — the draft is flagged for re-adjudication or drop. */
  readonly belowFloor: boolean;
  readonly floor: number;
}

const LABEL_ABSENT = "absent";
const LABEL_MATERIAL = "material";
const LABEL_IMMATERIAL = "immaterial";

function cellLabel(side: { material: boolean } | null): string {
  if (side === null) return LABEL_ABSENT;
  return side.material ? LABEL_MATERIAL : LABEL_IMMATERIAL;
}

/**
 * Compute per-draft IAA over an alignment. `floor` is the wave's pre-registered agreement floor (REQ-EVAL-4); a
 * draft with κ below it is flagged (`belowFloor`).
 */
export function interAnnotatorAgreement(cells: readonly AlignmentCell[], floor: number): IaaResult {
  let matched = 0;
  let aOnly = 0;
  let bOnly = 0;
  const labelsA: string[] = [];
  const labelsB: string[] = [];
  const matchedSevA: string[] = [];
  const matchedSevB: string[] = [];
  for (const cell of cells) {
    labelsA.push(cellLabel(cell.a));
    labelsB.push(cellLabel(cell.b));
    if (cell.a && cell.b) {
      matched++;
      matchedSevA.push(cell.a.severity);
      matchedSevB.push(cell.b.severity);
    } else if (cell.a) {
      aOnly++;
    } else if (cell.b) {
      bOnly++;
    }
  }
  const sizeA = matched + aOnly;
  const sizeB = matched + bOnly;
  const kappa = cohenKappa(labelsA, labelsB);
  const severityKappa =
    matchedSevA.length > 0 ? weightedKappa(matchedSevA, matchedSevB, SEVERITY_LEVELS, "quadratic") : null;
  return {
    matched,
    aOnly,
    bOnly,
    overlap: diceOverlap(matched, sizeA, sizeB),
    kappa,
    severityKappa,
    belowFloor: kappa < floor,
    floor,
  };
}
