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
  Button,
  ClaimsTable,
  DispositionControls,
  FindingsDesk,
  LetterView,
  PageTitle,
  RubricDelta,
  RubricView,
  SecondReadView,
  Select,
  VersionObligationChip,
  type ClaimTableRow,
  type FindingsDeskLabels,
  type FindingsListLabels,
  type LetterViewLabels,
  type LiveFeedLabels,
  type MarginLabels,
  type RubricLabels,
  type RunReportLabels,
  type SecondReadLabels,
  type LetterSection,
} from "@rhema/ui";
import {
  applyGate,
  applySeverityBudget,
  buildRubricDelta,
  buildRubricView,
  buildTrustChip,
  buildTriageQueue,
  claimUrlViews,
  collapsedRejected,
  fetchLogFromRows,
  filterFindings,
  groupFindingsForList,
  normalizeEvidence,
  parseFindingFilters,
  pretriageSummary,
  sectionedTriageQueue,
  severityBudget,
  summarizeReconciliation,
  LIVE_OBLIGATION_STATES,
  type AccessReportFacts,
  type RubricRowInput,
  type RunSummaryView,
  type TrustChipLabels,
} from "@rhema/findings-core";
import {
  type Claim,
  type FindingView,
  type ObligationState,
} from "@rhema/contracts";
import type { BulkPreviewDto, GateCardDto } from "@rhema/api-client";
import { COPY } from "./copy.js";
import { dispositionLabels, gateCardFor } from "./gate-card.js";
import {
  checkable,
  claimsLabels,
  fmt,
  runCardLabels,
} from "./dossier-labels.js";
export {
  checkable,
  claimsLabels,
  reviewPanelBodies,
  runCardLabels,
  timelineHrefs,
  timelineLabels,
} from "./dossier-labels.js";

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
  /**
   * R7COPY.0 (REQ-SYNC-1; R5 C4) — the ONE run summary: the same SQL-fact card assembly the
   * Timeline mounts (replaces the event-derived `RunCardInput`, which could show a stale
   * `created` state beside the Timeline's `completed`). The view is prebuilt — render
   * `runSummary.card` verbatim.
   */
  readonly runSummary: RunSummaryView;
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
  /** 222 R7DEM.6a — `null`/absent on a replayed record: the demo's dossier twin has no live
   *  access report (fetch log "not recorded"), so the letter renders no trust chip rather than
   *  a fabricated one. */
  readonly accessReport?: AccessReportFacts | null;
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


// ---- the delivered-review dossier reading surface (PRB.04, §5.5/§5.7/§6.6) ----

const R = COPY.review;


// ---- P1.05 — the Timeline pane + the run report (§5.5/§14.5) ----

const TL = COPY.timeline;
const RP = COPY.report;


/** The card action targets inside a project's pages — steering POSTs + the dossier/report links. */

export const feedLabels: LiveFeedLabels = {
  densityLabel: (d) => COPY.review.densityLabel[d] ?? d,
  heading: COPY.review.feedHeading,
};

export const reportLabels: RunReportLabels = {
  heading: RP.heading,
  // R7DEM.5 (REQ-DWEB-15 render; S-9) — the replayed-run labels on demo reports.
  replayedBadge: COPY.demo.replayedBadge,
  phaseInferredLabel: COPY.demo.phaseInferredLabel,
  approvalsNotRecordedLabel: COPY.demo.approvalsNotRecorded,
  notRecordedLabel: (field) => `${field} not recorded`,
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
  // REQ-SYNC-2 — the stack's figure rides the ONE count rule (strengths read as strengths, never
  // folded into findings — the rail and the run card show the same split).
  chipLabel: (counts, topSeverityLabel, topCount) =>
    fmt(R.marginChipFmt, {
      count: counts.findings,
      strengths: counts.strengths > 0
        ? ` · ${counts.strengths} strength${counts.strengths === 1 ? "" : "s"}`
        : "",
      top: topCount,
      severity: topSeverityLabel,
    }),
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
  opts: { readonly hasObligation: boolean; readonly readOnly?: string | null },
): ReactNode {
  const gate = applyGate(view);
  // R7RO.1 — under a read-only reason every finding write withholds with the reason tooltip
  // (Apply, the dispositions, Add-to-obligations); the visualize link is a navigation and stays.
  if (opts.readOnly != null) {
    return (
      <span
        data-readonly-controls={view.id}
        title={opts.readOnly}
        className="ui-d-s ui-vc-faint"
      >
        {opts.readOnly}
      </span>
    );
  }
  return (
    <>
      {/* VERIF.2 (F-VERIF.2-3) — the per-finding Apply verb rides the SAME §10.1/Q-1 desktop
          boundary as the bulk controls: compact withholds it (the phone arm is the five
          disposition verbs + the note). The gate existed for `[data-bulk-controls]` but Apply
          was missed — the preview's seeded dossier is the first fixture applyable enough to
          expose it (prod's showcase findings carried no applyable suggestion). */}
      {view.suggestion != null && gate.ok && compact !== true ? (
        <form method="post" action={`/p/${slug}/review/${runId}/findings/${view.id}/apply`} data-apply-form={view.id} style={{ display: "inline" }}>
          <Button type="submit" variant="primary" size="sm" data-apply="true" title={R.applyTitle}>
            {R.applyLabel}
          </Button>
        </form>
      ) : null}
      {dispositionControlsFor(view, slug, runId, compact, error)}
      {/* P1.13 — the craft finding's Visualize action (§7.5's fifth entry point): opens the SAME
          visualize sheet (entry=craft_finding) with the finding's text as the request seed. */}
      {view.kind === "craft" ? (
        <a
          href={`/p/${slug}/visualize?entry=craft_finding&request=${encodeURIComponent(`${view.title} — ${view.body}`.slice(0, 300))}`}
          data-visualize-finding={view.id}
          className="ui-d-s ui-vc-acc"
        >
          {R.visualizeLabel}
        </a>
      ) : null}
      {!opts.hasObligation && !view.provisional ? (
        <form method="post" action={`/p/${slug}/findings/${view.id}/obligations`} style={{ display: "inline" }}>
          <HiddenField name="next" value={`/p/${slug}/review/${runId}`} />
          <Button type="submit" variant="ghost" size="sm" data-add-obligation="true">
            {R.addObligationLabel}
          </Button>
        </form>
      ) : null}
    </>
  );
}

/** The no-JS post's hidden id carriers — the named GUARD-1 exemption (RV-36): Radix's own
 *  hidden carriers post the named select/checkbox fields, so only these ids ride a raw input. */
function HiddenField({ name, value }: { readonly name: string; readonly value: string }): ReactNode {
  return <input type="hidden" name={name} value={value} />;
}

/** The bulk-preview checklist's `only[]` carrier — the named GUARD-1 exemption (RV-36): the
 *  consolidated confirm posts checked ids through the form grammar the server arm `asArray`s. */
function BulkOnlyCheck({ findingId }: { readonly findingId: string }): ReactNode {
  return <input type="checkbox" name="only" value={findingId} defaultChecked />;
}

/** The Desk's bulk affordances (§5.7): each posts to the ONE consolidated preview — nothing blind. */
export function dossierBulkActions(slug: string, runId: string, visible: readonly FindingView[]): ReactNode {
  const sections = [...new Set(visible.map((v) => v.letterSection).filter((s): s is NonNullable<typeof s> => s != null))];
  const action = `/p/${slug}/review/${runId}/findings/bulk-preview`;
  return (
    <div data-bulk-controls="true" className="ui-d-acts" style={{ flexWrap: "wrap" }}>
      <form method="post" action={action} style={{ display: "inline" }}>
        <HiddenField name="action" value="apply_notes" />
        <Button type="submit" size="sm">{R.bulk.applyNotes}</Button>
      </form>
      <form method="post" action={action} style={{ display: "inline" }}>
        <HiddenField name="action" value="defer_minor" />
        <Button type="submit" size="sm">{R.bulk.deferMinor}</Button>
      </form>
      {sections.length > 0 ? (
        <form method="post" action={action} className="ui-d-acts">
          <HiddenField name="action" value="accept_section" />
          <Select
            name="section"
            aria-label={R.bulk.acceptSection}
            defaultValue={sections[0] ?? ""}
            items={sections.map((s) => ({ value: s, label: fmt(R.sectionLabelFmt, { key: s }) }))}
          />
          <Button type="submit" size="sm">{R.bulk.acceptSection}</Button>
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
  /** R7RO.1 — the read-only reason text; set ⇒ every finding/bulk write withholds. */
  readonly readOnly?: string | null;
}): { deskFindingsBody: ReactNode } | Record<string, never> {
  const dossier = data.dossier;
  if (!dossier) return {};
  const dv = data.dossierView;
  const visible = visibleDossierFindings(dossier, dv?.filters);
  const err = data.triage?.dispositionError;
  const compact = data.compact ?? false;
  const readOnly = data.readOnly ?? null;
  const obligationFor = (view: FindingView) => {
    const state = dossier.findingObligations?.[view.id];
    return state ? { state, label: R.obligationStateLabel[state] ?? state } : undefined;
  };
  const controlsFor = (view: FindingView) =>
    findingControlsFor(view, dossier.slug, dossier.runId, compact, err, {
      hasObligation: dossier.findingObligations?.[view.id] != null,
      readOnly,
    });
  const filterAction = `/p/${dossier.slug}/review/${dossier.runId}`;
  // 243a_R7KIT.3e (REQ-PANE-5) — findings live in the right panel's Findings tab ONLY: the
  // Margin rail (and with it the colour-dot minimap) is REMOVED on the dossier, and the body's
  // findings column is gone. The workflow furniture the body's findings section carried —
  // the pre-triage line, the triage promo, the consolidated bulk preview + dispatch lines,
  // the notice/saved flashes, the severity-budget line and the evidence explainer — moves
  // WITH the findings into this panel body so every hook stays emitted.
  const furniture = (
    <>
      {(() => {
        const summary = pretriageSummary([...dossier.findings]);
        const queue = buildTriageQueue([...dossier.findings]);
        return (
          <>
            {summary.triaged > 0 ? (
              <p data-pretriage-line="true" className="ui-d-t ui-d-mb10">
                {fmt(COPY.triage.pretriageFmt, { n: summary.triaged, m: summary.total })}
              </p>
            ) : null}
            {queue.promoteAgentTriage ? (
              <p data-triage-promo="true" className="ui-d-i ui-d-mb10">
                {fmt(COPY.triage.promoFmt, { n: 30 })}
              </p>
            ) : null}
          </>
        );
      })()}
      {dv?.bulk && compact !== true ? (
        <section data-bulk-preview="true" className="ui-bulk" style={{ border: "1px solid var(--shell-border)" }}>
          <h3 className="ui-d-fd ui-d-b ui-d-mb10">{R.bulk.previewHeading}</h3>
          {dv.bulk.preview.rows.length === 0 ? (
            <p className="ui-d-t">{R.bulk.emptyPreview}</p>
          ) : (
            <form method="post" action={`/p/${dossier.slug}/review/${dossier.runId}/findings/bulk`}>
              <HiddenField name="action" value={dv.bulk.action} />
              {dv.bulk.section != null ? (
                <HiddenField name="section" value={dv.bulk.section} />
              ) : null}
              <ul className="ui-d-p0 ui-d-mb10" style={{ listStyle: "none" }}>
                {dv.bulk.preview.rows.map((row) => (
                  <li key={row.findingId} className="ui-d-fd ui-d-p2">
                    <label className="ui-d-acts" style={{ alignItems: "baseline" }}>
                      <BulkOnlyCheck findingId={row.findingId} />
                      <span>
                        {row.title}{" "}
                        <span className="ui-d-t">
                          — {R.severityLabel[row.severity] ?? row.severity} · {R.dispositionPast[row.disposition] ?? row.disposition}
                        </span>
                        {row.appliedMarkdown != null ? (
                          <code className="ui-d-fs ui-d-t ui-d-mt6" style={{ display: "block", whiteSpace: "pre-wrap" }}>
                            {row.appliedMarkdown.slice(0, 200)}
                          </code>
                        ) : null}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {dv.bulk.preview.skipped.length > 0 ? (
                <div data-bulk-skipped="true" className="ui-d-mb10">
                  <h4 className="ui-d-cap ui-d-s ui-d-t ui-d-mb10">
                    {R.bulk.skippedHeading}
                  </h4>
                  <ul className="ui-d-p0 ui-d-m0 ui-d-s ui-d-t" style={{ listStyle: "none" }}>
                    {dv.bulk.preview.skipped.map((s) => (
                      <li key={s.findingId}>{s.title} — {s.reason}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <Button type="submit" variant="primary" data-bulk-confirm="true">
                {R.bulk.confirm}
              </Button>{" "}
              <a href={`/p/${dossier.slug}/review/${dossier.runId}`} className="ui-d-fd">{R.bulk.cancel}</a>
            </form>
          )}
        </section>
      ) : null}
      {dv?.bulkDone ? (
        <p data-bulk-done="true" role="status" className="ui-d-fd ui-d-ok ui-d-mb10">
          {fmt(R.bulk.doneFmt, { n: dv.bulkDone.count })}
        </p>
      ) : null}
      {dv?.notice ? (
        <p
          data-finding-notice={dv.notice.kind}
          role={dv.notice.kind === "error" ? "alert" : "status"}
          className={`ui-d-s ui-d-mb10 ${dv.notice.kind === "error" ? "ui-d-w" : "ui-d-ok"}`}
        >
          {dv.notice.message ??
            (dv.notice.kind === "applied"
              ? R.appliedToast
              : dv.notice.kind === "promoted"
                ? R.promotedToast
                : R.obligatedToast)}
        </p>
      ) : null}
      {severityBudget([...dossier.findings], dossier.rigor).folded > 0 ? (
        <p data-severity-budget="true" className="ui-d-s ui-d-t ui-d-mb10">
          {fmt(R.severityBudgetFmt, { n: severityBudget([...dossier.findings], dossier.rigor).folded })}
        </p>
      ) : null}
      {visible.some((f) => (normalizeEvidence(f.evidence)?.urls.length ?? 0) > 0) ? (
        <p data-evidence-explainer="true" className="ui-d-i ui-d-mb10">
          {R.evidenceExplainer}
        </p>
      ) : null}
      {data.triage?.savedFindingId ? (
        <p data-disposition-saved="true" className="ui-d-s ui-d-ok ui-d-mt6">
          {COPY.triage.savedLabel}
        </p>
      ) : null}
    </>
  );
  return {
    // §10.1 — the phone-width input set is "the same five verbs + a note; never a bulk action":
    // compact renders omit the bulk affordances entirely.
    deskFindingsBody: (
      <div data-dossier-desk="true">
        {furniture}
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
        {...(compact || readOnly != null
          ? readOnly != null
            ? {
                bulkActions: (
                  <span data-readonly-controls="bulk" title={readOnly} className="ui-d-s ui-vc-faint">
                    {readOnly}
                  </span>
                ),
              }
            : {}
          : { bulkActions: dossierBulkActions(dossier.slug, dossier.runId, visible) })}
        />
      </div>
    ),
  };
}

// ---- R7TALK.1b (REQ-TALK-4; R5 B17) — the right panel's Findings/Claims tab bodies ----

/**
 * The ONE builder both renderers share (`IdeFrame` SSR + `useShellChrome` SPA): the panel's
 * Findings/Claims tabs render the project's LATEST delivered review (`ide.latestReview`), never
 * the open version — B17's "No findings yet." beside a delivered claim ledger was the
 * version-scoped read. The header line names the source ("From Review of vN" — the same
 * follow-text the Margin's projection labels carry) and links the dossier; a finding filed on a
 * different version tags "on vM". Counts come pre-computed from `deliveredRecordCounts`
 * (REQ-SYNC-2). Absent `latestReview` ⇒ the tabs keep their empty states (never-delivered only).
 */

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
  savedFindingId: _savedFindingId,
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

  const trustChip = dossier.accessReport == null ? null : buildTrustChip(dossier.accessReport, trustLabels);
  // REQ-PANE-5 — the findings list lives in the right panel's Findings tab (dossierSurfaces);
  // the article keeps only the second-read + rubric sections beside the letter column.
  const rejected = collapsedRejected([...dossier.findings]);
  const reconciliation = summarizeReconciliation([...dossier.findings]);

  return (
    <>
      {/* P1.17 (§15.4) — the Showcase banner: the workspace's read-only worked example names itself
          and offers the ONE write affordance it has (Duplicate → a normal project). */}
      {dossier.showcase ? (
        // R7RO.1 — the showcase notice IS the read-only mechanism's notice slot (the existing
        // banner copy verbatim); C10 — the Duplicate CTA is the styled primary button, the ONE
        // write a showcase keeps.
        <div
          role="note"
          data-showcase-banner
          data-readonly-notice="showcase"
          className="ui-dbanner ui-d-fd"
          style={{ border: "1px solid var(--shell-border)" }}
        >
          <strong>{COPY.showcase.bannerTitle}</strong>
          <span className="ui-d-t"> — {COPY.showcase.bannerBody} </span>
          <form method="post" action={`/p/${dossier.slug}/duplicate`} data-duplicate-form="true" style={{ display: "inline" }}>
            <Button type="submit" variant="primary" size="sm" data-readonly-duplicate="true">
              {COPY.showcase.duplicateCta}
            </Button>
          </form>
        </div>
      ) : null}
      {/* P1.17 (§3.5) — `showcase.finding_anchor_viewed`: only the client observes the scroll onto the
          first finding's card — an IntersectionObserver posts the beacon once (the <60 s funnel leg).
          Under the SPA the effect twin in `useShowcaseAnchorBeacon` carries the same ping. */}
      {beacon === "script" && dossier.showcase && dossier.firstFindingId ? (
        // 243a — the finding anchor moved off the findings rail: the beacon resolves the
        // letter's passage link first, then the panel's desk row, then any data-finding card.
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var el=document.querySelector('[data-passage-link="${dossier.firstFindingId}"]')||document.querySelector('[data-desk-row="${dossier.firstFindingId}"]')||document.querySelector('[data-finding="${dossier.firstFindingId}"]');if(!el)return;var sent=false;function fire(){if(sent)return;sent=true;var b=JSON.stringify({event:"showcase.finding_anchor_viewed",props:{}});try{if(navigator.sendBeacon){navigator.sendBeacon("/a/acq",new Blob([b],{type:"application/json"}));return;}}catch(e){}fetch("/a/acq",{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true}).catch(function(){});}var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].isIntersecting){fire();io.disconnect();}}},{threshold:0.4});io.observe(el);setTimeout(function(){var r=el.getBoundingClientRect();if(r.top<window.innerHeight&&r.bottom>0)fire();},1200);})();`,
          }}
        />
      ) : null}
      {/* RES.2 — the persisted run-level label leads the dossier, above the verdict row
          (the same slot the card + email carry); the claim verdict stays `unverifiable`. */}
      {dossier.deliveryLabel ? (
        <div data-delivery-label={dossier.deliveryLabel} className="ui-dbanner ui-d-b ui-d-fd" style={{ border: "1px solid var(--shell-border)" }}>
          {fmt(R.deliveryBannerFmt, { label: R.deliveryLabel })}
        </div>
      ) : null}
      <div className="ui-d-acts" style={{ flexWrap: "wrap" }}>
        <PageTitle>{dossier.projectTitle}</PageTitle>
        <span className="ui-d-t">{dossier.versionLabel}</span>
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
        <section data-focused-gate={dossierView.focusedGate.id} className="ui-d-mb16">
          {gateCardFor(dossierView.focusedGate, dossier.slug, compact, dispositionError, {
            ...(gatePresenceScript === false ? { presenceScript: false } : {}),
          })}
        </section>
      ) : null}

      {/* 243a_R7KIT.3e (REQ-PANE-5) — the run card collapses to a one-line run header: the same
          RunSummaryView facts (workflow · state · meter) and the report link, never the card. */}
      <p data-run-header="true" className="ui-runhdr ui-d-fd" style={{ alignItems: "baseline", flexWrap: "wrap" }}>
        <span className="ui-d-b">{TL.workflowLabel[dossier.runSummary.workflow] ?? dossier.runSummary.workflow}</span>
        <span className="ui-d-t">
          · {runCardLabels.stateLabel(dossier.runSummary.state)}
          {/* the RunCard's own null-guard — a replayed/demo card may carry no meter. */}
          {dossier.runSummary.card.spentCredits != null && dossier.runSummary.card.capCredits != null
            ? ` · ${runCardLabels.creditsLabel(
                dossier.runSummary.card.spentCredits,
                dossier.runSummary.card.capCredits,
                dossier.runSummary.card.provisional,
              )}`
            : ""}
        </span>
        <a href={`/p/${dossier.slug}/r/${dossier.runId}#report`} className="ui-vc-acc">
          {COPY.steer.report}
        </a>
      </p>

      <div id="letter">
        {/* P1.07 — the letter's passage links resolve to the right panel's desk rows
            (`#desk-finding-<id>`): the findings rail is gone (REQ-PANE-5). REQ-PANE-5 — the
            claim ledger is a section of the letter column. */}
        <LetterView
          title={dossier.letterTitle}
          sections={dossier.letterSections.map((s) => {
            const refs = dossier.findings
              .filter((f) => f.letterSection === s.id)
              .map((f) => ({ findingId: f.id, label: f.title }));
            return refs.length > 0 ? { ...s, findingRefs: refs } : s;
          })}
          trustChip={trustChip}
          claims={
            <section id="claims" data-letter-section="claims" className="ui-d-mb16" style={{ scrollMarginTop: "16px" }}>
              <ClaimsTable rows={claimRows} labels={claimsLabels} />
            </section>
          }
          labels={{ ...letterLabels, findingHref: (id) => `#desk-finding-${id}`, claimsTocLabel: claimsLabels.heading }}
        />
      </div>

      <div className="ui-d-mb16">
        <SecondReadView summary={reconciliation} rejected={rejected} labels={secondReadLabels} />
      </div>

      <div className="ui-d-mb16">
        <RubricView view={buildRubricView([...dossier.rubric])} labels={rubricLabels} />
        {/* PRB.06 — a re-review dossier carries the prior round's rubric: the round-summary delta renders
            per-dimension before/after, never an aggregate (REQ-IDE-30). */}
        {dossier.priorRubric ? (
          <div className="ui-d-mt6">
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
      {/* REQ-PANE-5 — the findings list + its workflow furniture moved into the right panel's
          Findings tab (dossierSurfaces.deskFindingsBody). No dossier column renders them. */}
    </>
  );
}
