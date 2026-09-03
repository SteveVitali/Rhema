import { z } from "zod";
import { idSchema, isoSchema } from "../ids.js";
import {
  findingKindSchema,
  obligationSourceSchema,
  obligationStateSchema,
  severitySchema,
  OBLIGATION_RELATIONS,
} from "../enums.js";
import { actorSchema } from "./common.js";

// Revision obligations (§11.7; REQ-OBJ-1). The ONE deliberate mutable exception to "correspondence is
// immutable": the row's `state` is a cache of the last append-only obligation_transition (a DB trigger
// keeps them equal). Obligations add no ArtifactKind (REQ-OBJ-7).

export const deferHorizonSchema = z.object({
  rounds: z.number().int().positive().optional(),
  until: z.enum(["next_review", "pre_export"]).optional(),
});

export const dischargedBySchema = z.object({
  dispositionId: idSchema.optional(),
  moveOrdinal: z.number().int().optional(),
  draftId: idSchema,
  verifiedBy: z.enum(["gap_check", "re_review", "user"]),
});

export const revisionObligationSchema = z
  .object({
    id: idSchema,
    projectId: idSchema,
    source: obligationSourceSchema,
    findingId: idSchema.optional(), // root finding; null for agenda/user rows
    severity: severitySchema, // max over the lineage set
    kind: findingKindSchema.optional(),
    title: z.string(),
    state: obligationStateSchema,
    stateSince: isoSchema,
    openedOnDraftId: idSchema,
    rationale: z.string().optional(), // rebut/defer rationale, DB-enforced non-null for those states
    deferHorizon: deferHorizonSchema.optional(),
    roundsOpen: z.number().int().nonnegative(),
    dischargedBy: dischargedBySchema.optional(),
    createdBy: actorSchema,
    createdAt: isoSchema,
    closedAt: isoSchema.optional(),
  })
  .refine((o) => !(o.state === "rebutted" || o.state === "deferred") || !!o.rationale, {
    message: "rebutted/deferred obligations require a rationale (§11.7; DB check)",
    path: ["rationale"],
  });
export type RevisionObligation = z.infer<typeof revisionObligationSchema>;

/** Lineage edge: which findings, across rounds, are the same debt (REQ-OBJ-4). */
export const obligationFindingSchema = z.object({
  obligationId: idSchema,
  findingId: idSchema,
  correspondenceId: idSchema,
  relation: z.enum(OBLIGATION_RELATIONS),
});
export type ObligationFinding = z.infer<typeof obligationFindingSchema>;

/** Append-only transition; the truth the row's state caches (§11.7). */
export const obligationTransitionSchema = z.object({
  id: idSchema,
  obligationId: idSchema,
  fromState: obligationStateSchema.nullable(),
  toState: obligationStateSchema,
  cause: z.string(),
  byActor: actorSchema,
  runId: idSchema.optional(),
  dispositionId: idSchema.optional(),
  findingId: idSchema.optional(),
  at: isoSchema,
});
export type ObligationTransition = z.infer<typeof obligationTransitionSchema>;
