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
  // P1.16 §14.6 — the rate table moved while the run was parked: the cap delta waits on a confirm_cost
  // gate instead of resuming under a stale price. Credits + the gate id only (no token figures).
  "run.repriced": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      deltaCredits: z.number().int(),
      newEstimateCredits: z.number().int(),
      newCapCredits: z.number().int(),
      gateId: idSchema,
    }),
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
  // PRB.09 (D-P0.10-1): a deadline reminder fired — carries the do-nothing outcome + the offset that fired
  // (the deep link derives from the run id). ids + template-safe fields only.
  "gate.reminder": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      kind: gateKindSchema,
      offsetMinutes: z.number().int(),
      action: z.string(), // the do-nothing outcome (on_expiry)
      deadlineAt: isoSchema.nullable().optional(),
    }),
  },
  // research (verbose, requester only) — the query is the agent's question, not our instruction
  "search.performed": {
    visibility: "user",
    density: "verbose",
    payload: z.object({
      query: boundedText,
      // `null` = the search ran but its result-set size was never observed in the mapped stream.
      // The proxy-injected SERVER `web_search` is the only search path (P0.15i dropped the client
      // tool), and its results arrive inline as `web_search_tool_result` blocks — never as a
      // `tool_result` the mapper can count (RES.3). Fabricating `0` there made Leg-1a
      // (`01M48VNKY6F263TCQRVBJ8JRQA`) read as "searches returned nothing" when billing shows 17
      // executed + billed; a REAL empty result set still reports `0`.
      resultCount: z.number().int().nullable(),
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
    // RPT.1 — `provisional` marks a mid-phase meter reading (Σ proxy-metered usage before the step's
    // committed figure lands). Omitted/false on the completion-time tick, which reflects committed
    // credits. REQ-SPEC-32(a): the card's meter labels the provisional figure differently.
    payload: z.object({ spentCredits: z.number().int(), capCredits: z.number().int(), provisional: z.boolean().optional() }),
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
  // RES.2 (REQ-SPEC-31(3)) — a zero-coverage Review delivered Unverified: the run-level label persisted,
  // the platform-fault refund follows as `cost.refunded`. Counts only — never claim text.
  "run.unverified": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      checkableClaims: z.number().int(),
      coveredClaims: z.number().int(),
    }),
  },
  // CITE.1 (REQ-VIS-9) — the measured citation-completeness record the mirror computed at delivery:
  // post-backfill counts + ids only (normalized urls are identifiers, never prose). `backfillResolved`
  // counts cited urls rescued by mechanism-A backfill traffic (ADR-085).
  "run.citation_completeness": {
    visibility: "internal",
    density: "verbose",
    payload: z.object({
      cited: z.number().int(),
      covered: z.number().int(),
      missed: z.number().int(),
      stripped: z.number().int(),
      backfillRan: z.boolean(),
      backfillResolved: z.number().int(),
      searchCovered: z.number().int(),
      missedUrls: z.array(boundedText),
    }),
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
  // P1.11 (§7.1/REQ-CHAT-10) — the per-turn plan card: the budgets + tier the turn was consented under
  // (the card IS the consent — ids + counts only, never the message text).
  "chat.plan_card": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      threadId: idSchema,
      capCredits: z.number().int(),
      searches: z.number().int(),
      fetches: z.number().int(),
      modelTier: z.string(),
    }),
  },
  // P1.11 (§7.1/REQ-CHAT-10) — a per-turn cap tripped: the turn pauses with the over-cap card (never
  // silently proceeds). Emitted from METERED usage (the metered-rows check), not model text.
  "chat.over_cap": {
    visibility: "user",
    density: "summary",
    payload: z.object({
      threadId: idSchema,
      axis: z.enum(["credits", "searches", "fetches"]),
      used: z.number().int(),
      budget: z.number().int(),
    }),
  },
  // P1.11 (§7.1/REQ-CHAT-4) — a durable chat source note was written under agents/assistant/research/.
  "chat.source_saved": {
    visibility: "user",
    density: "normal",
    payload: z.object({ threadId: idSchema.optional(), notePath: boundedText }),
  },
  // P1.12 (§7.3/REQ-CHAT-18) — the Approve-outline gate resolved + its consequences landed inside the
  // finalize: the outline artifact (id + head version) and the count of source notes copied to
  // agents/author/research/. Ids + counts only — never outline text.
  "outline.approved": {
    visibility: "user",
    density: "normal",
    payload: z.object({
      slug: boundedText,
      artifactId: idSchema,
      versionId: idSchema.optional(),
      copiedNotes: z.number().int(),
      threadId: idSchema.optional(),
      scope: boundedText.optional(),
    }),
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
