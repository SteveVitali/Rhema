import { describe, it, expect } from "vitest";
import type { Anchor, FindingView } from "@rhema/contracts";
import { applyEligibility, applySuggestionToMarkdown, buildBulkPreview } from "./apply.js";

// P1.07 — Apply (REQ-SPEC-6, §5.7): the splice math and the one consolidated bulk preview. Pure +
// deterministic; the api layer owns the saveManualRevision write + disposition + obligation transitions.

const user = { kind: "user", userId: "u_1" } as const;

function view(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1",
    correspondenceId: "c_1",
    draftId: "d_1",
    kind: "craft",
    severity: "note",
    origin: "editor",
    anchor: null,
    title: "t",
    body: "b",
    rubricDims: [],
    provisional: false,
    ...over,
  };
}

const anchorOn = (blockId: string, start: number, end: number, quote: string): Anchor => ({
  blockId,
  startOffset: start,
  endOffset: end,
  quote,
  confidence: 1,
});

// two paragraphs; block ids hash from content+ordinal — find them via splitMarkdownBlocks in the tests.
const MD = "The quick brown fox.\n\nA second para sits here.\n";

import { splitMarkdownBlocks } from "./what-changed.js";

function firstBlock(): string {
  return splitMarkdownBlocks(MD)[0]!.blockId;
}

describe("applySuggestionToMarkdown (§5.7 — splice at the anchor's resolved span)", () => {
  it("splices an exact anchor in place", () => {
    const bid = firstBlock();
    const a = anchorOn(bid, 4, 9, "quick");
    const r = applySuggestionToMarkdown(MD, a, "slow");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.markdown).toBe("The slow brown fox.\n\nA second para sits here.\n");
      expect(r.blockId).toBe(bid);
      expect(r.method).toBe("exact");
    }
  });

  it("fuzzy matches replace the whole block's text", () => {
    const a = anchorOn("gone_block", 0, 4, "quick brown fox"); // wrong block id → fuzzy across blocks
    const r = applySuggestionToMarkdown(MD, a, "A rewritten first paragraph.");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.method).toBe("fuzzy");
      expect(r.markdown).toBe("A rewritten first paragraph.\n\nA second para sits here.\n");
    }
  });

  it("refuses cleanly when nothing resolves — Apply never guesses", () => {
    const a = anchorOn("gone", 0, 3, "zyzzyva nonsense words that match nothing at all ever");
    expect(applySuggestionToMarkdown(MD, a, "x")).toEqual({ ok: false, reason: "anchor_lost" });
    expect(applySuggestionToMarkdown(MD, null, "x")).toEqual({ ok: false, reason: "no_anchor" });
  });
});

describe("applyEligibility (gate + live splice)", () => {
  it("reports the live-anchor failure the static gate can't see", () => {
    const v = view({
      id: "lost",
      anchor: anchorOn("gone", 0, 3, "totally absent quote words entirely"),
      suggestion: { replacement: "r" },
    });
    expect(applyEligibility(v, MD)).toEqual({ ok: false, reason: "anchor_lost" });
  });

  it("ok when the gate passes and the span still resolves", () => {
    const v = view({
      id: "ok",
      anchor: anchorOn(firstBlock(), 4, 9, "quick"),
      suggestion: { replacement: "slow" },
    });
    expect(applyEligibility(v, MD)).toEqual({ ok: true });
  });
});

describe("buildBulkPreview (§5.7 — one consolidated preview before the writes)", () => {
  it("apply_notes: a checklist of accept-applied rows with spliced markdown, skipping lost anchors with reasons", () => {
    const views = [
      view({ id: "ok", anchor: anchorOn(firstBlock(), 4, 9, "quick"), suggestion: { replacement: "slow" } }),
      view({
        id: "lost",
        anchor: anchorOn("gone", 0, 3, "absent quote words entirely nothing"),
        suggestion: { replacement: "r" },
      }),
      view({ id: "major_one", severity: "major", suggestion: { replacement: "r" }, anchor: anchorOn(firstBlock(), 0, 3, "The") }),
    ];
    const p = buildBulkPreview(views, "apply_notes", MD);
    expect(p.total).toBe(2); // apply_notes covers notes only — the major stays out
    expect(p.rows).toHaveLength(1);
    expect(p.rows[0]).toMatchObject({ findingId: "ok", disposition: "accept", obligation: "revision" });
    expect(p.rows[0]!.appliedMarkdown).toContain("The slow brown fox");
    expect(p.skipped).toEqual([{ findingId: "lost", title: "t", reason: "anchor_lost" }]);
  });

  it("defer_minor / accept_section emit the right verb + obligation on every covered row", () => {
    const views = [
      view({ id: "mi", severity: "minor" }),
      view({ id: "mi_decided", severity: "minor", disposition: { kind: "accept", by: user, at: "t", frozen: false } }),
      view({ id: "sec", severity: "major", letterSection: "major" }),
    ];
    const d = buildBulkPreview(views, "defer_minor", MD);
    expect(d.rows).toEqual([
      { findingId: "mi", title: "t", severity: "minor", disposition: "defer", obligation: "none" },
    ]);
    const a = buildBulkPreview(views, "accept_section", MD, { section: "major" });
    expect(a.rows).toEqual([
      { findingId: "sec", title: "t", severity: "major", disposition: "accept", obligation: "revision" },
    ]);
  });
});
