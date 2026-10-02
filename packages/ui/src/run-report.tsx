// The run report surface (§5.5 D20; §14.5 Level 3 + the Level-4 Advanced disclosure; REQ-IDE-19). Renders
// the findings-core `RunReportView` verbatim — estimate vs actual, phase bars, the seat split, flags,
// claims verified × cost-per-claim, suggested guidance — plus, behind a `<details>` (the same progressive
// disclosure idiom the Advanced toggle uses), the phase × seat × model-tier rows with tokens and provider
// usage ids. No prompt, transcript, or source text exists on the view models, so none can render.

import type { ReactNode } from "react";
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
  readonly phaseDetail: (credits: number, durationMs: number | null, searches: number, fetches: number) => string;
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
  return (
    <article id="report" data-run-report={view.runId} style={{ fontSize: "14px" }}>
      <h2 style={{ fontSize: "18px" }}>{L.heading}</h2>
      {/* RPT.1 (§15.3) — a Showcase-seeded run's report announces itself a worked example. */}
      {view.workedExample === true && L.workedExampleLabel != null ? (
        <p data-worked-example style={{ fontSize: "13px", color: "var(--state-running)", fontWeight: 600 }}>
          {L.workedExampleLabel}
        </p>
      ) : null}
      <p data-estimate-line style={{ fontVariantNumeric: "tabular-nums", color: "var(--shell-fg)" }}>
        {L.estimateLine(view.spentCredits, view.estimateCredits, view.estimateRatio)}
      </p>
      {/* RPT.1 — the metered figure + each reasoned metered-vs-charged difference (§14.4 wording). */}
      {L.meteredLine && view.meteredCredits !== view.spentCredits ? (
        <p data-metered-line style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
          {L.meteredLine(view.meteredCredits, view.spentCredits)}
        </p>
      ) : null}
      {view.differences.length > 0 && L.differenceLabel != null ? (
        <ul data-differences style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px", color: "var(--shell-fg-muted)" }}>
          {view.differences.map((d, i) => {
            const diffLabel = L.differenceLabel;
            return (
              <li key={i} data-difference={d.key} style={{ padding: "2px 0" }}>
                {diffLabel?.(d)}
              </li>
            );
          })}
        </ul>
      ) : null}
      {view.refundedCredits > 0 && L.refundLine ? (
        <p data-refund style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{L.refundLine(view.refundedCredits)}</p>
      ) : null}
      {view.claims ? (
        <p data-claims style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>
          {L.claimsLine(view.claims.checked, view.claims.verified, view.claims.creditsPerVerified)}
        </p>
      ) : null}

      <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{L.phaseHeading}</h3>
      <ul data-phase-bars style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {view.phases.map((p) => (
          <li key={p.key} data-report-phase={p.key} data-phase-status={p.status} style={{ display: "flex", gap: "8px", padding: "4px 0", fontSize: "13px", color: p.status === "off" ? "var(--shell-fg-faint)" : "var(--shell-fg)" }}>
            <span aria-hidden="true" style={{ width: "14px" }}>{STATUS_GLYPH[p.status]}</span>
            <span>{L.phaseLabel(p.key)}</span>
            {p.status === "off" ? <span style={{ color: "var(--shell-fg-faint)", fontSize: "12px" }}>{L.offLabel}</span> : null}
            <span style={{ marginLeft: "auto", color: "var(--shell-fg-muted)", fontVariantNumeric: "tabular-nums", fontSize: "12px" }}>
              {L.phaseDetail(p.credits, p.durationMs, p.searches, p.fetches)}
            </span>
          </li>
        ))}
      </ul>

      {view.seatSplit.length > 0 ? (
        <>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{L.seatsHeading}</h3>
          <ul data-seat-split style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px" }}>
            {view.seatSplit.map((s) => (
              <li key={s.seat} data-seat={s.seat} style={{ padding: "2px 0" }}>
                {L.seatSplitLine(s.seat, s.credits, s.share)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.drivers.length > 0 ? (
        <>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{L.driversHeading}</h3>
          <ul data-drivers style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px" }}>
            {view.drivers.map((d, i) => (
              <li key={i} data-driver={d.key} style={{ padding: "2px 0" }}>
                {L.driverLabel(d.key, d.phase, d.share)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.flags.length > 0 ? (
        <>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{L.flagsHeading}</h3>
          <ul data-flags style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px" }}>
            {view.flags.map((f, i) => (
              <li key={i} data-flag={f.key} style={{ padding: "2px 0" }}>
                {L.flagLabel(f)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {view.suggestedGuidance.length > 0 ? (
        <>
          <h3 style={{ fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--shell-fg-muted)" }}>{L.guidanceHeading}</h3>
          <ul data-suggested-guidance style={{ listStyle: "none", margin: 0, padding: 0, fontSize: "13px" }}>
            {view.suggestedGuidance.map((g) => (
              <li key={g} data-guidance={g} style={{ padding: "2px 0" }}>
                {L.guidanceLabel(g)}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Level 4 — the Advanced disclosure: phase × seat × model tier × credits × searches × fetches ×
          tokens × provider usage ids (§14.5; tokens live ONLY behind this fold). */}
      <details data-report-advanced style={{ marginTop: "16px" }}>
        <summary style={{ fontSize: "13px", color: "var(--shell-fg-muted)", cursor: "pointer" }}>{L.advancedHeading}</summary>
        {advanced ? (
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px", marginTop: "8px" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
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
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.credits.toLocaleString("en-US")}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.searches.toLocaleString("en-US")}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.fetches.toLocaleString("en-US")}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.inputTokens.toLocaleString("en-US")}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.outputTokens.toLocaleString("en-US")}</td>
                  <td style={{ fontVariantNumeric: "tabular-nums" }}>{(r.cacheReadTokens + r.cacheWriteTokens).toLocaleString("en-US")}</td>
                  <td style={{ fontSize: "11px", wordBreak: "break-all" }}>{r.providerRequestIds.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : advancedHref != null ? (
          <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>
            <a href={advancedHref} style={{ color: "inherit", textDecoration: "underline" }}>
              {L.loadAdvanced}
            </a>
          </p>
        ) : (
          <p style={{ fontSize: "12px", color: "var(--shell-fg-muted)" }}>{L.notAvailable}</p>
        )}
      </details>
    </article>
  );
}
