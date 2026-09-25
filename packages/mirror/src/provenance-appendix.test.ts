import { describe, expect, it } from "vitest";
import type { ProvenanceSpan } from "@rhema/contracts";
import { renderProvenanceAppendix } from "./provenance-appendix.js";

// REQ-POS-7 — the block-level provenance appendix: one row per top-level block with the honest
// source label, the granularity spelled out, and `mixed` where the author edited an agent-drafted
// block. The span ids here follow the fixture the ticket fixes — an agent-drafted + human-edited
// draft (the same ids `splitMarkdownBlocks`/`buildBlockIdMap` emit).

const MD = `# The piece

The opening the drafter wrote stays untouched.

This paragraph the author rewrote by hand.

A pasted excerpt from the author's notes.

The closing the drafter wrote.
`;

const SPANS: ProvenanceSpan[] = [
  { blockId: "b1", source: { kind: "agent", runId: "run_1", draftN: 1 } },
  { blockId: "b2", source: { kind: "agent", runId: "run_1", draftN: 1 } },
  { blockId: "b3", source: { kind: "mixed", of: ["agent", "human"] } },
  { blockId: "b4", source: { kind: "pasted" } },
  { blockId: "b5", source: { kind: "agent", runId: "run_1", draftN: 1 } },
];

describe("renderProvenanceAppendix (REQ-POS-7)", () => {
  it("renders one labeled row per top-level block", () => {
    const out = renderProvenanceAppendix({ markdown: MD, spans: SPANS })!;
    expect(out).toContain("## Provenance");
    expect(out).toContain("Block-level provenance");
    expect(out).toContain("marked mixed");
    expect(out).toContain('`b2` — agent-drafted — "The opening the drafter wrote stays untouched."');
    expect(out).toContain('`b3` — mixed — "This paragraph the author rewrote by hand."');
    expect(out).toContain('`b4` — pasted — "A pasted excerpt from the author');
    expect(out).toContain('`b5` — agent-drafted — "The closing the drafter wrote."');
  });

  it("truncates the excerpt at 60 chars", () => {
    const long = "word ".repeat(30).trim();
    const md = `${long}\n\nsecond block\n`;
    const spans: ProvenanceSpan[] = [
      { blockId: "b1", source: { kind: "human" } },
      { blockId: "b2", source: { kind: "human" } },
    ];
    const out = renderProvenanceAppendix({ markdown: md, spans })!;
    expect(out).toMatch(/`b1` — author — "([^"]{59})…"/);
  });

  it("labels a block with no recorded span 'unrecorded' — never guesses", () => {
    const out = renderProvenanceAppendix({
      markdown: "one\n\ntwo\n",
      spans: [{ blockId: "b1", source: { kind: "human" } }],
    })!;
    expect(out).toContain("`b1` — author");
    expect(out).toContain("`b2` — unrecorded");
  });

  it("returns null without a provenance map (the caller omits the section)", () => {
    expect(renderProvenanceAppendix({ markdown: MD, spans: null })).toBeNull();
    expect(renderProvenanceAppendix({ markdown: MD, spans: [] })).toBeNull();
  });
});
