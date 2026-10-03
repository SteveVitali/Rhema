import { describe, it, expect } from "vitest";
import { calibrationRows, measureCorpus, measureProse, sentences } from "./index.js";
import { calibrationVerdict, withinOneBand } from "@rhema/contracts";

// P1.14 — the deterministic prose-metrics service (§9.4; REQ-PERSONA-6/8/9). The governing
// property: same text → same numbers, forever (the calibration table and the chat `measure`
// tool both consume this).

const PROSE = `The reaction to artificial intelligence has been strange. We built mirrors and called them minds.

I think the confusion is deliberate. When a system produces a sentence, we ask whether it means anything — as if meaning were a property of the sentence rather than of the reader. It is not. You read the sentence; the meaning happens in you.

Consider the evidence. Most deployed systems produce text at industrial scale, and almost none of it is read twice. The sentence is cheap now. What remains expensive is the sentence worth keeping.`;

describe("measureProse", () => {
  it("is deterministic — same text, byte-identical numbers", () => {
    expect(measureProse(PROSE)).toEqual(measureProse(PROSE));
  });

  it("counts words, sentences, paragraphs", () => {
    const m = measureProse(PROSE);
    expect(m.words).toBeGreaterThan(90);
    expect(m.sentences).toBeGreaterThanOrEqual(10);
    expect(m.paragraphs).toBe(3);
  });

  it("computes the sentence-length distribution (median, IQR, max)", () => {
    const m = measureProse("One two three. Four five. Six seven eight nine ten eleven twelve.");
    expect(m.sentenceLength.median).toBe(3);
    expect(m.sentenceLength.min).toBe(2);
    expect(m.sentenceLength.max).toBe(7);
    expect(m.sentenceLength.q1).toBeLessThanOrEqual(m.sentenceLength.median);
    expect(m.sentenceLength.q3).toBeGreaterThanOrEqual(m.sentenceLength.median);
  });

  it("counts the per-1k feature rates: first person, second person, questions, em-dash, colon/semicolon, parens", () => {
    const m = measureProse("I think you see it — plainly; clearly (obviously). Do you? Yes.");
    expect(m.rates.firstPerson).toBeGreaterThan(0);
    expect(m.rates.secondPerson).toBeGreaterThan(0);
    expect(m.rates.questions).toBeGreaterThan(0);
    expect(m.rates.emDash).toBeGreaterThan(0);
    expect(m.rates.colonSemicolon).toBeGreaterThan(0);
    expect(m.rates.parentheses).toBeGreaterThan(0);
  });

  it("em-dash rate is per 1,000 words and counts — and --", () => {
    const one = measureProse("a — b ".repeat(100));
    const two = measureProse("a -- b ".repeat(100));
    expect(one.rates.emDash).toBeCloseTo(two.rates.emDash, 5);
  });

  it("markdown apparatus counts headers, list items, table rows, footnotes", () => {
    const m = measureProse("# Title\n\n- one\n- two\n\n| a | b |\n|---|---|\n\n[^1]: note");
    expect(m.apparatus.headers).toBe(1);
    expect(m.apparatus.lists).toBe(2);
    expect(m.apparatus.tables).toBe(2);
    expect(m.apparatus.footnotes).toBe(1);
  });

  it("sentence openings classify conjunction, subordinate, it/there, subject-first", () => {
    const m = measureProse("And so it goes. Because the rain fell, we left. It is done. The house stood.");
    expect(m.openings.conjunction).toBeCloseTo(0.25, 5);
    expect(m.openings.subordinate).toBeCloseTo(0.25, 5);
    expect(m.openings.itThere).toBeCloseTo(0.25, 5);
    expect(m.openings.subjectFirst).toBeCloseTo(0.25, 5);
  });

  it("type-token ratio: all-same vs all-different", () => {
    expect(measureProse("same same same same").typeTokenRatio).toBeCloseTo(0.25, 5);
    expect(measureProse("one two three four").typeTokenRatio).toBe(1);
  });

  it("sections split on markdown headers", () => {
    const m = measureProse("Intro words here.\n\n## Part one\n\nBody body body body.\n\n## Part two\n\nMore body.");
    expect(m.sectionsCount).toBe(2);
    expect(m.sectionWordsMedian).toBeGreaterThan(0);
  });

  it("empty input produces zeros, never NaN", () => {
    const m = measureProse("");
    expect(m.words).toBe(0);
    expect(m.sentenceLength.median).toBe(0);
    expect(m.typeTokenRatio).toBe(0);
    for (const v of Object.values(m.rates)) expect(v).toBe(0);
  });
});

describe("measureCorpus", () => {
  it("returns corpus measures + per-piece measures + the piece-length distribution", () => {
    const c = measureCorpus(["one two three. four five.", "alpha beta gamma delta epsilon zeta."]);
    expect(c.pieces).toHaveLength(2);
    expect(c.corpus.words).toBe(11);
    expect(c.pieceLength.median).toBe(5.5);
    expect(c.pieceLength.min).toBe(5);
    expect(c.pieceLength.max).toBe(6);
  });
});

describe("calibrationRows + the §16.3 #10 verdict", () => {
  it("rows carry target / prediction / actual / withinBand per feature", () => {
    const target = measureProse(PROSE);
    const actual = measureProse(PROSE + " A closing line that shifts nothing structural.");
    const rows = calibrationRows(target, null, actual);
    expect(rows.length).toBe(9);
    for (const r of rows) {
      expect(r.prediction).toBeNull();
      expect(typeof r.withinBand).toBe("boolean");
    }
    // identical corpus ⇒ every feature within band
    const same = calibrationRows(target, null, target);
    expect(same.every((r) => r.withinBand)).toBe(true);
  });

  it("withinOneBand respects the per-feature floor and relative band", () => {
    expect(withinOneBand("em_dash_per_1k", 2.4, 6.4)).toBe(false); // spec's own example: badly under-produced
    expect(withinOneBand("em_dash_per_1k", 2.4, 3.0)).toBe(true);
    expect(withinOneBand("sentence_length_median", 15.5, 16)).toBe(true);
  });

  it("badly_off: fewer than half in band, or the blind check picked the prediction", () => {
    expect(calibrationVerdict({ rows: [{ withinBand: true }, { withinBand: false }] })).toBe("tested");
    expect(calibrationVerdict({ rows: [{ withinBand: false }, { withinBand: false }, { withinBand: true }] })).toBe("tested-badly-off");
    expect(calibrationVerdict({ rows: [{ withinBand: true }], blindCheckPickedPrediction: true })).toBe("tested-badly-off");
  });
});

describe("sentences()", () => {
  it("does not split inside numbers or on stray markdown", () => {
    expect(sentences("Version 3.5 shipped. Done.")).toHaveLength(2);
    expect(sentences("# A heading\n\nFirst line. Second line.")).toHaveLength(3);
  });
});
