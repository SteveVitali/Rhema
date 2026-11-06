// SPA.10 — the `usage` surface's React twins (REQ-SEQ-9, REQ-DAT-1/4, REQ-TST-2; design/22 §2
// `usage`/`p.projectUsage` rows). `UsageSurface` ports pages.tsx `UsagePage` and
// `ProjectUsageSurface` ports `ProjectUsagePage` — the SAME `<Shell>`/`<PageTitle>` chrome, the
// same sections, the same `data-*` hooks, on data read through Query instead of `usePageData()`.
// The wrapper carries `data-spa-surface` (the shell manifest's per-surface mark); nothing else is
// invented — every hook literal resolves to dom-contract.ts.
//
// R7KIT.3a (REQ-KIT-3 batch a, REQ-KIT-4, REQ-GUARD-1): every style rides a `uiCss()` class, and
// the runs table's enum keys (workflow/state/bucket/plan) render through COPY-owned label maps —
// an unlisted key humanizes, so a raw snake_case key never reaches the page (D4).
//
// Degrade parity (REQ-BFF-9): the twin answers `{usage|null, account|null}` — a null field renders
// the section's absence exactly as the SSR's `usage ? … : null` branches do, never a fabricated
// zero. `/usage.csv` stays a binary document navigation (`<a href>`, REQ-BFF-17 — never a fetch);
// `/app/usage/r/:runId` rows link to the server-owned 302 surface verbatim.

import type { ReactNode } from "react";
import type { UsageAccountDto, UsageDto, UsageProjectDto } from "@rhema/api-client";
import { PRICING } from "@rhema/contracts";
import { COPY } from "../../copy.js";
import { useDwell } from "../dwell.js";
import { PageBody, PageHeader } from "../page-header.js";

// Destructure the two COPY branches once — the REQ-SAFE-10 leaf scan keys on `COPY.<path>`
// literals and every leaf it cites must be a string; the branch handles keep the same leaves
// without walking a non-leaf path in JSX.
const { usage: U, projectUsage: P } = COPY;

/** "trial_pocket" → "Trial pocket" — the humanized fallback an unlisted enum key degrades to. */
function humanizeKey(key: string): string {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** REQ-KIT-4 (D4) — an enum key renders its COPY label; an unlisted key humanizes, never leaks. */
function enumLabel(map: Record<string, string> | undefined, key: string): string {
  return map?.[key] ?? humanizeKey(key);
}

/** A plan key → the shared config's display name ("writer" → "Writer"); unknown humanizes. */
function planLabel(key: string): string {
  const spec = PRICING.plans[key as keyof typeof PRICING.plans];
  return spec != null ? spec.display : humanizeKey(key);
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
      <PageBody>
        <PageHeader title={U.heading} />
        {account ? (
          <section data-usage-account="true">
            <p className="ui-set-h2 ui-set-sec" data-usage-plan="true">
              {U.planLabel}: <strong>{planLabel(account.level0.plan)}</strong>
              {account.level0.trialDaysLeft != null ? (
                <>
                  {" · "}
                  {U.trialFmt.replace("{n}", String(account.level0.trialDaysLeft))}
                </>
              ) : null}
              {account.periodStart && account.periodEnd ? (
                <>
                  {" · "}
                  {U.periodFmt
                    .replace("{start}", account.periodStart.slice(0, 10))
                    .replace("{end}", account.periodEnd.slice(0, 10))}
                </>
              ) : null}
            </p>
            <p className="ui-set-t" data-usage-mtd="true">
              {U.monthToDateFmt.replace("{n}", account.monthToDateCredits.toLocaleString())}
              {account.includedMonthly > 0 ? (
                <>
                  {" · "}
                  {U.includedFmt
                    .replace("{remaining}", account.includedRemaining.toLocaleString())
                    .replace("{monthly}", account.includedMonthly.toLocaleString())}
                </>
              ) : null}
            </p>
            <h2 className="ui-set-h2 ui-set-sec">{U.bucketsHeading}</h2>
            <table className="ui-matrix" data-usage-buckets="true">
              <tbody>
                {account.buckets.map((b) => (
                  <tr key={b.bucket} data-usage-bucket={b.bucket}>
                    <td>{enumLabel(U.bucketLabels, b.bucket)}</td>
                    <td className="ui-matrix-r">{credits(b.available)}</td>
                    <td className="ui-matrix-m">
                      {b.held > 0 ? `${U.heldLabel}: ${credits(b.held)}` : ""}
                    </td>
                    <td className="ui-matrix-m">
                      {b.expiresAt ? U.expiresFmt.replace("{at}", b.expiresAt.slice(0, 10)) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {account.warnings.length > 0 ? (
              <section data-usage-warnings="true" className="ui-set-sec">
                <h2 className="ui-set-h2">{U.warningsHeading}</h2>
                <ul className="ui-set-list">
                  {account.warnings.map((w, i) => (
                    <li key={i} data-usage-warning="true">
                      {w}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {account.nextExpiry ? (
              <p className="ui-set-t ui-set-t--m" data-usage-next-expiry="true">
                {U.nextExpiryFmt
                  .replace("{n}", account.nextExpiry.credits.toLocaleString())
                  .replace("{bucket}", enumLabel(U.bucketLabels, account.nextExpiry.bucket))
                  .replace("{at}", account.nextExpiry.at.slice(0, 10))}
              </p>
            ) : null}
            <p className="ui-set-t ui-set-sec">
              {/* REQ-BILL-11/REQ-BFF-17 — the level-1 CSV export is a document navigation (the web
                  proxies the api's binary download; no bytes ever enter a JSON envelope). */}
              <a href="/usage.csv" data-usage-csv="true" data-spa-native>
                {U.csvCta}
              </a>
            </p>
          </section>
        ) : null}
        {usage ? (
          <>
            <p className="ui-set-h2 ui-set-sec" data-usage-balance="true">
              {U.spendableLabel}: <strong>{credits(usage.spendableCredits)}</strong>
              {" · "}
              <span title={U.heldNote}>
                {U.heldLabel}: {credits(usage.heldCredits)}
              </span>
            </p>
            <h2 className="ui-set-h2 ui-set-sec">{U.runsHeading}</h2>
            {usage.runs.length === 0 ? (
              <p className="ui-set-t ui-set-t--m">{U.runEmpty}</p>
            ) : (
              <table className="ui-matrix" data-usage-runs="true">
                <thead>
                  <tr>
                    <th>{U.columns.run}</th>
                    <th>{U.columns.workflow}</th>
                    <th>{U.columns.state}</th>
                    <th className="ui-matrix-r">{U.columns.spent}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.runs.map((r) => (
                    <tr key={r.runId} data-usage-run={r.runId}>
                      <td className="ui-matrix-r">{r.createdAt.slice(0, 10)}</td>
                      <td>{enumLabel(U.workflowLabels, r.workflow)}</td>
                      <td>{enumLabel(U.stateLabels, r.state)}</td>
                      <td className="ui-matrix-r">{credits(r.spentCredits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : null}
      </PageBody>
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
      <PageBody>
        <PageHeader
          title={P.heading}
          crumbs={[
            {
              label: usageProject.projectName,
              href: `/p/${encodeURIComponent(usageProject.slug)}`,
            },
            { label: P.heading },
          ]}
        />
        <p className="ui-set-h2 ui-set-sec" data-project-usage-total="true">
          {P.totalFmt
            .replace("{n}", usageProject.totalCredits.toLocaleString())
            .replace("{runs}", String(usageProject.runs.length))}
        </p>
        {usageProject.runs.length === 0 ? (
          <p className="ui-set-t ui-set-t--m">{P.runEmpty}</p>
        ) : (
          <table className="ui-matrix" data-project-usage-runs="true">
            <thead>
              <tr>
                <th>{P.columns.run}</th>
                <th>{P.columns.workflow}</th>
                <th>{P.columns.state}</th>
                {/* A spacer cell, not a header — an empty `<th>` is an axe violation
                    (empty-table-header); the SSR's `<th></th>` becomes a `<td>` here. */}
                <td></td>
                <th className="ui-matrix-r">{P.columns.spent}</th>
              </tr>
            </thead>
            <tbody>
              {usageProject.runs.map((r) => (
                <tr key={r.runId} data-project-usage-run={r.runId}>
                  <td className="ui-matrix-r">{r.at.slice(0, 10)}</td>
                  <td>{enumLabel(U.workflowLabels, r.workflow)}</td>
                  <td>{enumLabel(U.stateLabels, r.state)}</td>
                  <td>
                    <a href={`/app/usage/r/${encodeURIComponent(r.runId)}`}>{P.runReportCta}</a>
                  </td>
                  <td className="ui-matrix-r">{r.credits.toLocaleString()} cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </PageBody>
    </div>
  );
}
