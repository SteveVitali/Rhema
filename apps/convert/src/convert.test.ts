import { describe, it, expect } from "vitest";
import { convertBytes, DecompressionLimitError } from "./convert.js";
import { normalizeMarkdown } from "@rhema/markdown";
import { make8kWordDocx, makeZipBombDocx, makePdf, htmlWithUnconvertible, makeDocx } from "../test/fixtures.js";

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
