import {
  EXPORT_EMBED,
  figureIdFromRef,
  type ExportFigure,
} from "@rhema/contracts";

// REQ-VIZ-15 — the figure half of the export rewrite, inside the container (the asset payloads are
// api-resolved `ExportFigure`s; the embed choice itself is §7.5's EXPORT_EMBED, applied per figure
// upstream). A canonical figure block is the contiguous run
//
//   ![<alt>](asset://fig_<id>)
//   *Figure N. <caption>[^k]*
//   <!-- rhema:figure id=fig_<id> version=<n> -->
//
// plus the `[^k]: Source: …` footnote definition elsewhere in the document. This rewrite swaps the
// `asset://` ref for the per-format payload (vector file ref / raster file ref / native table /
// plain text), folds the `[unverified data]` caption note into the caption, and drops the marker
// comment for every non-md format. The markdown `[^k]:` footnote survives untouched — pandoc
// renders the source line as a REAL footnote in docx/latex (the "source line as footnote" rule).
// The .md path never enters here — the canonical bytes stay verbatim and the figure's
// spec/data/provenance ride a `## Figure sources` appendix (figureSourcesAppendix below).

export interface FigureRewrite {
  readonly markdown: string;
  /** Sidecar files for the pandoc scratch dir (`fig_<id>.svg|png` — referenced by relative name). */
  readonly files: { name: string; bytes: Uint8Array | string }[];
}

const MARKER_RE = /^\s*<!--\s*rhema:figure\s+id=(fig_\S+)\s+version=\d+\s*-->\s*$/;
const ASSET_IMG_RE = /!\[([^\]]*)\]\(asset:\/\/(fig_\S+)\)/;

/** The asset filename a vector/raster embed ships as (relative to the pandoc scratch dir). */
function assetFileName(figureId: string, embed: "svg" | "png2x"): string {
  return `fig_${figureId}.${embed === "svg" ? "svg" : "png"}`;
}

/** Rewrite every figure block in the canonical markdown for a pandoc-converted format. */
export function rewriteFiguresForFormat(
  markdown: string,
  figures: readonly ExportFigure[],
): FigureRewrite {
  const byId = new Map(figures.map((f) => [f.figureId, f]));
  const files: FigureRewrite["files"] = [];
  const lines = markdown.split("\n");
  const out: string[] = [];

  // A figure's doc order (the api ships figures in document order) numbers the fallback text.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = MARKER_RE.exec(line);
    if (!marker) {
      out.push(line);
      continue;
    }
    const refId = marker[1]!;
    const figureId = figureIdFromRef(refId);
    const fig = byId.get(figureId);

    // The marker is the LAST line of its block; the two lines above it are the caption line and the
    // asset image line (figureBlockMarkdown's shape). Pop them off `out`, transform, re-emit — but
    // only when the image line really is THIS figure's asset ref; a hand-edited shape just loses
    // the marker (the stray `asset://` ref is still degraded by the trailing pass).
    const caption = out.length > 0 ? out.pop()! : null;
    const imageLine = out.length > 0 ? out.pop()! : null;
    const imgMatch = imageLine != null ? ASSET_IMG_RE.exec(imageLine) : null;
    const blockOk =
      caption != null &&
      imageLine != null &&
      imgMatch != null &&
      figureIdFromRef(imgMatch[2]!) === figureId;
    if (!blockOk) {
      if (imageLine != null) out.push(imageLine);
      if (caption != null) out.push(caption);
      continue; // drop only the marker line
    }

    const alt = fig?.altText ?? imgMatch![1]!;
    const captionLine =
      fig?.captionNote != null ? withCaptionNote(caption, fig.captionNote) : caption;

    const embed: ExportFigure["embed"] =
      fig == null ? "text" : fig.embed === "svg" && fig.svg == null ? "text"
      : fig.embed === "png2x" && fig.png2xBase64 == null ? "text"
      : fig.embed === "table" && fig.tableSource == null ? "text"
      : fig.embed;

    switch (embed) {
      case "svg": {
        const name = assetFileName(figureId, "svg");
        files.push({ name, bytes: fig!.svg! });
        out.push(`![${alt}](${name})`, captionLine);
        break;
      }
      case "png2x": {
        const name = assetFileName(figureId, "png2x");
        files.push({ name, bytes: Buffer.from(fig!.png2xBase64!, "base64") });
        out.push(`![${alt}](${name})`, captionLine);
        break;
      }
      case "table":
        // Native-table formats embed the table source in place of the asset image.
        out.push(fig!.tableSource!.trimEnd(), captionLine);
        break;
      case "appendix": {
        // Defensive: the .md appendix path never rewrites the block — treat as text.
        out.push(`[Figure: ${alt}]`, captionLine);
        break;
      }
      case "text":
      default:
        out.push(`[Figure: ${alt}]`, captionLine);
        break;
    }
    // the marker line itself is dropped for every converted format.
  }

  // Any `asset://` image with NO marker (hand-edited, or a marker the resolver missed) still must
  // not leak the internal URI — degrade it to its alt text.
  return {
    markdown: out
      .join("\n")
      .replace(/!\[([^\]]*)\]\(asset:\/\/fig_\S+\)/g, (_m, alt: string) => `[Figure: ${alt}]`),
    files,
  };
}

/** Fold the `[unverified data]` note into the italic caption line (`*…*` → `*… [unverified data]*`). */
function withCaptionNote(captionLine: string, note: string): string {
  const trimmed = captionLine.trimEnd();
  if (trimmed.endsWith("*")) return `${trimmed.slice(0, -1)} ${note}*`;
  return `${trimmed} ${note}`;
}

/**
 * The `.md` figure-sources appendix (REQ-VIZ-15: ".md carries spec + data + provenance"). The
 * canonical body stays byte-faithful; each figure's source triple rides behind a heading so the
 * file reproduces the figure outside Rhema. Deterministic — doc order, verbatim file contents.
 */
export function figureSourcesAppendix(figures: readonly ExportFigure[]): string {
  const withSources = figures.filter(
    (f) => f.specSource != null || f.dataCsv != null || f.provenanceJson != null,
  );
  if (withSources.length === 0) return "";
  const sections = withSources.map((f) => {
    const parts: string[] = [`### fig_${figureIdFromRef(f.figureId)}${f.title ? ` — ${f.title}` : ""}`];
    if (f.specSource != null) parts.push(`- \`spec\`:\n\n\`\`\`json\n${f.specSource.trimEnd()}\n\`\`\``);
    if (f.dataCsv != null) parts.push(`- \`data.csv\`:\n\n\`\`\`csv\n${f.dataCsv.trimEnd()}\n\`\`\``);
    if (f.provenanceJson != null)
      parts.push(`- \`provenance.json\`:\n\n\`\`\`json\n${f.provenanceJson.trimEnd()}\n\`\`\``);
    return parts.join("\n\n");
  });
  return `\n\n## Figure sources\n\n${sections.join("\n\n")}\n`;
}

/** Which asset filename an embed consumes — used by the api's file resolution + this rewrite. */
export function figureAssetRef(figure: ExportFigure): string | null {
  if (figure.embed === "svg" && figure.svg != null) return assetFileName(figure.figureId, "svg");
  if (figure.embed === "png2x" && figure.png2xBase64 != null)
    return assetFileName(figure.figureId, "png2x");
  return null;
}

/** The §7.5 embed map re-exported for container callers (single source of truth lives in contracts). */
export { EXPORT_EMBED };
