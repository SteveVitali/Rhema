import { describe, it, expect } from "vitest";
import { diffMarkdown } from "./what-changed.js";
import {
  diffWords,
  tokenizeWords,
  wordCoverage,
  wordPairable,
  WORD_DIFF_CELL_LIMIT,
  type WordRun,
} from "./word-diff.js";

// 333_R7UX.10 (BL-88) — the word-level diff inside a changed paragraph pair. Pin the run shape (the
// prosemirror-changeset 1.x `Change` offsets), the span kinds the compare view marks, the honest
// fast/fallback paths, and the recorded 100 KB perf bound.

/** Reconstruct both sides from the runs — the coverage invariant every consumer relies on. */
function reconstruct(before: string, after: string, runs: readonly WordRun[]) {
  return {
    a: runs.map((r) => before.slice(r.fromA, r.toA)).join(""),
    b: runs.map((r) => after.slice(r.fromB, r.toB)).join(""),
  };
}

function marked(runs: readonly WordRun[], before: string, after: string) {
  return {
    deleted: runs.filter((r) => r.kind === "deleted" || r.kind === "edited").map((r) => before.slice(r.fromA, r.toA)),
    inserted: runs.filter((r) => r.kind === "inserted" || r.kind === "edited").map((r) => after.slice(r.fromB, r.toB)),
  };
}

describe("diffWords (BL-88)", () => {
  it("tokenizeWords covers every character exactly once — word, space, and punct tokens", () => {
    const text = "don't stop—now, OK?";
    const tokens = tokenizeWords(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    for (let i = 1; i < tokens.length; i++) expect(tokens[i]!.start).toBe(tokens[i - 1]!.end);
    // the contraction is one word token; the em-dash is its own punct token.
    expect(tokens[0]!.text).toBe("don't");
    expect(tokens.some((t) => t.text === "—")).toBe(true);
  });

  it("the no-change fast path: identical text is one same run, empty input is no runs", () => {
    expect(diffWords("", "")).toEqual([]);
    const runs = diffWords("the quick brown fox", "the quick brown fox");
    expect(runs).toEqual([
      { fromA: 0, toA: 19, fromB: 0, toB: 19, kind: "same" },
    ]);
  });

  it("a replaced word marks the deleted + inserted spans around the same context", () => {
    const before = "The pillar stands on the old claim.";
    const after = "The pillar stands on the restated claim.";
    const runs = diffWords(before, after);
    const { a, b } = reconstruct(before, after, runs);
    expect(a).toBe(before);
    expect(b).toBe(after);
    const m = marked(runs, before, after);
    expect(m.deleted).toEqual(["old"]);
    expect(m.inserted).toEqual(["restated"]);
    // the shared prefix/suffix (incl. the trailing period) stay `same` — never marked.
    expect(runs[0]!.kind).toBe("same");
    expect(runs[0]!).toMatchObject({ fromA: 0, toA: "The pillar stands on the ".length });
    expect(runs[runs.length - 1]!.kind).toBe("same");
    expect(after.slice(runs[runs.length - 1]!.fromB, runs[runs.length - 1]!.toB)).toBe(" claim.");
  });

  it("a pure insertion emits an inserted run; a pure deletion a deleted run", () => {
    const ins = diffWords("a c", "a b c");
    expect(marked(ins, "a c", "a b c").inserted.join("")).toBe("b ");
    expect(ins.every((r) => r.kind !== "deleted" && r.kind !== "edited")).toBe(true);
    const del = diffWords("a b c", "a c");
    expect(marked(del, "a b c", "a c").deleted.join("")).toBe("b ");
    expect(del.every((r) => r.kind !== "inserted" && r.kind !== "edited")).toBe(true);
  });

  it("unicode words diff as words, and punctuation diffs separately from the word it trails", () => {
    const runs = diffWords("café über alles end.", "café naïve alles end,");
    const m = marked(runs, "café über alles end.", "café naïve alles end,");
    expect(m.deleted.join("")).toContain("über");
    expect(m.inserted.join("")).toContain("naïve");
    expect(m.deleted.join("")).toContain(".");
    expect(m.inserted.join("")).toContain(",");
    // the words around the punctuation are untouched.
    const last = runs[runs.length - 1]!;
    expect(last.kind).not.toBe("same");
  });

  it("intra-word joiners keep contractions/hyphenated words as one token", () => {
    const runs = diffWords("a well-known fact", "a little-known fact");
    const m = marked(runs, "a well-known fact", "a little-known fact");
    expect(m.deleted).toEqual(["well-known"]);
    expect(m.inserted).toEqual(["little-known"]);
  });

  it("runs partition both strings — A-slices concat to `before`, B-slices to `after`", () => {
    const before = "One two, three! Vier fünf sechs.";
    const after = "One 2, three… vier fünf + sieben.";
    const runs = diffWords(before, after);
    const { a, b } = reconstruct(before, after, runs);
    expect(a).toBe(before);
    expect(b).toBe(after);
    // ascending, non-overlapping, gap-free.
    for (let i = 1; i < runs.length; i++) {
      expect(runs[i]!.fromA).toBe(runs[i - 1]!.toA);
      expect(runs[i]!.fromB).toBe(runs[i - 1]!.toB);
    }
  });

  it("a paragraph with zero word changes gets no marked runs", () => {
    const para = "This paragraph survives the revision untouched.";
    const runs = diffWords(para, para);
    expect(runs.every((r) => r.kind === "same")).toBe(true);
    expect(marked(runs, para, para)).toEqual({ deleted: [], inserted: [] });
  });

  it("past the cell limit the middle degrades to one coarse edited run — bounded, still truthful", () => {
    const before = "aa bb cc dd ee";
    const after = "vv ww xx yy zz";
    // the default WORD_DIFF_CELL_LIMIT keeps this pair word-level; the tiny cap degrades it.
    expect(diffWords(before, after, WORD_DIFF_CELL_LIMIT).filter((r) => r.kind !== "same").length).toBeGreaterThan(1);
    const runs = diffWords(before, after, 4); // 5×5 tokens > 4 cells
    const { a, b } = reconstruct(before, after, runs);
    expect(a).toBe(before);
    expect(b).toBe(after);
    const edited = runs.filter((r) => r.kind === "edited");
    expect(edited.length).toBe(1);
    expect(before.slice(edited[0]!.fromA, edited[0]!.toA)).toBe(before);
    expect(after.slice(edited[0]!.fromB, edited[0]!.toB)).toBe(after);
  });

  it("wordCoverage / wordPairable gate the pairing exactly like the hunk's edited floor", () => {
    expect(wordCoverage("the old claim stands", "the restated claim stands")).toBeGreaterThan(0.5);
    expect(wordPairable("the old claim stands", "the restated claim stands")).toBe(true);
    expect(wordPairable("alpha beta gamma delta", "one two three four")).toBe(false);
  });

  it("a 100 KB document pair diffs under the compare view's block-diff budget (recorded bound)", () => {
    // ~100 KB pair: ~130 paragraphs (~390 chars each), every fifth paragraph word-edited.
    const para = (i: number) =>
      `Paragraph ${i} carries the standard prose about method and claim and evidence, ` +
      `the argument that a careful revision keeps in view while the wording moves around it, ` +
      `and the closing cadence that lands the section ${i} where the reader expects it to land, ` +
      `with a tail of plain connective text so the fixture weighs like a real document body ` +
      `rather than a token-count trick, section ${i} settled.`;
    const edited = (i: number) => para(i).replace("standard prose", "revised prose").replace("closing cadence", "final cadence");
    const beforeParts: string[] = [];
    const afterParts: string[] = [];
    for (let i = 0; i < 130; i++) {
      beforeParts.push(para(i));
      afterParts.push(i % 5 === 0 ? edited(i) : para(i));
    }
    const before = beforeParts.join("\n\n");
    const after = afterParts.join("\n\n");
    expect(before.length + after.length).toBeGreaterThanOrEqual(100_000);

    const t0 = performance.now();
    const diff = diffMarkdown(before, after);
    let runs = 0;
    for (const h of diff.hunks) {
      const rows = Math.min(h.before.length, h.after.length);
      for (let i = 0; i < rows; i++) {
        const b0 = h.before[i]!;
        const a0 = h.after[i]!;
        if (wordPairable(b0.text, a0.text)) runs += diffWords(b0.text, a0.text).length;
      }
    }
    const ms = performance.now() - t0;
    expect(runs).toBeGreaterThan(0);
    // the bound the run ledger records: measured on this fixture (see R7UX.10's ledger for the
    // number); the assert is the CI-safe ceiling, not the measurement.
    expect(ms).toBeLessThan(500);
    console.log(`[word-diff] 100KB-class pair (${before.length + after.length} chars): block diff + word marks in ${ms.toFixed(1)}ms`);
  });
});
