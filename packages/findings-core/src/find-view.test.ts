import { describe, it, expect } from "vitest";
import type { Finding } from "@rhema/contracts";
import { buildFindingView, groupFindingsForList, countGrouped, SEVERITY_ORDER } from "./find-view.js";
import { WHOLE_PIECE } from "./anchor.js";

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: "f_" + (over.ordinal ?? 1),
    correspondenceId: "corr_1",
    draftId: "draft_1",
    ordinal: 1,
    kind: "claim",
    severity: "major",
    origin: "editor",
    anchor: { blockId: "b1", quote: "q", startOffset: 0, endOffset: 1, confidence: 1 },
    title: "t",
    body: "b",
    rubricDims: [],
    projections: [],
    ...over,
  };
}

describe("buildFindingView (§5.7 read model from rows)", () => {
  it("maps a row into the FindingView shape and defaults provisional to false", () => {
    const v = buildFindingView(finding({ severity: "blocking" }));
    expect(v.severity).toBe("blocking");
    expect(v.provisional).toBe(false);
    expect(v.disposition).toBeUndefined();
  });

  it("marks a streaming finding provisional and carries a disposition when supplied", () => {
    const v = buildFindingView(finding(), {
      provisional: true,
      disposition: { kind: "accept", by: { kind: "user", userId: "u_1" }, at: "2026-09-16T00:00:00Z", frozen: true, applied: true },
    });
    expect(v.provisional).toBe(true);
    expect(v.disposition?.kind).toBe("accept");
    expect(v.disposition?.frozen).toBe(true);
    expect(v.disposition?.applied).toBe(true);
  });
});

describe("groupFindingsForList (REQ-IDE-23 / AC7 — Whole piece, never dropped)", () => {
  it("heads the list with the Whole piece group for unanchored findings and drops nothing", () => {
    const views = [
      buildFindingView(finding({ ordinal: 1, anchor: { blockId: "b2", quote: "x", startOffset: 0, endOffset: 1, confidence: 1 } })),
      buildFindingView(finding({ ordinal: 2, anchor: null })), // unanchored
      buildFindingView(finding({ ordinal: 3, anchor: { blockId: "b1", quote: "y", startOffset: 0, endOffset: 1, confidence: 1 } })),
      buildFindingView(finding({ ordinal: 4, anchor: { blockId: "b1", quote: "z", startOffset: 0, endOffset: 1, confidence: 1 } })),
    ];
    const groups = groupFindingsForList(views);
    expect(groups[0]!.key).toBe(WHOLE_PIECE); // heads the list
    expect(groups[0]!.label).toBe("Whole piece");
    expect(countGrouped(groups)).toBe(views.length); // count in === count out (never dropped)
  });

  it("treats anchor.unanchored:true as whole piece too", () => {
    const v = buildFindingView(finding({ ordinal: 9, anchor: { blockId: "b1", quote: "", startOffset: 0, endOffset: 0, confidence: 0, unanchored: true } }));
    const groups = groupFindingsForList([v]);
    expect(groups[0]!.key).toBe(WHOLE_PIECE);
    expect(groups[0]!.findings).toHaveLength(1);
  });

  it("has no Whole piece group when every finding is anchored", () => {
    const groups = groupFindingsForList([buildFindingView(finding())]);
    expect(groups.some((g) => g.key === WHOLE_PIECE)).toBe(false);
  });

  it("sorts within a group blocking → major → minor → note", () => {
    const views = [
      buildFindingView(finding({ ordinal: 1, severity: "note" })),
      buildFindingView(finding({ ordinal: 2, severity: "blocking" })),
      buildFindingView(finding({ ordinal: 3, severity: "minor" })),
      buildFindingView(finding({ ordinal: 4, severity: "major" })),
    ];
    const [g] = groupFindingsForList(views);
    expect(g!.findings.map((f) => f.severity)).toEqual(["blocking", "major", "minor", "note"]);
    expect(SEVERITY_ORDER.blocking).toBe(0);
  });

  it("applies a block label resolver when provided", () => {
    const v = buildFindingView(finding({ anchor: { blockId: "b7", quote: "q", startOffset: 0, endOffset: 1, confidence: 1 } }));
    const [g] = groupFindingsForList([v], { blockLabel: (id) => (id === "b7" ? "§II ¶4" : id) });
    expect(g!.label).toBe("§II ¶4");
  });
});
