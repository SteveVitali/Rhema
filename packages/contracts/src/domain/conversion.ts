import { z } from "zod";
import { anchorSchema } from "./anchor.js";
import { qualityVerdictSchema } from "../enums.js";

// The §5.3 conversion-preview payload (PRB.02). A `convert`-service run turns quarantine bytes into canonical
// Rhema Markdown and returns this: the converted markdown, the count line, the anchored warnings, and the
// verbatim `<!-- rhema:unconverted -->` spans. The web preview renders it source-beside-converted; on
// "Create and fix later" the warnings become a Conversion-notes card and the unconverted spans carry
// `[unconverted]` markers into the draft.

/** The formats the beta convert pipeline accepts (§9.5 subset; ticket In-scope 2). P1.15 widens the
 *  sniff union to the full §9.5 upload matrix: `epub`/`rtf` get deterministic converters, `image`
 *  (.png/.jpg/.tiff) and `binary` (.doc/.pages/.odt and unknown binaries) convert to `unreadable`
 *  with an honest note — the item stays listed, auto-omitted, until a converter or the opt-in
 *  visual tier covers it. */
export const CONVERT_SOURCE_FORMATS = [
  "md",
  "txt",
  "html",
  "docx",
  "pdf",
  "epub",
  "rtf",
  "image",
  "binary",
] as const;
export type ConvertSourceFormat = (typeof CONVERT_SOURCE_FORMATS)[number];
export const convertSourceFormatSchema = z.enum(CONVERT_SOURCE_FORMATS);

/** A conversion warning class (what could not be converted faithfully). */
export const CONVERSION_WARNING_KINDS = [
  "footnote_detached",
  "table_flattened",
  "unconverted_span",
  "image_dropped",
  "structure_lost",
  "encoding",
] as const;
export type ConversionWarningKind = (typeof CONVERSION_WARNING_KINDS)[number];

/** One anchored warning on the conversion preview (§5.3 "warnings list with anchors"). */
export const conversionWarningSchema = z
  .object({
    kind: z.enum(CONVERSION_WARNING_KINDS),
    /** Human-readable message (e.g. "1 table flattened to text"). Canonical vocabulary. */
    message: z.string().min(1),
    /** Where in the converted markdown it applies. Null when it is a document-level note. */
    anchor: anchorSchema.nullable(),
  })
  .strict();
export type ConversionWarning = z.infer<typeof conversionWarningSchema>;

/** A span that could not be converted, kept verbatim in a `<!-- rhema:unconverted -->` block. */
export const unconvertedBlockSchema = z
  .object({
    /** The `blockId` of the emitted `<!-- rhema:unconverted -->` block in the markdown. */
    blockId: z.string().min(1),
    /** The verbatim source text preserved inside the block. */
    raw: z.string(),
    /** Why it could not be converted. */
    reason: z.string().min(1),
  })
  .strict();
export type UnconvertedBlock = z.infer<typeof unconvertedBlockSchema>;

/** The §5.3 count line, structured (rendered as "7,900 words · 41 footnotes · 23 citation-like spans · …"). */
export const conversionCountsSchema = z
  .object({
    words: z.number().int().nonnegative(),
    footnotes: z.number().int().nonnegative(),
    citationSpans: z.number().int().nonnegative(),
    tables: z.number().int().nonnegative(),
    figures: z.number().int().nonnegative(),
  })
  .strict();
export type ConversionCounts = z.infer<typeof conversionCountsSchema>;

/** The full conversion result the preview + draft-create consume. */
export const conversionResultSchema = z
  .object({
    sourceFormat: convertSourceFormatSchema,
    /** The canonical (normalized) Rhema Markdown body — idempotent on a second normalize pass (REQ-DATA-9d). */
    markdown: z.string(),
    /**
     * ONB.1 — the document's own title, extracted when the converted body's FIRST block is an H1
     * (§9.5's "title lives in front-matter, never a body heading"). The H1 is REMOVED from the body —
     * it must not reappear as a demoted H2. The project-create paths use it as the title default
     * (an explicitly typed title still wins). Absent when the document leads with anything else.
     */
    title: z.string().min(1).optional(),
    counts: conversionCountsSchema,
    warnings: z.array(conversionWarningSchema),
    unconverted: z.array(unconvertedBlockSchema),
    quality: qualityVerdictSchema,
    qualityNotes: z.array(z.string()),
  })
  .strict();
export type ConversionResult = z.infer<typeof conversionResultSchema>;

/** The `<!-- rhema:unconverted -->` open/close markers (mirrors the `<!-- rhema:<kind> v1 -->` convention). */
export const UNCONVERTED_OPEN = "<!-- rhema:unconverted -->";
export const UNCONVERTED_CLOSE = "<!-- /rhema:unconverted -->";
