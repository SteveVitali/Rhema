import {
  EXPORT_FORMAT_INFO,
  EXPORT_FORMATS,
  isCslStyle,
  isExportFormat,
  isMdExportProfile,
  MD_EXPORT_PROFILES,
  type CslStyle,
  type ExportFigure,
  type ExportFormat,
  type MdExportProfile,
} from "@rhema/contracts";
import { figureSourcesAppendix, rewriteFiguresForFormat } from "./figures.js";
import type { PandocExec } from "./pandoc.js";
import { substackMarkdown } from "./substack.js";
import { CSL_STYLE_XML } from "./csl-styles.js";

// The export core (§13.4; PRB.11's beta path grown to the full P1.18 surface): the format registry
// + filename contract come from @rhema/contracts (P0.02 owns every shared name) so this container,
// the api's validation, and the web dialog read ONE table. `md` is the canonical bytes verbatim
// (export is the only way out — Q-9 — and the canonical form must leave untouched), everything else
// runs pandoc inside this container. `pdf` is pandoc's pdf writer with `--pdf-engine=typst` —
// typst is the second confined binary, same AC5 rule. Footnotes (`[^n]`) become REAL docx/latex
// footnotes via pandoc's native writers — never flattened text. `substack` is a `profile` on `md`,
// never an eighth format. `--citeproc` renders citations from the CSL-JSON bibliography through the
// five vendored styles. Figure blocks are rewritten per REQ-VIZ-15 before conversion.

export class ExportError extends Error {
  constructor(
    readonly reason:
      | "unsupported_format"
      | "unsupported_profile"
      | "empty_input"
      | "conversion_failed",
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

export interface ExportArgs {
  readonly markdown: string;
  readonly format: string;
  /** `md`-only profile (`substack`) — any profile on a non-md format rejects before work. */
  readonly profile?: string | null;
  /** CSL style for `--citeproc` — honored only when `bibliography` is present. */
  readonly cslStyle?: string | null;
  /** CSL-JSON items (the `bibliography/csl.json` artifact bytes) — enables citeproc. */
  readonly bibliography?: string | null;
  /** api-resolved figure payloads (REQ-VIZ-15) — rewritten per format before conversion. */
  readonly figures?: readonly ExportFigure[] | null;
}

/** The default CSL style when a bibliography exports without a style choice (dialog's default). */
export const DEFAULT_CSL_STYLE: CslStyle = "apa";

/**
 * Export canonical markdown. `md` returns the canonical bytes (profiled → the profile transform;
 * with figures → the canonical body + the `## Figure sources` appendix). Everything else runs
 * pandoc via the injected `PandocExec`. Anything outside the registry — format, profile, style —
 * is rejected here, before any conversion work begins.
 */
export async function exportMarkdown(
  deps: { pandoc: PandocExec },
  args: ExportArgs,
): Promise<ExportResult> {
  if (!isExportFormat(args.format)) {
    throw new ExportError(
      "unsupported_format",
      `export format "${args.format}" is not in the registry (${EXPORT_FORMATS.join("/")})`,
    );
  }
  const format: ExportFormat = args.format;
  if (args.markdown.trim() === "") {
    throw new ExportError("empty_input", "nothing to export — the draft is empty");
  }

  // A profile is legal on `md` only — reject before any work (the api shares this rule).
  if (args.profile != null && args.profile !== "") {
    if (format !== "md" || !isMdExportProfile(args.profile)) {
      throw new ExportError(
        "unsupported_profile",
        `profile "${args.profile}" applies to format "md" only (profiles: ${MD_EXPORT_PROFILES.join("/")})`,
      );
    }
  }
  const profile: MdExportProfile | null = isMdExportProfile(args.profile) ? args.profile : null;

  const info = EXPORT_FORMAT_INFO[format];
  const figures = args.figures ?? [];

  // ---- the canonical .md paths (never touch pandoc). ----
  if (format === "md") {
    let md = args.markdown;
    if (profile === "substack") {
      // figures → alt/caption text BEFORE the profile strips the marker comments.
      md = rewriteFiguresForFormat(md, figures).markdown;
      md = substackMarkdown(md);
    } else if (figures.length > 0) {
      // byte-faithful body + the REQ-VIZ-15 figure-sources appendix.
      md = `${md.trimEnd()}${figureSourcesAppendix(figures)}`;
    }
    return { bytes: new TextEncoder().encode(md), mediaType: info.mediaType, extension: info.extension };
  }

  // ---- the pandoc paths. ----
  const extraArgs: string[] = [];
  const extraFiles: { name: string; bytes: Uint8Array | string }[] = [];

  let markdown = args.markdown;
  if (figures.length > 0) {
    const rewritten = rewriteFiguresForFormat(markdown, figures);
    markdown = rewritten.markdown;
    extraFiles.push(...rewritten.files);
  }

  // `--citeproc`: the CSL-JSON bibliography + the vendored style file ride as sidecars.
  if (args.bibliography != null && args.bibliography !== "") {
    const style: CslStyle = isCslStyle(args.cslStyle) ? args.cslStyle : DEFAULT_CSL_STYLE;
    extraFiles.push({ name: "refs.json", bytes: args.bibliography });
    extraFiles.push({ name: `${style}.csl`, bytes: CSL_STYLE_XML[style] });
    extraArgs.push("--citeproc", `--bibliography=refs.json`, `--csl=${style}.csl`);
  }

  if (info.standalone) extraArgs.push("--standalone");
  if (format === "html") extraArgs.push("--embed-resources"); // a self-contained .html (figures inline)
  if (format === "pdf") extraArgs.push("--pdf-engine=typst"); // REQ-VIZ-15: vector svg, typst engine

  const bytes = await deps.pandoc({
    input: markdown,
    to: info.pandocTarget!,
    extraArgs,
    extraFiles: extraFiles.length > 0 ? extraFiles : undefined,
  });
  return { bytes, mediaType: info.mediaType, extension: info.extension };
}

// Re-export the shared registry so container-internal callers can import from one place.
export {
  CSL_STYLES,
  CSL_STYLE_INFO,
  EXPORT_FORMATS,
  EXPORT_FORMAT_INFO,
  MD_EXPORT_PROFILES,
  PROVENANCE_APPENDIX_FORMATS,
  exportFileName,
  aiUseFileName,
  isCslStyle,
  isExportFormat,
  isMdExportProfile,
} from "@rhema/contracts";
export type { CslStyle, ExportFigure, ExportFormat, ExportFormatInfo, MdExportProfile } from "@rhema/contracts";
