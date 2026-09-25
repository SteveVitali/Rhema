// The beta emission audit (PRB.12 — the ticket's "emission audit" deliverable). One row per catalogued
// analytics event: where it is emitted (`emitted` — a live call-site; `materialized` — the pipeline's
// domain→stream projector), or why it cannot fire at beta (`beta_absent` — the documented exclusions,
// incl. the ticket's named pair: `triage.mode_entered` + `finding.applied`). The audit test
// (`emission-audit.test.ts`) holds this map honest: every catalogue name classified exactly once,
// every `emitted` row's file actually contains the event literal, every `beta_absent` row carries a
// reason.

import type { AnalyticsEventName } from "@rhema/contracts";

export type EmissionStatus = "emitted" | "materialized" | "beta_absent";

export interface EmissionAuditEntry {
  readonly status: EmissionStatus;
  /**
   * `emitted`: the repo-relative source file whose text contains the event literal (a scan asserts it).
   * `materialized`: the domain rows the projector reads.
   */
  readonly source?: string;
  /** `beta_absent`: why the event cannot fire on a beta surface. */
  readonly reason?: string;
}

const MAT = "materializeRunAnalytics (packages/ledger/src/beta-dashboard.ts)";
const WEB = "apps/web/src/server.ts";

/**
 * The catalogue → emission map. `emitted` entries name the file a repo-scan test greps for the event
 * literal; `materialized` entries name the projector's source rows; `beta_absent` entries carry the
 * reason the event cannot fire at beta (the absence is a finding, not a gap in this map).
 */
export const BETA_EMISSION_AUDIT: Record<AnalyticsEventName, EmissionAuditEntry> = {
  // ---- acquisition / onboarding (P1.17): the pre-auth pair lands in `acquisition_events` via
  // `POST /analytics/landing` (no session; the IP hashes for dedupe); the session-authed funnel
  // mints via `POST /analytics/acquisition` or the server-owned seams named below.
  "landing.viewed": { status: "emitted", source: "apps/api/src/analytics-routes.ts" },
  "landing.dropzone_used": { status: "emitted", source: "apps/api/src/analytics-routes.ts" },
  // PRB.13 (REQ-BETA-19 amended 2026-09-16): the signup surface exists now — `POST /signup` emits
  // `signup.completed{method}` on account creation (server-owned, opt-out-honoring).
  "signup.completed": { status: "emitted", source: "apps/api/src/signup.ts" },
  // P1.17 — the magic-link verification return lands at `/app?verified=1`; the web shell triggers it,
  // the durable mint is the api's session-bound acquisition channel (POST /analytics/acquisition —
  // analytics-routes.ts holds the funnel allowlist).
  "email.verified": { status: "emitted", source: "apps/api/src/analytics-routes.ts" },
  // P1.17 — the workspace's Showcase dossier emits `showcase.opened` on its FIRST dossier read
  // (the letter_opened_at stamp transition is the signal; dossier-routes.ts, server-owned).
  "showcase.opened": { status: "emitted", source: "apps/api/src/dossier-routes.ts" },
  // P1.17 — the <60 s funnel signal only the client observes: the dossier page's IntersectionObserver
  // posts the beacon once when the first finding's card scrolls into view (pages.tsx → /a/acq → the
  // api's acquisition mint; the event is ALSO on the client whitelist as a client-only signal).
  "showcase.finding_anchor_viewed": { status: "emitted", source: "apps/web/src/pages.tsx" },
  // P1.17 — the §5.3 three-entry project create emits `entry.chosen{entry}` server-side at
  // `POST /projects` (project-routes.ts); the funnel's cohort key.
  "entry.chosen": { status: "emitted", source: "apps/api/src/project-routes.ts" },
  // ---- projects
  "project.created": { status: "beta_absent", reason: "no project-creation surface at beta; projects are operator-seeded for invited partners" },
  "project.protocol_changed": { status: "beta_absent", reason: "no protocol picker at beta (the beta's protocol is fixed)" },
  "project.voice_linked": { status: "materialized", source: `${MAT}: projects.persona_locked_at` },
  "project.forked": { status: "beta_absent", reason: "no project fork control at beta (drafts fork on edit; project forking is full-product)" },
  "project.accepted": { status: "beta_absent", reason: "no 'accept project' surface at beta" },
  "project.exported": { status: "emitted", source: "apps/api/src/export-routes.ts" },
  "project.archived": { status: "beta_absent", reason: "no archive control at beta" },
  // ---- runs
  // the emitEstimated seam is invoked in estimate-routes.ts but the literal + sink binding live where the
  // seam is bound — server.ts's composition root.
  "run.estimated": { status: "emitted", source: "apps/api/src/server.ts" },
  "run.lever_changed": { status: "beta_absent", reason: "levers are inputs to a fresh estimate at beta — the sheet re-estimates; no persisted in-place lever change" },
  "run.launched": { status: "materialized", source: `${MAT}: runs` },
  "run.phase_started": { status: "materialized", source: `${MAT}: steps` },
  "run.phase_finished": { status: "materialized", source: `${MAT}: steps` },
  "run.approval_opened": { status: "materialized", source: `${MAT}: gates` },
  "run.approval_decided": { status: "materialized", source: `${MAT}: gates + decisions` },
  "run.stopped": { status: "materialized", source: `${MAT}: runs` },
  "run.completed": { status: "materialized", source: `${MAT}: runs` },
  "run.failed": { status: "materialized", source: `${MAT}: runs` },
  "run.report_viewed": { status: "emitted", source: WEB },
  // ---- §3.5 additions
  "finding.applied": { status: "beta_absent", reason: "the free Apply verb needs the §5.7 proposal card + full editor; the beta dossier records dispositions only (ticket's named exclusion)" },
  "triage.mode_entered": { status: "beta_absent", reason: "no triage mode at beta — the flat dossier shows the five verbs on every card, no ⌘⇧T queue (ticket's named exclusion)" },
  "gate.presence_timer_shown": { status: "emitted", source: WEB },
  "trial.entitlement_consumed": { status: "beta_absent", reason: "no trial pocket at beta — house credits only (REQ-BETA-14)" },
  // ---- findings / dispositions
  "finding.viewed": { status: "emitted", source: WEB },
  // the emitDisposed seam is invoked in triage-routes.ts but the literal + sink binding live at the
  // composition root — server.ts (D-PRB.05-1 leg b).
  "finding.disposed": { status: "emitted", source: "apps/api/src/server.ts" },
  "findings.bulk_previewed": { status: "beta_absent", reason: "no bulk disposition actions at beta (the one-preview bulk surface is full-product §5.7)" },
  "findings.bulk_applied": { status: "beta_absent", reason: "no bulk apply at beta" },
  "letter.rated": { status: "beta_absent", reason: "no letter rating control at beta (whitelisted for the client intake for when the control lands)" },
  "secondread.opened": { status: "emitted", source: WEB },
  // ---- loop (Run-rounds surface is 1.x — §6.5's multi-round UI)
  "rounds.started": { status: "beta_absent", reason: "the Run-rounds surface is 1.x" },
  "rounds.round_completed": { status: "beta_absent", reason: "the Run-rounds surface is 1.x" },
  "rounds.stalled": { status: "beta_absent", reason: "the Run-rounds surface is 1.x" },
  "rounds.converged": { status: "beta_absent", reason: "the Run-rounds surface is 1.x" },
  // ---- voice
  "voice.created": { status: "emitted", source: "apps/api/src/voice-routes.ts" },
  "voice.built": { status: "materialized", source: `${MAT}: persona_profiles` },
  "voice.staleness_shown": { status: "emitted", source: WEB },
  "voice.refreshed": { status: "materialized", source: `${MAT}: persona_profiles (prior-profile diff)` },
  // ---- billing
  "credits.granted": { status: "materialized", source: `${MAT}: credit_ledger kind='grant'` },
  "estimate.consent_shown": { status: "materialized", source: `${MAT}: gates kind='confirm_cost'` },
  "estimate.consent_accepted": { status: "materialized", source: `${MAT}: confirm_cost gate decisions` },
  "estimate.consent_declined": { status: "materialized", source: `${MAT}: confirm_cost gate decisions` },
  // P1.17 — the §14.2/14.3 plan paywall exists now: `paywall.shown{location}` emits at the run sheet's
  // gate-denied seam (the 402/403/429 response the sheet renders the paywall from).
  "paywall.shown": { status: "emitted", source: "apps/api/src/run-routes.ts" },
  "plan.upgraded": { status: "beta_absent", reason: "no plan tiers at beta (house credits; P1.16)" },
  "topup.purchased": { status: "emitted", source: "packages/ledger/src/stripe.ts" },
  "refund.issued": { status: "materialized", source: `${MAT}: credit_ledger kind='refund'` },
  // ---- editor / import
  "draft.edited": { status: "materialized", source: `${MAT}: drafts origin='human_revision'` },
  "figure.proposed": { status: "beta_absent", reason: "no figure surface at beta (§5.9 figures are 1.x)" },
  "citation.imported": { status: "beta_absent", reason: "no citation-manager import at beta (RIS/Zotero import is full-product)" },
  // ---- REQ-BETA-7…12
  "revision.move_traced": { status: "materialized", source: `${MAT}: run_events + timeline_events` },
  "rereview.lineage": { status: "materialized", source: `${MAT}: run_events` },
  "round.completed": { status: "materialized", source: `${MAT}: correspondence_items` },
  "surface.dwell": { status: "emitted", source: WEB },
  "draft.imported": { status: "emitted", source: "apps/api/src/import.ts" },
  "wtp.recorded": { status: "emitted", source: "packages/ledger/src/stripe.ts" },
  "credits.exhausted_prompt": { status: "emitted", source: "apps/api/src/billing-routes.ts" },
  // ---- P1.11 — the Assistant activation funnel (REQ-CHAT-30's instrumentation half)
  "chat.turn_completed": { status: "emitted", source: "apps/api/src/chat-routes.ts" },
  "chat.plan_card_shown": { status: "emitted", source: "apps/api/src/chat-routes.ts" },
  "chat.plan_card_decided": { status: "emitted", source: "apps/api/src/chat-routes.ts" },
  "chat.empty_state_shown": { status: "emitted", source: "apps/api/src/chat-routes.ts" },
  // P1.17 — REQ-CHAT-30's instrumentation half: the scratch cohort's first gate decision emits
  // `outline.approved` at the gate-decision seam (an approve_outline gate resolving approve).
  "outline.approved": { status: "emitted", source: "apps/api/src/run-routes.ts" },
};

/** The audit grouped by status — the report/PR render this verbatim. */
export function emissionAuditByStatus(): Record<EmissionStatus, AnalyticsEventName[]> {
  const out: Record<EmissionStatus, AnalyticsEventName[]> = { emitted: [], materialized: [], beta_absent: [] };
  for (const [name, entry] of Object.entries(BETA_EMISSION_AUDIT) as [AnalyticsEventName, EmissionAuditEntry][]) {
    out[entry.status].push(name);
  }
  return out;
}
