import { z } from "zod";

// Anchor — §11.3 verbatim (REQ-OBJ-16). The canonical anchor into a frozen version's canonical markdown:
// (blockId, quote, startOffset, endOffset, confidence). Yjs relative positions are derived projections
// (Finding.projections), never the anchor of record. EVERY anchor-bearing sidecar must reuse THIS schema
// verbatim — the structural-sidecar contract test asserts it, so the B3 argument-graph substrate stays
// joinable by one anchor type across findings, claims, and every structural sidecar.
//
//   interface Anchor { blockId: string; quote: string; startOffset: number; endOffset: number;
//                      confidence: number; unanchored?: true }

export const anchorSchema = z
  .object({
    blockId: z.string().min(1),
    quote: z.string(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    confidence: z.number().min(0).max(1),
    /** present and `true` only for an unanchored finding (heads the list under "Whole piece"). */
    unanchored: z.literal(true).optional(),
  })
  .strict();

export type Anchor = z.infer<typeof anchorSchema>;

/** The canonical JSON shape of `Anchor`, for the REQ-OBJ-16 "verbatim" assertion (drift breaks the test). */
export const ANCHOR_FIELD_SHAPE = {
  blockId: "string",
  quote: "string",
  startOffset: "number",
  endOffset: "number",
  confidence: "number",
  unanchored: "true?",
} as const;
