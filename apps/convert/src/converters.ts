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

/** Extract the text layer of a born-digital PDF (pdf.js). No LLM reconstruction (that is P1.15). */
export async function convertPdf(bytes: Uint8Array): Promise<ConverterOutput> {
  const unreadable = (note: string): ConverterOutput => ({
    markdown: "",
    warnings: [{ kind: "structure_lost", message: "no extractable text layer" }],
    unconverted: [],
    quality: "unreadable",
    qualityNotes: [note],
  });
  let paras: string[];
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: bytes, isEvalSupported: false, useWorkerFetch: false }).promise;
    paras = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((it) => ("str" in it ? (it as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) paras.push(text);
    }
    await doc.destroy();
  } catch (e) {
    // pdf.js has had arbitrary-JS CVEs — convert runs isolated (no net/DB), and a parse failure degrades to
    // "unreadable" (LLM reconstruction of scanned/broken PDFs is P1.15), never crashes the pipeline.
    return unreadable(`PDF parse failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
  }
  const markdown = paras.join("\n\n");
  if (markdown.trim() === "") return unreadable("PDF has no text layer; reconstruction is a later capability");
  return { markdown, warnings: [], unconverted: [], quality: "clean", qualityNotes: [] };
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
