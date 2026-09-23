import { describe, it, expect } from "vitest";
import { undo, undoDepth } from "prosemirror-history";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";
import { acceptProposalTr, rejectProposal, blockProposal } from "./proposal.js";
import { createPageState } from "./plugins.js";
import { topBlocks, provenanceKey, ORIGIN_META } from "./provenance.js";

// The proposal card's transaction semantics (P1.02; REQ-IDE-45 amended, REQ-DATA-28 amended):
//   • accept applies ONE plain transaction tagged `agent:*` and excluded from human undo
//     (`addToHistory: false`) — the human's ⌘Z walks only their own edits;
//   • reject is a literal no-op on the document;
//   • the applied content lands in the provenance capture as `agent`.

const MD = `First paragraph of the draft.

Second paragraph of the draft.`;

describe("proposal accept", () => {
  it("applies the fragment as one transaction at the anchor range", () => {
    const s = createPageState(markdownToDoc(MD).toJSON());
    const target = topBlocks(s.doc)[1]!;
    const p = blockProposal("prop_1", target, "Replacement paragraph.", "agent:assistant:run_1");
    const s2 = s.apply(acceptProposalTr(s.doc, s.tr, p));
    expect(docToMarkdown(s2.doc)).toBe("First paragraph of the draft.\n\nReplacement paragraph.\n");
    // provenance capture sees the agent origin
    expect(provenanceKey.getState(s2)!.sources.get("b2")!.kind).toBe("agent");
  });

  it("agent transactions stay OUT of the human undo stack (⌘Z walks human edits only)", () => {
    const s = createPageState(markdownToDoc(MD).toJSON());
    // a human edit first — this is what ⌘Z must still reach
    const r1 = topBlocks(s.doc)[0]!;
    const s1 = s.apply(s.tr.insertText("human typed. ", r1.from + 1).setMeta(ORIGIN_META, "human"));
    expect(undoDepth(s1)).toBe(1);
    // the agent's proposal lands — NOT added to history
    const target = topBlocks(s1.doc)[1]!;
    const p = blockProposal("prop_1", target, "Agent rewrite.", "agent:assistant:run_1");
    const s2 = s1.apply(acceptProposalTr(s1.doc, s1.tr, p));
    expect(undoDepth(s2)).toBe(1); // the agent tr never joined the undo stack
    // undo → the HUMAN's edit reverts; the agent's applied content survives the undo
    const s3 = (() => {
      let st = s2;
      undo(st, (tr) => { st = st.apply(tr); });
      return st;
    })();
    const md = docToMarkdown(s3.doc);
    expect(md).not.toContain("human typed.");   // the human's edit undid
    expect(md).toContain("Agent rewrite.");      // the accepted proposal is not undoable
  });

  it("an insert-kind proposal splices at the anchor point without replacing", () => {
    const s = createPageState(markdownToDoc(MD).toJSON());
    const target = topBlocks(s.doc)[0]!;
    const p = blockProposal("prop_2", { from: target.to, to: target.to }, "An inserted sentence.", "agent:assistant:run_1", "insert");
    const s2 = s.apply(acceptProposalTr(s.doc, s.tr, p));
    const md = docToMarkdown(s2.doc);
    expect(md).toContain("First paragraph of the draft.");
    expect(md).toContain("An inserted sentence.");
  });
});

describe("proposal reject", () => {
  it("leaves the document untouched (provable equality)", () => {
    const s = createPageState(markdownToDoc(MD).toJSON());
    const target = topBlocks(s.doc)[1]!;
    const p = blockProposal("prop_3", target, "Would-be replacement.", "agent:assistant:run_1");
    const out = rejectProposal(s.doc, p);
    expect(out.eq(s.doc)).toBe(true);
    expect(docToMarkdown(out)).toBe(MD + "\n");
    // nothing was dispatched — the undo stack still holds zero
    expect(undoDepth(s)).toBe(0);
  });
});
