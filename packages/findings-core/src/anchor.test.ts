import { describe, it, expect } from "vitest";
import type { Anchor } from "@rhema/contracts";
import { resolveAnchor, normalizeText, WHOLE_PIECE, FUZZY_FLOOR, type PassageBlock } from "./anchor.js";

// AC1 — the anchor ladder: exact / normalized / fuzzy (with confidence) / unanchored fixtures.

const blocks: PassageBlock[] = [
  { blockId: "b1", text: "The state does not merely watch; it adjudicates who may be seen." },
  { blockId: "b2", text: "The 2019 Home Office guidance made this explicit when it issued the memo." },
  { blockId: "b3", text: "A wholly unrelated paragraph about migratory birds and the weather." },
];

function anchor(over: Partial<Anchor>): Anchor {
  return { blockId: "b1", quote: "adjudicates who may be seen", startOffset: 36, endOffset: 63, confidence: 1, ...over };
}

describe("resolveAnchor (§5.7 ladder)", () => {
  it("resolves EXACT when the raw slice at the offsets equals the quote", () => {
    const quote = blocks[0]!.text.slice(36, 62);
    const r = resolveAnchor(anchor({ quote, startOffset: 36, endOffset: 62 }), blocks);
    expect(r.method).toBe("exact");
    expect(r.blockId).toBe("b1");
    expect(r.confidence).toBe(1);
    expect(r.matchedText).toBe(quote);
  });

  it("resolves NORMALIZED when whitespace/smart-quote differences hide an otherwise-present quote", () => {
    // the block's offsets have drifted (a later edit), but the normalized quote is still inside the block.
    const r = resolveAnchor(
      anchor({ blockId: "b2", quote: "Home  Office   guidance", startOffset: 999, endOffset: 1000 }),
      blocks,
    );
    expect(r.method).toBe("normalized");
    expect(r.blockId).toBe("b2");
    expect(r.confidence).toBe(0.9);
  });

  it("normalizes smart quotes and dashes so a curly-quote drift still matches", () => {
    const b: PassageBlock[] = [{ blockId: "q", text: "she called it a \u201Cfox in the henhouse\u201D moment." }];
    const r = resolveAnchor(
      { blockId: "q", quote: 'a "fox in the henhouse" moment', startOffset: 0, endOffset: 0, confidence: 1 },
      b,
    );
    expect(r.method).toBe("normalized");
  });

  it("resolves FUZZY with a confidence below 1 when the passage was edited but mostly survives", () => {
    // quote words mostly present in b1 but reworded/reordered → coverage-based fuzzy confidence.
    const r = resolveAnchor(
      anchor({ blockId: "gone", quote: "the state adjudicates who may watch and be seen", startOffset: 0, endOffset: 0 }),
      blocks,
    );
    expect(r.method).toBe("fuzzy");
    expect(r.blockId).toBe("b1");
    expect(r.confidence).toBeGreaterThanOrEqual(FUZZY_FLOOR);
    expect(r.confidence).toBeLessThan(1);
  });

  it("returns UNANCHORED (whole piece) for a null anchor — never dropped", () => {
    const r = resolveAnchor(null, blocks);
    expect(r.method).toBe("unanchored");
    expect(r.blockId).toBeNull();
    expect(WHOLE_PIECE).toBe("Whole piece");
  });

  it("returns UNANCHORED for an anchor flagged unanchored:true, carrying its own confidence", () => {
    const r = resolveAnchor(
      { blockId: "b1", quote: "", startOffset: 0, endOffset: 0, confidence: 0.3, unanchored: true },
      blocks,
    );
    expect(r.method).toBe("unanchored");
    expect(r.confidence).toBe(0.3);
  });

  it("returns UNRESOLVED (still surfaced) when no rung clears the floor", () => {
    const r = resolveAnchor(
      anchor({ blockId: "nope", quote: "quantum chromodynamics lattice gauge renormalization", startOffset: 0, endOffset: 0 }),
      blocks,
    );
    expect(r.method).toBe("unresolved");
    expect(r.confidence).toBeLessThan(FUZZY_FLOOR);
  });
});

describe("normalizeText", () => {
  it("collapses whitespace, straightens quotes/dashes, trims", () => {
    expect(normalizeText("  a\u2014b   \u201Cc\u201D  ")).toBe('a-b "c"');
  });
});
