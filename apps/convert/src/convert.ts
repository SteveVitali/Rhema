import { normalizeMarkdown, detectCounts } from "@rhema/markdown";
import { conversionResultSchema } from "@rhema/contracts";
import type { ConversionResult, ConversionWarning, UnconvertedBlock, Anchor } from "@rhema/contracts";
import { sniffFormat, isZipContainer } from "./sniff.js";
import { assertSafeArchive } from "./decompression-guard.js";
import {
  convertDocx,
  convertEpub,
  convertHtml,
  convertPdf,
  convertRtf,
  convertText,
  convertUnsupported,
  type ConverterOutput,
} from "./converters.js";

// The convert entrypoint (§12.1): quarantine bytes → canonical Rhema Markdown + the §5.3 preview payload. No
// network, no DB — pure byte-to-markdown. A ZIP (docx) is checked by the decompression guard first (a zip-bomb
// throws before any inflate). Unconvertible spans become verbatim `<!-- rhema:unconverted -->` blocks with
// anchored warnings; the result is normalized (idempotent) and its count line computed.

export { DecompressionLimitError } from "./decompression-guard.js";

const PLACEHOLDER = /\[\[RHEMA-UNCONV:([a-z0-9-]+)\]\]/g;

export interface ConvertOptions {
  /** The untrusted client-asserted content-type (only breaks the md/txt tie; never overrides the sniff). */
  readonly assertedContentType?: string;
  /** Override the inflated-bytes ceiling for the decompression guard (default 100 MB). */
  readonly maxUncompressedBytes?: number;
}

/** Entity-encode an unconverted island so it cannot close the comment or become live HTML (recoverable). */
function encodeUnconverted(raw: string): string {
  return raw.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function anchorForBlock(blockId: string, raw: string): Anchor {
  const quote = raw.replace(/\s+/g, " ").trim().slice(0, 40);
  return { blockId, quote, startOffset: 0, endOffset: quote.length, confidence: 1 };
}

async function runConverter(format: ReturnType<typeof sniffFormat>, bytes: Uint8Array): Promise<ConverterOutput> {
  switch (format) {
    case "docx":
      return convertDocx(bytes);
    case "pdf":
      return convertPdf(bytes);
    case "epub":
      return convertEpub(bytes);
    case "rtf":
      return convertRtf(bytes);
    case "image":
    case "binary":
      return convertUnsupported(format);
    case "html":
      return convertHtml(new TextDecoder("utf-8").decode(bytes));
    case "txt":
    case "md":
    default:
      return convertText(new TextDecoder("utf-8").decode(bytes));
  }
}

/** Convert raw bytes to a canonical-markdown ConversionResult. Throws DecompressionLimitError on a zip-bomb. */
export async function convertBytes(bytes: Uint8Array, opts: ConvertOptions = {}): Promise<ConversionResult> {
  const format = sniffFormat(bytes, opts.assertedContentType);
  if (isZipContainer(bytes)) assertSafeArchive(bytes, opts.maxUncompressedBytes); // refuse a bomb before parsing

  const out = await runConverter(format, bytes);

  // Replace placeholders with `<!-- rhema:unconverted id=… -->` blocks. The raw island is HTML-ENTITY-ENCODED
  // (`<`/`>`/`&`) so it cannot (a) contain a literal `-->` that would close the comment early / break the
  // round-trip, or (b) become live HTML when the draft body is later rendered (latent stored-XSS — S2). The
  // original is fully recoverable by decoding, so "kept verbatim" (§5.3) still holds.
  const rawById = new Map(out.unconverted.map((u) => [u.blockId, u.raw]));
  const withBlocks = out.markdown.replace(PLACEHOLDER, (_m, id: string) => {
    const raw = encodeUnconverted(rawById.get(id) ?? "");
    return `<!-- rhema:unconverted id="${id}" -->\n${raw}\n<!-- /rhema:unconverted -->`;
  });

  const markdown = normalizeMarkdown(withBlocks);
  const counts = detectCounts(markdown);

  const warnings: ConversionWarning[] = out.warnings.map((w) => ({
    kind: w.kind,
    message: w.message,
    anchor: w.blockId ? anchorForBlock(w.blockId, rawById.get(w.blockId) ?? "") : null,
  }));
  const unconverted: UnconvertedBlock[] = out.unconverted.map((u) => ({
    blockId: u.blockId,
    raw: u.raw,
    reason: u.reason,
  }));

  return conversionResultSchema.parse({
    sourceFormat: format,
    markdown,
    counts,
    warnings,
    unconverted,
    quality: out.quality,
    qualityNotes: [...out.qualityNotes],
  });
}
