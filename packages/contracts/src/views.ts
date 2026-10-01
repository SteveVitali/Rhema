import { z } from "zod";
import { idSchema, isoSchema, urlSchema } from "./ids.js";
import {
  claimVerdictSchema,
  dispositionKindSchema,
  findingKindSchema,
  gateKindSchema,
  rubricDimensionExtendedSchema,
  severitySchema,
} from "./enums.js";
import { anchorSchema } from "./domain/anchor.js";
import { actorSchema } from "./domain/common.js";
import { FINDING_ORIGIN, FINDING_RECONCILIATION, LETTER_SECTIONS } from "./domain/findings.js";
import { reasonCodeSchema } from "./analytics.js";

// Read models the beta's phone-width-shared surfaces consume (§5.7 FindingView, §10.5 GateView). The full
// mobile-facing contract family (InboxItem, DocumentView, DispositionInput, BlockPatch, NotificationDevice)
// is deferred to 1.x; only these two are in scope now, because the beta's phone-width web consumes them.

/** FindingView — the IDE read model (§5.7). Field names match §11.3's canonical Finding/Disposition. */
export const findingViewSchema = z.object({
  id: idSchema,
  correspondenceId: idSchema,
  draftId: idSchema,
  kind: findingKindSchema,
  severity: severitySchema,
  origin: FINDING_ORIGIN,
  reconciliation: FINDING_RECONCILIATION.optional(),
  anchor: anchorSchema.nullable(),
  projection: anchorSchema.optional(),
  title: z.string(),
  body: z.string(),
  // HOT.1 — same relaxation as findingEvidenceSchema: `urls` is always present (post-normalization),
  // `accessed` is optional because legacy rows carry no stamp.
  evidence: z
    .object({
      claimId: idSchema.optional(),
      verdict: claimVerdictSchema.optional(),
      urls: z.array(z.object({ url: urlSchema, accessed: isoSchema.optional() })),
    })
    .optional(),
  suggestion: z.object({ replacement: z.string() }).optional(),
  rubricDims: z.array(rubricDimensionExtendedSchema),
  letterSection: LETTER_SECTIONS.optional(),
  provisional: z.boolean(),
  disposition: z
    .object({
      kind: dispositionKindSchema,
      rationale: z.string().optional(),
      /** PRB.05 — the adapt suggestion text the human left on the row. */
      adaptedText: z.string().optional(),
      by: actorSchema,
      at: isoSchema,
      moveId: idSchema.optional(),
      frozen: z.boolean(),
      applied: z.boolean().optional(),
      /** REQ-BETA-6 — the one-tap reason chip the human picked (optional). */
      reasonCode: reasonCodeSchema.optional(),
    })
    .optional(),
});
export type FindingView = z.infer<typeof findingViewSchema>;

/** GateView — the approval read model (§10.5; design/7 §8 with §11.3 renames). */
export const gateViewSchema = z.object({
  id: idSchema,
  runId: idSchema,
  kind: gateKindSchema,
  artifactVersionId: idSchema.optional(),
  openedAt: isoSchema,
  deadlineAt: isoSchema.nullable().optional(),
  /** false only for the informational scope card (§6.4). */
  blocking: z.boolean(),
  /** the 10-minute auto-proceed countdown while the user is present and not reading the artifact (REQ-SPEC-18). */
  presenceTimer: z.object({ deadlineAt: isoSchema, paused: z.boolean() }).optional(),
});
export type GateView = z.infer<typeof gateViewSchema>;
