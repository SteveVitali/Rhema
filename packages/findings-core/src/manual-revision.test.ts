import { describe, expect, it } from "vitest";
import {
  buildBlockIdMap,
  editedAfterBlockIds,
  humanRevisionProvenance,
  projectFindingsOntoMarkdown,
  type ProvenanceBase,
} from "./manual-revision.js";
import type { Anchor } from "@rhema/contracts";

// PRB.07 — the pure half of manual revision (§5.4/§11.6; REQ-DATA-24/26/29): findings re-anchor onto the
// human-edited head by quote (exact → normalized → fuzzy → Whole piece, never dropped), the block-level
// provenance map marks touched blocks `human` and inherits the rest, and the stable-block-id sidecar stays
// out of the markdown. Framework-free — no DOM, no DB.

const BEFORE = "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n";
const AFTER =
  "# Draft\n\nThe pillar stands on the restated claim.\n\nA middle section that stays.\n\nA human-added coda.\n";

const anchor = (quote: string, blockId = "b2"): Anchor => ({
  blockId,
  quote,
  startOffset: 0,
  endOffset: quote.length,
  confidence: 1,
});

describe("projectFindingsOntoMarkdown — findings follow the text (§5.4)", () => {
  it("re-anchors an exact-surviving quote onto the new head (same blockId)", () => {
    // the untouched middle block keeps its quote verbatim.
    const out = projectFindingsOntoMarkdown(
      [{ id: "f1", anchor: { ...anchor("A middle section that stays.", "b3") } }],
      AFTER,
    );
    expect(out[0]).toMatchObject({
      findingId: "f1",
      method: "exact",
      lost: false,
      anchor: { blockId: "b3" },
    });
    expect(out[0]!.anchor.unanchored).toBeUndefined();
  });

  it("re-anchors a normalized quote (whitespace/quote drift)", () => {
    const curly: Anchor = {
      blockId: "b3",
      quote: "A middle  section that stays.", // double space — normalizeText collapses it
      startOffset: 0,
      endOffset: 30,
      confidence: 1,
    };
    const out = projectFindingsOntoMarkdown([{ id: "f1", anchor: curly }], AFTER);
    expect(out[0]!.method).toBe("normalized");
    expect(out[0]!.lost).toBe(false);
    expect(out[0]!.anchor.blockId).toBe("b3");
  });

  it("re-anchors a fuzzy quote when the block's wording drifted (coverage ≥ floor)", () => {
    // every word of the quote survives in b2's rewrite but the slice itself changed — the fuzzy rung lands.
    const q = anchor("the pillar stands on the claim");
    const out = projectFindingsOntoMarkdown([{ id: "f1", anchor: q }], AFTER);
    expect(out[0]!.method).toBe("fuzzy");
    expect(out[0]!.lost).toBe(false);
    expect(out[0]!.anchor.blockId).toBe("b2");
    expect(out[0]!.anchor.confidence).toBeLessThanOrEqual(1);
  });

  it("a cleared quote goes to Whole piece as unanchored — lost, never dropped", () => {
    const out = projectFindingsOntoMarkdown(
      [{ id: "f1", anchor: anchor("the removal of the statue") }],
      AFTER,
    );
    expect(out[0]!.lost).toBe(true);
    expect(out[0]!.method).toBe("unresolved");
    expect(out[0]!.anchor.unanchored).toBe(true);
    expect(out[0]!.anchor.quote).toBe("the removal of the statue"); // the original quote is kept on record
  });

  it("an already-unanchored finding stays Whole piece and is NOT 'lost'", () => {
    const out = projectFindingsOntoMarkdown(
      [{ id: "f1", anchor: { ...anchor("", "b1"), unanchored: true } }, { id: "f2" }],
      AFTER,
    );
    expect(out[0]!.lost).toBe(false);
    expect(out[0]!.anchor.unanchored).toBe(true);
    expect(out[1]!.lost).toBe(false);
    expect(out[1]!.anchor.unanchored).toBe(true);
  });
});

describe("humanRevisionProvenance — block-level provenance map (§5.4; REQ-DATA-29)", () => {
  const fallback: ProvenanceBase = { fallbackSource: { kind: "agent", runId: "run_1", draftN: 2 } };

  it("marks every hunk's after-block human and inherits the rest", () => {
    const spans = humanRevisionProvenance(BEFORE, AFTER, fallback);
    // AFTER has 4 blocks: b1 unchanged (inherits agent), b2 edited (human), b3 unchanged, b4 added (human).
    expect(spans).toEqual([
      { blockId: "b1", source: { kind: "agent", runId: "run_1", draftN: 2 } },
      { blockId: "b2", source: { kind: "human" } },
      { blockId: "b3", source: { kind: "agent", runId: "run_1", draftN: 2 } },
      { blockId: "b4", source: { kind: "human" } },
    ]);
  });

  it("inherits through the base map's content hashes even when positions shifted", () => {
    // insert a block at the TOP so every positional id shifts — the unchanged blocks keep their
    // provenance by content hash, not by blockId.
    const shifted = "A new epigraph.\n\n" + BEFORE;
    const baseMap = buildBlockIdMap(BEFORE);
    const base: ProvenanceBase = {
      blockIdMap: baseMap,
      spans: [
        { blockId: "b1", source: { kind: "agent", runId: "run_9", draftN: 1 } },
        { blockId: "b2", source: { kind: "pasted" } },
        { blockId: "b3", source: { kind: "chat", threadId: "th_1" } },
      ],
      fallbackSource: { kind: "human" },
    };
    const spans = humanRevisionProvenance(BEFORE, shifted, base);
    expect(spans).toEqual([
      { blockId: "b1", source: { kind: "human" } }, // the new epigraph
      { blockId: "b2", source: { kind: "agent", runId: "run_9", draftN: 1 } },
      { blockId: "b3", source: { kind: "pasted" } },
      { blockId: "b4", source: { kind: "chat", threadId: "th_1" } },
    ]);
  });

  it("a no-op edit produces no human spans", () => {
    const spans = humanRevisionProvenance(BEFORE, BEFORE, fallback);
    expect(spans.every((s) => s.source.kind !== "human")).toBe(true);
    expect(spans).toHaveLength(3);
  });
});

describe("buildBlockIdMap — the stable-block-id sidecar (§5.4)", () => {
  it("is deterministic, positional, and keyed by content hash of normalized text", () => {
    const m1 = buildBlockIdMap(AFTER);
    const m2 = buildBlockIdMap(AFTER);
    expect(m1).toEqual(m2);
    expect(Object.keys(m1)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(m1["b4"]!.ordinal).toBe(4);
    // a whitespace-only drift keeps the hash (ids are stable under formatting noise)
    const drifted = buildBlockIdMap(AFTER.replace("restated claim", "restated  claim"));
    expect(drifted["b2"]!.contentHash).toBe(m1["b2"]!.contentHash);
  });
});

describe("editedAfterBlockIds", () => {
  it("returns the after-block ids inside hunks", () => {
    expect([...editedAfterBlockIds(BEFORE, AFTER)].sort()).toEqual(["b2", "b4"]);
  });
});
