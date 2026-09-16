import { EXPORT_FORMAT_INFO, isExportFormat, type ExportFormat } from "@rhema/contracts";
import type { PandocExec } from "./pandoc.js";

// The beta export core (PRB.11; §13.4). md / txt / docx from canonical markdown — the only formats
// at beta; pdf (Typst) / LaTeX / html / rtf / odt / epub / Google Docs / CSL land at P1.18.
// `md` is the canonical bytes verbatim (export is the only way out — Q-9 — and the canonical form
// must leave untouched); `txt`/`docx` go through pandoc inside this container. Footnotes (`[^n]`)
// become REAL docx footnotes via pandoc's native writer — never flattened text.
//
// The format registry + filename contract come from @rhema/contracts (P0.02 owns every shared name)
// so this container, the api's validation, and the web dialog read ONE table.

export class ExportError extends Error {
  constructor(
    readonly reason: "unsupported_format" | "empty_input" | "conversion_failed",
    message: string,
  ) {
    super(message);
    this.name = "ExportError";
  }
}

export interface ExportResult {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly extension: string;
}

/**
 * Export canonical markdown to a beta format. `md` returns the canonical bytes untouched (the
 * markdown IS the artifact); `txt`/`docx` run pandoc via the injected `PandocExec`. Anything outside
 * the beta set is rejected here, before any work — the container never sees a P1.18 format.
 */
export async function exportMarkdown(
  deps: { pandoc: PandocExec },
  args: { markdown: string; format: string },
): Promise<ExportResult> {
  if (!isExportFormat(args.format)) {
    throw new ExportError("unsupported_format", `export format "${args.format}" is not in the beta set (md/txt/docx)`);
  }
  const format: ExportFormat = args.format;
  if (args.markdown.trim() === "") throw new ExportError("empty_input", "nothing to export — the draft is empty");
  const info = EXPORT_FORMAT_INFO[format];
  if (format === "md") {
    return { bytes: new TextEncoder().encode(args.markdown), mediaType: info.mediaType, extension: info.extension };
  }
  const bytes = await deps.pandoc({ input: args.markdown, to: info.pandocTarget! });
  return { bytes, mediaType: info.mediaType, extension: info.extension };
}

// Re-export the shared registry so container-internal callers can import from one place.
export { EXPORT_FORMATS, EXPORT_FORMAT_INFO, exportFileName, aiUseFileName, isExportFormat } from "@rhema/contracts";
export type { ExportFormat, ExportFormatInfo } from "@rhema/contracts";
