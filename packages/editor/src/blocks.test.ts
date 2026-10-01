import { describe, it, expect } from "vitest";
import { buildBlockIdMap, splitMarkdownBlocks, blockContentHash } from "@rhema/findings-core";
import { rederiveBlockIds, blockSimilarity } from "./blocks.js";
import { docToMarkdown } from "./pm-to-md.js";
import { markdownToDoc } from "./md-to-pm.js";

// The block-id sidecar's re-derivation (P1.02; §5.4, REQ-DATA-29 amended): hash + ordinal + a fuzzy
// edited-block step. Ids never enter the markdown bytes.

const BASE = `## Title

First paragraph stays.

Second paragraph stays.

Third paragraph stays.`;

const stored = () => buildBlockIdMap(BASE);

describe("rederiveBlockIds", () => {
  it("identical text re-derives the stored ids verbatim", () => {
    const r = rederiveBlockIds(BASE, stored());
    expect(r.idsInOrder).toEqual(["b1", "b2", "b3", "b4"]);
    expect(r.inherited.size).toBe(4);
  });

  it("a moved block keeps its id by content hash", () => {
    const moved = `## Title

Second paragraph stays.

First paragraph stays.

Third paragraph stays.`;
    const r = rederiveBlockIds(moved, stored());
    // b2/b3 swapped positions — hash matching assigns each its ORIGINAL id.
    expect(r.idsInOrder).toEqual(["b1", "b3", "b2", "b4"]);
  });

  it("an in-place edited block inherits the same-ordinal id (the common case)", () => {
    const edited = `## Title

First paragraph stays.

Second paragraph EDITED.

Third paragraph stays.`;
    const r = rederiveBlockIds(edited, stored());
    expect(r.idsInOrder).toEqual(["b1", "b2", "b3-edited".startsWith("b3") ? "b3" : "b3", "b4"]);
    expect(r.idsInOrder[2]).toBe("b3"); // ordinal 3 was free → the edited block keeps b3
    expect(r.inherited.get(2)).toBe("b3");
    expect(r.map["b3"]!.contentHash).toBe(blockContentHash("Second paragraph EDITED."));
  });

  it("an edit after an insertion lands inside the fuzzy ordinal range and keeps its id", () => {
    const inserted = `## Title

First paragraph stays.

A brand new block inserted.

Second paragraph stays.

Third paragraph stays.`;
    const r = rederiveBlockIds(inserted, stored());
    // b2 ("Second paragraph stays.") matched by HASH at its new position; the insertion is fresh;
    // nothing claims an id wrongly.
    expect(r.idsInOrder[3]).toBe("b3");
    const fresh = r.idsInOrder[2]!;
    expect(["b1", "b2", "b3", "b4"]).not.toContain(fresh);
    expect(/^b\d+$/.test(fresh)).toBe(true);
    expect(Number(fresh.slice(1))).toBeGreaterThan(4);
  });

  it("an edit that shifts a block's hash AND ordinal resolves inside the fuzzy window (prevTexts armed)", () => {
    // "Second" edited AND shifted down by one (an insertion before it) — hash fails, ordinal is off
    // by one; the fuzzy step must tell the EDITED block (high overlap with stored b3) apart from the
    // INSERTED one (zero overlap) — the stored version's texts are the signal.
    const prevTexts = Object.fromEntries(splitMarkdownBlocks(BASE).map((b) => [b.blockId, b.text]));
    const edited = `## Title

First paragraph stays.

Inserted between.

Second paragraph EDITED.

Third paragraph stays.`;
    const r = rederiveBlockIds(edited, stored(), prevTexts);
    // b3's stored ordinal is 3; the edited block sits at ordinal 4 — |4-3| = 1 ≤ 2, and its text
    // still covers b3's words (0.75+), so it keeps the id.
    expect(r.idsInOrder[3]).toBe("b3");
    expect(r.inherited.get(3)).toBe("b3");
    // the inserted block has zero overlap with every stored text — it can claim nothing; fresh id.
    const insertedId = r.idsInOrder[2]!;
    expect(["b1", "b2", "b3", "b4"]).not.toContain(insertedId);
    expect(Number(insertedId.slice(1))).toBeGreaterThan(4);
  });

  it("a block whose edited text drifts past the fuzzy window gets a fresh id — never a wrong one", () => {
    const prevTexts = Object.fromEntries(splitMarkdownBlocks(BASE).map((b) => [b.blockId, b.text]));
    const edited = `## Title

New one.

New two.

New three.

Fourth is new too.

Fifth also new.`;
    const r = rederiveBlockIds(edited, stored(), prevTexts);
    expect(r.idsInOrder[0]).toBe("b1"); // heading matched by hash
    // everything else is too far AND has zero overlap — fresh ids past the stored max
    for (const id of r.idsInOrder.slice(1)) expect(Number(id.slice(1))).toBeGreaterThan(4);
  });

  it("no stored map → positional ids, the same map buildBlockIdMap writes", () => {
    const r = rederiveBlockIds(BASE, null);
    expect(r.idsInOrder).toEqual(["b1", "b2", "b3", "b4"]);
    expect(r.map).toEqual(buildBlockIdMap(BASE));
  });

  it("re-derivation is stable: the emitted map re-derives itself", () => {
    const edited = `## Title

First paragraph stays.

Second paragraph EDITED.

Third paragraph stays.`;
    const r1 = rederiveBlockIds(edited, stored());
    const r2 = rederiveBlockIds(edited, r1.map);
    expect(r2.idsInOrder).toEqual(r1.idsInOrder);
  });
});

describe("id stripping (REQ-DATA-29 — ids never reach the artifact bytes)", () => {
  it("the serialized markdown contains no block-id syntax", () => {
    const doc = markdownToDoc(BASE);
    const md = docToMarkdown(doc);
    expect(md).not.toMatch(/\{#b\d+\}/);
    // the sidecar is the ONLY carrier — the bytes are clean markdown
    expect(splitMarkdownBlocks(md).map((b) => b.blockId)).toEqual(["b1", "b2", "b3", "b4"]);
  });
});

describe("blockSimilarity", () => {
  it("scores word coverage of b by a", () => {
    expect(blockSimilarity("the quick brown fox", "the quick brown fox jumps")).toBe(1);
    expect(blockSimilarity("the quick brown fox", "completely different words here")).toBe(0);
    expect(blockSimilarity("alpha beta gamma delta", "alpha beta gamma NEW")).toBe(0.75);
  });
});
