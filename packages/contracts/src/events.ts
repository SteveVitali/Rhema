import { z } from "zod";
import { idSchema, isoSchema, urlSchema } from "./ids.js";
import {
  artifactKindSchema,
  claimVerdictSchema,
  findingKindSchema,
  gateKindSchema,
  severitySchema,
} from "./enums.js";

// Streaming run events and the visibility split (§12.5). A `user` event carries counts, ids, URLs, labels
// and template text — NEVER prompt text, skill text, private memory, raw page text, model thinking, or tool
// inputs other than URLs/paths. Payloads are typed per event with a whitelist validator (this file); no
// free-text field exceeds 280 chars except `artifact.written.summary` (≤600, model-written) — REQ-DATA-37.
// The SSE route streams only `visibility=user` rows and the mapper must never emit an internal type as user
// (REQ-ARCH-12); `isUserVisible()` / `INTERNAL_EVENT_TYPES` back the CI assertion.

/** Free-text bound for user events (REQ-DATA-37). */
export const boundedText = z.string().max(280, "user-event free text ≤ 280 chars (REQ-DATA-37)");
/** The one exception: `artifact.written.summary`, model-written from the artifact (≤600). */
export const summaryText = z
  .string()
  .max(600, "artifact.written.summary ≤ 600 chars (REQ-DATA-37)");

export type EventVisibility = "user" | "internal";
export type EventDensity = "summary" | "normal" | "verbose" | "internal";

interface EventDef {
  visibility: EventVisibility;
  density: EventDensity;
  payload: z.ZodTypeAny;
}

const checkSchema = z.object({
  name: boundedText,
  passed: z.boolean(),
  iteration: z.number().int().optional(),
});

// The catalogue (§12.5). Grouped as in the spec; `visibility: internal` on the final group.
export const RUN_EVENTS = {
  // run lifecycle
  "run.state_changed": {
    visibility: "user",
    density: "summary",
    payload: z.object({ from: z.string(), to: z.string(), reason: boundedText.optional() }),
  },
  "run.started": {
    visibility: "user",
    density: "summary",
    payload: z.object({ modelTier: z.string().optional(), phase: z.string().optional() }),
  },
  "run.resumed": {
    visibility: "user",
    density: "summary",
    payload: z.object({ resumeFrom: boundedText.optional() }),
  },
  "run.hiccup": {
    visibility: "user",
    density: "summary",
    payload: z.object({ reason: boundedText.optional() }),
  },
  // steps
  "step.started": {
    visibility: "user",
    density: "summary",
    payload: z.object({ phase: z.string(), ordinal: z.number().int(), of: z.number().int() }),
  },
  "step.finished": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      phase: z.string(),
      ordinal: z.number().int(),
      of: z.number().int(),
      credits: z.number().int().optional(),
      durationMs: z.number().int().optional(),
      checks: z.array(checkSchema).optional(),
    }),
  },
  "phase.skipped": {
    visibility: "user",
    density: "summary",
    payload: z.object({ phase: z.string(), ordinal: z.number().int() }),
  },
  // gates
  "gate.opened": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      kind: gateKindSchema,
      artifactVersionId: idSchema.optional(),
      deadlineAt: isoSchema.nullable().optional(),
    }),
  },
  "gate.resolved": {
    visibility: "user",
    density: "summary",
    payload: z.object({ action: z.string(), by: z.string() }),
  },
  "gate.expired": {
    visibility: "user",
    density: "summary",
    payload: z.object({ kind: gateKindSchema, action: z.string() }),
  },
  // research (verbose, requester only) — the query is the agent's question, not our instruction
  "search.performed": {
    visibility: "user",
    density: "verbose",
    payload: z.object({
      query: boundedText,
      resultCount: z.number().int(),
      agentLabel: boundedText,
    }),
  },
  // sources — url comes from the tool RESULT, not the model's request (REQ-ARCH-15)
  "source.read": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      url: urlSchema,
      title: boundedText.optional(),
      status: z.number().int().optional(),
      bytes: z.number().int().optional(),
      agentLabel: boundedText,
    }),
  },
  "source.denied": {
    visibility: "user",
    density: "normal",
    payload: z.object({ urlDomain: boundedText, reason: boundedText }),
  },
  // claims
  "claim.checked": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      claimOrdinal: z.number().int(),
      verdict: claimVerdictSchema,
      url: urlSchema.optional(),
    }),
  },
  "claim.progress": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      checked: z.number().int(),
      of: z.number().int(),
      verified: z.number().int(),
    }),
  },
  // findings
  "finding.emitted": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      findingOrdinal: z.number().int(),
      kind: findingKindSchema,
      severity: severitySchema,
      anchorHash: z.string().optional(),
    }),
  },
  "section.drafted": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      sectionRef: boundedText,
      words: z.number().int(),
      budget: z.number().int().optional(),
    }),
  },
  // artifacts — H-kind writes emit `{kind:'private', namespace}` counts only
  "artifact.written": {
    visibility: "user",
    density: "normal",
    payload: z.union([
      z.object({
        kind: artifactKindSchema,
        mirrorPath: boundedText,
        versionId: idSchema,
        words: z.number().int().optional(),
        summary: summaryText.optional(),
      }),
      z.object({ kind: z.literal("private"), namespace: boundedText }),
    ]),
  },
  // subagents
  "subagent.started": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      label: boundedText,
      inputs: z.enum(["explicit_files", "inherit"]),
      fileCount: z.number().int(),
      model: boundedText.optional(),
    }),
  },
  "subagent.finished": {
    visibility: "user",
    density: "normal",
    payload: z.object({ label: boundedText, fileCount: z.number().int() }),
  },
  // agent.note — template-generated ONLY (REQ-ARCH-14); text comes from notes.ts, never model/page content
  "agent.note": {
    visibility: "user",
    density: "normal",
    payload: z.object({ template: z.string(), text: boundedText }),
  },
  // boundary
  "boundary.denied": {
    visibility: "user",
    density: "normal",
    payload: z.object({ tool: boundedText, pathClass: boundedText }),
  },
  "boundary.attested": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      paths_touched_count: z.number().int(),
      by_top_level: z.record(z.string(), z.number().int()).optional(),
      denied_count: z.number().int(),
      violations: z.number().int(),
      subagents: z.number().int().optional(),
      fetches: z.number().int().optional(),
    }),
  },
  // usage/cost
  "usage.tick": {
    visibility: "user",
    density: "summary",
    payload: z.object({ spentCredits: z.number().int(), capCredits: z.number().int() }),
  },
  "cost.final": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      spentCredits: z.number().int(),
      capCredits: z.number().int(),
      byPhase: z.record(z.string(), z.number().int()).optional(),
    }),
  },
  // PRB.08: a run's refund back to available — failed/refused/cancelled runs and the parked-timeout sweep;
  // "reconcile_drift" is the nightly user-favourable silent refund (REQ-BILL-13). The run row renders it as
  // "refunded N credits; partial results kept".
  "cost.refunded": {
    visibility: "user",
    density: "summary",
    payload: z.object({ credits: z.number().int(), reason: boundedText }),
  },
  // misc summary
  "check.result": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      name: boundedText,
      passed: z.boolean(),
      iteration: z.number().int().optional(),
      of: z.number().int().optional(),
    }),
  },
  "context.compacted": {
    visibility: "user",
    density: "summary",
    payload: z.object({ count: z.number().int() }),
  },
  "run.report": {
    visibility: "user",
    density: "summary",
    payload: z.object({ reportVersionId: idSchema }),
  },
  "chat.turn.completed": {
    visibility: "user",
    density: "normal",
    payload: z.object({ threadId: idSchema }),
  },
  "guidance.captured": {
    visibility: "user",
    density: "normal",
    payload: z.object({ guidanceId: idSchema }),
  },
  "guidance.delivered": {
    visibility: "user",
    density: "normal",
    payload: z.object({ guidanceId: idSchema, phase: z.string() }),
  },
  "steer.paused": {
    visibility: "user",
    density: "normal",
    payload: z.object({ reason: boundedText.optional() }),
  },
  "steer.queued": {
    visibility: "user",
    density: "normal",
    payload: z.object({ guidanceId: idSchema }),
  },
  "figure.rendered": {
    visibility: "user",
    density: "normal",
    payload: z.object({ figureId: idSchema }),
  },
  "figure.proposed": {
    visibility: "user",
    density: "normal",
    payload: z.object({ figureId: idSchema }),
  },
  "figure.accepted": {
    visibility: "user",
    density: "normal",
    payload: z.object({ figureId: idSchema }),
  },
  // drafts — a human edit on a frozen head forked v(N+1) (PRB.07; REQ-DATA-24's timeline event; ids + n only)
  "draft.forked": {
    visibility: "user",
    density: "summary",
    payload: z.object({ draftId: idSchema, baseDraftId: idSchema, n: z.number().int() }),
  },
  // revision trace (PRB.06; REQ-BETA-7/8) — ids + counts only, never hunk text or ledger prose
  "revision.move_traced": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      correspondenceId: idSchema.optional(),
      draftId: idSchema.optional(),
      baseDraftId: idSchema.optional(),
      findingId: idSchema.optional(),
      moveId: boundedText.optional(),
      hunkCount: z.number().int(),
      charsChanged: z.number().int(),
    }),
  },
  "rereview.lineage": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      correspondenceId: idSchema,
      priorReviewId: idSchema.optional(),
      carried: z.number().int(),
      closed: z.number().int(),
      new: z.number().int(),
      reopened: z.number().int(),
    }),
  },
  // INTERNAL — full detail, never streamed to the client
  "tool.audit": {
    visibility: "internal",
    density: "internal",
    payload: z.record(z.string(), z.unknown()),
  },
  "search.result": {
    visibility: "internal",
    density: "internal",
    payload: z.record(z.string(), z.unknown()),
  },
  "engine.error": {
    visibility: "internal",
    density: "internal",
    payload: z.record(z.string(), z.unknown()),
  },
  "egress.denied": {
    visibility: "internal",
    density: "internal",
    payload: z.record(z.string(), z.unknown()),
  },
  "boundary.violation": {
    visibility: "internal",
    density: "internal",
    payload: z.record(z.string(), z.unknown()),
  },
} as const satisfies Record<string, EventDef>;

export type RunEventType = keyof typeof RUN_EVENTS;

export const RUN_EVENT_TYPES = Object.keys(RUN_EVENTS) as RunEventType[];
export const INTERNAL_EVENT_TYPES = RUN_EVENT_TYPES.filter(
  (t) => RUN_EVENTS[t].visibility === "internal",
);
export const USER_EVENT_TYPES = RUN_EVENT_TYPES.filter((t) => RUN_EVENTS[t].visibility === "user");

/** True when the event type is safe to stream over the SSE user route (REQ-ARCH-12). */
export function isUserVisible(type: RunEventType): boolean {
  return RUN_EVENTS[type].visibility === "user";
}

/** Validate an event payload against its type's whitelist schema; throws on an unknown type or bad payload. */
export function parseRunEvent(
  type: string,
  payload: unknown,
): { type: RunEventType; payload: unknown } {
  if (!(type in RUN_EVENTS)) throw new Error(`unknown run event type: ${type}`);
  const t = type as RunEventType;
  return { type: t, payload: RUN_EVENTS[t].payload.parse(payload) };
}
