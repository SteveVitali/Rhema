import { z } from "zod";
import { authIdSchema, idSchema } from "./ids.js";
import { dispositionKindSchema, gateKindSchema } from "./enums.js";
import { rigorSchema } from "./vocab.js";

// The analytics event catalogue (design/9 §7.2, adopted by reference §0.1) with spec §3.5's additions and
// the standard envelope, plus the REQ-BETA-6…12 event shapes. This is the ONE schema set every later emitter
// (PRB.03/05/06/08/12) consumes; none authors its own. Distinct from the §12.5 run-event stream (events.ts):
// analytics is product telemetry, and every event honors the per-account opt-out (REQ-PROD-15).

/** The standard envelope on every analytics event (design/9 §7.2). `user_id` is an opaque auth id
 *  (`authIdSchema`, F-R6H11B-1) — never a ULID; Better Auth mints non-ULID ids on its own create paths. */
export const analyticsEnvelopeSchema = z.object({
  user_id: authIdSchema,
  workspace_id: idSchema,
  project_id: idSchema.optional(),
  run_id: idSchema.optional(),
  protocol_id: idSchema.optional(),
  tier: z.string(),
  surface: z.enum(["web", "mobile"]),
});
export type AnalyticsEnvelope = z.infer<typeof analyticsEnvelopeSchema>;

/** Run events carry cost + rigor so estimate accuracy and margin roll up without joins (REQ-PROD-15). */
export const runEconomicsSchema = z.object({
  cost_actual: z.number().optional(),
  cost_estimate: z.number().optional(),
  rigor: rigorSchema.optional(),
});

/** The one-tap reason code on every disposition (REQ-BETA-6); never required text. */
export const REASON_CODES = [
  "wrong",
  "stylistic_disagreement",
  "already_knew",
  "too_costly",
  "not_this_round",
  "other",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];
export const reasonCodeSchema = z.enum(REASON_CODES);

// The catalogue: analytics name → payload schema (the envelope is merged in by `analyticsEventSchema`).
export const ANALYTICS_EVENTS = {
  // acquisition / onboarding
  "landing.viewed": z.object({}),
  "landing.dropzone_used": z.object({}),
  "signup.completed": z.object({ method: z.string() }),
  "email.verified": z.object({ trigger: z.string() }),
  "showcase.opened": z.object({}),
  "showcase.finding_anchor_viewed": z.object({}), // activation
  "entry.chosen": z.object({ entry: z.enum(["scratch", "outline", "draft"]) }),
  // projects
  "project.created": z.object({
    protocol: z.string(),
    venue: z.string().optional(),
    voice: z.boolean().optional(),
  }),
  "project.protocol_changed": z.object({}),
  "project.voice_linked": z.object({}),
  "project.forked": z.object({ reason: z.string() }),
  "project.accepted": z.object({ version: z.number().int() }),
  "project.exported": z.object({ format: z.string() }),
  "project.archived": z.object({}),
  // runs (§3.5: run.estimated fires from the stateless estimate endpoint)
  "run.estimated": z.object({
    kind: z.string(),
    rigor: rigorSchema,
    estimate: z.number(),
    cap: z.number(),
    levers_shown: z.boolean().optional(),
    cost_actual: z.number().optional(),
    cost_estimate: z.number().optional(),
  }),
  "run.lever_changed": runEconomicsSchema.extend({ lever: z.string(), delta: z.number() }),
  "run.launched": z.object({
    kind: z.string(),
    rigor: rigorSchema,
    estimate: z.number(),
    cost_actual: z.number().optional(),
    cost_estimate: z.number().optional(),
  }),
  "run.phase_started": runEconomicsSchema.extend({ phase: z.string() }),
  "run.phase_finished": runEconomicsSchema.extend({
    phase: z.string(),
    duration: z.number().optional(),
    cost: z.number().optional(),
  }),
  "run.approval_opened": runEconomicsSchema.extend({ approval: gateKindSchema }),
  "run.approval_decided": runEconomicsSchema.extend({
    decision: z.string(),
    latency: z.number().optional(),
    auto_proceeded: z.boolean().optional(),
  }),
  "run.stopped": runEconomicsSchema.extend({ phase: z.string(), partials_kept: z.boolean().optional() }),
  "run.completed": runEconomicsSchema.extend({
    cap_hit: z.boolean().optional(),
    verdict: z.string().optional(),
  }),
  "run.failed": runEconomicsSchema.extend({ stage: z.string(), refunded: z.boolean() }),
  // RES.2 (REQ-SPEC-31(3)) — an Unverified delivery: its own event so success cohorts stay clean
  // (`run.completed` is never emitted for it — isSuccessfulDelivery is the shared predicate).
  "run.unverified": runEconomicsSchema.extend({
    checkable_claims: z.number().int().optional(),
    covered_claims: z.number().int().optional(),
    refunded: z.boolean().optional(),
  }),
  "run.report_viewed": runEconomicsSchema.extend({}),
  // §3.5 additions
  "finding.applied": z.object({ severity: z.string() }), // the free Apply verb (§5.7)
  "triage.mode_entered": z.object({}),
  "gate.presence_timer_shown": z.object({ kind: gateKindSchema }),
  "trial.entitlement_consumed": z.object({}),
  // findings / dispositions (REQ-BETA-6: disposition carries a reason_code)
  "finding.viewed": z.object({ phase_of_origin: z.string().optional(), severity: z.string() }),
  "finding.disposed": z.object({
    disposition: dispositionKindSchema,
    reason_code: reasonCodeSchema.optional(),
  }),
  "findings.bulk_previewed": z.object({}),
  "findings.bulk_applied": z.object({ count: z.number().int() }),
  "letter.rated": z.object({ rating: z.enum(["up", "down"]) }),
  "secondread.opened": z.object({}),
  // loop
  "rounds.started": z.object({
    criterion: z.string(),
    max_rounds: z.number().int(),
    budget: z.number(),
    autonomy: z.string(),
  }),
  "rounds.round_completed": z.object({ k: z.number().int(), verdict: z.string().optional() }),
  "rounds.stalled": z.object({}),
  "rounds.converged": z.object({ criterion_met: z.boolean() }),
  // voice
  "voice.created": z.object({ tier: z.enum(["quick", "full"]), samples: z.number().int() }),
  "voice.built": z.object({ calibration_status: z.string() }),
  "voice.staleness_shown": z.object({ state: z.string() }),
  "voice.refreshed": z.object({ delta_pieces: z.number().int() }),
  // billing
  "credits.granted": z.object({ source: z.string() }),
  "estimate.consent_shown": z.object({}),
  "estimate.consent_accepted": z.object({}),
  "estimate.consent_declined": z.object({}),
  "paywall.shown": z.object({ location: z.string() }),
  "plan.upgraded": z.object({ from: z.string(), to: z.string() }),
  "topup.purchased": z.object({}),
  "refund.issued": z.object({ reason: z.string() }),
  // editor
  "draft.edited": z.object({
    version: z.number().int(),
    reviewed: z.boolean(),
    forked: z.boolean(),
  }),
  "figure.proposed": z.object({}),
  "citation.imported": z.object({ format: z.string() }),

  // ---- REQ-BETA-7…12 (Q-22 ratified) ----
  "revision.move_traced": z.object({
    finding_id: idSchema,
    move_id: idSchema,
    hunk_count: z.number().int(),
    chars_changed: z.number().int(),
  }),
  "rereview.lineage": z.object({
    carried: z.number().int(),
    closed: z.number().int(),
    new: z.number().int(),
    reopened: z.number().int(),
  }),
  "round.completed": z.object({
    ordinal: z.number().int(),
    manuscript_id: idSchema,
    important: z.boolean(),
  }),
  "surface.dwell": z.object({ surface: z.string(), ms: z.number().int() }),
  "draft.imported": z.object({
    origin: z.string(),
    is_new_manuscript: z.boolean(),
    venue_set: z.boolean(),
  }),
  "wtp.recorded": z.object({ source: z.string(), amount: z.number() }),
  "credits.exhausted_prompt": z.object({ action_taken: z.string() }),
  // P1.11 — the Assistant activation funnel (REQ-CHAT-30's instrumentation half): a turn completed
  // (with its budget posture), the plan card shown/decided (the card IS the consent), and the
  // scratch-path empty state rendering (the four chips + next-step card surface).
  "chat.turn_completed": z.object({
    over_cap: z.boolean().optional(),
    searches: z.number().int().optional(),
    fetches: z.number().int().optional(),
  }),
  "chat.plan_card_shown": z.object({}),
  "chat.plan_card_decided": z.object({
    action: z.enum(["run", "first_step", "edit", "cancel"]),
  }),
  "chat.empty_state_shown": z.object({}),
  // P1.17 — REQ-CHAT-30's scratch-cohort activation event: the outline-approval gate (the scratch
  // onboarding path's first gate) resolved approve. Server-owned — emitted at the gate-decision seam.
  "outline.approved": z.object({}),

  // ---- 223 R7DEM.6b (REQ-TOUR-9; ADR-126) — the anonymous demo funnel ----
  // Registered for the catalogue + emission audit ONLY. Their envelope differs from every
  // other event: these NEVER ride `recordAnalyticsEvent`/`analytics_events` (the user/
  // workspace envelope cannot apply — the demo has no principal). They are anonymous rows in
  // `demo_events`, written only through `rhema_demo_event_insert` behind `POST /a/demo` →
  // `POST /analytics/demo`. Payload = the bounded {essay slug, tour step, ?src=} fields.
  "demo.hub_viewed": z.object({}),
  "demo.tour_started": z.object({}),
  "demo.tour_completed_or_cta": z.object({}),
} as const;

export type AnalyticsEventName = keyof typeof ANALYTICS_EVENTS;
export const ANALYTICS_EVENT_NAMES = Object.keys(ANALYTICS_EVENTS) as AnalyticsEventName[];

/** The full event schema (envelope + name + typed payload) for a given analytics event. */
export function analyticsEventSchema<K extends AnalyticsEventName>(name: K) {
  return analyticsEnvelopeSchema.extend({
    event: z.literal(name),
    props: ANALYTICS_EVENTS[name],
  });
}

/** Validate an analytics event by name; throws on unknown name or bad payload. */
export function parseAnalyticsEvent(name: string, envelope: unknown, props: unknown) {
  if (!(name in ANALYTICS_EVENTS)) throw new Error(`unknown analytics event: ${name}`);
  const n = name as AnalyticsEventName;
  const env = analyticsEnvelopeSchema.parse(envelope);
  const p = ANALYTICS_EVENTS[n].parse(props);
  return { event: n, ...env, props: p };
}

/**
 * The events a session-authed CLIENT may mint via `POST /analytics/events` (PRB.12): only
 * view/dwell/timer signals the server cannot observe itself. Server-owned facts (run lifecycle,
 * billing, ledger, imports/exports) are emitted api-side or materialized by the pipeline —
 * never trusting a client to attest them keeps spend events forgery-proof.
 */
export const CLIENT_ANALYTICS_EVENTS = [
  "surface.dwell",
  "letter.rated",
  "secondread.opened",
  "finding.viewed",
  "run.report_viewed",
  "gate.presence_timer_shown",
  "voice.staleness_shown", // the staleness banner's render — a view signal only the client sees
  // P1.17 — §3.5's "saw the Showcase anchor <60 s" signal: only the client observes the scroll.
  "showcase.finding_anchor_viewed",
] as const satisfies readonly AnalyticsEventName[];
export type ClientAnalyticsEventName = (typeof CLIENT_ANALYTICS_EVENTS)[number];
export const CLIENT_ANALYTICS_EVENT_NAMES: ReadonlySet<string> = new Set(CLIENT_ANALYTICS_EVENTS);

/**
 * The pre-registered REQ-BETA-18 gate registry (verbatim values, one row per registered
 * threshold). The weekly dashboard renders every metric beside its row here — the readout is
 * mechanical: observed vs threshold, never vibes. `direction` is the comparison the gate makes:
 * "floor" passes when observed ≥ value, "ceiling" when observed ≤ value, "exact" when equal.
 */
export interface BetaGateThreshold {
  readonly value: number;
  readonly direction: "floor" | "ceiling" | "exact";
  /** which REQ-BETA-18 clause registers it. */
  readonly clause: "proceed" | "stop";
  /** the gate language printed beside the metric (verbatim REQ-BETA-18). */
  readonly label: string;
}
export const BETA_GATE_THRESHOLDS = {
  repeatCycleRate: {
    value: 0.5,
    direction: "floor",
    clause: "proceed",
    label: "≥50% run a manuscript through ≥2 full rounds unprompted",
  },
  acceptAdaptShare: {
    value: 0.55,
    direction: "floor",
    clause: "proceed",
    label: "≥55% of dispositions are accept+adapt",
  },
  secondManuscriptImport: {
    value: 0.6,
    direction: "floor",
    clause: "proceed",
    label: "≥60% import a second manuscript",
  },
  paidConversion: {
    value: 0.4,
    direction: "floor",
    clause: "proceed",
    label: "≥40% convert to paid",
  },
  round2Rate: {
    value: 0.2,
    direction: "floor",
    clause: "stop",
    label: "stop if fewer than 20% take a manuscript past one round",
  },
  medianStatedWtp: {
    value: 20,
    direction: "floor",
    clause: "stop",
    label: "stop if stated WTP medians below $20",
  },
  autoProceedShare: {
    value: 0.4,
    direction: "ceiling",
    clause: "stop",
    label: "stop if >40% of gates auto-proceed",
  },
  cancelRate: {
    value: 0.08,
    direction: "ceiling",
    clause: "stop",
    label: "stop if cancel rate exceeds 8%",
  },
  boundaryAttestationFailures: {
    value: 0,
    direction: "exact",
    clause: "stop",
    label: "boundary-attestation failures must be zero",
  },
} as const satisfies Record<string, BetaGateThreshold>;
export type BetaGateMetric = keyof typeof BETA_GATE_THRESHOLDS;
