import type { ProvenanceSource } from "./common.js";

// §13.4 — the export surface. "Export is the only way out" and it runs inside the isolated
// conversion environment (REQ-INT-9): the canonical markdown is materialized onto the container
// filesystem and handed to the conversion engine (pandoc; the pdf path hands pandoc's pdf to
// Typst — both binaries live only in apps/export, AC5). Everything in this file is data +
// predicates the api dialog, web menu, and export job share so a format/property can never drift
// between "listed" and "handled".

export const EXPORT_FORMATS = ["md", "txt", "html", "docx", "rtf", "pdf", "latex"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export interface ExportFormatInfo {
  /**
   * The pandoc writer target, or null for the canonical byte-faithful `.md` path. `pdf` runs
   * pandoc's pdf writer with `--pdf-engine=typst` (REQ-VIZ-15 needs the same figure/asset
   * rewrite as every other pandoc route; a direct markdown→typst emitter would fork it).
   */
  readonly pandocTarget: string | null;
  /** true for pandoc targets that want `--standalone` (self-contained documents). */
  readonly standalone: boolean;
  /** Whether the format renders generated text/footnotes well enough to carry the §8.4 appendix. */
  readonly provenanceAppendix: boolean;
  /** Internet media type for the download/attachment. */
  readonly mediaType: string;
  /** File extension (no leading dot). */
  readonly extension: string;
  /** Human label for the dialog/menu row. */
  readonly label: string;
  /** One-line honest description for the dialog/menu row. */
  readonly blurb: string;
}

export const EXPORT_FORMAT_INFO: Record<ExportFormat, ExportFormatInfo> = {
  // .md is canonical: the store bytes are the export bytes — no writer, never re-rendered.
  md: {
    pandocTarget: null,
    standalone: false,
    provenanceAppendix: true,
    mediaType: "text/markdown; charset=utf-8",
    extension: "md",
    label: "Markdown",
    blurb: "The canonical file, byte-for-byte; figures append their spec, data, and provenance.",
  },
  txt: {
    pandocTarget: "plain",
    standalone: false,
    provenanceAppendix: false,
    mediaType: "text/plain; charset=utf-8",
    extension: "txt",
    label: "Plain text",
    blurb: "Text only — figures become alt text, caption, and source.",
  },
  html: {
    pandocTarget: "html",
    standalone: true,
    provenanceAppendix: true,
    mediaType: "text/html; charset=utf-8",
    extension: "html",
    label: "HTML",
    blurb: "A self-contained page with vector figures and real footnotes.",
  },
  docx: {
    pandocTarget: "docx",
    standalone: false,
    provenanceAppendix: true,
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extension: "docx",
    label: "Word (.docx)",
    blurb: "A Word document — tracked headings, tables, and footnotes; figures as images.",
  },
  rtf: {
    pandocTarget: "rtf",
    // without --standalone pandoc emits an RTF fragment (no {\rtf1 header) — Word needs the doc.
    standalone: true,
    // spec's appendix-capable set is html/pdf/docx/latex/md — rtf (like txt) omits the appendix.
    provenanceAppendix: false,
    mediaType: "application/rtf",
    extension: "rtf",
    label: "Rich Text (.rtf)",
    blurb: "Opens anywhere Word-format files are accepted.",
  },
  pdf: {
    pandocTarget: "pdf",
    standalone: false,
    provenanceAppendix: true,
    mediaType: "application/pdf",
    extension: "pdf",
    label: "PDF",
    blurb: "Typeset by Typst inside the export container.",
  },
  latex: {
    pandocTarget: "latex",
    standalone: true,
    provenanceAppendix: true,
    mediaType: "application/x-latex",
    extension: "tex",
    label: "LaTeX (.tex)",
    blurb: "A .tex source file with real \\footnote{…} marks.",
  },
} satisfies Record<ExportFormat, ExportFormatInfo>;

// §13.4 — "Substack-flavored Markdown is a profile of `md`" — the request carries `format:"md"`
// plus this profile; the container applies the profile's canonical-markdown transform (platform
// paste-habits: no html comments — which covers the figure markers — and footnotes flattened to
// a "## Notes" list). A profile is legal on `md` only — recorded here so api/web/container share
// the same registry and can never drift.
export const MD_EXPORT_PROFILES = ["substack"] as const;
export type MdExportProfile = (typeof MD_EXPORT_PROFILES)[number];

export const MD_EXPORT_PROFILE_INFO: Record<MdExportProfile, { label: string; blurb: string }> = {
  substack: {
    label: "Substack",
    blurb: "Markdown shaped for pasting into the Substack editor (footnotes become a Notes list).",
  },
};

// §13.4 — CSL citation rendering. `bibliography/csl.json` (the P1.02 storage artifact) + `[@key]`
// cite nodes in the canonical markdown ride to the container, which invokes pandoc `--citeproc`
// (pandoc's bundled citeproc — a BSD-licensed engine; citeproc-js's AGPL is rejected).
// Five styles at MVP — the conventional academic five: APA, MLA, Chicago author-date, Harvard,
// Vancouver. The style is a dialog option; ten styles is 1.x. `.csl` definitions are vendored
// under apps/export/csl/ (authored here — the upstream Zotero collection is CC-BY-SA, outside
// the license allowlist).
export const CSL_STYLES = [
  "apa",
  "mla",
  "chicago-author-date",
  "harvard",
  "vancouver",
] as const;
export type CslStyle = (typeof CSL_STYLES)[number];

export const CSL_STYLE_INFO: Record<CslStyle, { label: string }> = {
  apa: { label: "APA" },
  mla: { label: "MLA" },
  "chicago-author-date": { label: "Chicago (author-date)" },
  harvard: { label: "Harvard" },
  vancouver: { label: "Vancouver" },
};

/** The formats that can carry the §8.4 block-level provenance appendix (ticket's own set). */
export const PROVENANCE_APPENDIX_FORMATS: readonly ExportFormat[] = (
  Object.entries(EXPORT_FORMAT_INFO) as [ExportFormat, ExportFormatInfo][]
)
  .filter(([, i]) => i.provenanceAppendix)
  .map(([f]) => f);

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && (EXPORT_FORMATS as readonly string[]).includes(value);
}

export function isMdExportProfile(value: unknown): value is MdExportProfile {
  return typeof value === "string" && (MD_EXPORT_PROFILES as readonly string[]).includes(value);
}

export function isCslStyle(value: unknown): value is CslStyle {
  return typeof value === "string" && (CSL_STYLES as readonly string[]).includes(value);
}

export function provenanceAppendixSupported(format: ExportFormat): boolean {
  return EXPORT_FORMAT_INFO[format].provenanceAppendix;
}

// ---- REQ-VIZ-15 — the api → container figure payload (JSON transport). The api resolves the
// figure rows + render bytes via `figureExportPackage` (domain/figure.ts — the §7.5 embed map is
// the single source of truth) and ships the payload the container's markdown rewrite consumes.
// PNG bytes travel base64 (JSON-safe); svg/table/spec/data/provenance travel as text. A
// `rhema:figure` marker the payload does NOT cover renders as its alt + caption text. ----

/** One figure's per-format export payload (the api resolves `embed` via EXPORT_EMBED first). */
export interface ExportFigure {
  /** bare row id (matches the `fig_<id>` marker ref once `figureIdFromRef` is applied). */
  readonly figureId: string;
  /** the embed the api resolved for THIS format (per figure — a table figure embeds `table`). */
  readonly embed: "svg" | "png2x" | "table" | "text" | "appendix";
  readonly title: string;
  readonly caption: string;
  /** maps to the format's alt-text field — always present. */
  readonly altText: string;
  /** "Source: …" — carried as a footnote where footnotes exist, else a caption suffix. */
  readonly sourceFootnote: string;
  /** the `[unverified data]` caption note — present while the badge persists. */
  readonly captionNote?: string;
  /** `render.svg` (the LIGHT render — dark never exports). */
  readonly svg?: string;
  /** `render@2x.png` bytes, base64 for JSON transport. */
  readonly png2xBase64?: string;
  /** `table.md` source for the native-table embed. */
  readonly tableSource?: string;
  /** spec source (spec.vl.json | diagram.mmd | table.md) — the `.md` figure-sources appendix. */
  readonly specSource?: string;
  /** `data.csv` text — the `.md` figure-sources appendix. */
  readonly dataCsv?: string;
  /** `provenance.json` text — the `.md` figure-sources appendix. */
  readonly provenanceJson?: string;
}

// ---- §8.4 provenance → the exportable source label (REQ-POS-7's appendix shape) --------------
// The appendix renders one row per top-level block: `{blockId, first 60 chars, source}` where
// source is the same honest label the Version History bars use, PLUS the mixed-degradation
// wording the ticket fixes ("blocks edited by the author after drafting are marked mixed").

/** One row of a version's `provenance_maps.spans` (§8.4 — block-level at MVP). */
export interface ProvenanceSpan {
  readonly blockId: string;
  readonly source: ProvenanceSource;
}

/** Label for one provenance span — shared by the appendix and any future UI. REQ-POS-7's honest
 * wording: a block touched by both the agent and the author renders as `mixed`, never a guess. */
export function provenanceSourceLabel(source: ProvenanceSource): string {
  switch (source.kind) {
    case "human":
    case "human_mobile":
      return "author";
    case "pasted":
      return "pasted";
    case "chat":
      return "chat";
    case "agent":
      return "agent-drafted";
    case "suggestion_applied":
      return "suggestion applied";
    case "mixed":
      return "mixed";
  }
}

/** Account-export link lifetime (REQ-ACCT-3's delivery leg): the emailed link expires after this. */
export const ACCOUNT_EXPORT_LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** The download filename for a project export: the slug sanitized, plus the format extension. */
export function exportFileName(
  projectSlug: string,
  format: ExportFormat,
  opts?: { profile?: MdExportProfile | null },
): string {
  const stem =
    projectSlug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "manuscript";
  // A profiled .md keeps the .md extension (it IS markdown) but marks the flavor in the name.
  if (format === "md" && opts?.profile) {
    return `${stem}.${opts.profile}.${EXPORT_FORMAT_INFO[format].extension}`;
  }
  return `${stem}.${EXPORT_FORMAT_INFO[format].extension}`;
}

/** The standalone AI-use statement download filename (§8.4 REQ-VIS-10). */
export function aiUseFileName(format: ExportFormat): string {
  return `ai-use-statement.${EXPORT_FORMAT_INFO[format].extension}`;
}
