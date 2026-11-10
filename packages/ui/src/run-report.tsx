// The run report surface (§5.5 D20; §14.5 Level 3 + the Level-4 Advanced disclosure; REQ-IDE-19). Renders
// the findings-core `RunReportView` verbatim — estimate vs actual, phase bars, the seat split, flags,
// claims verified × cost-per-claim, suggested guidance — plus, behind a `<details>` (the same progressive
// disclosure idiom the Advanced toggle uses), the phase × seat × model-tier rows with tokens and provider
// usage ids. No prompt, transcript, or source text exists on the view models, so none can render.

import type { CSSProperties, ReactNode } from "react";
import type {
  RunReportView,
  RunReportAdvancedView,
  ReportFlag,
  ReportDifference,
  PhaseStatus,
} from "@rhema/findings-core";

export interface RunReportLabels {
  readonly heading: string;
  /** e.g. (actual, estimate) => "412 cr spent · est. 1,240 (0.33×)". */
  readonly estimateLine: (actual: number, estimate: number | null, ratio: number | null) => string;
  /** the refunded line when the run returned credits. */
  readonly refundLine?: (credits: number) => string;
  readonly phaseHeading: string;
  readonly phaseLabel: (key: string) => string;
  readonly seatLabel: (seat: string | null) => string;
  readonly offLabel: string;
  /** phase-row detail, e.g. (credits, ms) => "210 cr · 4m". */
  readonly phaseDetail: (
    credits: number,
    durationMs: number | null,
    searches: number,
    fetches: number,
  ) => string;
  readonly seatsHeading: string;
  /** seat split line, e.g. (seat, credits, share) => "editor — 300 cr (73%)". */
  readonly seatSplitLine: (seat: string, credits: number, share: number) => string;
  readonly flagsHeading: string;
  /** resolve a flag to its sentence (the copy table words each controlled key, interpolating the
   *  server-computed figures the flag carries — RPT.1). */
  readonly flagLabel: (flag: ReportFlag) => string;
  /**
   * RPT.1 (§14.4/§14.5; REQ-SPEC-32) — the metered-vs-charged reconciliation lines, one per reasoned
   * difference ("you were not charged for the overrun", "…covered by your trial", per-refund lines).
   * Rendered under the estimate line; the metered figure itself rides `meteredLine`.
   */
  readonly meteredLine?: (metered: number, charged: number) => string;
  readonly differenceLabel?: (d: ReportDifference) => string;
  /** RPT.1 (§15.3) — the worked-example banner on a Showcase-seeded run's report. */
  readonly workedExampleLabel?: string;
  /** "Claims verified" line, e.g. (checked, verified, perClaim) => "56 checked · 41 verified · 10 cr each". */
  readonly claimsLine: (checked: number, verified: number, perVerified: number | null) => string;
  readonly driversHeading: string;
  /** a driver row: phase_share → "checking_claims — 42% of spend"; a flag key → flagLabel. */
  readonly driverLabel: (key: string, phase?: string, share?: number) => string;
  readonly guidanceHeading: string;
  /** resolve a "guidance.<flag>" key to the suggested-guidance sentence for the next round. */
  readonly guidanceLabel: (key: string) => string;
  // ---- R7DEM.5 (REQ-DWEB-15 render; S-9) — the replayed-run labels. All optional; absent ⇒ the
  // replayed arm hides its label lines (the badge/phases/approvals still render). ----
  /** the replayed-run badge, e.g. "Replayed from the agent-discourse record". */
  readonly replayedBadge?: string;
  /** the per-phase provenance label, e.g. "inferred from the delivered files". */
  readonly phaseInferredLabel?: string;
  /** the approvals slot's honest empty, e.g. "approvals not recorded". */
  readonly approvalsNotRecordedLabel?: string;
  /** one "not recorded" field label, e.g. (field) => "time not recorded". */
  readonly notRecordedLabel?: (field: string) => string;
  // ---- Level 4 (Advanced) ----
  readonly advancedHeading: string;
  readonly advancedColumns: {
    phase: string;
    seat: string;
    subagent: string;
    model: string;
    modelTier: string;
    credits: string;
    searches: string;
    fetches: string;
    inputTokens: string;
    outputTokens: string;
    cacheTokens: string;
    providerIds: string;
  };
  readonly notAvailable: string;
  /** the "load Level 4" link label shown inside the disclosure when `advanced` isn't loaded. */
  readonly loadAdvanced: string;
}

const STATUS_GLYPH: Record<PhaseStatus, string> = {
  done: "✓",
  running: "◐",
  pending: "○",
  skipped: "○",
  off: "○",
};

/** The Level-3 report (the `/p/:project/r/:run#report` body). `advancedHref` — the Level-4 lazy load:
 *  the disclosure's "load" affordance navigates there (a full read of the L4 model, §14.5 "loads only on
 *  Advanced disclosure open"); when `advanced` is already supplied the table renders inline. */
export function RunReport({
  view,
  advanced,
  labels,
  advancedHref,
}: {
  view: RunReportView;
  advanced?: RunReportAdvancedView;
  labels: RunReportLabels;
  advancedHref?: string;
}): ReactNode {
  const L = labels;
  // R7DEM.5 (REQ-DWEB-15 render; S-9) — a `ReplayedRunReportView` arrives structurally inside
  // `view`: every money/usage block the live report renders is OMITTED from the DTO (the record
  // never held it), so the replayed arm renders its own honest body — badge, "not recorded"
  // fields, inferred phase rows, PROVENANCE approvals — instead of crashing on absent fields.
  const replayed = "replayed" in view && view.replayed === true;
  if (replayed) {
    const rv = view as unknown as {
      phases: readonly {
        key: string;
        ordinal: number;
        status: PhaseStatus;
        seat: string | null;
        source?: string;
      }[];
      approvals: readonly { round: string; decision: string; note?: string }[] | "not_recorded";
      notRecorded?: readonly string[];
      claims?: { readonly checked: number; readonly verified: number } | null;
    };
    return (
      <article id="report" data-run-report={view.runId} data-replayed className="ui-d-fs14">
        <h2 className="ui-t-f18">{L.heading}</h2>
        {L.replayedBadge ? (
          <p data-replayed-badge className="ui-d-fd ui-t-mut ui-d-b">
            {L.replayedBadge}
          </p>
        ) : null}
        {Array.isArray(rv.notRecorded) && rv.notRecorded.length > 0 && L.notRecordedLabel ? (
          <p data-not-recorded className="ui-d-fd ui-t-mut">
            {rv.notRecorded.map((f) => L.notRecordedLabel!(f)).join(" · ")}
          </p>
        ) : null}
        {rv.claims ? (
          <p data-claims className="ui-d-fd ui-t-mut">
            {L.claimsLine(rv.claims.checked, rv.claims.verified, null)}
          </p>
        ) : null}
        <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
          {L.phaseHeading}
        </h3>
        <ul data-phase-bars className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
          {rv.phases.map((p) => (
            <li
              key={p.key}
              data-report-phase={p.key}
              data-phase-status={p.status}
              className="ui-d-fd ui-d-sc ui-d-p2 ui-c2-g2"
              style={
                {
                  display: "flex",
                  "--d-sev": p.status === "off" ? "var(--shell-fg-faint)" : "var(--shell-fg)",
                } as CSSProperties
              }
            >
              <span aria-hidden="true" className="ui-d-w14">
                {STATUS_GLYPH[p.status]}
              </span>
              <span>{L.phaseLabel(p.key)}</span>
              {p.source != null && L.phaseInferredLabel ? (
                <span data-phase-inferred className="ui-d-mla ui-d-i">
                  {L.phaseInferredLabel}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {rv.approvals === "not_recorded" && L.approvalsNotRecordedLabel ? (
          <p data-approvals-not-recorded className="ui-d-fd ui-t-mut">
            {L.approvalsNotRecordedLabel}
          </p>
        ) : null}
        {Array.isArray(rv.approvals)
          ? rv.approvals.map((a, i) => (
              <p key={`approval-${i}`} data-replayed-approval className="ui-t-m06 ui-d-fs ui-t-mut">
                {a.round}: {a.decision}
                {a.note != null ? ` — ${a.note}` : ""}
              </p>
            ))
          : null}
      </article>
    );
  }
  return (
    <article id="report" data-run-report={view.runId} className="ui-d-fs14">
      <h2 className="ui-t-f18">{L.heading}</h2>
      {/* RPT.1 (§15.3) — a Showcase-seeded run's report announces itself a worked example. */}
      {view.workedExample === true && L.workedExampleLabel != null ? (
        <p data-worked-example className="ui-d-fd ui-d-run ui-d-b">
          {L.workedExampleLabel}
        </p>
      ) : null}
      <p data-estimate-line className="ui-t-fg" style={{ fontVariantNumeric: "tabular-nums" }}>
        {L.estimateLine(view.spentCredits, view.estimateCredits, view.estimateRatio)}
      </p>
      {/* RPT.1 — the metered figure + each reasoned metered-vs-charged difference (§14.4 wording). */}
      {L.meteredLine && view.meteredCredits !== view.spentCredits ? (
        <p data-metered-line className="ui-d-fd ui-t-mut">
          {L.meteredLine(view.meteredCredits, view.spentCredits)}
        </p>
      ) : null}
      {view.differences.length > 0 && L.differenceLabel != null ? (
        <ul
          data-differences
          className="ui-c2-m0 ui-d-p0 ui-d-fd ui-t-mut"
          style={{ listStyle: "none" }}
        >
          {view.differences.map((d, i) => {
            const diffLabel = L.differenceLabel;
            return (
              <li key={i} data-difference={d.key} className="ui-t-p20">
                {diffLabel?.(d)}
              </li>
            );
          })}
        </ul>
      ) : null}
      {view.refundedCredits > 0 && L.refundLine ? (
        <p data-refund className="ui-d-fd ui-t-mut">
          {L.refundLine(view.refundedCredits)}
        </p>
      ) : null}
      {view.claims ? (
        <p data-claims className="ui-d-fd ui-t-mut">
          {L.claimsLine(view.claims.checked, view.claims.verified, view.claims.creditsPerVerified)}
        </p>
      ) : null}

      <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
        {L.phaseHeading}
      </h3>
      <ul data-phase-bars className="ui-c2-m0 ui-d-p0" style={{ listStyle: "none" }}>
        {view.phases.map((p) => (
          <li
            key={p.key}
            data-report-phase={p.key}
            data-phase-status={p.status}
            className="ui-d-fd ui-d-sc ui-d-p2 ui-c2-g2"
            style={
              {
                display: "flex",
                "--d-sev": p.status === "off" ? "var(--shell-fg-faint)" : "var(--shell-fg)",
              } as CSSProperties
            }
          >
            <span aria-hidden="true" className="ui-d-w14">
              {STATUS_GLYPH[p.status]}
            </span>
            <span>{L.phaseLabel(p.key)}</span>
            {p.status === "off" ? <span className="ui-d-i">{L.offLabel}</span> : null}
            <span
              className="ui-d-mla ui-t-mut ui-d-fs"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {L.phaseDetail(p.credits, p.durationMs, p.searches, p.fetches)}
            </span>
          </li>
        ))}
      </ul>

      {view.seatSplit.length > 0 ? (
        <>
          <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
            {L.seatsHeading}
          </h3>
          <ul data-seat-split className="ui-c2-m0 ui-d-p0 ui-d-fd" style={{ listStyle: "none" }}>
            {view.seatSplit.map((s) => (
              <li key={s.seat} data-seat={s.seat} className="ui-t-p20">
                {L.seatSplitLine(s.seat, s.credits, s.share)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.drivers.length > 0 ? (
        <>
          <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
            {L.driversHeading}
          </h3>
          <ul data-drivers className="ui-c2-m0 ui-d-p0 ui-d-fd" style={{ listStyle: "none" }}>
            {view.drivers.map((d, i) => (
              <li key={i} data-driver={d.key} className="ui-t-p20">
                {L.driverLabel(d.key, d.phase, d.share)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.flags.length > 0 ? (
        <>
          <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
            {L.flagsHeading}
          </h3>
          <ul data-flags className="ui-c2-m0 ui-d-p0 ui-d-fd" style={{ listStyle: "none" }}>
            {view.flags.map((f, i) => (
              <li key={i} data-flag={f.key} className="ui-t-p20">
                {L.flagLabel(f)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.suggestedGuidance.length > 0 ? (
        <>
          <h3 className="ui-d-fd ui-t-ls6 ui-t-mut" style={{ textTransform: "uppercase" }}>
            {L.guidanceHeading}
          </h3>
          <ul
            data-suggested-guidance
            className="ui-c2-m0 ui-d-p0 ui-d-fd"
            style={{ listStyle: "none" }}
          >
            {view.suggestedGuidance.map((g) => (
              <li key={g} data-guidance={g} className="ui-t-p20">
                {L.guidanceLabel(g)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Level 4 — the Advanced disclosure: phase × seat × model tier × credits × searches × fetches ×
          tokens × provider usage ids (§14.5; tokens live ONLY behind this fold). */}
      <details data-report-advanced className="ui-c2-mt4">
        <summary className="ui-d-fd ui-t-mut" style={{ cursor: "pointer" }}>
          {L.advancedHeading}
        </summary>
        {advanced ? (
          <table className="ui-vc-w ui-d-fs ui-c2-mt" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr className="ui-t-mut" style={{ textAlign: "left" }}>
                <th scope="col">{L.advancedColumns.phase}</th>
                <th scope="col">{L.advancedColumns.seat}</th>
                <th scope="col">{L.advancedColumns.subagent}</th>
                <th scope="col">{L.advancedColumns.model}</th>
                <th scope="col">{L.advancedColumns.modelTier}</th>
                <th scope="col">{L.advancedColumns.credits}</th>
                <th scope="col">{L.advancedColumns.searches}</th>
                <th scope="col">{L.advancedColumns.fetches}</th>
                <th scope="col">{L.advancedColumns.inputTokens}</th>
                <th scope="col">{L.advancedColumns.outputTokens}</th>
                <th scope="col">{L.advancedColumns.cacheTokens}</th>
                <th scope="col">{L.advancedColumns.providerIds}</th>
              </tr>
            </thead>
            <tbody>
              {advanced.rows.map((r, i) => (
                <tr key={i} data-usage-row>
                  <td>{r.phase != null ? L.phaseLabel(r.phase) : "—"}</td>
                  <td>{L.seatLabel(r.seat)}</td>
                  <td>{r.subagentLabel ?? "—"}</td>
                  <td>{r.model}</td>
                  <td>{r.modelTier}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.credits.toLocaleString("en-US")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.searches.toLocaleString("en-US")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.fetches.toLocaleString("en-US")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.inputTokens.toLocaleString("en-US")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {r.outputTokens.toLocaleString("en-US")}
                  </td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>
                    {(r.cacheReadTokens + r.cacheWriteTokens).toLocaleString("en-US")}
                  </td>
                  <td className="ui-d-s" style={{ wordBreak: "break-all" }}>
                    {r.providerRequestIds.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : advancedHref != null ? (
          <p className="ui-d-fs ui-t-mut">
            <a href={advancedHref} className="ui-d-inh" style={{ textDecoration: "underline" }}>
              {L.loadAdvanced}
            </a>
          </p>
        ) : (
          <p className="ui-d-fs ui-t-mut">{L.notAvailable}</p>
        )}
      </details>
    </article>
  );
}
