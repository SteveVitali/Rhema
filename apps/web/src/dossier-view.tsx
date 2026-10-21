// SPA.21 — the dossier's shared view module (design/22 §2 `p.review` row; REQ-TST-2, REQ-SEQ-9).
// The label bags, the §5.7 findings-surface helpers, and the article composition BOTH renderers
// emit — pages.tsx (SSR) imports them back and `spa/surfaces/dossier.tsx` mounts the same DOM on
// the BFF twin, so the dom-contract's hooks (`data-letter-view`, `data-claims-table`,
// `data-second-read`, `data-findings-*`, `data-disposition-*`, `data-bulk-*`, `data-margin-*`)
// stay attribute-for-attribute identical across renderers (the DOM contract is tested, not the
// wiring — the gate-card.tsx precedent).
//
// Pure React + @rhema/ui + @rhema/findings-core + COPY: no node/fs imports, so the client bundle
// consumes this module as-is (the client-ported `filterFindings`/`applySeverityBudget` filters
// run through the same findings-core functions the SSR handler ran — design/22 OQ8 option (b)).
import type { ReactNode } from "react";
import {
  ClaimsTable,
  DispositionControls,
  FindingsDesk,
  FindingsList,
  LetterView,
  MarginSurface,
  PageTitle,
  RubricDelta,
  RubricView,
  RunCard,
  SecondReadView,
  VersionObligationChip,
  type ClaimsTableLabels,
  type ClaimTableRow,
  type FindingsDeskLabels,
  type FindingsListLabels,
  type LetterViewLabels,
  type LiveFeedLabels,
  type MarginLabels,
  type RubricLabels,
  type RunCardLabels,
  type RunReportLabels,
  type SecondReadLabels,
  type TimelineHrefs,
  type TimelineLabels,
  type LetterSection,
} from "@rhema/ui";
import {
  applyGate,
  applySeverityBudget,
  buildRubricDelta,
  buildRubricView,
  buildRunCardView,
  buildTrustChip,
  buildTriageQueue,
  claimUrlViews,
  collapsedRejected,
  detectReconciliationConflicts,
  evidenceUrlViews,
  fetchLogFromRows,
  filterFindings,
  groupFindingsForList,
  marginItems,
  normalizeEvidence,
  parseFindingFilters,
  pretriageSummary,
  sectionedTriageQueue,
  severityBudget,
  summarizeReconciliation,
  LIVE_OBLIGATION_STATES,
  type AccessReportFacts,
  type RubricRowInput,
  type RunCardInput,
  type TrustChipLabels,
} from "@rhema/findings-core";
import {
  CHECKABLE_CLAIM_KINDS,
  type Claim,
  type ClaimKind,
  type FindingView,
  type ObligationState,
} from "@rhema/contracts";
import type { BulkPreviewDto, GateCardDto } from "@rhema/api-client";
import { COPY } from "./copy.js";
import { decisionLine, dispositionLabels, gateCardFor } from "./gate-card.js";

// ---- the dossier's view contracts, declared here so this module stays bundle-clean (data.ts and
// page-data.ts pull server seams — node async_hooks/fs — the SPA graph never typechecks). The server
// side aliases them back: `DossierData extends DossierViewData` in data.ts and PageData's
// `dossierView`/`triage` bags reference `DossierViewState`/`TriageSurfaceState` — ONE source of
// truth, both directions assignable. ----

/**
 * The delivered-review dossier the reading surfaces render (PRB.04). Semi-raw domain data + the proxy fetch
 * log; the web page assembles the view models via @rhema/findings-core and renders them with @rhema/ui. The
 * `runCard` state is already the orchestrator-only projection (REQ-IDE-11); the `accessReport` is the §12.6
 * facts the trust chip derives from (REQ-PROD-2). The live binding (reading it from a delivered run) landed
 * in PRB.16 — `apiDataSource.getDossier` hits `GET /projects/:id/review/:runId/dossier` (D-PRB.04-1);
 * the SPA's `/bff/p/:slug/review/:runId` twin carries this shape verbatim (SPA.21).
 */
export interface DossierViewData {
  readonly slug: string;
  readonly runId: string;
  readonly projectTitle: string;
  readonly versionLabel: string;
  /** P1.07 — the run's rigor drives the §5.7 severity budget (Quick's 40-finding rendered cap). */
  readonly rigor?: string;
  /** P1.07 — the reviewed draft the Apply path splices (its working head when forked). */
  readonly reviewedDraftId?: string;
  /** P1.06 — a scoped run's dossier label (§7.2 scope chips, e.g. "§III"); absent on whole-draft runs. */
  readonly scopeLabels?: readonly string[];
  readonly openObligations: number;
  readonly addressedObligations: number;
  readonly runCard: RunCardInput;
  readonly letterTitle: string;
  readonly letterSections: readonly LetterSection[];
  readonly claims: readonly Claim[];
  /** normalized URLs the proxy request log confirms retrieved (fetch + url-bearing search rows — the
   *  guard's cited⇒retrieved join set; CITE.1/ADR-084). */
  readonly fetchLog: readonly string[];
  /** CITE.1 — normalized urls covered ONLY by `search` rows (a hit the run's searches surfaced, never a
   *  page fetch): the "Search result" chip set (ADR-084). */
  readonly searchResultLog?: readonly string[];
  readonly findings: readonly FindingView[];
  readonly rubric: readonly RubricRowInput[];
  /** PRB.06 — the prior round's rubric when this dossier is a re-review (the round-summary delta renders
   *  per-dimension before/after, never an aggregate — REQ-IDE-30). */
  readonly priorRubric?: readonly RubricRowInput[];
  readonly accessReport: AccessReportFacts;
  /** PRB.16 — finding id → its revision obligation's state, for the per-finding state chip (REQ-OBJ-6). */
  readonly findingObligations?: Readonly<Record<string, ObligationState>>;
  /** P1.17 (§15.4) — this dossier is the workspace's read-only Showcase (the banner + the
   *  anchor-viewed beacon arm). */
  readonly showcase?: boolean;
  /** P1.17 — the welcome dossier's deep-link anchor (finding 1) for the <60 s funnel event. */
  readonly firstFindingId?: string;
  /** RES.2 — the persisted run-level delivery label (`runs.delivery.label`); the page renders the
   *  banner above the verdict row when set. */
  readonly deliveryLabel?: string | null;
}

/**
 * P1.07 — the dossier's findings-surface view state (§5.7): the shared filters echoed from the GET
 * params, triage mode (`?triage=1`), the one consolidated bulk preview (`?bulk=<action>`), a dispatch
 * result line, and the notice a bounced Apply/promote/obligations POST re-renders with. Under the SPA
 * these are validated route search keys forwarded onto the twin's query string (SPA.21).
 */
export interface DossierViewState {
  readonly filters: Record<string, string | undefined>;
  readonly triage: boolean;
  readonly bulk?: { readonly action: string; readonly section?: string; readonly preview: BulkPreviewDto };
  readonly bulkDone?: { readonly count: number; readonly skipped: number };
  readonly notice?: { readonly kind: "applied" | "promoted" | "obligated" | "error"; readonly findingId: string; readonly message?: string };
  /**
   * P1.19 — the Inbox gate row's `?gate=<id>` deep link lands `?gate=<id>` here (REQ-IDE-2 amended): the dossier
   * mounts that gate's real card at the head of the artifact — "approve reads the artifact first",
   * and on phone width (where the Timeline is display:none) it's the row's approve surface.
   */
  readonly focusedGate?: GateCardDto;
}

/** PRB.05 — per-request shell state for the triage surfaces (PageData's `triage` bag). */
export interface TriageSurfaceState {
  /** a disposition-validation error from the last POST (re-rendered under the finding card). */
  readonly dispositionError?: { readonly findingId: string; readonly message: string };
  /** a saved marker ("Saved") under the card the last POST wrote. */
  readonly savedFindingId?: string;
}

/** Replace `{key}` placeholders in a copy template with string/number values (pages.tsx's `fmt` twin). */
function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

// ---- the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6) ----

const R = COPY.review;

export const runCardLabels: RunCardLabels = {
  phaseLabel: (k) => R.phaseLabel[k] ?? k,
  stateLabel: (s) => R.runStateLabel[s] ?? s,
  // RPT.1 (REQ-SPEC-32(a)) — a provisional mid-phase metered reading renders the ≈ marker; the SSE
  // patch in ide.ts re-renders the SAME `card.meter`/`card.meterProvisional` templates (copy.ts) so
  // SSR and live rows never diverge.
  creditsLabel: (spent, cap, provisional) =>
    fmt(COPY.feed.templates[provisional === true ? "card.meterProvisional" : "card.meter"]!, {
      spentCredits: spent.toLocaleString("en-US"),
      capCredits: cap.toLocaleString("en-US"),
    }),
  etaLabel: (lo, hi) => `~${lo}–${hi} min`,
  offLabel: R.offLabel,
  counterLabel: (_key, value, of) => (of != null ? `${value} / ${of}` : String(value)),
  refundLabel: (credits) => fmt(R.refundFmt, { n: credits }),
  // RES.2 — the run-level delivery-label line above the card's state/verdict (machine value → copy).
  deliveryLabel: () => fmt(R.deliveryBannerFmt, { label: R.deliveryLabel }),
  // ---- P1.05 — the §5.5 state chrome + §6.5 steering ----
  queueLabel: (pos) => fmt(COPY.steer.queueFmt, { n: pos }),
  estimateLabel: (actual, est) =>
    fmt(COPY.steer.estimateLineFmt, { actual: actual.toLocaleString("en-US"), est: est.toLocaleString("en-US") }),
  pausedLabel: (done, total) => fmt(COPY.steer.pausedFmt, { done, total }),
  partialLabel: (done, total) => fmt(COPY.steer.partialFmt, { done, total }),
  waitingGateLabel: (kind, deadlineAt) =>
    fmt(COPY.steer.waitingGateFmt, { kind: G.kindLabel[kind] ?? kind }) + (deadlineAt != null ? ` · ${deadlineAt.slice(0, 10)}` : ""),
  queuedNotesLabel: (n) => fmt(COPY.steer.queuedNotesFmt, { n }),
  deliverableLabel: (key, count) =>
    count != null ? fmt(COPY.steer.deliverableLabel[key] ?? key, { n: count }) : (COPY.steer.deliverableLabel[key] ?? key),
  actionLabel: (action) =>
    action === "pause" ? COPY.steer.pause
    : action === "stop" ? COPY.steer.stop
    : action === "cancel" ? COPY.steer.cancel
    : action === "resume" ? COPY.steer.resume
    : action === "note" ? COPY.steer.note
    : action === "report" ? COPY.steer.report
    : action === "open_deliverable" ? COPY.steer.openDeliverable
    : action === "live_feed" ? COPY.steer.liveFeed
    : COPY.steer.retryWalkthrough,
  notePlaceholder: COPY.steer.notePlaceholder,
  walkthroughHeading: COPY.steer.walkthroughHeading,
  walkthroughPendingLabel: COPY.steer.walkthroughPending,
  walkthroughFailedLabel: COPY.steer.walkthroughFailed,
  reportLabel: COPY.steer.report,
  // P1.09 (§6.4 item 8; REQ-RUN-5/6) — the permanent approval-decision lines under the run card.
  decisionLabel: (d) => decisionLine(d),
};

// ---- P1.05 — the Timeline pane + the run report (§5.5/§14.5) ----

const TL = COPY.timeline;
const RP = COPY.report;
const G = COPY.gates;

export const timelineLabels: TimelineLabels = {
  nextStepLabel: (verb, headDraftN) =>
    fmt(TL.nextStep[verb] ?? verb, { n: headDraftN ?? "" }).replace(/\s+/g, " ").trim(),
  estimateLabel: (credits) => fmt(TL.estimateFmt, { n: credits.toLocaleString("en-US") }),
  versionLabel: (n) => fmt(TL.versionFmt, { n }),
  workflowLabel: (workflow, count) =>
    (TL.workflowLabel[workflow] ?? workflow) + (count != null ? ` ${fmt(TL.countFmt, { n: count })}` : ""),
  arrow: TL.arrow,
  originChipLabel: (kind) => TL.originChip[kind],
  runLineLabel: (workflow, createdAt) =>
    `${TL.workflowLabel[workflow] ?? workflow} · ${createdAt.slice(0, 10)}`,
  emptyText: COPY.ide.timeline.empty,
  verbLabel: (verb) => TL.verbs[verb] ?? verb,
};

/** The card action targets inside a project's pages — steering POSTs + the dossier/report links. */
export function timelineHrefs(slug: string): TimelineHrefs {
  return {
    nextStep: `/p/${slug}/run`,
    reportHref: (runId) => `/p/${slug}/r/${runId}#report`,
    deliverableHref: (runId) => `/p/${slug}/review/${runId}`,
    steeringHref: (runId, action) => `/p/${slug}/r/${runId}/${action}`,
    gateHref: () => `/p/${slug}`,
    versionHref: (n) => `/p/${slug}/v/${n}`,
    verbHref: (verb) => `/p/${slug}/run?workflow=${verb}`,
  };
}

export const feedLabels: LiveFeedLabels = {
  densityLabel: (d) => COPY.review.densityLabel[d] ?? d,
  heading: COPY.review.feedHeading,
};

export const reportLabels: RunReportLabels = {
  heading: RP.heading,
  estimateLine: (actual, estimate, ratio) =>
    estimate != null
      ? fmt(RP.estimateFmt, { spent: actual.toLocaleString("en-US"), est: estimate.toLocaleString("en-US") }) +
        (ratio != null ? ` (${ratio}×)` : "")
      : fmt(RP.noEstimate, { spent: actual.toLocaleString("en-US") }),
  refundLine: (credits) => fmt(RP.refundFmt, { n: credits.toLocaleString("en-US") }),
  phaseHeading: RP.phaseHeading,
  phaseLabel: (k) => R.phaseLabel[k] ?? k,
  seatLabel: (seat) => (seat != null ? (RP.seatLabel[seat] ?? seat) : "—"),
  offLabel: R.offLabel,
  phaseDetail: (credits, durationMs, searches, fetches) => {
    // RPT.1 — truthful durations: a real sub-minute phase renders seconds (never "0 min"); a legacy
    // row whose commit wrote started_at = ended_at (duration 0) renders the "—" the AC words — it has
    // no duration to claim, and it must not borrow one.
    const base =
      durationMs != null
        ? durationMs === 0
          ? fmt(RP.phaseDetailDurationUnknownFmt, { credits: credits.toLocaleString("en-US") })
          : durationMs < 60_000
            ? fmt(RP.phaseDetailDurationSecFmt, {
                credits: credits.toLocaleString("en-US"),
                n: Math.max(1, Math.round(durationMs / 1000)),
              })
            : fmt(RP.phaseDetailDurationFmt, { credits: credits.toLocaleString("en-US"), n: Math.round(durationMs / 60000) })
        : fmt(RP.phaseDetailFmt, { credits: credits.toLocaleString("en-US") });
    const tail = searches > 0 || fetches > 0 ? ` · ${searches + fetches}` : "";
    return base + tail;
  },
  seatsHeading: RP.seatsHeading,
  seatSplitLine: (seat, credits, share) =>
    fmt(RP.seatSplitFmt, { seat: RP.seatLabel[seat] ?? seat, credits: credits.toLocaleString("en-US"), pct: Math.round(share * 100) }),
  flagsHeading: RP.flagsHeading,
  // RPT.1 — flags render the server-computed figures through their templated sentences (§14.5).
  flagLabel: (flag) => {
    const key =
      flag.key === "fact_check_dominated" && flag.count == null ? "fact_check_dominated_noClaims" : flag.key;
    return fmt(RP.flagLabel[key] ?? flag.key, {
      pct: flag.sharePct ?? "",
      // retries may carry a comma-joined phase list — translate each controlled key.
      phase: flag.phase != null ? flag.phase.split(",").map((k) => R.phaseLabel[k] ?? k).join(", ") : "",
      n: flag.count ?? "",
      ratio: flag.ratio ?? "",
    }).replace(/\s+\)/g, ")").trim();
  },
  meteredLine: (metered, charged) =>
    fmt(RP.meteredFmt, { metered: metered.toLocaleString("en-US"), charged: charged.toLocaleString("en-US") }),
  differenceLabel: (d) => {
    if (d.key === "refund") {
      const reason = d.reason != null ? (RP.refundReasonLabel[d.reason] ?? null) : null;
      return reason != null
        ? fmt(RP.differenceFmt["refund"] ?? "{n} cr", { n: d.credits.toLocaleString("en-US"), reason })
        : fmt(RP.differenceFmt["refundNoReason"] ?? "{n} cr", { n: d.credits.toLocaleString("en-US") });
    }
    return fmt(RP.differenceFmt[d.key] ?? "{n} cr", { n: d.credits.toLocaleString("en-US") });
  },
  workedExampleLabel: RP.workedExample,
  claimsLine: (checked, verified, perVerified) =>
    perVerified != null
      ? fmt(RP.claimsFmt, { checked, verified, per: perVerified.toLocaleString("en-US") })
      : fmt(RP.claimsNoVerifyFmt, { checked, verified }),
  driversHeading: RP.driversHeading,
  driverLabel: (key, phase, share) =>
    key === "phase_share" && phase != null && share != null
      ? fmt(RP.driverPhaseShareFmt, { phase: R.phaseLabel[phase] ?? phase, pct: Math.round(share * 100) })
      : key === "within_estimate"
        ? RP.driverWithinEstimate
        : (RP.flagLabel[key] ?? key),
  guidanceHeading: RP.guidanceHeading,
  guidanceLabel: (key) => RP.guidanceLabel[key] ?? key,
  advancedHeading: RP.advancedHeading,
  advancedColumns: RP.advancedColumns,
  notAvailable: RP.notAvailable,
  loadAdvanced: RP.loadAdvanced,
};

export const letterLabels: LetterViewLabels = {
  tocHeading: R.letterTocHeading,
  attestationHeading: R.attestationHeading,
};

export const trustLabels: TrustChipLabels = {
  boundary: R.trust.boundary,
  fetched: R.trust.fetchedFmt,
  secondRead: R.trust.secondRead,
  blockedOne: R.trust.blockedOne,
  blockedMany: R.trust.blockedMany,
};

export const claimsLabels: ClaimsTableLabels = {
  heading: R.claimsHeading,
  tierLabel: (t) => `Tier ${t}`,
  fetchedLabel: R.fetchedLabel,
  searchResultLabel: R.searchResultLabel,
  stanceLabel: (s) => R.stanceLabel[s] ?? s,
  notCheckableLabel: (k) => (k ? fmt(R.notCheckableFmt, { kind: R.kindNounLabel[k] ?? k }) : ""),
  accessedLabel: (a) => a.slice(0, 10),
  contradictedTierOneLabel: R.contradictedTierOneLabel,
};

export const rubricLabels: RubricLabels = {
  heading: R.rubricHeading,
  dimensionLabel: (d) => R.dimensionLabel[d] ?? d,
  capLabel: (c) => fmt(R.capFmt, { at: c.at, reason: c.reason }),
};

export const secondReadLabels: SecondReadLabels = {
  heading: R.secondReadHeading,
  corroboratedLabel: (n) => fmt(R.corroboratedFmt, { n }),
  secondReadOnlyLabel: (n) => fmt(R.secondReadOnlyFmt, { n }),
  rejectedHeading: R.rejectedHeading,
  promoteLabel: R.promoteLabel,
  emptyRejectedLabel: R.emptyRejected,
};

export const findingsLabels: FindingsListLabels = {
  kindLabel: (k) => R.findingKindLabel[k] ?? k,
  severityLabel: (s) => R.severityLabel[s] ?? s,
  provisionalLabel: R.provisionalLabel,
  dispositionLabel: (kind, applied) =>
    applied ? R.appliedLabel : fmt(R.disposedFmt, { verb: R.dispositionPast[kind] ?? kind }),
  conflictLine: (kind) => fmt(R.conflictLineFmt, { verb: R.dispositionPast[kind] ?? kind }),
  conflictsHeading: R.conflictsHeading,
  rejectedHeading: R.rejectedHeading,
  promoteLabel: R.promoteLabel,
  // P1.07 — the evidence block's labels (claim findings show the verdict chip + fetched ✓, REQ-IDE-25).
  // CITE.1 — a search-hit-only url renders the "Search result" chip instead (ADR-084).
  fetchedLabel: `${R.fetchedLabel} ✓`,
  searchResultLabel: R.searchResultLabel,
  accessedLabel: (a) => a.slice(0, 10),
};

// ---- P1.07 — the §5.7 findings surfaces: Margin cards/chips + the Desk's findings table, powered by
// the SAME FindingView[] as the dossier list (one model, three surfaces). ----

export const marginLabels: MarginLabels = {
  kindLabel: findingsLabels.kindLabel,
  severityLabel: findingsLabels.severityLabel,
  provisionalLabel: findingsLabels.provisionalLabel,
  dispositionLabel: findingsLabels.dispositionLabel,
  fetchedLabel: findingsLabels.fetchedLabel,
  searchResultLabel: findingsLabels.searchResultLabel,
  accessedLabel: findingsLabels.accessedLabel,
  chipLabel: (count, topSeverityLabel, topCount) =>
    fmt(R.marginChipFmt, { count, top: topCount, severity: topSeverityLabel }),
  chipAria: (count) => fmt(R.marginChipAriaFmt, { count }),
};

export const deskFindingsLabels: FindingsDeskLabels = {
  table: {
    finding: R.deskTable.finding,
    severity: R.deskTable.severity,
    kind: R.deskTable.kind,
    status: R.deskTable.status,
    actions: R.deskTable.actions,
  },
  empty: R.findingsEmpty,
  filters: {
    severity: R.filters.severity,
    kind: R.filters.kind,
    status: R.filters.status,
    apply: R.filters.apply,
    clear: R.filters.clear,
    allLabel: R.filters.all,
  },
  severityLabel: (s) => R.severityLabel[s] ?? s,
  kindLabel: (k) => R.findingKindLabel[k] ?? k,
  statusLabel: (v) =>
    v.disposition ? (R.dispositionPast[v.disposition.kind] ?? v.disposition.kind) : R.filters.undecided,
  progressFmt: (decided, total) => fmt(R.triageProgressFmt, { decided, total }),
  triageExit: R.triageExit,
};

export function checkable(kind: string | undefined): boolean {
  return kind == null || CHECKABLE_CLAIM_KINDS.includes(kind as ClaimKind);
}

// ---- PRB.05 — the triage write surfaces (§5.7/§6.4/§10.1) ----

/** The per-finding disposition control (§5.7) — the same component desktop + phone (REQ-SPEC-20). */
export function dispositionControlsFor(
  view: { id: string; provisional: boolean; suggestion?: { replacement: string } | null; disposition?: { kind: string; rationale?: string; adaptedText?: string; reasonCode?: string } | null },
  slug: string,
  runId: string,
  compact: boolean,
  error: { findingId: string; message: string } | undefined,
): ReactNode {
  return (
    <DispositionControls
      formAction={`/p/${slug}/review/${runId}/findings/${view.id}/disposition`}
      compact={compact}
      labels={dispositionLabels}
      suggestion={view.suggestion?.replacement ?? null}
      {...(view.disposition
        ? {
            current: {
              kind: view.disposition.kind as "accept" | "adapt" | "rebut" | "defer" | "escalate",
              ...(view.disposition.rationale != null ? { rationale: view.disposition.rationale } : {}),
              ...(view.disposition.adaptedText != null ? { adaptedText: view.disposition.adaptedText } : {}),
              ...(view.disposition.reasonCode != null
                ? { reasonCode: view.disposition.reasonCode as "wrong" }
                : {}),
            },
          }
        : {})}
      {...(error && error.findingId === view.id ? { error: error.message } : {})}
    />
  );
}

// ---- P1.07 — the findings surface's per-card actions (§5.7): Apply (the free verb — the primary
// button whenever the card carries an applyable suggestion), the five disposition verbs, and
// "Add to obligations". Every control is a plain form POST — no client JS required. ----

/** The shared filters applied server-side: budget first (Quick's 40-cap), then the GET-param filters. */
export function visibleDossierFindings(
  dossier: { findings: readonly FindingView[]; rigor?: string; findingObligations?: Readonly<Record<string, string>> },
  filters: Record<string, string | undefined> | undefined,
): FindingView[] {
  const parsed = parseFindingFilters(filters ?? {});
  const openObligationIds = new Set(
    Object.entries(dossier.findingObligations ?? {})
      .filter(([, s]) => LIVE_OBLIGATION_STATES.includes(s))
      .map(([id]) => id),
  );
  return filterFindings(applySeverityBudget([...dossier.findings], dossier.rigor), parsed, { openObligationIds });
}

/** A finding card's full control set — Apply (when applyGate allows) + the verbs + Add-to-obligations. */
export function findingControlsFor(
  view: FindingView,
  slug: string,
  runId: string,
  compact: boolean,
  error: { findingId: string; message: string } | undefined,
  opts: { readonly hasObligation: boolean },
): ReactNode {
  const gate = applyGate(view);
  return (
    <>
      {/* VERIF.2 (F-VERIF.2-3) — the per-finding Apply verb rides the SAME §10.1/Q-1 desktop
          boundary as the bulk controls: compact withholds it (the phone arm is the five
          disposition verbs + the note). The gate existed for `[data-bulk-controls]` but Apply
          was missed — the preview's seeded dossier is the first fixture applyable enough to
          expose it (prod's showcase findings carried no applyable suggestion). */}
      {view.suggestion != null && gate.ok && compact !== true ? (
        <form method="post" action={`/p/${slug}/review/${runId}/findings/${view.id}/apply`} data-apply-form={view.id} style={{ display: "inline" }}>
          <button
            type="submit"
            data-apply="true"
            title={R.applyTitle}
            style={{ fontSize: "12px", fontWeight: 600, padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--shell-bg)", cursor: "pointer" }}
          >
            {R.applyLabel}
          </button>
        </form>
      ) : null}
      {dispositionControlsFor(view, slug, runId, compact, error)}
      {/* P1.13 — the craft finding's Visualize action (§7.5's fifth entry point): opens the SAME
          visualize sheet (entry=craft_finding) with the finding's text as the request seed. */}
      {view.kind === "craft" ? (
        <a
          href={`/p/${slug}/visualize?entry=craft_finding&request=${encodeURIComponent(`${view.title} — ${view.body}`.slice(0, 300))}`}
          data-visualize-finding={view.id}
          style={{ fontSize: "12px", color: "var(--accent)" }}
        >
          {R.visualizeLabel}
        </a>
      ) : null}
      {!opts.hasObligation && !view.provisional ? (
        <form method="post" action={`/p/${slug}/findings/${view.id}/obligations`} style={{ display: "inline" }}>
          <input type="hidden" name="next" value={`/p/${slug}/review/${runId}`} />
          <button
            type="submit"
            data-add-obligation="true"
            style={{ fontSize: "12px", background: "none", border: "none", color: "var(--shell-fg-muted)", cursor: "pointer", textDecoration: "underline", padding: 0 }}
          >
            {R.addObligationLabel}
          </button>
        </form>
      ) : null}
    </>
  );
}

/** The Desk's bulk affordances (§5.7): each posts to the ONE consolidated preview — nothing blind. */
export function dossierBulkActions(slug: string, runId: string, visible: readonly FindingView[]): ReactNode {
  const btn = { fontSize: "12px", padding: "4px 10px", borderRadius: "4px", border: "1px solid var(--shell-border)", background: "var(--shell-raised)", color: "var(--shell-fg)", cursor: "pointer" } as const;
  const sections = [...new Set(visible.map((v) => v.letterSection).filter((s): s is NonNullable<typeof s> => s != null))];
  const action = `/p/${slug}/review/${runId}/findings/bulk-preview`;
  return (
    <div data-bulk-controls="true" style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
      <form method="post" action={action} style={{ display: "inline" }}>
        <input type="hidden" name="action" value="apply_notes" />
        <button type="submit" style={btn}>{R.bulk.applyNotes}</button>
      </form>
      <form method="post" action={action} style={{ display: "inline" }}>
        <input type="hidden" name="action" value="defer_minor" />
        <button type="submit" style={btn}>{R.bulk.deferMinor}</button>
      </form>
      {sections.length > 0 ? (
        <form method="post" action={action} style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
          <input type="hidden" name="action" value="accept_section" />
          <select name="section" aria-label={R.bulk.acceptSection} defaultValue={sections[0] ?? ""} style={{ fontSize: "12px" }}>
            {sections.map((s) => (
              <option key={s} value={s}>{fmt(R.sectionLabelFmt, { key: s })}</option>
            ))}
          </select>
          <button type="submit" style={btn}>{R.bulk.acceptSection}</button>
        </form>
      ) : null}
    </div>
  );
}

/**
 * P1.07 — the dossier's Margin + Desk bodies (§5.7 "three surfaces, one list"): MarginSurface renders
 * `marginItems` (cards beside passages, stacked chips for crowds), FindingsDesk renders the grouped
 * screen-reader table + the shared filter bar + the sectioned queue when `?triage=1` + the bulk
 * affordances. Everything derives from `visibleDossierFindings` — the same list the body list shows.
 */
export function dossierSurfaces(data: {
  readonly dossier?: DossierViewData;
  readonly dossierView?: DossierViewState;
  readonly triage?: TriageSurfaceState;
  readonly compact?: boolean;
}): { marginBody: ReactNode; deskFindingsBody: ReactNode } | Record<string, never> {
  const dossier = data.dossier;
  if (!dossier) return {};
  const dv = data.dossierView;
  const visible = visibleDossierFindings(dossier, dv?.filters);
  const err = data.triage?.dispositionError;
  const compact = data.compact ?? false;
  const fetchLog = fetchLogFromRows(dossier.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const searchOnly = fetchLogFromRows((dossier.searchResultLog ?? []).map((normalizedUrl) => ({ normalizedUrl })));
  const obligationFor = (view: FindingView) => {
    const state = dossier.findingObligations?.[view.id];
    return state ? { state, label: R.obligationStateLabel[state] ?? state } : undefined;
  };
  const evidenceFor = (view: FindingView) => {
    // HOT.1 — normalize at the render seam: a view assembled without the api's row normalization (a
    // bypass regression) still renders instead of 500ing on `.urls` (ADR-019).
    const evidence = normalizeEvidence(view.evidence);
    return evidence != null
      ? {
          ...(evidence.verdict != null ? { verdictLabel: R.verdictLabel[evidence.verdict] ?? evidence.verdict } : {}),
          urls: evidenceUrlViews(evidence, fetchLog, searchOnly),
        }
      : undefined;
  };
  const controlsFor = (view: FindingView) =>
    findingControlsFor(view, dossier.slug, dossier.runId, compact, err, {
      hasObligation: dossier.findingObligations?.[view.id] != null,
    });
  const filterAction = `/p/${dossier.slug}/review/${dossier.runId}`;
  return {
    marginBody: (
      <MarginSurface
        items={marginItems(visible)}
        labels={marginLabels}
        obligationFor={obligationFor}
        controlsFor={controlsFor}
        evidenceFor={evidenceFor}
      />
    ),
    // §10.1 — the phone-width input set is "the same five verbs + a note; never a bulk action":
    // compact renders omit the bulk affordances entirely.
    deskFindingsBody: (
      <FindingsDesk
        groups={groupFindingsForList(visible)}
        labels={deskFindingsLabels}
        filterAction={filterAction}
        filters={{
          ...(dv?.filters?.sev != null ? { severity: dv.filters.sev } : {}),
          ...(dv?.filters?.kind != null ? { kind: dv.filters.kind } : {}),
          ...(dv?.filters?.disp != null ? { status: dv.filters.disp } : {}),
        }}
        severityOptions={Object.entries(R.severityLabel).map(([value, label]) => ({ value, label }))}
        kindOptions={Object.entries(R.findingKindLabel).map(([value, label]) => ({ value, label }))}
        statusOptions={[
          { value: "undecided", label: R.filters.undecided },
          ...Object.entries(R.dispositionPast).map(([value, label]) => ({ value, label })),
        ]}
        obligationFor={obligationFor}
        actionsFor={controlsFor}
        {...(dv?.triage === true ? { triage: sectionedTriageQueue(visible, { wholePiece: R.wholePieceLabel }) } : {})}
        {...(compact ? {} : { bulkActions: dossierBulkActions(dossier.slug, dossier.runId, visible) })}
      />
    ),
  };
}

// ---- the dossier article (the IdeFrame's Page content — both renderers) ----

/**
 * The dossier's Page content — every section the SSR `DossierPage` renders inside `IdeFrame`,
 * verbatim. The SSR page passes `beacon="script"` (the inline `<script>` it always emitted);
 * the SPA leaf passes `beacon={false}` and calls `useShowcaseAnchorBeacon` (spa/showcase-beacon.ts —
 * DOM effects live under `src/spa`, which carries the DOM lib; this module stays SSR-safe).
 * Every form keeps `method`/`action` verbatim: under SSR they POST natively; the SPA leaf
 * intercepts `submit` at its `data-spa-surface` root and re-issues the same fields as a JSON
 * envelope call (design/22 §3 — the DOM contract is the wire contract).
 */
export function DossierArticle({
  dossier,
  compact,
  dossierView,
  dispositionError,
  savedFindingId,
  beacon,
  gatePresenceScript,
}: {
  readonly dossier: DossierViewData;
  readonly compact: boolean;
  readonly dossierView?: DossierViewState;
  readonly dispositionError?: { readonly findingId: string; readonly message: string };
  readonly savedFindingId?: string;
  readonly beacon: "script" | false;
  /** false under a React mount — innerHTML `<script>` pings never execute; `useGatePresence`
   *  carries them instead (the inbox.tsx precedent). SSR leaves it unset (the card's own
   *  script runs). */
  readonly gatePresenceScript?: boolean;
}): ReactNode {
  const fetchLog = fetchLogFromRows(dossier.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const searchOnly = fetchLogFromRows((dossier.searchResultLog ?? []).map((normalizedUrl) => ({ normalizedUrl })));
  const claimRows: ClaimTableRow[] = dossier.claims.map((c) => ({
    ordinal: c.ordinal,
    text: c.text,
    tier: c.tier,
    verdict: c.verdict,
    verdictLabel: R.verdictLabel[c.verdict] ?? c.verdict,
    ...(c.kind ? { kind: c.kind } : {}),
    checkable: checkable(c.kind),
    ...(c.note ? { note: c.note } : {}),
    urls: claimUrlViews(c, fetchLog, searchOnly),
    // P1.13 — a figure-linked Tier-1 claim (§7.5; REQ-VIZ-13) carries the card link, so the
    // claims table shows WHICH figure each row verifies (a `none`-provenance figure's claims land
    // here too — their Unsupported verdict is the ledger row's own field).
    ...(c.figureId
      ? { figureHref: `/p/${dossier.slug}/figures/${c.figureId}`, figureLabel: R.figureClaimLabel }
      : {}),
  }));

  const trustChip = buildTrustChip(dossier.accessReport, trustLabels);
  // P1.07 — ONE list powers the body, the Margin, and the Desk: the Quick severity budget caps the
  // rendered set first, then the shared GET-param filters narrow every surface together (§5.7).
  const visible = visibleDossierFindings(dossier, dossierView?.filters);
  const budget = severityBudget([...dossier.findings], dossier.rigor);
  const groups = groupFindingsForList(visible);
  const conflicts = detectReconciliationConflicts([...dossier.findings]);
  const rejected = collapsedRejected([...dossier.findings]);
  const reconciliation = summarizeReconciliation([...dossier.findings]);

  return (
    <>
      {/* P1.17 (§15.4) — the Showcase banner: the workspace's read-only worked example names itself
          and offers the ONE write affordance it has (Duplicate → a normal project). */}
      {dossier.showcase ? (
        <div
          role="note"
          data-showcase-banner
          style={{
            border: "1px solid var(--shell-border)",
            borderRadius: "10px",
            padding: "12px 16px",
            margin: "0 0 16px",
            background: "var(--shell-raised)",
            fontSize: "13px",
          }}
        >
          <strong>{COPY.showcase.bannerTitle}</strong>
          <span style={{ color: "var(--shell-fg-muted)" }}> — {COPY.showcase.bannerBody} </span>
          <form method="post" action={`/p/${dossier.slug}/duplicate`} data-duplicate-form="true" style={{ display: "inline" }}>
            <button type="submit" style={{ fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
              {COPY.showcase.duplicateCta}
            </button>
          </form>
        </div>
      ) : null}
      {/* P1.17 (§3.5) — `showcase.finding_anchor_viewed`: only the client observes the scroll onto the
          first finding's card — an IntersectionObserver posts the beacon once (the <60 s funnel leg).
          Under the SPA the effect twin in `useShowcaseAnchorBeacon` carries the same ping. */}
      {beacon === "script" && dossier.showcase && dossier.firstFindingId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var el=document.querySelector('[data-finding="${dossier.firstFindingId}"]');if(!el)return;var sent=false;function fire(){if(sent)return;sent=true;var b=JSON.stringify({event:"showcase.finding_anchor_viewed",props:{}});try{if(navigator.sendBeacon){navigator.sendBeacon("/a/acq",new Blob([b],{type:"application/json"}));return;}}catch(e){}fetch("/a/acq",{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true}).catch(function(){});}var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].isIntersecting){fire();io.disconnect();}}},{threshold:0.4});io.observe(el);setTimeout(function(){var r=el.getBoundingClientRect();if(r.top<window.innerHeight&&r.bottom>0)fire();},1200);})();`,
          }}
        />
      ) : null}
      {/* RES.2 — the persisted run-level label leads the dossier, above the verdict row
          (the same slot the card + email carry); the claim verdict stays `unverifiable`. */}
      {dossier.deliveryLabel ? (
        <div
          data-delivery-label={dossier.deliveryLabel}
          style={{
            margin: "0 0 12px",
            padding: "10px 14px",
            borderRadius: "8px",
            border: "1px solid var(--shell-border)",
            background: "var(--shell-raised)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--shell-fg)",
          }}
        >
          {fmt(R.deliveryBannerFmt, { label: R.deliveryLabel })}
        </div>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <PageTitle>{dossier.projectTitle}</PageTitle>
        <span style={{ color: "var(--shell-fg-muted)", fontSize: "13px" }}>{dossier.versionLabel}</span>
        {/* P1.06 — a scoped run's dossier carries its scope pills (the same chips the sheet showed). */}
        {(dossier.scopeLabels ?? []).map((s) => (
          <span key={s} className="ide-pill" data-scope-pill>
            {s}
          </span>
        ))}
        <VersionObligationChip
          open={dossier.openObligations}
          addressed={dossier.addressedObligations}
          label={fmt(R.obligationSummaryFmt, { open: dossier.openObligations, addressed: dossier.addressedObligations })}
        />
      </div>

      {/* P1.19 — `?gate=<id>` (the Inbox row's deep link) mounts the gate's real card at the head of
          the artifact: the approve flow reads the artifact first — and on phone width (Timeline
          hidden) this is the row's approve surface. */}
      {dossierView?.focusedGate ? (
        <section data-focused-gate={dossierView.focusedGate.id} style={{ margin: "16px 0" }}>
          {gateCardFor(dossierView.focusedGate, dossier.slug, compact, dispositionError, {
            ...(gatePresenceScript === false ? { presenceScript: false } : {}),
          })}
        </section>
      ) : null}

      <div style={{ margin: "16px 0" }}>
        {/* P1.05 — the dossier card carries the same actions the Timeline's card does (report link,
            walkthrough block, retry) — same view model, same labels (re-skin, never a fork). */}
        <RunCard
          view={buildRunCardView(dossier.runCard)}
          labels={runCardLabels}
          hrefs={{
            report: `/p/${dossier.slug}/r/${dossier.runId}#report`,
            deliverable: `/p/${dossier.slug}/review/${dossier.runId}`,
            retryWalkthrough: `/p/${dossier.slug}/r/${dossier.runId}/walkthrough`,
          }}
        />
      </div>

      <div style={{ margin: "16px 0" }}>
        {/* P1.07 — the letter's passage links resolve to the finding cards/rows (§5.7): each
            section lists the findings filed under its `letterSection` key. */}
        <LetterView
          title={dossier.letterTitle}
          sections={dossier.letterSections.map((s) => {
            const refs = dossier.findings
              .filter((f) => f.letterSection === s.id)
              .map((f) => ({ findingId: f.id, label: f.title }));
            return refs.length > 0 ? { ...s, findingRefs: refs } : s;
          })}
          trustChip={trustChip}
          labels={letterLabels}
        />
      </div>

      <div style={{ margin: "16px 0" }}>
        <ClaimsTable rows={claimRows} labels={claimsLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <SecondReadView summary={reconciliation} rejected={rejected} labels={secondReadLabels} />
      </div>

      <div style={{ margin: "16px 0" }}>
        <RubricView view={buildRubricView([...dossier.rubric])} labels={rubricLabels} />
        {/* PRB.06 — a re-review dossier carries the prior round's rubric: the round-summary delta renders
            per-dimension before/after, never an aggregate (REQ-IDE-30). */}
        {dossier.priorRubric ? (
          <div style={{ marginTop: "12px" }}>
            <RubricDelta
              view={buildRubricDelta([...dossier.priorRubric], [...dossier.rubric])}
              labels={{
                heading: COPY.revision.rubricDeltaHeading,
                dimensionLabel: (d) => COPY.review.dimensionLabel[d] ?? d,
                beforeLabel: COPY.revision.rubricBeforeLabel,
                afterLabel: COPY.revision.rubricAfterLabel,
              }}
            />
          </div>
        ) : null}
      </div>

      <div style={{ margin: "16px 0" }}>
        <h2 style={{ fontSize: "16px", fontWeight: 600 }}>{R.findingsHeading}</h2>
        {/* pre-triage line (REQ-IDE-28) + the >30-findings triage promo (§5.7). */}
        {(() => {
          const summary = pretriageSummary([...dossier.findings]);
          const queue = buildTriageQueue([...dossier.findings]);
          return (
            <>
              {summary.triaged > 0 ? (
                <p data-pretriage-line="true" style={{ fontSize: "13px", color: "var(--shell-fg-muted)", margin: "4px 0 10px" }}>
                  {fmt(COPY.triage.pretriageFmt, { n: summary.triaged, m: summary.total })}
                </p>
              ) : null}
              {queue.promoteAgentTriage ? (
                <p data-triage-promo="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 10px" }}>
                  {fmt(COPY.triage.promoFmt, { n: 30 })}
                </p>
              ) : null}
            </>
          );
        })()}
        {/* P1.07 — the one-preview bulk render (§5.7; REQ-IDE-29 amended): `?bulk=<action>` lands the
            consolidated checklist here — checked rows ride `only[]` to the dispatch POST; the skipped
            rows list their reasons. No blind accept-all exists. */}
        {/* P1.19 — §10.1 ✗ ("bulk accept/apply"): a crafted ?bulk= URL renders no confirm form at
            phone width — the preview affordance is desktop-only, like the controls that open it. */}
        {dossierView?.bulk && compact !== true ? (
          <section
            data-bulk-preview="true"
            style={{ border: "1px solid var(--shell-border)", borderRadius: "8px", padding: "12px 14px", margin: "0 0 14px", background: "var(--shell-surface)" }}
          >
            <h3 style={{ fontSize: "13px", fontWeight: 600, margin: "0 0 8px" }}>{R.bulk.previewHeading}</h3>
            {dossierView.bulk.preview.rows.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{R.bulk.emptyPreview}</p>
            ) : (
              <form method="post" action={`/p/${dossier.slug}/review/${dossier.runId}/findings/bulk`}>
                <input type="hidden" name="action" value={dossierView.bulk.action} />
                {dossierView.bulk.section != null ? (
                  <input type="hidden" name="section" value={dossierView.bulk.section} />
                ) : null}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px" }}>
                  {dossierView.bulk.preview.rows.map((row) => (
                    <li key={row.findingId} style={{ fontSize: "13px", padding: "4px 0" }}>
                      <label style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                        <input type="checkbox" name="only" value={row.findingId} defaultChecked />
                        <span>
                          {row.title}{" "}
                          <span style={{ color: "var(--shell-fg-muted)" }}>
                            — {R.severityLabel[row.severity] ?? row.severity} · {R.dispositionPast[row.disposition] ?? row.disposition}
                          </span>
                          {row.appliedMarkdown != null ? (
                            <code style={{ display: "block", fontSize: "11px", color: "var(--shell-fg-muted)", marginTop: "2px", whiteSpace: "pre-wrap" }}>
                              {row.appliedMarkdown.slice(0, 200)}
                            </code>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {dossierView.bulk.preview.skipped.length > 0 ? (
                  <div data-bulk-skipped="true" style={{ margin: "4px 0 8px" }}>
                    <h4 style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)", margin: "0 0 4px" }}>
                      {R.bulk.skippedHeading}
                    </h4>
                    <ul style={{ listStyle: "none", padding: 0, margin: 0, fontSize: "12px", color: "var(--shell-fg-muted)" }}>
                      {dossierView.bulk.preview.skipped.map((s) => (
                        <li key={s.findingId}>{s.title} — {s.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <button type="submit" data-bulk-confirm="true" style={{ fontSize: "13px", fontWeight: 600, padding: "6px 14px", borderRadius: "4px", border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--shell-bg)", cursor: "pointer" }}>
                  {R.bulk.confirm}
                </button>{" "}
                <a href={`/p/${dossier.slug}/review/${dossier.runId}`} style={{ fontSize: "13px" }}>{R.bulk.cancel}</a>
              </form>
            )}
          </section>
        ) : null}
        {dossierView?.bulkDone ? (
          <p data-bulk-done="true" role="status" style={{ fontSize: "13px", color: "var(--state-ready)", margin: "0 0 10px" }}>
            {fmt(R.bulk.doneFmt, { n: dossierView.bulkDone.count })}
          </p>
        ) : null}
        {dossierView?.notice ? (
          <p
            data-finding-notice={dossierView.notice.kind}
            role={dossierView.notice.kind === "error" ? "alert" : "status"}
            style={{ fontSize: "12px", color: dossierView.notice.kind === "error" ? "var(--sev-major)" : "var(--state-ready)", margin: "0 0 10px" }}
          >
            {dossierView.notice.message ??
              (dossierView.notice.kind === "applied"
                ? R.appliedToast
                : dossierView.notice.kind === "promoted"
                  ? R.promotedToast
                  : R.obligatedToast)}
          </p>
        ) : null}
        {/* the severity-budget line (§5.7): Quick's rendered cap is honest — the folded count names
            what the roadmap absorbed. */}
        {budget.folded > 0 ? (
          <p data-severity-budget="true" style={{ fontSize: "12px", color: "var(--shell-fg-muted)", margin: "4px 0 10px" }}>
            {fmt(R.severityBudgetFmt, { n: budget.folded })}
          </p>
        ) : null}
        {/* the once-per-surface evidence explainer (§5.7) — shown when any finding carries URLs. */}
        {visible.some((f) => (normalizeEvidence(f.evidence)?.urls.length ?? 0) > 0) ? (
          <p data-evidence-explainer="true" style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "4px 0 10px" }}>
            {R.evidenceExplainer}
          </p>
        ) : null}
        {/* PRB.16 — the per-finding obligation-state chip (REQ-OBJ-6): the dossier payload carries
            finding id → obligation state, joined from the delivered revision_obligations rows. */}
        <FindingsList
          groups={groups}
          conflicts={conflicts}
          collapsedRejected={rejected}
          labels={findingsLabels}
          obligationFor={(view) => {
            const state = dossier.findingObligations?.[view.id];
            return state
              ? { state, label: COPY.review.obligationStateLabel[state] ?? state }
              : undefined;
          }}
          controlsFor={(view) =>
            findingControlsFor(view, dossier.slug, dossier.runId, compact, dispositionError, {
              hasObligation: dossier.findingObligations?.[view.id] != null,
            })
          }
          promoteActionFor={(view) => `/p/${dossier.slug}/findings/${view.id}/promote`}
          evidenceFor={(view) => {
            const evidence = normalizeEvidence(view.evidence);
            return evidence != null
              ? {
                  ...(evidence.verdict != null
                    ? { verdictLabel: R.verdictLabel[evidence.verdict] ?? evidence.verdict }
                    : {}),
                  urls: evidenceUrlViews(evidence, fetchLog, searchOnly),
                }
              : undefined;
          }}
        />
        {savedFindingId ? (
          <p data-disposition-saved="true" style={{ fontSize: "12px", color: "var(--state-ready)", marginTop: "6px" }}>
            {COPY.triage.savedLabel}
          </p>
        ) : null}
      </div>
    </>
  );
}
