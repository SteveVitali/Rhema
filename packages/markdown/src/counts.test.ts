import { describe, it, expect } from "vitest";
import { wordCount, detectCounts, renderCountLine } from "./counts.js";

describe("wordCount", () => {
  it("counts whitespace-separated words; empty is 0", () => {
    expect(wordCount("hello world")).toBe(2);
    expect(wordCount("  ")).toBe(0);
    expect(wordCount("a\nb\tc")).toBe(3);
  });
});

describe("detectCounts (§5.3 count line)", () => {
  it("counts words, footnotes, citation-like spans, tables, figures", () => {
    const md = `## Heading

Prose with a note[^1] and a citation [@smith2020], a numeric [12], and a [link](https://example.org).

[^1]: The note.

| A | B |
| - | - |
| 1 | 2 |

![fig](asset://abc)`;
    const c = detectCounts(md);
    expect(c.footnotes).toBe(1);
    expect(c.tables).toBe(1);
    expect(c.figures).toBe(1);
    // [@smith2020] + [12] + the external link = 3 citation-like spans (footnote ref excluded)
    expect(c.citationSpans).toBe(3);
    expect(c.words).toBeGreaterThan(5);
  });

  it("does not count citation-shaped tokens inside code", () => {
    const c = detectCounts("Text.\n\n```\n[12] [@x]\n```\n");
    expect(c.citationSpans).toBe(0);
  });

  it("renders the count line with pluralization + thousands separators", () => {
    expect(
      renderCountLine({ words: 7900, footnotes: 41, citationSpans: 23, tables: 2, figures: 1 }),
    ).toBe("7,900 words · 41 footnotes · 23 citation-like spans · 2 tables · 1 figure");
    expect(renderCountLine({ words: 1, footnotes: 0, citationSpans: 1, tables: 1, figures: 0 })).toBe(
      "1 word · 0 footnotes · 1 citation-like span · 1 table · 0 figures",
    );
  });
});
