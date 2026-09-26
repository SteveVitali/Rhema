import { z } from "zod";
import { idSchema, isoSchema, urlSchema } from "../ids.js";
import { reasonCodeSchema } from "../analytics.js";
import {
  claimVerdictSchema,
  dispositionKindSchema,
  dispositionStatusSchema,
  findingKindSchema,
  rubricDimensionSchema,
  severitySchema,
} from "../enums.js";
import { anchorSchema } from "./anchor.js";
import { actorSchema } from "./common.js";

// Finding + Disposition (§5.7, §11.3). §5.7's FindingView is the IDE read model; these are the canonical
// row shapes the `findings.json` sidecar and the DB carry.

export const FINDING_ORIGIN = z.enum(["editor", "second_read", "both"]);
export const FINDING_RECONCILIATION = z.enum(["kept", "rejected"]);
export const LETTER_SECTIONS = z.enum([
  "one_thing",
  "major",
  "strength",
  "roadmap",
  "considered_rejected",
]);

/** A projection of a finding's anchor onto a later draft (§5.7; Yjs rel positions optional). */
export const findingProjectionSchema = z.object({
  draftId: idSchema,
  anchor: anchorSchema,
  relStart: z.string().optional(),
  relEnd: z.string().optional(),
});

export const findingEvidenceSchema = z.object({
  claimId: idSchema.optional(),
  verdict: claimVerdictSchema.optional(),
  urls: z.array(z.object({ url: urlSchema, accessed: isoSchema })),
});

export const findingSchema = z.object({
  id: idSchema,
  correspondenceId: idSchema,
  draftId: idSchema,
  ordinal: z.number().int().nonnegative(),
  kind: findingKindSchema,
  severity: severitySchema,
  origin: FINDING_ORIGIN,
  reconciliation: FINDING_RECONCILIATION.optional(),
  anchor: anchorSchema.nullable(),
  title: z.string(),
  body: z.string().max(4096, "finding body ≤ 4 kB (§11.1)"),
  evidence: findingEvidenceSchema.optional(),
  suggestion: z.object({ replacement: z.string() }).optional(),
  rubricDims: z.array(rubricDimensionSchema),
  letterSection: LETTER_SECTIONS.optional(),
  projections: z.array(findingProjectionSchema).default([]),
  /** a re-review's finding may declare the open obligation it carries (lineage matcher 2 — REQ-OBJ-4/§11.7). */
  carriesObligationId: idSchema.optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const dispositionSchema = z.object({
  id: idSchema,
  findingId: idSchema,
  responseId: idSchema.optional(),
  kind: dispositionKindSchema,
  status: dispositionStatusSchema,
  rationale: z.string().optional(),
  adaptedText: z.string().optional(),
  /** REQ-BETA-6 — the one-tap reason chip (telemetry; never required). */
  reasonCode: reasonCodeSchema.optional(),
  moveOrdinal: z.number().int().optional(),
  /** the free Apply verb (REQ-SPEC-6). */
  applied: z.boolean().optional(),
  by: actorSchema,
  frozenAt: isoSchema.optional(),
});
export type Disposition = z.infer<typeof dispositionSchema>;
