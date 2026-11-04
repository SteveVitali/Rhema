// R6LGL.1 (REQ-LCH-1; GD-LEGAL.R6 / GD-LEGAL-DETAILS.R6; ADR-118) — the legal/trust
// documents' SSR renderer + the public footer every funnel page shares.
//
// The content model lives in contracts (`LEGAL_PAGES` — routeId · title · navLabel ·
// `approved` · `details`) and `COPY.legal` (the drafted text, `⟦KEY⟧`-marked at the
// operator-fill slots). While `approved` is false the page renders `COPY.legal.draftBanner`
// — the public-facing honesty marker — and every `⟦KEY⟧` renders a
// `data-legal-placeholder` mark until R6CNT.2 fills `LEGAL_DETAILS` for HUMAN-H11's record.
// `legalApprovalViolations` (contracts) is the invariant CI pins: an approved page can never
// still carry a placeholder.

import type { ReactNode } from "react";
import { Shell, PageTitle, SectionTitle } from "@rhema/ui";
import {
  LEGAL_DETAILS,
  LEGAL_DETAIL_KEYS,
  LEGAL_DETAIL_LABELS,
  LEGAL_PAGES,
  LEGAL_PLACEHOLDER_RE,
  type LegalDetailKey,
  type LegalPageRow,
  type LegalRouteId,
} from "@rhema/contracts";
import { COPY } from "./copy.js";

const MUTED = { color: "var(--shell-fg-muted)", fontSize: "14px", lineHeight: 1.7, maxWidth: "68ch" } as const;
const SECTION = { marginTop: "32px" } as const;
const PLACEHOLDER_MARK = {
  background: "var(--state-needs-you)",
  color: "var(--shell-bg)",
  padding: "0 4px",
  borderRadius: "3px",
  fontSize: "0.9em",
} as const;

/**
 * The ONE footer every public SSR page carries (R6LGL.1): the brand + the legal/trust link
 * group enumerated from `LEGAL_PAGES` — the census order is the link order, so an omitted
 * page or a stale label is a single-table fix, never five files to edit.
 */
export function publicFooter(): ReactNode {
  return (
    <>
      <span>{COPY.footer}</span>
      <span aria-hidden="true">{" · "}</span>
      <nav data-legal-nav aria-label={COPY.legal.footerLabel} style={{ display: "inline" }}>
        {LEGAL_PAGES.map((p, i) => (
          <span key={p.routeId}>
            {i > 0 ? <span aria-hidden="true">{" · "}</span> : null}
            <a href={p.routeId} style={{ color: "inherit" }}>{p.navLabel}</a>
          </span>
        ))}
      </nav>
      {/* 222 R7DEM.6a (REQ-TOUR-4; S-14) — the shared footer's /demo entry: a document
          navigation on every public SSR page. */}
      <span aria-hidden="true">{" · "}</span>
      <a href="/demo" data-spa-native data-demo-entry="footer" style={{ color: "inherit" }}>{COPY.footerDemo}</a>
    </>
  );
}

/**
 * Render one text run, substituting `⟦KEY⟧` slots: a filled `LEGAL_DETAILS` value renders as
 * text (a `mailto:` for the contact email); an unfilled slot renders the
 * `data-legal-placeholder` mark — the same hook the DOM contract + the placeholder tests pin.
 * A `⟦…⟧` token that names no detail key (e.g. the banner's literal `⟦KEY⟧` example) passes
 * through as literal text.
 */
function renderLegalText(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let cursor = 0;
  let n = 0;
  for (const m of text.matchAll(LEGAL_PLACEHOLDER_RE)) {
    const key = m[1]! as LegalDetailKey;
    if (!(LEGAL_DETAIL_KEYS as readonly string[]).includes(key)) continue;
    const at = m.index!;
    if (at > cursor) out.push(text.slice(cursor, at));
    const value = LEGAL_DETAILS[key];
    if (value == null) {
      out.push(
        <mark
          key={`k${n++}`}
          data-legal-placeholder={key}
          title={`${LEGAL_DETAIL_LABELS[key]} — to be filled before approval`}
          style={PLACEHOLDER_MARK}
        >
          ⟦{key}⟧
        </mark>,
      );
    } else if (key === "CONTACT_EMAIL") {
      out.push(
        <a key={`k${n++}`} href={`mailto:${value}`}>
          {value}
        </a>,
      );
    } else {
      out.push(<span key={`k${n++}`}>{value}</span>);
    }
    cursor = at + m[0].length;
  }
  out.push(text.slice(cursor));
  return out;
}

/** The drafted copy for a page — `COPY.legal.<pageKey>` where the key is the routeId-less name. */
export type LegalCopyKey = "terms" | "privacy" | "refunds" | "acceptableUse" | "contact";
export const LEGAL_COPY_KEY: Record<LegalRouteId, LegalCopyKey> = {
  "/terms": "terms",
  "/privacy": "privacy",
  "/refunds": "refunds",
  "/acceptable-use": "acceptableUse",
  "/contact": "contact",
};

/**
 * A legal/trust document (REQ-LCH-1). SSR-only like the rest of the funnel (REQ-BND-5): the
 * route census is `SPA_PUBLIC_ROUTES`, the DOM hook is `data-legal-page` (the routeId), and
 * `approved: false` rides the `data-legal-draft` banner until the operator's HUMAN-H11 flip.
 */
export function LegalPage({ page }: { page: LegalPageRow }): ReactNode {
  const copy = COPY.legal[LEGAL_COPY_KEY[page.routeId]];
  return (
    <Shell brand={COPY.brand} footer={publicFooter()}>
      <article data-legal-page={page.routeId}>
        <PageTitle>{page.title}</PageTitle>
        {page.approved ? null : (
          <p
            data-legal-draft
            role="status"
            style={{
              border: "1px solid var(--shell-border)",
              borderRadius: "8px",
              padding: "10px 14px",
              background: "var(--shell-raised)",
              color: "var(--shell-fg)",
              fontSize: "13px",
              lineHeight: 1.6,
            }}
          >
            {COPY.legal.draftBanner}
          </p>
        )}
        <p style={MUTED}>{renderLegalText(copy.lede)}</p>
        {copy.sections.map((s) => (
          <section key={s.heading} style={SECTION}>
            <SectionTitle>{s.heading}</SectionTitle>
            {s.paragraphs.map((p, i) => (
              <p key={i} style={MUTED}>
                {renderLegalText(p)}
              </p>
            ))}
          </section>
        ))}
      </article>
    </Shell>
  );
}

/** The five document elements `routes.tsx` + `server.ts` bind (one per census row). */
export const legalElements: Record<LegalRouteId, ReactNode> = Object.fromEntries(
  LEGAL_PAGES.map((p) => [p.routeId, <LegalPage key={p.routeId} page={p} />]),
) as Record<LegalRouteId, ReactNode>;
