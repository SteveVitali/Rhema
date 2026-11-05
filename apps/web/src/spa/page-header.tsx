// R7SHELL.1b (REQ-SHELL-3/5; R6 §3's 14-header table; UXC-11/12) — the one page-header content
// row the framed surfaces render where the hand-picked `<Shell nav=…>` header used to sit. The
// AppShell owns the chrome now, so a leaf's header is content: an optional `Project › Surface`
// breadcrumb (SPA links — the plain `<a>` rides the one interceptor) and the page's `<PageTitle>`
// h1, which stays the REQ-COPY-7 route-focus target (`[data-spa-root] h1`, `spa/head.tsx`).
//
// `PageBody` replaces `<Shell>`'s `<main>` — the same 880 px column / 24 px padding — so a leaf
// keeps its single `<main>` landmark inside `app-shell-content` (the hosted IDE leaves keep
// `IdeShell`'s own `#ide-page` main and never mount this row).
//
// The breadcrumb contract (the format this ticket owns; 237's page header strip consumes it):
// `crumbs` is the full trail — every crumb but the last renders a `<a data-breadcrumb-link>`
// when it carries `href`; the last is the current surface's `aria-current="page"` text. In
// project scope the trail is `<project title — the twin's, else the slug> → /p/:slug` then the
// surface label; detail pages (the figure card) append their item as the current tail, so the
// middle crumb keeps the retired "Back to figures" affordance inside the crumb itself.

import { Fragment, type ReactNode } from "react";
import { PageTitle } from "@rhema/ui";
import { COPY } from "../copy.js";

/** One breadcrumb segment — `href` links the non-terminal crumbs; the last is the current page. */
export interface PageCrumb {
  readonly label: string;
  readonly href?: string;
}

export function PageHeader({
  title,
  crumbs,
}: {
  readonly title: ReactNode;
  readonly crumbs?: readonly PageCrumb[];
}): ReactNode {
  return (
    <header data-page-header="true">
      {crumbs != null && crumbs.length > 0 ? (
        <nav
          aria-label={COPY.pageHeader.breadcrumbAria}
          data-page-breadcrumb="true"
          style={{ fontSize: "12px", color: "var(--shell-fg-faint)", margin: "0 0 6px" }}
        >
          {crumbs.map((c, i) => {
            const last = i === crumbs.length - 1;
            return (
              <Fragment key={`${i}-${c.label}`}>
                {i > 0 ? <span aria-hidden="true">{` ${COPY.pageHeader.separator} `}</span> : null}
                {!last && c.href != null ? (
                  <a href={c.href} data-breadcrumb-link="true" style={{ color: "var(--shell-fg-muted)" }}>
                    {c.label}
                  </a>
                ) : (
                  <span {...(last ? { "aria-current": "page" as const } : {})}>{c.label}</span>
                )}
              </Fragment>
            );
          })}
        </nav>
      ) : null}
      <PageTitle>{title}</PageTitle>
    </header>
  );
}

/** The content column `<Shell>` used to emit — the leaf's `<main>` landmark + the 880 px cap. */
export function PageBody({ children }: { children: ReactNode }): ReactNode {
  return (
    <main
      style={{
        flex: 1,
        width: "100%",
        maxWidth: "880px",
        margin: "0 auto",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
    >
      {children}
    </main>
  );
}
