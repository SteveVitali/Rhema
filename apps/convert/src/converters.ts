import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import mammoth from "mammoth";
import type { ConversionWarningKind, QualityVerdict } from "@rhema/contracts";

// The format converters (F41 split: convert PARSES, never fetches). Each returns intermediate markdown plus
// the structured warnings and the verbatim spans that could not be converted. The canonical normalization +
// count line are applied downstream in convert.ts; these just do the format-specific extraction.

export interface RawWarning {
  readonly kind: ConversionWarningKind;
  readonly message: string;
  /** The blockId of the related unconverted block, if any (for anchoring). */
  readonly blockId?: string;
}
export interface RawUnconverted {
  readonly blockId: string;
  readonly raw: string;
  readonly reason: string;
}
export interface ConverterOutput {
  readonly markdown: string;
  readonly warnings: readonly RawWarning[];
  readonly unconverted: readonly RawUnconverted[];
  readonly quality: QualityVerdict;
  readonly qualityNotes: readonly string[];
}

/** Tags the beta pipeline cannot faithfully convert — kept verbatim in an unconverted block. */
const UNCONVERTIBLE_TAGS = ["iframe", "object", "embed", "script", "svg", "video", "audio", "canvas"];

function newTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
    emDelimiter: "_",
    strongDelimiter: "**",
  });
  td.use(gfm);
  return td;
}

/** Convert an HTML string, capturing unconvertible islands as verbatim blocks + anchored warnings. */
export function convertHtml(html: string): ConverterOutput {
  const unconverted: RawUnconverted[] = [];
  const warnings: RawWarning[] = [];
  const td = newTurndown();

  td.addRule("rhema-unconvertible", {
    filter: (node: TurndownService.Node) => UNCONVERTIBLE_TAGS.includes(node.nodeName.toLowerCase()),
    replacement: (_content: string, node: TurndownService.Node) => {
      const tag = node.nodeName.toLowerCase();
      const raw = (node as unknown as { outerHTML?: string }).outerHTML ?? `<${tag}></${tag}>`;
      const blockId = `unconv-${unconverted.length + 1}`;
      unconverted.push({ blockId, raw, reason: `<${tag}> is not convertible` });
      warnings.push({ kind: "unconverted_span", message: `1 ${tag} block could not be converted — kept verbatim`, blockId });
      return `\n\n[[RHEMA-UNCONV:${blockId}]]\n\n`;
    },
  });

  // Tables with merged cells cannot become GFM pipe tables — flag "flattened to text".
  td.addRule("rhema-merged-table", {
    filter: (node: TurndownService.Node) =>
      node.nodeName.toLowerCase() === "table" &&
      /rowspan|colspan/i.test((node as unknown as { innerHTML?: string }).innerHTML ?? ""),
    replacement: (content: string) => {
      warnings.push({ kind: "table_flattened", message: "1 table with merged cells flattened to text" });
      return "\n\n" + content.replace(/\s*\|\s*/g, " ").trim() + "\n\n";
    },
  });

  const markdown = td.turndown(html);
  const quality: QualityVerdict = markdown.trim() === "" ? "empty" : warnings.length > 0 ? "partial" : "clean";
  return { markdown, warnings, unconverted, quality, qualityNotes: [] };
}

/** Convert a `.docx` (ZIP of XML) via mammoth → HTML → markdown. */
export async function convertDocx(bytes: Uint8Array): Promise<ConverterOutput> {
  const result = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) });
  const html = convertHtml(result.value);
  const mammothWarnings: RawWarning[] = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => ({ kind: "structure_lost" as ConversionWarningKind, message: m.message }));
  const notes = mammothWarnings.length > 0 ? [`${mammothWarnings.length} docx element(s) simplified`] : [];
  return {
    markdown: html.markdown,
    warnings: [...html.warnings, ...mammothWarnings],
    unconverted: html.unconverted,
    quality: html.quality === "clean" && mammothWarnings.length > 0 ? "partial" : html.quality,
    qualityNotes: notes,
  };
}

/**
 * Extract the text layer of a PDF (pdf.js) with the §9.5 quality verdicts. Per-page text density is
 * the heuristic: a page with near-zero extractable text is a scanned image (OCR is the opt-in
 * visual tier); garble markers (replacement chars, cid escapes) flag extraction degradation.
 * Verdicts: `clean` (full text layer), `partial` (some pages scanned / degraded — the warning
 * drawer offers reconstruction), `unreadable` (no text layer — reconstruction needs the visual
 * tier or OCR), `empty` (a zero-page document). The PRICED reconstruction itself never runs here —
 * convert parses; a metered worker job reconstructs (F41).
 */
export async function convertPdf(bytes: Uint8Array): Promise<ConverterOutput> {
  const unreadable = (note: string): ConverterOutput => ({
    markdown: "",
    warnings: [{ kind: "structure_lost", message: "no extractable text layer" }],
    unconverted: [],
    quality: "unreadable",
    qualityNotes: [note],
  });
  let pages: { page: number; text: string }[];
  let numPages = 0;
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // No standardFontDataUrl: pdf.js warns about base-14 font metrics but text extraction still
    // succeeds (the glyph map is built-in), and passing the URL breaks the fake-worker transport
    // under some runtimes (DataCloneError on the factory object). Cosmetic warning only.
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false }).promise;
    numPages = doc.numPages;
    pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      pages.push({ page: i, text });
    }
    await doc.destroy();
  } catch (e) {
    // pdf.js has had arbitrary-JS CVEs — convert runs isolated (no net/DB), and a parse failure degrades to
    // "unreadable" (reconstruction is a priced worker pass, never inside convert), never crashes the pipeline.
    return unreadable(`PDF parse failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  if (numPages === 0) {
    return { markdown: "", warnings: [], unconverted: [], quality: "empty", qualityNotes: ["PDF has no pages"] };
  }
  // A scanned/image page has NEAR-ZERO extractable text (<8 non-space chars — a real text page,
  // even a sparse one like a title page, carries more); the 40-char density cut would misflag
  // legitimately short pages as scans.
  const scanned = pages.filter((p) => p.text.replace(/\s/g, "").length < 8).map((p) => p.page);
  const body = pages
    .filter((p) => p.text.replace(/\s/g, "").length >= 8)
    .map((p) => p.text)
    .join("\n\n");
  const garbled = /\ufffd|\(cid:\d+\)/.test(body);
  if (scanned.length === numPages) {
    return unreadable(
      `no text layer on ${numPages} page(s) — the document appears to be scanned images; the opt-in visual tier can rebuild it`,
    );
  }
  const notes: string[] = [];
  const warnings: RawWarning[] = [];
  if (scanned.length > 0) {
    notes.push(`pages ${scanned.join(", ")} appear to be scanned images — the visual tier can rebuild them`);
    warnings.push({ kind: "structure_lost", message: `${scanned.length} page(s) had no text layer` });
  }
  if (garbled) {
    notes.push("the text layer has garbled spans — reconstruction can fix them");
    warnings.push({ kind: "encoding", message: "garbled spans detected in the text layer" });
  }
  if (body.trim() === "") return unreadable("PDF produced no usable text");
  return {
    markdown: body,
    warnings,
    unconverted: [],
    quality: notes.length > 0 ? "partial" : "clean",
    qualityNotes: notes,
  };
}

/** `.epub`: a ZIP of XHTML spine documents — concatenate the spine in order, run the HTML converter. */
export async function convertEpub(bytes: Uint8Array): Promise<ConverterOutput> {
  const { default: JSZip } = await import("jszip");
  let zip: InstanceType<typeof JSZip>;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (e) {
    return {
      markdown: "",
      warnings: [{ kind: "structure_lost", message: "epub archive unreadable" }],
      unconverted: [],
      quality: "unreadable",
      qualityNotes: [`epub parse failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`],
    };
  }
  // The OPF package file lists the spine; fall back to all XHTML/HTML files in name order.
  const opf = zip.file(/\.opf$/i)[0];
  let spineNames: string[] = [];
  if (opf) {
    const opfXml = await opf.async("string");
    const opfDir = opf.name.replace(/[^/]*$/, "");
    const idrefs = [...opfXml.matchAll(/<itemref[^>]*idref="([^"]+)"/g)].map((m) => m[1]!);
    const items = new Map(
      [...opfXml.matchAll(/<item[^>]*id="([^"]+)"[^>]*href="([^"]+)"/g)].map((m) => [m[1]!, m[2]!]),
    );
    spineNames = idrefs
      .map((id) => items.get(id))
      .filter((h): h is string => h != null)
      .map((h) => opfDir + h);
  }
  if (spineNames.length === 0) {
    spineNames = zip
      .file(/\.(xhtml|html|htm)$/i)
      .map((f: { name: string }) => f.name)
      .sort();
  }
  const parts: string[] = [];
  for (const name of spineNames) {
    const f = zip.file(name);
    if (f) parts.push(await f.async("string"));
  }
  if (parts.length === 0) {
    return {
      markdown: "",
      warnings: [{ kind: "structure_lost", message: "epub had no readable spine documents" }],
      unconverted: [],
      quality: "unreadable",
      qualityNotes: ["epub spine empty or unreadable"],
    };
  }
  const html = convertHtml(parts.join("\n<hr/>\n"));
  return {
    ...html,
    qualityNotes: [...html.qualityNotes, `epub: ${spineNames.length} spine document(s) joined`],
  };
}

/** `.rtf`: strip control words/groups to text — a deterministic subset parser (no full RTF engine). */
export function convertRtf(bytes: Uint8Array): ConverterOutput {
  const raw = new TextDecoder("latin1").decode(bytes);
  // Remove font/colour/stylesheet groups wholesale, then control words; unescape \'xx and braces.
  const stripped = raw
    .replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?\}/g, "")
    .replace(/\\'[0-9a-fA-F]{2}/g, (m) => String.fromCharCode(parseInt(m.slice(2), 16)))
    .replace(/\\par[d]?|\\line/g, "\n\n")
    .replace(/\\tab/g, "\t")
    .replace(/\\[a-zA-Z]+-?\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!stripped) {
    return {
      markdown: "",
      warnings: [{ kind: "structure_lost", message: "rtf produced no text" }],
      unconverted: [],
      quality: "unreadable",
      qualityNotes: ["rtf text extraction produced nothing"],
    };
  }
  return {
    markdown: stripped,
    warnings: [{ kind: "structure_lost", message: "rtf formatting stripped to plain text" }],
    unconverted: [],
    quality: "partial",
    qualityNotes: ["rtf converted as plain text — formatting is not preserved"],
  };
}

/** Image + unknown-binary formats: honestly unreadable at the text tier — the item stays listed,
 *  auto-omitted, and the note names the opt-in path (the visual tier for scans/images). */
export function convertUnsupported(format: "image" | "binary"): ConverterOutput {
  const note =
    format === "image"
      ? "image file — the opt-in visual tier can transcribe it; otherwise paste the text"
      : "format sniffed but no text converter — re-export as .docx/.pdf/.md, or use the visual tier";
  return {
    markdown: "",
    warnings: [{ kind: "unconverted_span", message: note }],
    unconverted: [],
    quality: "unreadable",
    qualityNotes: [note],
  };
}

/** Pass-through for markdown/plaintext (the normalizer canonicalizes downstream). */
export function convertText(text: string): ConverterOutput {
  return {
    markdown: text,
    warnings: [],
    unconverted: [],
    quality: text.trim() === "" ? "empty" : "clean",
    qualityNotes: [],
  };
}
