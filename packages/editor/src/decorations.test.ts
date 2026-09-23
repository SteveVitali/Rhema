import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import {
  resolveFindings, findingDecorationSet, decorationsPlugin, decorationInputsKey,
  pageDecorationsKey, type FindingForDecoration,
} from "./decorations.js";
import type { Anchor } from "@rhema/contracts";

// Findings as sidecar decorations (P1.02; §5.4, REQ-DATA-28 amended): decorations never enter the
// document — serialized markdown is byte-identical before and after, and a finding can only UNDERLINE
// text, never change it.

const MD = `## A heading

The injury claim is asserted more than shown.

A second paragraph with a cite \\[@smith2020] inside.`;

const blocks = splitMarkdownBlocks(MD);
const quote = "asserted more than shown";
const b2 = blocks[1]!;

const anchor: Anchor = {
  blockId: b2.blockId,
  quote,
  startOffset: b2.text.indexOf(quote),
  endOffset: b2.text.indexOf(quote) + quote.length,
  confidence: 1,
} as Anchor;

const FINDING: FindingForDecoration = { findingId: "fnd_1", anchor, severity: "major" };

describe("resolveFindings", () => {
  it("an exact anchor lands as an inline range inside the owning block", () => {
    const doc = markdownToDoc(MD);
    const [r] = resolveFindings(doc, [FINDING]);
    expect(r!.method).toBe("exact");
    expect(r!.blockId).toBe("b2");
    expect(r!.from).not.toBeNull();
    expect(r!.to).not.toBeNull();
    expect(r!.to! > r!.from!).toBe(true);
    // the decorated range covers exactly the quote's text
    expect(doc.textBetween(r!.from!, r!.to!)).toBe(quote);
  });

  it("an unanchored finding produces no doc range (Whole piece renders outside the doc)", () => {
    const doc = markdownToDoc(MD);
    const [r] = resolveFindings(doc, [{ findingId: "fnd_2", anchor: null, severity: "minor" }]);
    expect(r!.from).toBeNull();
    expect(r!.to).toBeNull();
    expect(["unanchored", "unresolved"]).toContain(r!.method);
  });

  it("a lost anchor stays unanchored (the card carries the lost note)", () => {
    const doc = markdownToDoc(MD);
    const [r] = resolveFindings(doc, [{ ...FINDING, lost: true }]);
    expect(r!.lost).toBe(true);
    expect(r!.from).toBeNull();
  });

  it("a quote that moved blocks resolves at block scope — the ladder's fuzzy rung", () => {
    const moved = `## A heading

Interlude paragraph inserted first.

The injury claim is asserted more than shown.`;
    const doc = markdownToDoc(moved);
    const [r] = resolveFindings(doc, [FINDING]);
    // the recorded block id no longer holds the quote → fuzzy resolves the block, which decorates
    // at block granularity (offsets are null on the fuzzy rung by design)
    expect(r!.method).toBe("fuzzy");
    expect(r!.from).not.toBeNull();
    expect(doc.textBetween(r!.from!, r!.to!)).toContain(quote);
  });
});

describe("decoration invariance — decorations never alter the document", () => {
  it("serialized markdown is byte-identical with findings decorated", () => {
    const doc = markdownToDoc(MD);
    const before = docToMarkdown(doc);
    const set = findingDecorationSet(doc, [FINDING]);
    expect(set.find().length).toBe(1);
    // the decoration set is applied to the SAME doc — nothing is inserted
    expect(docToMarkdown(doc)).toBe(before);
  });

  it("the decorations plugin leaves bytes untouched across input refresh", () => {
    const state = EditorState.create({ doc: markdownToDoc(MD), plugins: [decorationsPlugin()] });
    const before = docToMarkdown(state.doc);
    const tr = state.tr.setMeta(decorationInputsKey, { findings: [FINDING] });
    const next = state.apply(tr);
    expect(docToMarkdown(next.doc)).toBe(before);
    const decoState = pageDecorationsKey.getState(next)!;
    expect(decoState.set.find().length).toBe(1);
  });

  it("decorations remap through an edit (the finding rides its text)", () => {
    const state = EditorState.create({ doc: markdownToDoc(MD), plugins: [decorationsPlugin()] });
    const s1 = state.apply(state.tr.setMeta(decorationInputsKey, { findings: [FINDING] }));
    const decoBefore = pageDecorationsKey.getState(s1)!.set.find()[0]!;
    // insert text at the very start of the document → the decoration shifts by the insertion size
    const s2 = s1.apply(s1.tr.insertText("Prepended. ", 1));
    const decoAfter = pageDecorationsKey.getState(s2)!.set.find()[0]!;
    expect(decoAfter.from).toBe(decoBefore.from + "Prepended. ".length);
    expect(docToMarkdown(s2.doc)).toContain("Prepended.");
  });
});
