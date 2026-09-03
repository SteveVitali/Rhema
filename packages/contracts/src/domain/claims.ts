import { z } from "zod";
import { idSchema, isoSchema, urlSchema } from "../ids.js";
import {
  CLAIM_KINDS,
  CLAIM_SOURCE_CHECKS,
  CLAIM_SOURCE_STANCES,
  claimVerdictSchema,
} from "../enums.js";
import { anchorSchema } from "./anchor.js";

// Claim + claim-source stance edges (§11.3; REQ-OBJ-17/18/19). The claim ledger's rows come from the
// `01-claim-ledger.json` sidecar; the singular `url` remains (= sources[0] of the verdict-determining
// stance) so existing surfaces render unchanged, while `sources[]` carries the full multi-source evidence.

/** A per-source stance edge (REQ-OBJ-18); rows in `claim_sources`, not jsonb, so cited⇒fetched stays mechanical. */
export const claimSourceSchema = z.object({
  url: urlSchema,
  normalizedUrl: z.string().min(1),
  accessedAt: isoSchema,
  stance: z.enum(CLAIM_SOURCE_STANCES),
  note: z.string().optional(),
});
export type ClaimSource = z.infer<typeof claimSourceSchema>;

export const claimSchema = z.object({
  id: idSchema,
  correspondenceId: idSchema,
  draftId: idSchema,
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  verdict: claimVerdictSchema,
  url: urlSchema.optional(),
  normalizedUrl: z.string().optional(),
  accessedAt: isoSchema.optional(),
  note: z.string().optional(),
  /** REQ-OBJ-19: Quick's cap spends only on checkable kinds; non-checkable render "not a matter of verification". */
  kind: z.enum(CLAIM_KINDS).optional(),
  sources: z.array(claimSourceSchema).optional(),
  sourceCheck: z.enum(CLAIM_SOURCE_CHECKS).optional(),
  anchor: anchorSchema.optional(),
  humanAdded: z.boolean(),
  figureId: idSchema.optional(),
  /** genre ledger columns (REQ-GENRE-7). */
  extra: z.record(z.string(), z.unknown()).optional(),
});
export type Claim = z.infer<typeof claimSchema>;
