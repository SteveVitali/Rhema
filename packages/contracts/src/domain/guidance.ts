import { z } from "zod";
import { idSchema, isoSchema } from "../ids.js";
import { workflowKeySchema } from "../enums.js";
import { anchorSchema } from "./anchor.js";

// Guidance (§6.5; REQ-GATE-9/10/11; ledger C19) — the ONLY human input the skills accept after launch, made an
// object. Standing guidance is project-scope, retirable (never deleted). Guidance is delivered at phase
// boundaries, its `consumedBy` records which run/phase consumed it, and it is NEVER delivered into an
// independence context (second read, fidelity audit, gap check — REQ-RUN-18). It never edits `agents/**`
// directly (REQ-GATE-11; REQ-RUN-7). This schema is the shared contract; the orchestrator owns capture/delivery.

/** Where a `Guidance` record came from (§6.5). MVP sources are run_sheet / gate_edit / gate_text / queued_message. */
export const GUIDANCE_SOURCES = [
  "run_sheet",
  "gate_edit",
  "gate_text",
  "inline_comment", //   1.x (batched inline comments)
  "queued_message", //   a note for the next phase (REQ-RUN-18)
  "chat_promote", //     promoted from an Assistant turn
  "interview", //        Interview-me
] as const;
export type GuidanceSource = (typeof GUIDANCE_SOURCES)[number];
export const guidanceSourceSchema = z.enum(GUIDANCE_SOURCES);

/** The `consumedBy` entry: which run/phase read this guidance (the UI links each record to its phase). */
export const guidanceConsumedBySchema = z.object({ runId: idSchema, phase: z.string() });
export type GuidanceConsumedBy = z.infer<typeof guidanceConsumedBySchema>;

/**
 * The §6.5 `Guidance` object. `scope:'project'` is standing guidance (listed and retirable in project settings;
 * `active:false` retires it, it is never deleted). `text` is what the skill receives verbatim; it is rendered
 * into the skill's `guidance` input as a dated, sourced list.
 */
export const guidanceSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  scope: z.enum(["run", "project"]),
  /** the workflows this guidance applies to; omitted = all workflows. */
  workflows: z.array(workflowKeySchema).optional(),
  /** run-scope guidance is bound to a run; project-scope (standing) guidance has no runId. */
  runId: idSchema.optional(),
  source: guidanceSourceSchema,
  text: z.string(),
  anchors: z.array(anchorSchema).optional(),
  createdBy: idSchema,
  createdAt: isoSchema,
  consumedBy: z.array(guidanceConsumedBySchema).optional(),
  /** standing guidance can be retired (active:false), never deleted (REQ-GATE-10). */
  active: z.boolean(),
});
export type Guidance = z.infer<typeof guidanceSchema>;
