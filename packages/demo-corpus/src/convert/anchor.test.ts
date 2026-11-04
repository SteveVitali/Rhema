import { describe, expect, it } from "vitest";
import { resolveAnchor } from "@rhema/findings-core";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import { anchorQuote, splitAtReferences } from "./anchor.js";

// REQ-CONV-11 — the anchor ladder over `splitMarkdownBlocks` on the sanitized draft: rungs,
// confidence constants, References exclusion (except `Ref [n]` claims), line hints, the
// section-heading fallback, and the round-trip rule that every emitted anchor resolves through
// `resolveAnchor` to the same block.

const DRAFT = [
  "# Essay Title",
  "",
  "An opening paragraph with its own voice and no repeated phrasing elsewhere.",
  "",
  "## Section One",
  "",
  "The warden kept the ledger and the ledger kept the names of every repair.",
  "",
  "## Section Two",
  "",
  "A second section that repeats the ledger kept the names for a second time.",
  "",
  "## Section Three",
  "",
  "“Smart-quoted prose” — with em dashes — that only a normalized match survives.",
  "",
  "## Section Four",
  "",
  "the roster-keeping parish council failed twice in one wet year",
  "",
  "## References",
  "",
  "[1] The warden kept the ledger. Archive, 1994.",
  "",
  "[2] A source note repeated here.",
].join("\n");

const blocks = splitMarkdownBlocks(DRAFT);

describe("splitAtReferences", () => {
  it("drops everything from the References/Notes heading on", () => {
    const { body, references } = splitAtReferences(blocks);
    expect(body.some((b) => b.text.includes("[1] The warden"))).toBe(false);
    expect(references.some((b) => b.text.includes("[1] The warden"))).toBe(true);
    expect(references[0]?.text).toMatch(/^## References/);
  });
});

describe("anchorQuote rungs (R2 §3)", () => {
  it("exact unique → 1.0", () => {
    const r = anchorQuote('"own voice and no repeated phrasing"', DRAFT);
    expect(r.rung).toBe("exact");
    expect(r.anchor?.confidence).toBe(1.0);
  });

  it("exact non-unique → first occurrence at 0.85", () => {
    const r = anchorQuote('"ledger kept the names"', DRAFT);
    expect(r.rung).toBe("exact-multi");
    expect(r.anchor?.confidence).toBe(0.85);
    const b = blocks.find((x) => x.blockId === r.anchor?.blockId);
    expect(b?.text).toContain("kept the ledger");
  });

  it("normalized → 0.9 for smart-quote/dash variants", () => {
    // The fragment carries an em dash where the block has a hyphen — raw substring misses, the
    // normalized rung maps back to raw offsets.
    const r = anchorQuote('"roster—keeping parish council failed"', DRAFT);
    expect(r.rung).toBe("normalized");
    expect(r.anchor?.confidence).toBe(0.9);
    const b = blocks.find((x) => x.blockId === r.anchor?.blockId);
    expect(b?.text.slice(r.anchor!.startOffset, r.anchor!.endOffset)).toBe(r.anchor?.quote);
  });

  it("fuzzy → coverage-scaled ≤ 0.8 with the whole-block anchor shape", () => {
    const r = anchorQuote(
      '"opening paragraph own voice repeated phrasing nowhere"',
      DRAFT,
    );
    expect(r.rung).toBe("fuzzy");
    expect(r.anchor?.confidence).toBeLessThanOrEqual(0.8);
    expect(r.anchor?.startOffset).toBe(0);
    expect(r.anchor?.endOffset).toBeLessThanOrEqual(200);
  });

  it("references blocks are hidden unless the claim is a `Ref [n]` claim", () => {
    const body = anchorQuote('"Archive, 1994"', DRAFT);
    expect(body.rung).toBe("none");
    const ref = anchorQuote('"Archive, 1994"', DRAFT, { referenceClaim: true });
    expect(ref.rung).toBe("exact");
    expect(ref.anchor?.blockId).toBe(
      splitAtReferences(blocks).references.find((b) => b.text.includes("Archive"))?.blockId,
    );
  });

  it("unresolvable quote with a § hint falls back to the section heading at 0.4", () => {
    const r = anchorQuote('"phrase that appears nowhere at all" (§II)', DRAFT);
    expect(r.rung).toBe("section");
    expect(r.anchor?.confidence).toBe(0.4);
    expect(r.anchor?.blockId).toBe(blocks.find((b) => b.text.startsWith("## Section Two"))?.blockId);
  });

  it("no quote, no hint → rung none, anchor omitted", () => {
    const r = anchorQuote('"completely absent words that never occur"', DRAFT);
    expect(r.rung).toBe("none");
    expect(r.anchor).toBeNull();
  });
});

describe("line hints", () => {
  const LINED = [
    "line one",
    "",
    "the hinted sentence lives here precisely",
    "",
    "unrelated trailing block",
  ].join("\n");

  it("a fragment miss with a hint lands the line rung at 0.5", () => {
    const r = anchorQuote('"missing words entirely" (l.3)', LINED, { lineHint: 3 });
    expect(r.rung).toBe("line");
    expect(r.anchor?.confidence).toBe(0.5);
    expect(r.anchor?.blockId).toBe(splitMarkdownBlocks(LINED)[1]?.blockId);
  });

  it("a fuzzy hit on the hinted block gets the 0.75 agreement floor", () => {
    const r = anchorQuote('"hinted sentence lives here somewhere"', LINED, { lineHint: 3 });
    expect(r.anchor?.confidence).toBeGreaterThanOrEqual(0.75);
  });
});

describe("resolveAnchor round-trip (emitted anchors always resolve)", () => {
  it.each([
    '"own voice and no repeated phrasing"',
    '"ledger kept the names"',
    '"Smart-quoted prose" - with em dashes',
    '"opening paragraph own voice repeated phrasing nowhere"',
    '"phrase that appears nowhere at all" (§II)',
  ])("%s resolves back to its recorded block", (q) => {
    const r = anchorQuote(q, DRAFT);
    expect(r.anchor).not.toBeNull();
    const back = resolveAnchor(r.anchor!, blocks);
    expect(back.blockId).toBe(r.anchor!.blockId);
    expect(["exact", "normalized"]).toContain(back.method);
  });
});
