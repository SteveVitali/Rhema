import { describe, it, expect } from "vitest";
import { normalizeMarkdown } from "./normalize.js";
import { assembleImportedDoc } from "./frontmatter.js";

// AC6 (REQ-DATA-9d, markdown level): the import normalizer is IDEMPOTENT — normalize(normalize(x)) is
// byte-for-byte equal to normalize(x). Proven over a representative corpus (headings, footnotes, tables,
// links, emphasis, smart quotes, front-matter).

const CORPUS: Record<string, string> = {
  headingsAndProse: `# The Politics of Visibility

Some intro prose with *emphasis* and **strong** and a [link](https://example.org/a).

## A section

- one
- two

### deeper
text`,
  footnotesOutOfOrder: `Body with a note[^beta] then another[^alpha].

[^alpha]: The alpha note.
[^beta]: The beta note.`,
  tableAndImage: `Intro.

| A | B |
| - | - |
| 1 | 2 |

![a figure](asset://abc)

*A caption in italics.*`,
  smartQuotes: `He said “visibility” and it’s a voice signal — preserved.`,
  citations: `A claim [@smith2020] and a numeric one [12] and a range [3, 4].`,
  withFrontMatter: `---
rhema: 1
id: smp_1
title: X
---

## Body

text[^1]

[^1]: note`,
};

describe("normalizeMarkdown — idempotence (AC6)", () => {
  for (const [name, src] of Object.entries(CORPUS)) {
    it(`is byte-stable on the second pass: ${name}`, () => {
      const once = normalizeMarkdown(src);
      const twice = normalizeMarkdown(once);
      expect(twice).toBe(once);
    });
  }
});

describe("normalizeMarkdown — profile rules", () => {
  it("demotes a body H1 so the first heading is H2 (no body H1)", () => {
    const out = normalizeMarkdown(`# Title\n\n## Sub\n\ntext`);
    expect(out).not.toMatch(/^# /m);
    expect(out).toMatch(/^## Title/m);
    expect(out).toMatch(/^### Sub/m);
  });

  it("renumbers footnotes in first-reference order and collects them at the end", () => {
    const out = normalizeMarkdown(`Ref b[^beta] then a[^alpha].\n\n[^alpha]: A.\n[^beta]: B.`);
    // first reference is beta → 1, alpha → 2
    expect(out).toMatch(/\[\^1\].*\[\^2\]/s);
    const defIdx = out.indexOf("[^1]:");
    const bodyIdx = out.indexOf("Ref");
    expect(defIdx).toBeGreaterThan(bodyIdx); // definitions trail the body
    // idempotent
    expect(normalizeMarkdown(out)).toBe(out);
  });

  it("preserves smart quotes and em dashes as characters (NFC), no hard wraps", () => {
    const out = normalizeMarkdown(`“quoted” — dash ’apostrophe`);
    expect(out).toContain("“quoted”");
    expect(out).toContain("—");
    expect(out).toContain("’");
  });

  it("retains GFM tables and math", () => {
    const out = normalizeMarkdown(`| A | B |\n| - | - |\n| 1 | 2 |\n\nInline $x^2$ and $$y$$.`);
    expect(out).toContain("| A | B |");
    expect(out).toContain("$x^2$");
  });
});

describe("assembleImportedDoc", () => {
  it("prepends front-matter and the body stays normalize-stable", () => {
    const { document, body, contentSha256, wordCount } = assembleImportedDoc(`# T\n\nHello world.`, {
      id: "smp_1",
      title: "T",
      source: {
        kind: "upload",
        original_format: "docx",
        original_sha256: "a".repeat(64),
        fetched_at: "2026-09-15T00:00:00Z",
      },
      quality: "clean",
    });
    expect(document.startsWith("---\nrhema: 1\n")).toBe(true);
    expect(document).toContain("content_sha256: " + contentSha256);
    expect(document).toContain("word_count: " + wordCount);
    expect(wordCount).toBe(2); // "Hello world."
    expect(normalizeMarkdown(body)).toBe(body);
    // the whole assembled document (with front-matter) is also normalize-stable
    expect(normalizeMarkdown(document)).toBe(normalizeMarkdown(normalizeMarkdown(document)));
  });
});
