import { describe, expect, it } from "vitest";
import {
  buildChangedSince,
  buildRubricDelta,
  buildWhatChangedView,
  diffMarkdown,
  splitMarkdownBlocks,
  traceRevisionMoves,
} from "./what-changed.js";

// PRB.06 — the server-side What-changed model (§5.8; REQ-IDE-33, REQ-BETA-7/8, REQ-DATA-25, REQ-IDE-30).
// Deterministic: identical markdown + ledger inputs produce identical block ids, hunks, and joins.

const V2 = `# Title\n\nThe thesis stands on one pillar.\n\nEvidence: the old source says it holds.\n\nA closing note.\n`;
const V3 = `# Title\n\nThe thesis stands on one pillar, now restated for the move.\n\nEvidence: the old source says it holds.\n\nA closing note.\n\nA new coda the ledger never mentioned.\n`;

describe("splitMarkdownBlocks", () => {
  it("splits on blank lines into deterministic positional block ids", () => {
    const blocks = splitMarkdownBlocks(V2);
    expect(blocks.map((b) => b.blockId)).toEqual(["b1", "b2", "b3", "b4"]);
    // identical input → identical ids (the diff is reproducible byte-for-byte).
    expect(splitMarkdownBlocks(V2).map((b) => b.blockId)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(blocks[1]!.text).toBe("The thesis stands on one pillar.");
  });
});

describe("diffMarkdown", () => {
  it("produces block-aligned hunks: an edit, an addition, unchanged context counted", () => {
    const diff = diffMarkdown(V2, V3);
    expect(diff.unchanged).toBe(3); // title, evidence, closing note
    expect(diff.hunks.length).toBe(2);
    const [edit, add] = diff.hunks;
    expect(edit!.kind).toBe("edited");
    expect(edit!.before[0]!.text).toContain("one pillar.");
    expect(edit!.after[0]!.text).toContain("restated for the move");
    expect(add!.kind).toBe("added");
    expect(add!.after[0]!.text).toContain("new coda");
    expect(edit!.charsChanged).toBeGreaterThan(0);
  });

  it("an empty after-side yields a removed hunk; identical inputs yield no hunks", () => {
    const removed = diffMarkdown(V2, `# Title\n\nThe thesis stands on one pillar.\n\nA closing note.\n`);
    expect(removed.hunks[0]!.kind).toBe("removed");
    expect(diffMarkdown(V2, V2).hunks).toEqual([]);
  });
});

describe("buildWhatChangedView — the move ↔ finding ↔ hunk join (§5.8)", () => {
  const ledgerAnchor = {
    blockId: "b2",
    quote: "restated for the move",
    startOffset: 0,
    endOffset: 0,
    confidence: 1,
  };

  it("joins the move's discharge-evidence anchor into its hunk; rebutted carries rationale + NO hunk; unlinked groups the rest", () => {
    const diff = diffMarkdown(V2, V3);
    const view = buildWhatChangedView(diff, {
      entries: [
        // Move 1 answers finding 2 (accept, done) — its anchor resolves onto the edited block.
        { findingOrdinal: 2, findingId: "f_2", title: "weak pillar", severity: "major", kind: "accept", status: "done", moveOrdinal: 1, anchor: ledgerAnchor },
        // finding 3 is rebutted — the card carries the rationale and NO hunk.
        { findingOrdinal: 3, findingId: "f_3", title: "tone", severity: "minor", kind: "rebut", status: "done", rationale: "The tone is deliberate — see the charter." },
        // finding 4 has no move — an unlinked ledger row.
        { findingOrdinal: 4, findingId: "f_4", title: "typo", severity: "note", kind: "accept", status: "open" },
      ],
      moves: [{ ordinal: 1, title: "Restate the thesis", type: "structure" }],
      obligationLines: {
        1: [
          {
            obligationId: "obl_1",
            label: "OBL-3",
            lineage: "(F-02, carried from v2)",
            verifiedBy: "gap_check",
            state: "discharged",
          },
        ],
      },
      strip: { addressed: 1, rebutted: 1, stillOpen: 2 },
    });

    // Move 1 card: the answered finding + the discharge line + the joined hunk.
    expect(view.moves.length).toBe(1);
    const move = view.moves[0]!;
    expect(move.moveId).toBe("M1");
    expect(move.title).toBe("Restate the thesis");
    expect(move.findings[0]!.findingOrdinal).toBe(2);
    expect(move.dischargeLines[0]!.label).toBe("OBL-3");
    expect(move.dischargeLines[0]!.verifiedBy).toBe("gap_check");
    expect(move.hunks.map((h) => h.id)).toEqual(["h1"]);

    // the rebutted finding: rationale rendered, no hunk joined.
    expect(view.rebutted.length).toBe(1);
    expect(view.rebutted[0]!.rationale).toContain("deliberate");
    expect(view.moves.flatMap((m) => m.hunks)).toHaveLength(1);

    // the "new coda" hunk + the no-move entry group under Unlinked.
    expect(view.unlinked.hunks.map((h) => h.id)).toEqual(["h2"]);
    expect(view.unlinked.entries.map((e) => e.findingOrdinal)).toEqual([4]);

    // the strip carries the server-computed counts + the move/hunk tallies.
    expect(view.strip).toEqual({ addressed: 1, rebutted: 1, stillOpen: 2, moves: 1, hunks: 2 });
  });

  it("a deletion's evidence resolves on the BEFORE side (the anchor only exists in vN)", () => {
    const before = `# T\n\nKeep me.\n\nCut this passage entirely.\n\nEnd.\n`;
    const after = `# T\n\nKeep me.\n\nEnd.\n`;
    const diff = diffMarkdown(before, after);
    const view = buildWhatChangedView(diff, {
      entries: [
        {
          findingOrdinal: 1,
          kind: "accept",
          status: "done",
          moveOrdinal: 2,
          anchor: { blockId: "b3", quote: "Cut this passage entirely.", startOffset: 0, endOffset: 0, confidence: 1 },
        },
      ],
      moves: [{ ordinal: 2, title: "Cut the digression" }],
      strip: { addressed: 1, rebutted: 0, stillOpen: 0 },
    });
    expect(view.moves[0]!.hunks.map((h) => h.id)).toEqual(["h1"]);
    expect(view.unlinked.hunks).toEqual([]);
  });

  it("a move-less ledger still renders: all hunks + entries group Unlinked", () => {
    const view = buildWhatChangedView(diffMarkdown(V2, V3), {
      entries: [{ findingOrdinal: 1, kind: "accept", status: "done" }],
      strip: { addressed: 0, rebutted: 0, stillOpen: 0 },
    });
    expect(view.moves).toEqual([]);
    expect(view.unlinked.hunks.length).toBe(2);
    expect(view.unlinked.entries.length).toBe(1);
  });
});

describe("traceRevisionMoves — revision.move_traced (REQ-BETA-7)", () => {
  it("emits one trace per move + an unlinked remainder row", () => {
    const diff = diffMarkdown(V2, V3);
    const traces = traceRevisionMoves(diff, {
      entries: [
        {
          findingOrdinal: 2,
          findingId: "f_2",
          kind: "accept",
          status: "done",
          moveOrdinal: 1,
          anchor: { blockId: "b2", quote: "restated for the move", startOffset: 0, endOffset: 0, confidence: 1 },
        },
      ],
      moves: [{ ordinal: 1, title: "Restate" }],
    });
    // move row + the unlinked "new coda" hunk.
    const moveTrace = traces.find((t) => t.moveId === "M1");
    expect(moveTrace).toMatchObject({ findingId: "f_2", hunkCount: 1 });
    const unlinked = traces.find((t) => t.moveId === undefined);
    expect(unlinked).toMatchObject({ hunkCount: 1 });
    expect(unlinked!.charsChanged).toBeGreaterThan(0);
  });

  it("a ledger-less diff (a manual revision) emits a single unlinked trace", () => {
    const traces = traceRevisionMoves(diffMarkdown(V2, V3), { entries: [], moves: [] });
    expect(traces.length).toBe(1);
    expect(traces[0]).toMatchObject({ hunkCount: 2 });
    expect(traces[0]!.moveId).toBeUndefined();
  });
});

describe("buildChangedSince — the re-review input (REQ-DATA-25)", () => {
  it("carries the diff hunks + a per-kind summary", () => {
    const cs = buildChangedSince(V2, V3);
    expect(cs.hunks.length).toBe(2);
    expect(cs.summary).toMatchObject({ edited: 1, added: 1, removed: 0, unchanged: 3 });
    expect(cs.humanAddedClaims).toEqual([]); // an agent revision carries none
  });

  it("a HUMAN revision marks every touched block humanAdded + verdict 'unverifiable' (AC4)", () => {
    const cs = buildChangedSince(V2, V3, { humanEdit: true });
    expect(cs.humanAddedClaims.length).toBe(2); // the edited block + the added coda
    for (const c of cs.humanAddedClaims) {
      expect(c.humanAdded).toBe(true);
      expect(c.verdict).toBe("unverifiable");
      expect(c.blockId).toMatch(/^b\d+$/);
    }
  });
});

describe("buildRubricDelta — per-dimension, NEVER an aggregate (REQ-IDE-30; AC6)", () => {
  it("renders before/after per dimension with a direction; no total exists", () => {
    const delta = buildRubricDelta(
      [
        { dimension: "thesis_contribution", score: 3 },
        { dimension: "prose", score: 4 },
      ],
      [
        { dimension: "thesis_contribution", score: 4 },
        { dimension: "prose", score: 4 },
        { dimension: "structure", score: 3 },
      ],
    );
    expect(delta.rows).toEqual([
      { dimension: "thesis_contribution", before: 3, after: 4, direction: "up" },
      { dimension: "prose", before: 4, after: 4, direction: "same" },
      { dimension: "structure", before: null, after: 3, direction: "new" },
    ]);
    // REQ-IDE-30: the view model carries no aggregate field at all.
    expect("total" in delta).toBe(false);
    expect(Object.keys(delta)).toEqual(["rows"]);
    for (const r of delta.rows) expect(Object.keys(r).sort()).toEqual(["after", "before", "dimension", "direction"]);
  });
});
