import { describe, expect, it } from "vitest";
import { lineHintOf, quoteFragments, stripLocator } from "./quotes.js";

// REQ-CONV-1 — the quote-fragment extractor feeds the anchor ladder: quoted spans, split on
// ellipses/editorial brackets, word floors; the trailing locator parenthetical comes off the
// emitted `text` but the quote stays verbatim.

describe("quoteFragments (R2 §5)", () => {
  it("extracts a double-quoted span as one fragment", () => {
    expect(
      quoteFragments('"the repair log showed eleven entries over nine years" (§I)'),
    ).toEqual(["the repair log showed eleven entries over nine years"]);
  });

  it("splits quoted spans on ellipses and editorial brackets, dropping short pieces", () => {
    const frs = quoteFragments(
      '"seven federal agencies ran the searches … roughly sixty thousand [in one year]"',
    );
    expect(frs).toEqual([
      "seven federal agencies ran the searches",
      "roughly sixty thousand",
    ]);
  });

  it("never splits on footnote markers", () => {
    const frs = quoteFragments('"the figure holds across the board [12] and holds again"');
    expect(frs).toEqual(["the figure holds across the board [12] and holds again"]);
  });

  it("falls back to the whole text minus the locator when no quoted span exists", () => {
    expect(quoteFragments("All ten reference URLs resolve today (§II)")).toEqual([
      "All ten reference URLs resolve today",
    ]);
  });

  it("smart quotes delimit spans too", () => {
    expect(quoteFragments("“the seal has already failed” (§V)")).toEqual([
      "the seal has already failed",
    ]);
  });
});

describe("stripLocator / lineHintOf", () => {
  it.each([
    ['"a" (l.10)', '"a"'],
    ['"a" (§IV; fn 1)', '"a"'],
    ['"a" (Opening ¶1)', '"a"'],
    ['"a" ((nested))', '"a"'],
  ])("strips %s → %s", (input, want) => {
    expect(stripLocator(input)).toBe(want);
  });

  it("leaves a non-locatored quote untouched", () => {
    expect(stripLocator('"verbatim words here"')).toBe('"verbatim words here"');
  });

  it("reads the (l.N) line hint", () => {
    expect(lineHintOf('"x" (l.84)')).toBe(84);
    expect(lineHintOf('"x" (§I)')).toBeUndefined();
  });
});
