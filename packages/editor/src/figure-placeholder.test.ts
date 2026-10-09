// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { DOMSerializer } from "prosemirror-model";
import { markdownToDoc } from "./md-to-pm.js";
import { pageSchema } from "./schema.js";

// ONB.1 (REQ-INGEST-7; REQ-GROWTH-1 amended) — the Page-side half of the unresolved-figure fix: a
// converted import rewrites `![](figure_1_five_questions.png)` to the inert `![name]()` form
// (packages/markdown's import-doc), and the rendered Page must make ZERO requests for the original
// path. These tests serialize the doc with the REAL schema the Page renders: an empty-src figure
// becomes `.rm-figure-placeholder`, an empty-src inline image too — never an `<img>`.

function render(doc: ReturnType<typeof markdownToDoc>): HTMLElement {
  const frag = DOMSerializer.fromSchema(pageSchema).serializeFragment(doc.content, { document });
  const el = document.createElement("div");
  el.appendChild(frag);
  return el;
}

describe("ONB.1 — unresolved figures render inert (zero live requests)", () => {
  it("a lone `![name]()` paragraph parses to an empty-src figure and renders the placeholder, not an <img>", () => {
    const doc = markdownToDoc("Opening.\n\n![figure_1_five_questions.png]()\n\nMore.");
    const html = render(doc);
    expect(html.querySelectorAll("img").length).toBe(0);
    const ph = html.querySelector(".rm-figure-placeholder");
    expect(ph).not.toBeNull();
    expect(ph!.textContent).toContain("figure_1_five_questions.png");
    // belt + suspenders: no attribute anywhere carries a live target
    expect(html.innerHTML).not.toContain("src=");
  });

  it("an inline `![alt]()` inside a paragraph renders the placeholder span, not <img src=\"\">", () => {
    const doc = markdownToDoc("See ![the five questions]() for details.");
    const html = render(doc);
    expect(html.querySelectorAll("img").length).toBe(0);
    expect(html.querySelector(".rm-figure-placeholder")?.textContent).toBe("the five questions");
  });

  it("a real https image still renders <img src> (the placeholder path only covers the inert form)", () => {
    const doc = markdownToDoc("![ok](https://example.com/x.png)");
    const html = render(doc);
    expect(html.querySelector('img[src="https://example.com/x.png"]')).not.toBeNull();
  });

  it("a converted import's figure paragraph carries NO attribute equal to the original relative path", () => {
    // the converter's output shape: `![the five questions]()` — parse the doc and walk every node:
    // no node may carry the original `figure_1_five_questions.png` as a src/href attribute.
    const doc = markdownToDoc("Text.\n\n![the five questions]()\n\nMore.");
    doc.descendants((n) => {
      expect(n.attrs.src ?? "").not.toContain("figure_1_five_questions");
      expect(n.attrs.href ?? "").not.toContain("figure_1_five_questions");
      return true;
    });
  });
});
