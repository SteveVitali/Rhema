import { describe, expect, it } from "vitest";
import type { Finding, GoldFinding, MatchRecord, Severity } from "./types.js";
import { anchoringScore, classifyAnchor } from "./scorers/anchoring.js";
import { severityCalibration } from "./scorers/severity-calibration.js";
import { recallFp } from "./scorers/recall-fp.js";
import { secondReadContribution } from "./scorers/second-read.js";
import { findingDiversity } from "./scorers/diversity.js";
import { styleControl } from "./scorers/style-control.js";

// AC4: the deterministic scorers reproduce hand-computed values on a synthetic-flaw fixture set. This fixture is
// SCORER-DEVELOPMENT-ONLY — its numbers are never publishable as a benchmark result (REQ-EVAL-1).
const SCORER_DEVELOPMENT_ONLY = true as const;

/** Build a §5.7 Finding with just the fields the scorers read. */
function fnd(
  id: string,
  opts: {
    severity?: Severity;
    origin?: Finding["origin"];
    reconciliation?: Finding["reconciliation"];
    anchor?: Finding["anchor"];
  } = {},
): Finding {
  return {
    id,
    correspondenceId: "c1",
    draftId: "d1",
    ordinal: 0,
    kind: "claim",
    severity: opts.severity ?? "major",
    origin: opts.origin ?? "editor",
    ...(opts.reconciliation ? { reconciliation: opts.reconciliation } : {}),
    anchor: opts.anchor ?? null,
    title: id,
    body: "",
    rubricDims: [],
    projections: [],
  };
}
function anchor(confidence: number, quote = "the 2019 guidance"): Finding["anchor"] {
  return { blockId: "b1", quote, startOffset: 0, endOffset: quote.length, confidence };
}

describe("anchoring / specificity (anchor ladder) — AC4", () => {
  it("classifies each rung of the ladder", () => {
    expect(classifyAnchor(fnd("f", { anchor: anchor(1) }))).toBe("exact");
    expect(classifyAnchor(fnd("f", { anchor: anchor(0.8) }))).toBe("normalized");
    expect(classifyAnchor(fnd("f", { anchor: anchor(0.5) }))).toBe("fuzzy");
    expect(classifyAnchor(fnd("f", { anchor: null }))).toBe("unanchored");
    // a degenerate anchor (empty quote) is not a real location
    expect(classifyAnchor(fnd("f", { anchor: anchor(1, "") }))).toBe("unanchored");
  });

  it("reproduces a hand-computed specificity", () => {
    // findings: exact(1), normalized(0.5), fuzzy(0.25), unanchored(0)
    // specificity = (1+0.5+0.25+0)/4 = 0.4375; anchoredRate = 3/4 = 0.75
    const s = anchoringScore([
      fnd("a", { anchor: anchor(1) }),
      fnd("b", { anchor: anchor(0.8) }),
      fnd("c", { anchor: anchor(0.5) }),
      fnd("d", { anchor: null }),
    ]);
    expect(s.byTier).toEqual({ exact: 1, normalized: 1, fuzzy: 1, unanchored: 1 });
    expect(s.specificity).toBeCloseTo(0.4375, 12);
    expect(s.anchoredRate).toBeCloseTo(0.75, 12);
    expect(s.meanConfidence).toBeCloseTo((1 + 0.8 + 0.5) / 3, 12);
  });
  it("is labeled scorer-development-only (REQ-EVAL-1) — never a publishable result", () => {
    expect(SCORER_DEVELOPMENT_ONLY).toBe(true);
  });
});

describe("severity calibration (weighted κ) — AC4", () => {
  it("κ = 1 when the arm's severities match gold on every matched finding", () => {
    const arm = [fnd("a1", { severity: "blocking" }), fnd("a2", { severity: "minor" })];
    const gold: GoldFinding[] = [
      { finding: fnd("g1", { severity: "blocking" }), material: true },
      { finding: fnd("g2", { severity: "minor" }), material: false },
    ];
    const matches: MatchRecord[] = [
      { armFindingId: "a1", goldFindingId: "g1", verdict: "matched" },
      { armFindingId: "a2", goldFindingId: "g2", verdict: "matched" },
    ];
    const r = severityCalibration(arm, gold, matches);
    expect(r.pairs).toBe(2);
    expect(r.kappa).toBe(1);
  });
  it("returns null κ when nothing matched", () => {
    expect(severityCalibration([], [], []).kappa).toBeNull();
  });
});

describe("recall / FP / novelty — AC4 (headline metric)", () => {
  const gold: GoldFinding[] = [
    { finding: fnd("g1", { severity: "blocking" }), material: true }, // material major/blocking
    { finding: fnd("g2", { severity: "major" }), material: true }, // material major/blocking
    { finding: fnd("g3", { severity: "minor" }), material: true }, // material but NOT major/blocking → not in denom
    { finding: fnd("g4", { severity: "major" }), material: false }, // major but not material → not in denom
  ];
  const arm = [fnd("a1"), fnd("a2"), fnd("a3"), fnd("a4")];
  const matches: MatchRecord[] = [
    { armFindingId: "a1", goldFindingId: "g1", verdict: "matched" }, // hits a material major/blocking gold
    { armFindingId: "a2", goldFindingId: "g3", verdict: "matched" }, // hits a non-denominator gold
    { armFindingId: "a3", verdict: "invalid" }, // false positive
    { armFindingId: "a4", verdict: "valid_but_missed_by_gold" }, // novelty, NOT a FP
  ];
  it("recall is over material major/blocking gold only; novelty is not a FP", () => {
    const r = recallFp(arm, gold, matches);
    expect(r.materialGold).toBe(2); // g1, g2
    expect(r.materialHits).toBe(1); // only g1
    expect(r.recall).toBeCloseTo(0.5, 12);
    expect(r.falsePositives).toBe(1);
    expect(r.falsePositiveRate).toBeCloseTo(0.25, 12); // 1/4 arm findings
    expect(r.novel).toBe(1);
  });
  it("recall is 1 when there is nothing material to miss", () => {
    expect(recallFp([], [], []).recall).toBe(1);
  });
});

describe("second-read marginal contribution — AC4 (REQ-EVAL-13)", () => {
  it("counts gold hits reachable ONLY via kept origin=second_read findings", () => {
    const arm = [
      fnd("s1", { origin: "second_read" }), // unique second-read hit on g1
      fnd("e2", { origin: "editor" }), // editor hit on g2
      fnd("s3", { origin: "second_read", reconciliation: "rejected" }), // second-read but REJECTED → ignored
      fnd("b4", { origin: "both" }), // corroborated hit on g4 (not unique to second read)
    ];
    const matches: MatchRecord[] = [
      { armFindingId: "s1", goldFindingId: "g1", verdict: "matched" },
      { armFindingId: "e2", goldFindingId: "g2", verdict: "matched" },
      { armFindingId: "s3", goldFindingId: "g3", verdict: "matched" }, // rejected → not a kept hit
      { armFindingId: "b4", goldFindingId: "g4", verdict: "matched" },
    ];
    const r = secondReadContribution(arm, [], matches);
    expect(r.goldHits).toBe(3); // g1, g2, g4 (g3's only match was rejected)
    expect(r.secondReadUniqueHits).toBe(1); // only g1
    expect(r.marginalContribution).toBeCloseTo(1 / 3, 12);
  });
});

describe("inter-arm finding diversity — AC4 (C-f)", () => {
  it("computes union, per-arm uniqueness and mean pairwise Jaccard", () => {
    const r = findingDiversity([
      { arm: "A4", ids: new Set(["g1", "g2", "g3"]) },
      { arm: "A1", ids: new Set(["g2", "g3", "g4"]) },
    ]);
    expect(r.unionCoverage).toBe(4); // g1..g4
    expect(r.perArmUnique).toEqual({ A4: 1, A1: 1 }); // g1 only A4; g4 only A1
    // Jaccard({g1,g2,g3},{g2,g3,g4}) = 2/4 = 0.5
    expect(r.meanPairwiseJaccard).toBeCloseTo(0.5, 12);
  });
});

describe("style-perturbed control — AC4 (C-e)", () => {
  it("flags a laundered twin that scores materially higher", () => {
    expect(styleControl(0.6, 0.7, 0.05).materiallyHigher).toBe(true);
    expect(styleControl(0.6, 0.62, 0.05).materiallyHigher).toBe(false);
    expect(styleControl(0.6, 0.4, 0.05).materiallyHigher).toBe(false); // a drop is not a C-e failure
  });
});
