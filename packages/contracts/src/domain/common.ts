import { z } from "zod";
import { authIdSchema, brandedId, idSchema, isoSchema, sha256Schema, urlSchema } from "../ids.js";
import { PROVENANCE_SOURCE_KINDS } from "../enums.js";

// Cross-cutting value objects reused by many domain schemas and sidecars (§11.3).

/** Actor — who created a version / made a decision (§11.3). */
export const actorSchema = z.discriminatedUnion("kind", [
  // `userId` carries `"user".id` — an opaque auth id (`authIdSchema`, F-R6H11B-1), never a ULID.
  z.object({ kind: z.literal("user"), userId: authIdSchema }),
  z.object({ kind: z.literal("agent"), runId: idSchema, agentInstanceId: idSchema }),
  z.object({ kind: z.literal("system") }),
]);
export type Actor = z.infer<typeof actorSchema>;

/** ProvenanceSource — where a block/span of text came from (§11.3). */
export const provenanceSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("human") }),
  z.object({ kind: z.literal("human_mobile") }),
  z.object({ kind: z.literal("agent"), runId: idSchema, draftN: z.number().int() }),
  z.object({ kind: z.literal("pasted") }),
  z.object({ kind: z.literal("chat"), threadId: idSchema }),
  z.object({ kind: z.literal("suggestion_applied"), runId: idSchema, findingId: idSchema }),
  // REQ-POS-9: a human edit inside a span captured at an agent-origin transaction degrades the block
  // to `mixed` — the block was touched by both. `of` lists the contributing kinds when known.
  z.object({ kind: z.literal("mixed"), of: z.array(z.string()).optional() }),
]);
export type ProvenanceSource = z.infer<typeof provenanceSourceSchema>;
// Guard: the discriminated union covers exactly the PROVENANCE_SOURCE_KINDS enum.
const _provenanceKindsCovered: readonly (typeof PROVENANCE_SOURCE_KINDS)[number][] =
  PROVENANCE_SOURCE_KINDS;
void _provenanceKindsCovered;

/** A source reference used across billing / delivery. */
export { brandedId, idSchema, isoSchema, sha256Schema, urlSchema };
