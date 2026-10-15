// SPA.10 — the `usage` surface's React twins (REQ-SEQ-9, REQ-DAT-1/4, REQ-TST-2; design/22 §2
// `usage`/`p.projectUsage` rows). `UsageSurface` ports pages.tsx `UsagePage` and
// `ProjectUsageSurface` ports `ProjectUsagePage` — the SAME `<Shell>`/`<PageTitle>` chrome, the
// same sections, the same `data-*` hooks, on data read through Query instead of `usePageData()`.
// The wrapper carries `data-spa-surface` (the shell manifest's per-surface mark); nothing else is
// invented — every hook literal resolves to dom-contract.ts.
//
// Degrade parity (REQ-BFF-9): the twin answers `{usage|null, account|null}` — a null field renders
// the section's absence exactly as the SSR's `usage ? … : null` branches do, never a fabricated
// zero. `/usage.csv` stays a binary document navigation (`<a href>`, REQ-BFF-17 — never a fetch);
// `/app/usage/r/:runId` rows link to the server-owned 302 surface verbatim.

import type { ReactNode } from "react";
import { Shell, PageTitle } from "@rhema/ui";
import type { UsageAccountDto, UsageDto, UsageProjectDto } from "@rhema/api-client";
import { COPY } from "../../copy.js";
import { useDwell } from "../dwell.js";

// Destructure the two COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>`
// literals and every leaf it cites must be a string; the branch handles keep the same leaves
// without walking a non-leaf path in JSX.
const { usage: U, projectUsage: P } = COPY;

function footer(): ReactNode {
  return <span>{COPY.footer}</span>;
}

/** `/usage` — the §14.5 level-1 glance + the level-1 account read (buckets, MTD, warnings, CSV). */
export function UsageSurface({
  usage,
  account,
}: {
  readonly usage: UsageDto | null;
  readonly account: UsageAccountDto | null;
}): ReactNode {
  // REQ-BETA-10 — the same `dwellSurface:"usage"` heartbeat the SSR document carries (the beat
  // posts only while this surface is mounted, mirroring the document's script lifetime).
  useDwell("usage");
  const credits = (n: number) => `${n.toLocaleString()} ${U.creditsSuffix}`;
  return (
    <div data-spa-surface>
      <Shell brand={COPY.brand} nav={<a href="/app">{COPY.project.backToList}</a>} footer={footer()}>
        <PageTitle>{U.heading}</PageTitle>
        {account ? (
          <section data-usage-account="true">
            <p style={{ fontSize: "14px", margin: "12px 0" }} data-usage-plan="true">
              {U.planLabel}: <strong>{account.level0.plan}</strong>
              {account.level0.trialDaysLeft != null ? (
                <>{" · "}{U.trialFmt.replace("{n}", String(account.level0.trialDaysLeft))}</>
              ) : null}
              {account.periodStart && account.periodEnd ? (
                <>{" · "}{U.periodFmt
                  .replace("{start}", account.periodStart.slice(0, 10))
                  .replace("{end}", account.periodEnd.slice(0, 10))}</>
              ) : null}
            </p>
            <p style={{ fontSize: "14px", margin: "4px 0" }} data-usage-mtd="true">
              {U.monthToDateFmt.replace("{n}", account.monthToDateCredits.toLocaleString())}
              {account.includedMonthly > 0 ? (
                <>{" · "}{U.includedFmt
                  .replace("{remaining}", account.includedRemaining.toLocaleString())
                  .replace("{monthly}", account.includedMonthly.toLocaleString())}</>
              ) : null}
            </p>
            <h2 style={{ fontSize: "14px", margin: "16px 0 8px" }}>{U.bucketsHeading}</h2>
            <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-usage-buckets="true">
              <tbody>
                {account.buckets.map((b) => (
                  <tr key={b.bucket} data-usage-bucket={b.bucket}>
                    <td style={{ padding: "4px 8px 4px 0" }}>{U.bucketLabels[b.bucket] ?? b.bucket}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {credits(b.available)}
                    </td>
                    <td style={{ padding: "4px 8px", color: "var(--shell-fg-muted)" }}>
                      {b.held > 0 ? `${U.heldLabel}: ${credits(b.held)}` : ""}
                    </td>
                    <td style={{ padding: "4px 0 4px 8px", color: "var(--shell-fg-muted)" }}>
                      {b.expiresAt ? U.expiresFmt.replace("{at}", b.expiresAt.slice(0, 10)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {account.warnings.length > 0 ? (
              <section data-usage-warnings="true" style={{ margin: "16px 0" }}>
                <h2 style={{ fontSize: "14px", margin: "0 0 8px" }}>{U.warningsHeading}</h2>
                <ul style={{ fontSize: "13px", margin: 0, paddingLeft: "18px" }}>
                  {account.warnings.map((w, i) => (
                    <li key={i} data-usage-warning="true">{w}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {account.nextExpiry ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }} data-usage-next-expiry="true">
                {U.nextExpiryFmt
                  .replace("{n}", account.nextExpiry.credits.toLocaleString())
                  .replace("{bucket}", U.bucketLabels[account.nextExpiry.bucket] ?? account.nextExpiry.bucket)
                  .replace("{at}", account.nextExpiry.at.slice(0, 10))}
              </p>
            ) : null}
            <p style={{ fontSize: "13px", margin: "12px 0" }}>
              {/* REQ-BILL-11/REQ-BFF-17 — the level-1 CSV export is a document navigation (the web
                  proxies the api's binary download; no bytes ever enter a JSON envelope). */}
              <a href="/usage.csv" data-usage-csv="true" data-spa-native>{U.csvCta}</a>
            </p>
          </section>
        ) : null}
        {usage ? (
          <>
            <p style={{ fontSize: "14px", margin: "12px 0" }} data-usage-balance="true">
              {U.spendableLabel}: <strong>{credits(usage.spendableCredits)}</strong>
              {" · "}
              <span title={U.heldNote}>
                {U.heldLabel}: {credits(usage.heldCredits)}
              </span>
            </p>
            <h2 style={{ fontSize: "14px", margin: "16px 0 8px" }}>{U.runsHeading}</h2>
            {usage.runs.length === 0 ? (
              <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{U.runEmpty}</p>
            ) : (
              <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-usage-runs="true">
                <thead>
                  <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
                    <th style={{ padding: "4px 8px 4px 0" }}>{U.columns.run}</th>
                    <th style={{ padding: "4px 8px" }}>{U.columns.workflow}</th>
                    <th style={{ padding: "4px 8px" }}>{U.columns.state}</th>
                    <th style={{ padding: "4px 0 4px 8px", textAlign: "right" }}>{U.columns.spent}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.runs.map((r) => (
                    <tr key={r.runId} data-usage-run={r.runId}>
                      <td style={{ padding: "4px 8px 4px 0", fontVariantNumeric: "tabular-nums" }}>
                        {r.createdAt.slice(0, 10)}
                      </td>
                      <td style={{ padding: "4px 8px" }}>{r.workflow}</td>
                      <td style={{ padding: "4px 8px" }}>{r.state}</td>
                      <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {credits(r.spentCredits)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
      </Shell>
    </div>
  );
}

/** `/p/:slug/usage` — the §14.5 level-2 project rollup: total + the per-run cost rows linking to
 *  the server-owned run-report redirect surface (`/app/usage/r/:runId` — a 302, never a twin). */
export function ProjectUsageSurface({
  usageProject,
}: {
  readonly usageProject: UsageProjectDto & { readonly slug: string };
}): ReactNode {
  return (
    <div data-spa-surface>
      <Shell
        brand={COPY.brand}
        nav={<a href={`/p/${encodeURIComponent(usageProject.slug)}`}>{P.backToProject}</a>}
        footer={footer()}
      >
        <PageTitle>{P.heading} — {usageProject.projectName}</PageTitle>
        <p style={{ fontSize: "14px", margin: "12px 0" }} data-project-usage-total="true">
          {P.totalFmt
            .replace("{n}", usageProject.totalCredits.toLocaleString())
            .replace("{runs}", String(usageProject.runs.length))}
        </p>
        {usageProject.runs.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--shell-fg-muted)" }}>{P.runEmpty}</p>
        ) : (
          <table style={{ fontSize: "13px", borderCollapse: "collapse", width: "100%" }} data-project-usage-runs="true">
            <thead>
              <tr style={{ textAlign: "left", color: "var(--shell-fg-muted)" }}>
                <th style={{ padding: "4px 8px 4px 0" }}>{P.columns.run}</th>
                <th style={{ padding: "4px 8px" }}>{P.columns.workflow}</th>
                <th style={{ padding: "4px 8px" }}>{P.columns.state}</th>
                {/* A spacer cell, not a header — an empty `<th>` is an axe violation
                    (empty-table-header); the SSR's `<th></th>` becomes a `<td>` here. */}
                <td style={{ padding: "4px 8px" }}></td>
                <th style={{ padding: "4px 0 4px 8px", textAlign: "right" }}>{P.columns.spent}</th>
              </tr>
            </thead>
            <tbody>
              {usageProject.runs.map((r) => (
                <tr key={r.runId} data-project-usage-run={r.runId}>
                  <td style={{ padding: "4px 8px 4px 0", fontVariantNumeric: "tabular-nums" }}>{r.at.slice(0, 10)}</td>
                  <td style={{ padding: "4px 8px" }}>{r.workflow}</td>
                  <td style={{ padding: "4px 8px" }}>{r.state}</td>
                  <td style={{ padding: "4px 8px" }}>
                    <a href={`/app/usage/r/${encodeURIComponent(r.runId)}`}>{P.runReportCta}</a>
                  </td>
                  <td style={{ padding: "4px 0 4px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {r.credits.toLocaleString()} cr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Shell>
    </div>
  );
}
