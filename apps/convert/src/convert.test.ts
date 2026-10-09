import { describe, it, expect } from "vitest";
import { convertBytes, DecompressionLimitError } from "./convert.js";
import { normalizeMarkdown } from "@rhema/markdown";
import { make8kWordDocx, makeZipBombDocx, makePdf, makePdfPages, htmlWithUnconvertible, makeDocx } from "../test/fixtures.js";

// AC2 (zip-bomb refused), AC4 (8k-word docx preview <20s + counts), AC5 (unconverted blocks + warnings),
// AC6 (import → normalized markdown byte-stable on the 2nd pass).

describe("AC2 — decompression bomb refused", () => {
  it("refuses a zip-bomb .docx by the real inflated-size bound (not declared sizes)", async () => {
    // The 6 MB-inflating docx is refused against a 1 MB inflation budget — the guard actually inflates with a
    // hard maxOutputLength, so it cannot be fooled by an under-declared central-directory size.
    const bomb = await makeZipBombDocx();
    await expect(convertBytes(bomb, { maxUncompressedBytes: 1024 * 1024 })).rejects.toBeInstanceOf(
      DecompressionLimitError,
    );
    // a normal small docx passes the default (100 MB) budget
    const ok = await makeDocx({ headingText: "T", paragraphs: ["small doc"] });
    await expect(convertBytes(ok)).resolves.toBeTruthy();
  });
});

describe("AC4 — 8k-word .docx preview", () => {
  it("converts within 20 s with a word count and citation spans", async () => {
    const docx = await make8kWordDocx();
    const start = Date.now();
    const result = await convertBytes(docx);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(20_000);
    expect(result.sourceFormat).toBe("docx");
    expect(result.counts.words).toBeGreaterThan(7000);
    expect(result.counts.words).toBeLessThan(9000);
    expect(result.counts.citationSpans).toBeGreaterThan(0);
    // the body is canonical (no body H1) + normalize-stable
    expect(result.markdown).not.toMatch(/^# /m);
    expect(normalizeMarkdown(result.markdown)).toBe(result.markdown);
  });
});

describe("AC5 — unconvertible spans + anchored warnings", () => {
  it("keeps an unconvertible span verbatim in a <!-- rhema:unconverted --> block with an anchored warning", async () => {
    const result = await convertBytes(new TextEncoder().encode(htmlWithUnconvertible()));
    expect(result.sourceFormat).toBe("html");
    expect(result.markdown).toContain("<!-- rhema:unconverted");
    expect(result.markdown).toContain("iframe");
    expect(result.unconverted.length).toBeGreaterThan(0);
    const w = result.warnings.find((x) => x.kind === "unconverted_span");
    expect(w).toBeDefined();
    expect(w!.anchor).not.toBeNull();
    expect(w!.anchor!.blockId).toBe(result.unconverted[0]!.blockId);
    expect(result.quality).toBe("partial");
    // still normalize-stable
    expect(normalizeMarkdown(result.markdown)).toBe(result.markdown);
  });
});

describe("AC6 — import round-trip byte-stability", () => {
  it("is byte-stable on the 2nd normalize pass for docx/html/txt/md/pdf fixtures", async () => {
    const fixtures: Uint8Array[] = [
      await makeDocx({ headingText: "Doc", paragraphs: ["First paragraph with a [12] citation.", "Second."] }),
      new TextEncoder().encode(htmlWithUnconvertible()),
      new TextEncoder().encode("# Title\n\nplain markdown with a note[^1].\n\n[^1]: n"),
      new TextEncoder().encode("Just some plain text.\nAnother line."),
      makePdf("Hello World from a born-digital PDF."),
    ];
    for (const bytes of fixtures) {
      const r = await convertBytes(bytes);
      expect(normalizeMarkdown(r.markdown)).toBe(r.markdown); // 2nd pass == 1st
    }
  });

  it("extracts the text layer of a born-digital PDF", async () => {
    const r = await convertBytes(makePdf("Hello World from a born-digital PDF."));
    expect(r.sourceFormat).toBe("pdf");
    // pdf.js text extraction (born-digital) — clean quality with the words present.
    expect(r.markdown).toContain("Hello World");
    expect(r.quality).toBe("clean");
  });
});

// P1.15 — the §9.5 PDF quality-verdict matrix (REQ-INGEST-7/9): fixtures produce clean / partial /
// unreadable / empty. `reconstructed` is never a convert verdict — it is the post-model verdict the
// priced worker pass lands (asserted in packages/ingest), and convert stays no-network.
describe("P1.15 — the §9.5 PDF quality verdicts (REQ-INGEST-7/9)", () => {
  it("partial: a mixed PDF (text page + scanned page) names the scanned page with the visual-tier note", async () => {
    const r = await convertBytes(makePdfPages(["A real text layer with enough words to count.", ""]));
    expect(r.sourceFormat).toBe("pdf");
    expect(r.quality).toBe("partial");
    expect(r.markdown).toContain("A real text layer");
    expect(r.qualityNotes.join(" ")).toContain("pages 2");
    expect(r.qualityNotes.join(" ")).toContain("visual tier");
    expect(r.warnings.some((w) => w.kind === "structure_lost")).toBe(true);
  });

  it("unreadable: an all-scanned PDF has no text layer and points at the visual tier", async () => {
    const r = await convertBytes(makePdfPages(["", ""]));
    expect(r.quality).toBe("unreadable");
    expect(r.markdown.trim()).toBe("");
    expect(r.qualityNotes.join(" ")).toContain("scanned images");
  });

  it("unreadable: unparseable bytes degrade, never crash", async () => {
    const r = await convertBytes(new TextEncoder().encode("%PDF-1.4\n<broken garbage that is not a pdf>"));
    expect(r.quality).toBe("unreadable");
    expect(r.qualityNotes[0]).toContain("PDF parse failed");
  });

  it("empty: a zero-page PDF", async () => {
    const r = await convertBytes(makePdfPages([]));
    expect(r.quality).toBe("empty");
    expect(r.qualityNotes.join(" ")).toContain("no pages");
  });

  it("reconstructed is never a convert verdict — the priced worker pass owns it (F41)", async () => {
    for (const bytes of [
      makePdf("clean text"),
      makePdfPages(["text page one", ""]),
      makePdfPages([""]),
      makePdfPages([]),
    ]) {
      const r = await convertBytes(bytes);
      expect(r.quality).not.toBe("reconstructed");
    }
  });
});

// ONB.1 — REQ-GROWTH-1 amended / REQ-INGEST-7: the leading H1 is the document's title (never a
// demoted body-H2 duplicate), and a figure path nothing can resolve becomes an `image_dropped`
// warning + an inert empty-url placeholder — never a live URL the Page would 404 on.
describe("ONB.1 — faithful imports: the leading H1 and unresolved figures", () => {
  it("an .md with a leading H1 yields `title` and a body with NO heading duplicating it", async () => {
    const r = await convertBytes(
      new TextEncoder().encode("# The Quiet Manuscript\n\nOpening line.\n\n## Section one\n\nBody."),
    );
    expect(r.title).toBe("The Quiet Manuscript");
    expect(r.markdown).not.toContain("The Quiet Manuscript");
    expect(r.markdown).not.toMatch(/^# /m); // no body H1 …
    expect(r.markdown).not.toMatch(/^## The Quiet Manuscript/m); // …and no demoted dup
    expect(r.markdown).toContain("## Section one");
    expect(normalizeMarkdown(r.markdown)).toBe(r.markdown);
  });

  it("an .md whose H1 sits after prose yields NO title (it stays a section heading → H2)", async () => {
    const r = await convertBytes(
      new TextEncoder().encode("Intro paragraph first.\n\n# Later Heading\n\nBody."),
    );
    expect(r.title).toBeUndefined();
    expect(r.markdown).toContain("## Later Heading"); // demoted, still a heading — not dropped
    expect(r.markdown).not.toMatch(/^# /m);
  });

  it("a docx whose first paragraph is a Heading-1 style yields `title` the same way", async () => {
    const docx = await makeDocx({ headingText: "Doc Title", paragraphs: ["body para"] });
    const r = await convertBytes(docx);
    expect(r.title).toBe("Doc Title");
    expect(r.markdown).not.toContain("# Doc Title");
    expect(r.markdown).not.toMatch(/^## Doc Title/m);
  });

  it("a relative figure path becomes a warning + an inert empty-url image (never a live src)", async () => {
    const r = await convertBytes(
      new TextEncoder().encode("Text.\n\n![the five questions](figure_1_five_questions.png)\n\nMore."),
    );
    const w = r.warnings.find((x) => x.kind === "image_dropped");
    expect(w).toBeDefined();
    expect(w!.message).toBe("figure_1_five_questions.png wasn't included — add it or remove the reference");
    // the inert placeholder: an image with an EMPTY url (the figure node's placeholder form) —
    // the relative path appears only inside the alt, never as a target.
    expect(r.markdown).toMatch(/!\[the five questions]\(\s*\)/);
    expect(r.markdown).not.toContain("](figure_1_five_questions.png)");
    expect(r.quality).toBe("partial"); // REQ-INGEST-7's verdict for a dropped figure
    expect(r.qualityNotes.join(" ")).toContain("figure_1_five_questions.png");
    expect(normalizeMarkdown(r.markdown)).toBe(r.markdown); // still byte-stable
  });

  it("https/data image targets pass through untouched and un-warned", async () => {
    const r = await convertBytes(
      new TextEncoder().encode("![a](https://example.com/x.png)\n\n![b](data:image/png;base64,AAAA)\n"),
    );
    expect(r.warnings.filter((w) => w.kind === "image_dropped")).toEqual([]);
    expect(r.markdown).toContain("https://example.com/x.png");
    expect(r.quality).toBe("clean");
  });
});
