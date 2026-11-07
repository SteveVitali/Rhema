import type { ReactNode } from "react";
import {
  ClaimsTable,
  type ClaimsTableLabels,
  type ClaimTableRow,
  type RunCardLabels,
  type TimelineHrefs,
  type TimelineLabels,
} from "@rhema/ui";
import { claimUrlViews, fetchLogFromRows } from "@rhema/findings-core";
import { CHECKABLE_CLAIM_KINDS, isDemoSlug, type ClaimKind } from "@rhema/contracts";
import type { LatestReviewDto } from "@rhema/api-client";
import { COPY } from "./copy.js";
import { decisionLine } from "./gate-card.js";

// ---- R7SYNC.1 — the dossier's light label/body module. `chrome-data` (an entry-graph chunk)
// imports these four exports; dossier-view.tsx pulls Select + the markdown renderer and must
// NOT leak into entry. These label builders + the review-panel bodies are pure copy+JSX over
// findings-core helpers — no Select, no markdown-prose. dossier-view re-exports them so every
// existing import site stays on its old path. ----

/** Replace `{key}` placeholders in a copy template with string/number values (pages.tsx's `fmt` twin). */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

const R = COPY.review;
const TL = COPY.timeline;
const G = COPY.gates;

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
    : COPY.steer.liveFeed,
  notePlaceholder: COPY.steer.notePlaceholder,
  // R7COPY.0 (REQ-COPY-4) — the record-composed delivered block's labels.
  deliveredHeading: COPY.steer.deliveredHeading,
  // R7DEM.5 (REQ-DWEB-15 render; S-9) — the replayed-run labels on demo cards.
  replayedBadge: COPY.demo.replayedBadge,
  phaseInferredLabel: COPY.demo.phaseInferredLabel,
  approvalsNotRecordedLabel: COPY.demo.approvalsNotRecorded,
  notRecordedLabel: (field) => `${field} not recorded`,
  deliveredCountsLabel: (c) =>
    fmt(COPY.steer.deliveredCountsFmt, {
      findings: c.findings,
      strengths: c.strengths > 0 ? fmt(COPY.steer.deliveredStrengthsFmt, { n: c.strengths, s: c.strengths === 1 ? "" : "s" }) : "",
      claims: c.claims,
    }),
  deliveredLinkLabel: (key) => COPY.steer.deliveredLinkLabel[key] ?? key,
  reportLabel: COPY.steer.report,
  // P1.09 (§6.4 item 8; REQ-RUN-5/6) — the permanent approval-decision lines under the run card.
  decisionLabel: (d) => decisionLine(d),
};

export const timelineLabels: TimelineLabels = {
  nextStepLabel: (verb, headDraftN) =>
    fmt(TL.nextStep[verb] ?? verb, { n: headDraftN ?? "" }).replace(/\s+/g, " ").trim(),
  estimateLabel: (credits) => fmt(TL.estimateFmt, { n: credits.toLocaleString("en-US") }),
  versionLabel: (n) => fmt(TL.versionFmt, { n }),
  workflowLabel: (workflow, count) =>
    (TL.workflowLabel[workflow] ?? workflow) + (count != null ? ` ${fmt(TL.countFmt, { n: count })}` : ""),
  arrow: TL.arrow,
  originChipLabel: (kind) => TL.originChip[kind],
  // R7DEM.4b — the demo twin's replayed runs carry `createdAt: null` ("not recorded" — S-9);
  // a null timestamp renders the workflow label alone, never a crash.
  runLineLabel: (workflow, createdAt) =>
    createdAt == null
      ? (TL.workflowLabel[workflow] ?? workflow)
      : `${TL.workflowLabel[workflow] ?? workflow} · ${createdAt.slice(0, 10)}`,
  emptyText: COPY.ide.timeline.empty,
  verbLabel: (verb) => TL.verbs[verb] ?? verb,
};

export function timelineHrefs(slug: string): TimelineHrefs {
  // R7DEM.5 — the run sheet is outside the demo allowlist: for a `demo~` slug the next-step
  // card and verb chips omit their `/run` hrefs (R3 §4 row 4 — an out-of-scope navigation
  // is dropped, never a terminal 404). Steering POST forms stay: DemoEffects captures their
  // submit into the read-only notice.
  const demo = isDemoSlug(slug);
  return {
    ...(demo ? {} : { nextStep: `/p/${slug}/run` }),
    reportHref: (runId) => `/p/${slug}/r/${runId}#report`,
    deliverableHref: (runId) => `/p/${slug}/review/${runId}`,
    steeringHref: (runId, action) => `/p/${slug}/r/${runId}/${action}`,
    // R7COPY.0 (REQ-COPY-4) — the composed block's links: dossier page; the letter sits inside it
    // (#letter), as does the claims ledger (#claims).
    deliveredLinkHref: (runId, key) =>
      key === "letter"
        ? `/p/${slug}/review/${runId}#letter`
        : key === "ledger"
          ? `/p/${slug}/review/${runId}#claims`
          : `/p/${slug}/review/${runId}`,
    gateHref: () => `/p/${slug}`,
    versionHref: (n) => `/p/${slug}/v/${n}`,
    ...(demo ? {} : { verbHref: (verb) => `/p/${slug}/run?workflow=${verb}` }),
  };
}

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

export function checkable(kind: string | undefined): boolean {
  return kind == null || CHECKABLE_CLAIM_KINDS.includes(kind as ClaimKind);
}


export function reviewPanelBodies(
  review: LatestReviewDto,
  slug: string,
): { deskFindingsBody: ReactNode; deskClaimsBody: ReactNode } {
  const P = COPY.ide.panel;
  const dossierHref = `/p/${slug}/review/${review.runId}`;
  const n = review.draftN ?? 0;
  const sourceLine = (
    <p data-review-source={review.runId} className="ui-d-s ui-d-mb10">
      <a href={dossierHref} className="ui-vc-acc">
        {fmt(P.reviewFromFmt, { n })}
      </a>
      <span className="ui-vc-faint">
        {" "}
        · {review.counts.findings} findings
        {review.counts.strengths > 0 ? ` · ${review.counts.strengths} strengths` : ""}
        {review.counts.claims > 0 ? ` · ${review.counts.claims} claims` : ""}
        {" · "}
        {P.openDossier}
      </span>
    </p>
  );
  const fetchLog = fetchLogFromRows(review.fetchLog.map((normalizedUrl) => ({ normalizedUrl })));
  const searchOnly = fetchLogFromRows(
    (review.searchResultLog ?? []).map((normalizedUrl) => ({ normalizedUrl })),
  );
  const claimRows: ClaimTableRow[] = review.claims.map((c) => ({
    ordinal: c.ordinal,
    text: c.text,
    tier: c.tier,
    verdict: c.verdict,
    verdictLabel: R.verdictLabel[c.verdict] ?? c.verdict,
    ...(c.kind ? { kind: c.kind } : {}),
    checkable: checkable(c.kind),
    ...(c.note ? { note: c.note } : {}),
    urls: claimUrlViews(c, fetchLog, searchOnly),
  }));
  return {
    deskFindingsBody: (
      <div data-review-panel="findings">
        {sourceLine}
        {review.findings.length === 0 ? (
          <p data-findings-empty="true" className="ui-d-t">
            {R.findingsEmpty}
          </p>
        ) : (
          <table className="ui-rptab ui-d-fd" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="ui-d-t">
                <th scope="col">{P.findingsTable.finding}</th>
                <th scope="col">{P.findingsTable.severity}</th>
                <th scope="col">{P.findingsTable.kind}</th>
                <th scope="col">{P.findingsTable.status}</th>
              </tr>
            </thead>
            <tbody>
              {review.findings.map((f) => (
                <tr key={f.id} data-review-finding={f.id}>
                  <td>
                    <a href={`${dossierHref}#finding-${f.id}`} className="ui-d-inh">
                      {f.excerpt}
                    </a>
                  </td>
                  <td>{R.severityLabel[f.severity] ?? f.severity}</td>
                  <td>{R.findingKindLabel[f.kind] ?? f.kind}</td>
                  <td>
                    {R.dispositionPast[f.status] ?? f.status}
                    {f.draftN != null && f.draftN !== n
                      ? ` · ${fmt(P.onVersionFmt, { n: f.draftN })}`
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    ),
    deskClaimsBody: (
      <div data-review-panel="claims">
        {sourceLine}
        {claimRows.length === 0 ? (
          <p className="ui-d-t">{P.emptyClaims}</p>
        ) : (
          <ClaimsTable rows={claimRows} labels={claimsLabels} />
        )}
      </div>
    ),
  };
}
