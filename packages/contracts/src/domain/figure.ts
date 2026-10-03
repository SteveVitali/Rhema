import { z } from "zod";
import { idSchema, isoSchema } from "../ids.js";

// The figure contract (§7.5; REQ-VIZ-1…16; P1.13). A figure is a CLAIM-BEARING ASSET — spec + data
// + provenance — versioned per iteration, living under `assets/figures/<figure-id>/` in the shared
// record (both seats read it). The `figures`/`figure_versions` rows (packages/db misc schema) carry
// this shape; the asset directory carries the spec file (`spec.vl.json` | `diagram.mmd` |
// `table.md`), `data.csv`, `provenance.json`, the cached renders, and `versions/<n>/`. Renders are
// regenerable cache — never the source of truth (REQ-VIZ-1). Provenance is structured DATA, never
// a caption convention — the data-honesty rule (REQ-WF-14) is enforced before any spec exists.

/** The figure's visual family — the card's headline chip (§7.5 `kind`). */
export const FIGURE_KINDS = ["chart", "diagram", "table"] as const;
export type FigureKind = (typeof FIGURE_KINDS)[number];
export const figureKindSchema = z.enum(FIGURE_KINDS);

/** The on-disk spec vocabulary — one filename per kind (§7.5 layout). */
export const FIGURE_SPEC_KINDS = ["vega_lite", "mermaid", "table"] as const;
export type FigureSpecKind = (typeof FIGURE_SPEC_KINDS)[number];
export const figureSpecKindSchema = z.enum(FIGURE_SPEC_KINDS);

/** `specKind` → the §7.5 spec filename inside `assets/figures/<figure-id>/`. */
export const SPEC_FILENAME: Record<FigureSpecKind, string> = {
  vega_lite: "spec.vl.json",
  mermaid: "diagram.mmd",
  table: "table.md",
};

/** `specKind` → the card's figure kind chip. */
export const FIGURE_KIND_BY_SPEC: Record<FigureSpecKind, FigureKind> = {
  vega_lite: "chart",
  mermaid: "diagram",
  table: "table",
};

/**
 * Where every number in `data.csv` came from — classified by the data-resolution honesty step
 * BEFORE any spec is generated (REQ-VIZ-4, REQ-WF-14). `none` is the insist-path: the model
 * refused model-memory numbers, the user insisted anyway, and the figure carries a persistent
 * `[unverified data]` badge until provenance attaches or a review verdict lands.
 */
export const FIGURE_PROVENANCE_KINDS = [
  "selection", //     numbers in the selection/draft — no badge; the review checks them anyway
  "claim_ledger", //   a claim-ledger row — inherits the claim's verified state
  "asset_upload", //   an uploaded CSV/JSON asset
  "fetched", //       a URL fetched for this figure
  "user_typed", //    numbers the user typed/corrected inline — badge: author-supplied
  "none", //          insisted-without-source — persistent [unverified data]
] as const;
export type FigureProvenanceKind = (typeof FIGURE_PROVENANCE_KINDS)[number];
export const figureProvenanceKindSchema = z.enum(FIGURE_PROVENANCE_KINDS);

/** The verification states a Review verdict writes back to `provenance.verification` (§7.5). */
export const FIGURE_VERIFICATIONS = ["unverified", "verified", "contradicted", "unverifiable"] as const;
export type FigureVerification = (typeof FIGURE_VERIFICATIONS)[number];
export const figureVerificationSchema = z.enum(FIGURE_VERIFICATIONS);

/** The five §7.5 entry points — every one opens the SAME run with the right provenance kind. */
export const FIGURE_ENTRY_POINTS = [
  "chat", //          "make a chart of…" in the Assistant thread (the visualize tool's sheet → run)
  "selection", //     the selection popover's Visualize — provenance `selection` + anchor
  "command", //       `/visualize` with @claim:/@asset:/free text
  "edit_block", //    Edit figure on an existing figure block (opens the card at the version)
  "craft_finding", // the craft finding's Visualize action
] as const;
export type FigureEntryPoint = (typeof FIGURE_ENTRY_POINTS)[number];
export const figureEntryPointSchema = z.enum(FIGURE_ENTRY_POINTS);

/**
 * The provenance kind an entry point SEEDS (the run's honesty step confirms/amends it — e.g. a
 * free-text request carrying a URL reclassifies to `fetched`, typed numbers to `user_typed`, and
 * numbers with no source at all are refused). `@claim:` scopes carry `claim_ledger`;
 * `@asset:` uploads carry `asset_upload`; the selection popover carries `selection` + its anchor.
 */
export const ENTRY_POINT_PROVENANCE: Partial<Record<FigureEntryPoint, FigureProvenanceKind>> = {
  selection: "selection",
  edit_block: undefined, // reuses the figure's existing provenance — never reclassified by entry
};

/** A provenance ref (§7.5): the concrete object a number trace back to. */
export const figureProvenanceRefSchema = z.object({
  url: z.string().optional(),
  accessedAt: isoSchema.optional(),
  claimId: idSchema.optional(),
  assetId: idSchema.optional(),
  /** the transform applied between the source and `data.csv` ("dropped row 3", "log scale"). */
  transform: z.string().optional(),
});
export type FigureProvenanceRef = z.infer<typeof figureProvenanceRefSchema>;

/** `provenance.json` — where every number came from + the verification state Review writes. */
export const figureProvenanceSchema = z.object({
  kind: figureProvenanceKindSchema,
  refs: z.array(figureProvenanceRefSchema).default([]),
  computedBy: z.enum(["assistant", "drafter", "user"]),
  verification: figureVerificationSchema.default("unverified"),
});
export type FigureProvenance = z.infer<typeof figureProvenanceSchema>;

/** The insert anchor (§7.5): which draft block the proposal lands after. */
export const figureAnchorSchema = z.object({
  draftVersion: z.number().int().nonnegative(),
  blockId: z.string(),
});
export type FigureAnchor = z.infer<typeof figureAnchorSchema>;

/** One iteration in the Versions strip (§7.5; REQ-VIZ-9) — the request that produced it + cost. */
export const figureVersionSummarySchema = z.object({
  n: z.number().int().positive(),
  /** the iterate turn's request text ("make it a bar chart"); "initial" on v1, "chip:<mark>" on
   *  a 0-credit type-chip edit, "restore:<n>" on a restore. */
  request: z.string(),
  specSha256: z.string(),
  createdAt: isoSchema,
  cost: z.number().nonnegative(),
});
export type FigureVersionSummary = z.infer<typeof figureVersionSummarySchema>;

/** `data.csv` facts the card shows ("4 rows · from @claim:v3/28") — never the CSV itself. */
export const figureDataSummarySchema = z.object({
  rows: z.number().int().nonnegative(),
  columns: z.array(z.string()),
  csvSha256: z.string(),
});
export type FigureDataSummary = z.infer<typeof figureDataSummarySchema>;

export const FIGURE_ALT_MAX = 250 as const;

/**
 * The §7.5 `FigureAsset` verbatim (spec block). `alt` (≤250 chars) and `sourceLine` are REQUIRED
 * before insert (REQ-VIZ-2) — `figureInsertReadiness` is the check the proposal path runs.
 */
export const figureAssetSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  kind: figureKindSchema,
  title: z.string(),
  caption: z.string(),
  alt: z.string().max(FIGURE_ALT_MAX),
  sourceLine: z.string(),
  specKind: figureSpecKindSchema,
  data: figureDataSummarySchema.optional(),
  provenance: figureProvenanceSchema,
  anchor: figureAnchorSchema.optional(),
  versions: z.array(figureVersionSummarySchema),
});
export type FigureAsset = z.infer<typeof figureAssetSchema>;

/** The badge the figure carries in the Page + on the card (§7.5; REQ-VIZ-4). */
export const FIGURE_BADGES = [
  "unverified_data", //  kind:"none" — persists until provenance attaches or a verdict lands
  "author_supplied", //   kind:"user_typed" — the author's own numbers, marked as such
  "verified", //         a review verdict verified the figure's claims
  "contradicted", //     a review verdict contradicted them
  "unverifiable", //     a review verdict could not verify them
] as const;
export type FigureBadge = (typeof FIGURE_BADGES)[number];
export const figureBadgeSchema = z.enum(FIGURE_BADGES);

/**
 * Derive the figure's badge (§7.5): a review verdict outranks provenance (a `claim_ledger` figure
 * "inherits verified"; a `none` figure verified by review loses the badge); absent a verdict,
 * `kind:"none"` ⇒ `[unverified data]` (persistent — exports carry it too) and `kind:"user_typed"`
 * ⇒ `author-supplied`. `selection`/`fetched`/`asset_upload` carry NO badge — the review checks
 * them anyway.
 */
export function figureBadge(p: Pick<FigureProvenance, "kind" | "verification">): FigureBadge | null {
  if (p.verification === "verified") return "verified";
  if (p.verification === "contradicted") return "contradicted";
  if (p.verification === "unverifiable") return "unverifiable";
  if (p.kind === "none") return "unverified_data";
  if (p.kind === "user_typed") return "author_supplied";
  return null;
}

/** The literal badge text the Page + exports render (§7.5's `[unverified data]` verbatim). */
export const FIGURE_BADGE_TEXT: Record<FigureBadge, string> = {
  unverified_data: "[unverified data]",
  author_supplied: "author-supplied",
  verified: "verified",
  contradicted: "contradicted",
  unverifiable: "unverifiable",
};

/** REQ-VIZ-2 — what insert still needs. `missing` names the unmet fields (empty ⇒ insertable). */
export function figureInsertReadiness(
  asset: Pick<FigureAsset, "alt" | "sourceLine">,
): { readonly ok: boolean; readonly missing: readonly ("alt" | "sourceLine")[] } {
  const missing: ("alt" | "sourceLine")[] = [];
  if (asset.alt.trim() === "" || asset.alt.length > FIGURE_ALT_MAX) missing.push("alt");
  if (asset.sourceLine.trim() === "") missing.push("sourceLine");
  return { ok: missing.length === 0, missing };
}

/** The figure's asset URI form (`asset://fig_<ulid>`) — the `fig_` prefix lives in the URI +
 *  marker, never in the row id (entity ids are bare ULIDs everywhere, incl. `figure.*` events). */
export function figureAssetUri(figureId: string): string {
  return `asset://fig_${figureId}`;
}

/** Strip a `fig_`-prefixed marker/URI id back to the row id (idempotent on bare ULIDs). */
export function figureIdFromRef(ref: string): string {
  return ref.startsWith("fig_") ? ref.slice(4) : ref;
}

/**
 * The Rhema-Markdown figure block an insert proposal writes (§7.5 verbatim): the asset image ref,
 * the italic caption line with the footnoted source, and the `rhema:figure` marker the block maps
 * back to its asset + version. `figureNumber` is computed from DOCUMENT ORDER at insert/render —
 * never typed by the model (REQ-VIZ-11).
 */
export function figureBlockMarkdown(args: {
  /** the figures row id (a bare ULID — the `fig_` prefix is added here). */
  figureId: string;
  version: number;
  alt: string;
  caption: string;
  /** the caption's "Figure N." prefix (document-order derived); omit the *Figure N.* lead when absent. */
  figureNumber?: number;
  /** the footnote label without brackets ("12" → `[^12]` inline + `[^12]:` definition). */
  footnoteId: string;
  sourceLine: string;
}): string {
  const lead = args.figureNumber != null ? `Figure ${args.figureNumber}. ` : "";
  const ref = `fig_${figureIdFromRef(args.figureId)}`;
  return [
    `![${args.alt}](${figureAssetUri(figureIdFromRef(args.figureId))})`,
    `*${lead}${args.caption}[^${args.footnoteId}]*`,
    `<!-- rhema:figure id=${ref} version=${args.version} -->`,
    `[^${args.footnoteId}]: Source: ${args.sourceLine}`,
  ].join("\n");
}

/** Parse a `<!-- rhema:figure id=… version=n -->` marker back to its refs (block → asset map).
 *  `figureId` is the bare row id (the marker's `fig_` prefix stripped). */
export const FIGURE_MARKER_RE = /<!--\s*rhema:figure\s+id=fig_(\S+)\s+version=(\d+)\s*-->/;

export function parseFigureMarker(markdown: string): { figureId: string; version: number }[] {
  const out: { figureId: string; version: number }[] = [];
  const re = new RegExp(FIGURE_MARKER_RE.source, "g");
  for (const m of markdown.matchAll(re)) {
    out.push({ figureId: m[1]!, version: Number(m[2]) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// Export packaging (REQ-VIZ-15 — the ASSET half; the formats themselves are P1.18's).
// ---------------------------------------------------------------------------------------------------------

/** The export formats the asset packages for (P1.18 consumes this mapping). */
export const FIGURE_EXPORT_FORMATS = ["md", "txt", "html", "docx", "rtf", "pdf", "latex", "odt", "epub", "gdocs", "zip"] as const;
export type FigureExportFormat = (typeof FIGURE_EXPORT_FORMATS)[number];

/** Which payload a format embeds (§7.5): light SVG everywhere vector is supported, PNG@2x where
 *  the format needs raster, the native table everywhere tables exist, alt+caption+source for txt. */
export type FigureExportEmbed = "svg" | "png2x" | "table" | "text";

export interface FigureExportPackage {
  readonly figureId: string;
  readonly format: FigureExportFormat;
  readonly embed: FigureExportEmbed;
  /** `render.svg` bytes (the LIGHT render — dark never exports, §7.5). Present iff embed svg. */
  readonly svg?: string;
  /** `render@2x.png` bytes. Present iff embed png2x (lazily produced on first request). */
  readonly png2x?: Uint8Array;
  /** the table's markdown/HTML source. Present iff embed table. */
  readonly tableSource?: string;
  /** maps to the format's alt-text field, always present. */
  readonly altText: string;
  /** the source line as a footnote where footnotes exist, else a caption suffix. */
  readonly sourceFootnote: string;
  /** the `[unverified data]` caption note — present while the badge persists (REQ-VIZ-15). */
  readonly captionNote?: string;
}

/** The format → embed mapping, verbatim §7.5. */
export const EXPORT_EMBED: Record<FigureExportFormat, FigureExportEmbed> = {
  html: "svg",
  pdf: "svg",
  latex: "svg",
  md: "table",
  docx: "png2x",
  rtf: "png2x",
  gdocs: "png2x",
  txt: "text",
  odt: "png2x",
  epub: "svg",
  zip: "svg", // the .md zip carries spec + data + provenance so the figure reproduces outside Rhema
};

/**
 * Package a figure for an export format (the asset half of REQ-VIZ-15): the caller supplies the
 * render bytes it resolved (light svg / lazy png2x / table source); this chooses the embed, always
 * attaches alt + the source footnote, and appends the `[unverified data]` caption note while the
 * badge persists. A `table`-kind figure embeds its native table everywhere tables exist; a txt
 * export keeps alt + caption + source.
 */
export function figureExportPackage(args: {
  figure: Pick<FigureAsset, "id" | "alt" | "sourceLine" | "caption" | "specKind" | "provenance">;
  format: FigureExportFormat;
  figureNumber?: number;
  svg?: string;
  png2x?: Uint8Array;
  tableSource?: string;
}): FigureExportPackage {
  const { figure, format } = args;
  const badge = figureBadge(figure.provenance);
  const captionNote = badge === "unverified_data" ? FIGURE_BADGE_TEXT.unverified_data : undefined;
  const embed: FigureExportEmbed =
    figure.specKind === "table"
      ? format === "txt"
        ? "text"
        : "table"
      : EXPORT_EMBED[format];
  return {
    figureId: figure.id,
    format,
    embed,
    ...(embed === "svg" && args.svg != null ? { svg: args.svg } : {}),
    ...(embed === "png2x" && args.png2x != null ? { png2x: args.png2x } : {}),
    ...(embed === "table" && args.tableSource != null ? { tableSource: args.tableSource } : {}),
    altText: figure.alt,
    sourceFootnote: `Source: ${figure.sourceLine}`,
    ...(captionNote ? { captionNote } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------------
// Review integration (REQ-VIZ-13/14) — the figure-claims input the claim inventory consumes and the
// verdict write-back to `provenance.verification`.
// ---------------------------------------------------------------------------------------------------------

/** One Tier-1 claim a figure makes (§7.5: values, labels, axis ranges, caption comparisons). */
export const FIGURE_CLAIM_KINDS = [
  "value", //              a plotted number from data.csv
  "label", //              an axis/series/category label
  "axis_range", //         the axis extent the spec asserts
  "caption_comparison", // a comparison the caption states ("highest", "doubled")
] as const;
export type FigureClaimKind = (typeof FIGURE_CLAIM_KINDS)[number];
export const figureClaimKindSchema = z.enum(FIGURE_CLAIM_KINDS);

/** The inventory input row: one figure claim + its evidence refs (provenance.json + data.csv). */
export const figureClaimSchema = z.object({
  figureId: idSchema,
  /** the figure's document-order number — the claims table groups under it (REQ-VIZ-14). */
  figureNumber: z.number().int().positive().optional(),
  ordinal: z.number().int().positive(),
  kind: figureClaimKindSchema,
  /** the claim text the reviewer verifies ("Radical right: 0.71"). */
  text: z.string(),
  /** the expected value where the claim is numeric. */
  value: z.number().optional(),
  /** evidence refs — the claim inherits the figure's provenance for re-fetch + recompute. */
  refs: z.array(figureProvenanceRefSchema).default([]),
});
export type FigureClaim = z.infer<typeof figureClaimSchema>;

/**
 * Derive a figure's Tier-1 inventory claims from its spec + data + caption (the deterministic
 * half — the reviewer's claim inventory consumes these alongside `provenance.json`/`data.csv`).
 * A figure with `provenance.kind === "none"` inventories UNSUPPORTED by construction (§7.5): the
 * claims exist but carry no refs, so verification can never re-fetch a source.
 */
export function figureClaims(args: {
  figure: Pick<FigureAsset, "id" | "caption" | "provenance" | "specKind" | "title">;
  figureNumber?: number;
  /** the data rows exactly as plotted (from data.csv). */
  rows: readonly Record<string, string | number>[];
  /** axis/series labels the spec asserts (titles, category names). */
  labels?: readonly string[];
  /** caption-stated comparisons to verify ("highest", "doubled") — extracted upstream. */
  captionComparisons?: readonly string[];
}): FigureClaim[] {
  const claims: FigureClaim[] = [];
  let ordinal = 0;
  const supported = args.figure.provenance.kind !== "none";
  const refs = supported ? args.figure.provenance.refs : [];
  for (const row of args.rows) {
    for (const [col, v] of Object.entries(row)) {
      if (typeof v === "number") {
        claims.push({
          figureId: args.figure.id,
          ...(args.figureNumber != null ? { figureNumber: args.figureNumber } : {}),
          ordinal: ++ordinal,
          kind: "value",
          text: `${col}: ${v}`,
          value: v,
          refs,
        });
      }
    }
  }
  for (const label of args.labels ?? []) {
    claims.push({
      figureId: args.figure.id,
      ...(args.figureNumber != null ? { figureNumber: args.figureNumber } : {}),
      ordinal: ++ordinal,
      kind: "label",
      text: label,
      refs,
    });
  }
  for (const cmp of args.captionComparisons ?? []) {
    claims.push({
      figureId: args.figure.id,
      ...(args.figureNumber != null ? { figureNumber: args.figureNumber } : {}),
      ordinal: ++ordinal,
      kind: "caption_comparison",
      text: cmp,
      refs,
    });
  }
  return claims;
}

/** A figure with no provenance is inventoried UNSUPPORTED by construction (§7.5/REQ-VIZ-13). */
export function figureClaimsSupported(p: Pick<FigureProvenance, "kind">): boolean {
  return p.kind !== "none";
}

/**
 * Fold the figure claims' verdicts into `provenance.verification` (REQ-VIZ-13): all verified ⇒
 * `verified`; any contradicted ⇒ `contradicted`; anything unverifiable (and none contradicted) ⇒
 * `unverifiable`; a `none` figure stays unverified-by-construction until a verdict exists (a
 * verdict CAN still land — the reviewer recomputes from data.csv itself — so we honor it).
 */
export function verificationFromVerdicts(
  verdicts: readonly ("verified" | "contradicted" | "unverifiable")[],
): FigureVerification | null {
  if (verdicts.length === 0) return null;
  if (verdicts.some((v) => v === "contradicted")) return "contradicted";
  if (verdicts.every((v) => v === "verified")) return "verified";
  return "unverifiable";
}
