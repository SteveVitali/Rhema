import { describe, it, expect } from "vitest";
import { structurePlanSidecarSchema, cutListSidecarSchema } from "@rhema/contracts";
import { applyGateEdits, decodeGateEditFields } from "./gate-edits.js";

// P1.09 — the §6.4 item-4 structured edits (REQ-GATE-5/6; REQ-SPEC-9). The card's `ed.*` form grammar
// decodes to `GateStructuredEdits`; `applyGateEdits` applies them to the SERVER-side sidecar document
// (deltas, never the base) and counts changes for the "approved … with N changes" decision line.
// Pure + deterministic — fixture docs, no inference.

const PLAN_DOC = {
  sidecar: "structure_plan",
  version: 1,
  spine: ["Visibility is enforced, not requested.", "The registry makes it legible.", "Costs follow attention."],
  sections: [
    { ref: "§I", title: "Intro", targetWords: 400, purpose: "frame" },
    { ref: "§II", title: "Mechanism", targetWords: 900, purpose: "how" },
    { ref: "§III", title: "Cases", targetWords: 1200 },
  ],
  alternativesConsidered: ["chronological"],
  gaps: ["the municipal comparator"],
};

describe("decodeGateEditFields — the `ed.*` form grammar (§6.4 item 4)", () => {
  it("decodes every field shape: note, values, spine ord/strike/note, new claim, sections, cuts", () => {
    const edits = decodeGateEditFields({
      action: "approve",
      guidance: "unrelated",
      "ed.note": "tighten the middle",
      "ed.values.venue": "JCS",
      "ed.spine.0.ord": "2",
      "ed.spine.0.note": "keep, but soften",
      "ed.spine.1.strike": "1",
      "ed.spine.new.text": "A new claim",
      "ed.spine.new.note": "because the case demands it",
      "ed.sec.0.ord": "2",
      "ed.sec.1.targetWords": "1100",
      "ed.sec.1.purpose": "mechanism in detail",
      "ed.cut.0.protect": "1",
      "ed.cut.2.protect": "on",
    });
    expect(edits.note).toBe("tighten the middle");
    expect(edits.values).toEqual({ venue: "JCS" });
    expect(edits.spine).toEqual([
      { index: 0, order: 2, note: "keep, but soften" },
      { index: 1, strike: true },
    ]);
    expect(edits.newClaims).toEqual([{ text: "A new claim", note: "because the case demands it" }]);
    expect(edits.sections).toEqual([
      { index: 0, order: 2 },
      { index: 1, targetWords: 1100, purpose: "mechanism in detail" },
    ]);
    expect(edits.cutToggles).toEqual([
      { index: 0, protect: true },
      { index: 2, protect: true },
    ]);
  });

  it("non-ed.* fields and empty values never decode", () => {
    expect(decodeGateEditFields({ action: "approve", "ed.values.stage": "" })).toEqual({});
    expect(decodeGateEditFields({})).toEqual({});
  });
});

describe("applyGateEdits — approve_plan against the structure-plan sidecar", () => {
  it("strikes, reorders, appends (with its note recorded), and edits sections — schema-valid output", () => {
    const applied = applyGateEdits("approve_plan", PLAN_DOC, {
      spine: [
        { index: 0, order: 2 },
        { index: 1, strike: true, note: "drop the registry claim" },
      ],
      newClaims: [{ text: "Attention budgets bind.", note: "the missing premise" }],
      sections: [{ index: 2, targetWords: 1400, purpose: "three cases" }],
    });
    const doc = applied.rows as { spine: string[]; sections: { ref: string; targetWords?: number; purpose?: string }[] };
    // strike removes the claim; reorder moved claim 1 after the remaining claim 2.
    expect(doc.spine).toEqual(["Costs follow attention.", "Visibility is enforced, not requested.", "Attention budgets bind."]);
    expect(doc.sections[2]).toEqual({ ref: "§III", title: "Cases", targetWords: 1400, purpose: "three cases" });
    expect(applied.changes).toBeGreaterThan(0);
    expect(applied.summary.join(" ")).toContain("struck");
    expect(applied.summary.join(" ")).toContain("added");
    // the result still validates against the contract — the overlay serializes what the schema accepts.
    expect(structurePlanSidecarSchema.safeParse(applied.rows).success).toBe(true);
  });

  it("the full form round-trip: decode → apply → a schema-valid plan", () => {
    const edits = decodeGateEditFields({
      "ed.spine.2.strike": "1",
      "ed.spine.new.text": "Attention budgets bind.",
      "ed.sec.0.targetWords": "500",
    });
    const applied = applyGateEdits("approve_plan", PLAN_DOC, edits);
    const doc = applied.rows as { spine: string[]; sections: { targetWords?: number }[] };
    expect(doc.spine).toEqual([
      "Visibility is enforced, not requested.",
      "The registry makes it legible.",
      "Attention budgets bind.",
    ]);
    expect(doc.sections[0]?.targetWords).toBe(500);
    expect(structurePlanSidecarSchema.safeParse(applied.rows).success).toBe(true);
  });
});

describe("applyGateEdits — approve_cutlist toggles + values-only kinds", () => {
  const CUT_DOC = {
    sidecar: "cut_list",
    version: 1,
    targetWords: 4000,
    cuts: [
      { ordinal: 0, anchor: { blockId: "b1", quote: "the passage", startOffset: 0, endOffset: 10, confidence: 0.9 }, words: 220, reason: "redundant" },
      { ordinal: 1, anchor: { blockId: "b2", quote: "the survey", startOffset: 20, endOffset: 30, confidence: 0.8 }, words: 140, reason: "off-scope" },
    ],
  };

  it("protect toggles flip rows; untouched rows pass through", () => {
    const applied = applyGateEdits("approve_cutlist", CUT_DOC, {
      cutToggles: [
        { index: 0, protect: true },
        { index: 1, protect: false },
      ],
    });
    const doc = applied.rows as { cuts: { protect?: boolean }[] };
    expect(doc.cuts[0]?.protect).toBe(true);
    expect(doc.cuts[1]?.protect).toBe(false);
    expect(applied.changes).toBe(2);
    expect(cutListSidecarSchema.safeParse(applied.rows).success).toBe(true);
  });

  it("kinds without an editable sidecar record `values` only — no rows, changes counted", () => {
    const applied = applyGateEdits("choose_thesis", null, { values: { thesis: "visibility is produced" } });
    expect(applied.rows).toBeUndefined();
    expect(applied.changes).toBe(1);
    expect(applied.summary[0]).toContain("thesis");

    const scope = applyGateEdits("approve_scope", null, {
      values: { venue: "JCS", narrow: "drop the survey section" },
    });
    expect(scope.rows).toBeUndefined();
    expect(scope.changes).toBe(2);
  });
});
