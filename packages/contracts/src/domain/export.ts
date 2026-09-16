import { z } from "zod";

// The §13.4 export contract (PRB.11). The beta formats are md/txt/docx out of the canonical Rhema Markdown;
// pdf/LaTeX/html/rtf/odt/epub/Google Docs/CSL and the account zip are P1.18 and MUST NOT appear here. The
// registry lives in contracts (P0.02 owns every shared name) so the api's validation, the web dialog's
// format list, and the `export` container's conversion target can never drift apart.

/** The export formats the beta supports (§13.4 beta subset). */
export const EXPORT_FORMATS = ["md", "txt", "docx"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const exportFormatSchema = z.enum(EXPORT_FORMATS);

/** Per-format facts the dialog + download headers consume. */
export interface ExportFormatInfo {
  /** The pandoc target name (md needs none — canonical markdown exports byte-identical). */
  readonly pandocTarget: "plain" | "docx" | null;
  readonly mediaType: string;
  readonly extension: string;
  /** The dialog's radio label. */
  readonly label: string;
}

export const EXPORT_FORMAT_INFO: Record<ExportFormat, ExportFormatInfo> = {
  md: { pandocTarget: null, mediaType: "text/markdown; charset=utf-8", extension: "md", label: "Markdown" },
  txt: { pandocTarget: "plain", mediaType: "text/plain; charset=utf-8", extension: "txt", label: "Plain text" },
  docx: {
    pandocTarget: "docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    label: "Word (.docx)",
  },
};

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

/** The download filename for a project export: the slug sanitized, plus the format extension. */
export function exportFileName(projectSlug: string, format: ExportFormat): string {
  const stem =
    projectSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "manuscript";
  return `${stem}.${EXPORT_FORMAT_INFO[format].extension}`;
}

/** The standalone AI-use statement download filename (§8.4 REQ-VIS-10). */
export function aiUseFileName(format: ExportFormat): string {
  return `ai-use-statement.${EXPORT_FORMAT_INFO[format].extension}`;
}
