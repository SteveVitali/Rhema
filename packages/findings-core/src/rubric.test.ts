import { describe, it, expect } from "vitest";
import { buildRubricView, RUBRIC_MAX, type RubricRowInput } from "./rubric.js";
import { RUBRIC_DIMENSIONS } from "@rhema/contracts";

// AC5 — rubric renders as dot rows with cap reasons; NEVER an aggregate (REQ-IDE-30). The view model is the
// substrate; the DOM assertion lives in the @rhema/ui test.

const rows: RubricRowInput[] = RUBRIC_DIMENSIONS.map((dimension, i) => ({
  dimension,
  score: (i % 5) + 1,
  ...(dimension === "evidence_accuracy"
    ? { cap: { at: 2, reason: "a contradicted Tier-1 claim caps Evidence at 2", entailedByFindingOrdinal: 12 } }
    : {}),
}));

describe("buildRubricView (§5.7)", () => {
  it("produces a five-dot mask per row (index filled iff i < score)", () => {
    const v = buildRubricView([{ dimension: "prose", score: 3 }]);
    expect(v.rows[0]!.dots).toEqual([true, true, true, false, false]);
    expect(v.rows[0]!.dots).toHaveLength(RUBRIC_MAX);
  });

  it("carries the entailment cap (score ceiling + reason + entailing finding) inline on the row", () => {
    const v = buildRubricView(rows);
    const evidence = v.rows.find((r) => r.dimension === "evidence_accuracy");
    expect(evidence?.cap).toEqual({ at: 2, reason: "a contradicted Tier-1 claim caps Evidence at 2", entailedByFindingOrdinal: 12 });
  });

  it("exposes NO aggregate/total field anywhere on the view model (REQ-IDE-30)", () => {
    const v = buildRubricView(rows);
    const json = JSON.stringify(v);
    expect(json).not.toMatch(/"total"/);
    expect(json).not.toMatch(/"aggregate"/);
    expect(json).not.toMatch(/"sum"/);
    expect(json).not.toMatch(/"average"/);
    // and the object literally has no such key
    expect(Object.keys(v)).not.toContain("total");
  });

  it("clamps a score to the 1–5 dot range", () => {
    expect(buildRubricView([{ dimension: "structure", score: 9 }]).rows[0]!.dots).toEqual([true, true, true, true, true]);
    expect(buildRubricView([{ dimension: "structure", score: 0 }]).rows[0]!.dots).toEqual([false, false, false, false, false]);
  });

  it("passes protocol swaps through for the row label", () => {
    const v = buildRubricView([{ dimension: "structure", score: 4 }], [{ from: "originality_situatedness", to: "structure" }]);
    expect(v.swaps).toEqual([{ from: "originality_situatedness", to: "structure" }]);
  });
});
