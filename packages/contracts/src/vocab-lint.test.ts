import { describe, it, expect } from "vitest";
import { lintCopy } from "./vocab-lint.js";

describe("lintCopy (Appendix D.2 i18n lint)", () => {
  it("flags a strictly-banned word", () => {
    const v = lintCopy({ greeting: "Answer the gate to continue" });
    expect(v.map((x) => x.term)).toContain("gate");
  });

  it("matches whole words only — canonical nouns pass", () => {
    // "Project" contains "Pro"; "navigate"/"aggregate" contain "gate"; "authority" contains "author".
    const v = lintCopy({
      a: "Open your Project",
      b: "Navigate to the aggregate view",
      c: "the reviewing authority",
    });
    expect(v).toEqual([]);
  });

  it("is case-insensitive and catches banned phrases", () => {
    const v = lintCopy({ x: "This was made with claude code" });
    expect(v.map((x) => x.term)).toContain("Claude Code");
  });

  it("flags excepted terms by default (strict), and permits them via allow", () => {
    const strict = lintCopy({ x: "shown under Advanced" });
    expect(strict.map((t) => t.term)).toContain("Advanced");
    const permitted = lintCopy({ x: "shown under Advanced" }, { allow: ["Advanced"] });
    expect(permitted).toEqual([]);
    const excl = lintCopy({ x: "shown under Advanced" }, { includeExcepted: false });
    expect(excl).toEqual([]);
  });

  it("accepts an array of [key, value] pairs and a Map", () => {
    expect(lintCopy([["k", "unlimited runs"]]).map((t) => t.term)).toContain("unlimited");
    expect(lintCopy(new Map([["k", "no overage ever"]])).map((t) => t.term)).toContain("overage");
  });

  it("passes clean canonical copy", () => {
    expect(
      lintCopy({
        pill: "Reviewed",
        action: "Read the Editor's letter",
        credits: "1,240 credits",
        plan: "Writer plan",
      }),
    ).toEqual([]);
  });
});
