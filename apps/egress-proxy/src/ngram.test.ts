import { describe, expect, it } from "vitest";
import { checkSearchQuery, longestConsecutiveWordMatch, words } from "./ngram.js";

const DRAFT =
  "the quick brown fox jumps over the lazy dog while the cat sleeps soundly in the warm afternoon sun";

describe("n-gram suspicious_query (§12.8d)", () => {
  it("tokenizes to lowercase words", () => {
    expect(words("Hello, World! 42")).toEqual(["hello", "world", "42"]);
  });

  it("finds the longest consecutive shared word-run", () => {
    // 12 consecutive draft words.
    expect(longestConsecutiveWordMatch("the quick brown fox jumps over the lazy dog while the cat", DRAFT)).toBe(12);
    // A re-ordered / interrupted query breaks the run.
    expect(longestConsecutiveWordMatch("brown fox jumps ZZZ over the lazy", DRAFT)).toBe(3);
    expect(longestConsecutiveWordMatch("", DRAFT)).toBe(0);
  });

  it("flags a query sharing ≥ 12 consecutive draft words (AC4)", () => {
    const q = "the quick brown fox jumps over the lazy dog while the cat";
    expect(checkSearchQuery(q, DRAFT).suspicious).toBe(true);
    expect(checkSearchQuery(q, DRAFT).matchLength).toBe(12);
  });

  it("does not flag an 11-word match (below threshold)", () => {
    const q = "the quick brown fox jumps over the lazy dog while the";
    const r = checkSearchQuery(q, DRAFT);
    expect(r.matchLength).toBe(11);
    expect(r.suspicious).toBe(false);
  });

  it("never flags when there is no draft to diff against", () => {
    expect(checkSearchQuery("anything at all here", undefined).suspicious).toBe(false);
  });
});
