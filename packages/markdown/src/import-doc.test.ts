import { describe, it, expect } from "vitest";
import { extractLeadingTitle, inertUnresolvedImages, uniqueUnresolved } from "./import-doc.js";
import { normalizeMarkdown } from "./normalize.js";

// ONB.1 — the import-time document fixups (REQ-GROWTH-1 amended / REQ-INGEST-7): the leading H1
// comes out as the document title (never a body-H2 duplicate), and an image target nothing can
// resolve becomes an inert placeholder — never a live URL the Page would 404 on.

describe("extractLeadingTitle", () => {
  it("a document-leading H1 becomes the title and leaves the body", () => {
    const out = extractLeadingTitle("# My Thesis\n\nOpening paragraph.\n\n## Section one\n");
    expect(out.title).toBe("My Thesis");
    expect(out.markdown).not.toMatch(/^#\s/m);
    expect(out.markdown).toContain("Opening paragraph.");
    expect(out.markdown).toContain("## Section one");
  });

  it("a second H1 in the body stays a heading (the demote pass owns it — only the leading one is the title)", () => {
    const out = extractLeadingTitle("# Title\n\nText.\n\n# Another top heading\n");
    expect(out.title).toBe("Title");
    expect(out.markdown).toContain("# Another top heading");
    // ...and the canonical normalize demotes it to H2 — never an H1 and never a title dup.
    expect(normalizeMarkdown(out.markdown)).toContain("## Another top heading");
  });

  it("an H1 after prose is a section heading, not the title", () => {
    const out = extractLeadingTitle("Some intro paragraph.\n\n# Later heading\n");
    expect(out.title).toBeUndefined();
    expect(out.markdown).toContain("# Later heading");
  });

  it("an H2-leading document yields no title", () => {
    const out = extractLeadingTitle("## Not the title\n\nBody.\n");
    expect(out.title).toBeUndefined();
  });

  it("front matter is preserved and skipped over", () => {
    const out = extractLeadingTitle("---\ntitle: old\n---\n\n# Real Title\n\nBody.\n");
    expect(out.title).toBe("Real Title");
    expect(out.markdown).toContain("title: old");
  });

  it("a heading that is only markup still yields trimmed plain text", () => {
    const out = extractLeadingTitle("# The *Italic* `Code` Title\n\nBody.\n");
    expect(out.title).toBe("The Italic Code Title");
  });
});

describe("inertUnresolvedImages", () => {
  it("a relative figure target is inerted — empty url, basename alt — and reported", () => {
    const out = inertUnresolvedImages("Text.\n\n![the five questions](figure_1_five_questions.png)\n");
    expect(out.unresolved).toEqual([{ path: "figure_1_five_questions.png", name: "figure_1_five_questions.png" }]);
    expect(out.markdown).not.toContain("figure_1_five_questions.png)");
    expect(out.markdown).toMatch(/!\[the five questions]\(\s*\)/);
  });

  it("an empty-alt image gets the basename folded into the alt", () => {
    const out = inertUnresolvedImages("![](figures/chart.png)\n");
    expect(out.markdown).toMatch(/!\[chart\.png]\(\s*\)/);
  });

  it("https/data targets are left alone and unreported", () => {
    const md = "![a](https://example.com/x.png)\n\n![b](data:image/png;base64,AAAA)\n";
    const out = inertUnresolvedImages(md);
    expect(out.unresolved).toEqual([]);
    expect(out.markdown).toContain("https://example.com/x.png");
    expect(out.markdown).toContain("data:image/png;base64,AAAA");
  });

  it("a reference-style image is inerted through its definition; a link-only definition is kept", () => {
    const md = "![chart][fig1]\n\n[see][lnk]\n\n[fig1]: images/fig1.png\n[lnk]: refs/doc.pdf\n";
    const out = inertUnresolvedImages(md);
    expect(out.unresolved.map((u) => u.path)).toEqual(["images/fig1.png"]);
    expect(out.markdown).toContain("[lnk]: refs/doc.pdf");
    expect(out.markdown).not.toMatch(/\[fig1]:\s*images/);
  });

  it("an already-inert empty-url image is not re-reported (idempotent)", () => {
    const first = inertUnresolvedImages("![](a.png)\n");
    const second = inertUnresolvedImages(first.markdown);
    expect(second.unresolved).toEqual([]);
    expect(second.markdown).toBe(first.markdown);
  });

  it("a bare site-relative path is also unresolved (only https?/data: resolve)", () => {
    const out = inertUnresolvedImages("![x](/static/x.png)\n");
    expect(out.unresolved).toEqual([{ path: "/static/x.png", name: "x.png" }]);
  });
});

describe("uniqueUnresolved", () => {
  it("collapses repeat paths, order-preserving", () => {
    const out = uniqueUnresolved([
      { path: "a.png", name: "a.png" },
      { path: "b.png", name: "b.png" },
      { path: "a.png", name: "a.png" },
    ]);
    expect(out.map((u) => u.path)).toEqual(["a.png", "b.png"]);
  });
});
