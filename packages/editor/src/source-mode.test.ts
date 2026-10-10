import { describe, it, expect } from "vitest";
import { undo, redo } from "prosemirror-history";
import { applySourceMarkdown, diffTopBlocks, SOURCE_EDIT_META } from "./source-mode.js";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";
import { ORIGIN_META, provenanceKey } from "./provenance.js";
import { createPageState } from "./plugins.js";
import type { EditorState, Transaction } from "prosemirror-state";

// SPA.25 — the source-mode commit core (REQ-ED-17; design/30): markdown⇄doc mapping is the
// canonical serializer/parser pair, commits are block-diffed transactions stamped `human`/`pasted`,
// and the commit lands on the SAME undo/provenance story the rendered editor owns — including a
// three-way merge that keeps foreign (remote/proposal/restore) writes the user never touched.
// Divergence between the two views is the defect these tests fence.

const MD = `Para one.

Para two.

Para three.`;

const state = (md = MD) => createPageState(markdownToDoc(md).toJSON());

/** The caller's shape: buffer text → parsed `next`; `base` = the doc the buffer was seeded/last
 *  committed against. A caller with no foreign activity passes `state.doc` as base. */
const apply = (s: EditorState, md: string, base = s.doc, origin: "human" | "pasted" = "human"): Transaction | null =>
  applySourceMarkdown(s, markdownToDoc(md), base, origin);

describe("diffTopBlocks", () => {
  it("equal docs produce no runs", () => {
    expect(diffTopBlocks(markdownToDoc(MD), markdownToDoc(MD))).toEqual([]);
  });

  it("a middle-paragraph change diffs to exactly one run over that block", () => {
    const cur = markdownToDoc(MD);
    const next = markdownToDoc(`Para one.\n\nCHANGED.\n\nPara three.`);
    const runs = diffTopBlocks(cur, next);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.fromIndex).toBe(1);
    expect(runs[0]!.toIndex).toBe(2);
    expect(runs[0]!.insert.map((n) => n.textContent)).toEqual(["CHANGED."]);
  });

  it("two scattered edits produce two disjoint runs (no whole-doc replace)", () => {
    const cur = markdownToDoc(MD);
    const next = markdownToDoc(`ONE edited.\n\nPara two.\n\nTHREE edited.`);
    const runs = diffTopBlocks(cur, next);
    expect(runs).toHaveLength(2);
    expect(runs[0]!.fromIndex).toBe(0);
    expect(runs[0]!.toIndex).toBe(1);
    expect(runs[1]!.fromIndex).toBe(2);
    expect(runs[1]!.toIndex).toBe(3);
  });

  it("insertions and deletions diff to empty-range / empty-insert runs", () => {
    const cur = markdownToDoc(`A.\n\nC.`);
    const inserted = markdownToDoc(`A.\n\nB.\n\nC.`);
    const ins = diffTopBlocks(cur, inserted);
    expect(ins).toHaveLength(1);
    expect(ins[0]!.fromIndex).toBe(ins[0]!.toIndex); // pure insertion
    expect(ins[0]!.insert.map((n) => n.textContent)).toEqual(["B."]);
    const del = diffTopBlocks(inserted, cur);
    expect(del).toHaveLength(1);
    expect(del[0]!.insert).toHaveLength(0); // pure deletion
  });
});

describe("applySourceMarkdown", () => {
  it("a buffer equal to base returns null — no transaction, no provenance churn", () => {
    // reflowed whitespace parses to the same doc — the commit must be a no-op, not a tr.
    const s = state();
    expect(apply(s, docToMarkdown(s.doc))).toBeNull();
    expect(apply(s, `Para one.\n\n\n\nPara two.\n\nPara three.\n`)).toBeNull();
  });

  it("commits a block-diffed transaction stamped human + SOURCE_EDIT_META", () => {
    const s = state();
    const tr = apply(s, `Para one.\n\nCHANGED.\n\nPara three.`);
    expect(tr).not.toBeNull();
    expect(tr!.getMeta(ORIGIN_META)).toBe("human");
    expect(tr!.getMeta(SOURCE_EDIT_META)).toBe(true);
    const s2 = s.apply(tr!);
    expect(s2.doc.childCount).toBe(3);
    expect(s2.doc.child(1).textContent).toBe("CHANGED.");
    expect(docToMarkdown(s2.doc)).toBe(docToMarkdown(markdownToDoc(`Para one.\n\nCHANGED.\n\nPara three.`)));
  });

  it("touches only the edit region — agent provenance in untouched blocks survives the commit", () => {
    const five = `A.\n\nB.\n\nC.\n\nD.\n\nE.`;
    const s = state(five);
    // a live agent write records the span on b1 (the only way spans exist — write-only capture)
    const s1 = s.apply(s.tr.insertText("AGENT ", 1).setMeta(ORIGIN_META, "agent:drafter:run_1"));
    expect(provenanceKey.getState(s1)!.sources.get("b1")?.kind).toBe("agent");
    // a source commit editing only the LAST block must not restamp b1
    const md = docToMarkdown(s1.doc).replace(/\n\nE\.\s*$/, "\n\nE edited.");
    const tr = apply(s1, md)!;
    const s2 = s1.apply(tr);
    const prov = provenanceKey.getState(s2)!;
    expect(prov.sources.get("b1")?.kind).toBe("agent"); // untouched → source preserved
    expect(prov.sources.get("b5")?.kind).toBe("human"); // the edit → human
    expect(s2.doc.child(0).textContent).toBe("AGENT A.");
    expect(s2.doc.child(4).textContent).toBe("E edited.");
  });

  it("a human source edit inside a recorded agent span degrades the block to mixed (REQ-POS-9)", () => {
    const s = state();
    let b2From = 0;
    s.doc.forEach((_n, off, i) => {
      if (i === 1) b2From = off;
    });
    const s1 = s.apply(s.tr.insertText("AGENT ", b2From + 1).setMeta(ORIGIN_META, "agent:drafter:run_1"));
    const md = docToMarkdown(s1.doc).replace("AGENT Para two.", "HUMAN-edited two.");
    const tr = apply(s1, md)!;
    const s2 = s1.apply(tr);
    expect(provenanceKey.getState(s2)!.sources.get("b2")?.kind).toBe("mixed");
  });

  it("the commit is ONE undo unit on the PM history stack — undo restores the pre-commit doc", () => {
    const s = state();
    const tr = apply(s, `Para one.\n\nCHANGED.\n\nPara three.\n\nFour appended.`)!;
    let s2 = s.apply(tr);
    expect(s2.doc.childCount).toBe(4);
    // prosemirror-history's undo is a command — drive it with a dispatch that applies to s2.
    const dispatch = (t: Transaction) => {
      s2 = s2.apply(t);
    };
    expect(undo(s2, dispatch)).toBe(true);
    expect(docToMarkdown(s2.doc)).toBe(docToMarkdown(markdownToDoc(MD)));
    expect(redo(s2, dispatch)).toBe(true);
    expect(s2.doc.childCount).toBe(4);
  });

  it("paste-origin commits stamp `pasted`, matching the island's provenance vocabulary", () => {
    const s = state();
    const tr = apply(s, `Para one.\n\nPasted two.\n\nPara three.`, undefined, "pasted")!;
    expect(tr.getMeta(ORIGIN_META)).toBe("pasted");
  });
});

describe("applySourceMarkdown — the three-way merge (design/30)", () => {
  it("foreign writes in untouched regions survive a dirty commit", () => {
    const s = state();
    const base = s.doc;
    // foreign append while the buffer is dirty (a remote peer / proposal / restore tr)
    const s1 = s.apply(
      s.tr.insert(s.doc.content.size, s.schema.node("paragraph", null, s.schema.text("foreign tail"))),
    );
    // the user's buffer: the seeded text with the tail block edited (never saw the foreign append)
    const tr = apply(s1, `Para one.\n\nPara two.\n\nMY tail.`, base)!;
    const s2 = s1.apply(tr);
    const texts = s2.doc.children.map((c) => c.textContent);
    expect(texts).toEqual(["Para one.", "Para two.", "MY tail.", "foreign tail"]);
  });

  it("a foreign edit overlapping the user's block loses (last-writer-wins, flagged by the note)", () => {
    const s = state();
    const base = s.doc;
    let b2From = 0;
    s.doc.forEach((_n, off, i) => {
      if (i === 1) b2From = off;
    });
    const s1 = s.apply(s.tr.insertText("FOREIGN ", b2From + 1));
    // the user's buffer still carries the pre-foreign text, edited — the overlap drops the foreign run
    const tr = apply(s1, `Para one.\n\nMY two.\n\nPara three.`, base)!;
    const s2 = s1.apply(tr);
    const texts = s2.doc.children.map((c) => c.textContent);
    expect(texts).toEqual(["Para one.", "MY two.", "Para three."]);
  });

  it("non-overlapping user+foreign edits on BOTH sides land in one commit", () => {
    const s = state();
    const base = s.doc;
    // foreign edits block 1; the user's buffer edits block 3 — both survive.
    const s1 = s.apply(s.tr.insertText("FOREIGN ", 1));
    const tr = apply(s1, `Para one.\n\nPara two.\n\nTHREE edited.`, base)!;
    const s2 = s1.apply(tr);
    const texts = s2.doc.children.map((c) => c.textContent);
    expect(texts).toEqual(["FOREIGN Para one.", "Para two.", "THREE edited."]);
  });
});
