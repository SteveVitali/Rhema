// SPA.4 — the shared route states. `SsrHandoff` is the client→server document handoff
// (REQ-FW-3/4, design/25 §strangler): a leaf whose boot-map verdict is "ssr" document-navigates
// to its own URL so the server re-decides the document — the settle probes see at most one
// boundary cross. SPA.28 re-scopes it: the flag-driven "unflipped surface" case is gone (every
// surface is SPA-only); what remains is the STRUCTURAL cases — a phone client's nav into a
// `pageMount` route (REQ-ED-12's forced-SSR Page) and the server-owned `surfaces:null` routes.
// `PendingShell`/`SpaRouteError`/`SpaNotFound` are the skeleton/error/404 halves (REQ-NAV-10,
// REQ-UX-6): a pending route renders skeleton rows, never blank; every user-facing string
// resolves to a `COPY` leaf (REQ-UX-12).

import { useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { spaRouteFor } from "@rhema/contracts";
import { ShellSkeleton } from "@rhema/ui";
import { COPY } from "../copy.js";
import { docMetaFor } from "../doc-meta.js";
import { AppShell, useInAppShell } from "./app-shell.js";
import { getSpaBoot, isSpaEnabled } from "./boot.js";
import { replaceDocument } from "./dom.js";
import { useProjectChromeFallback } from "./version-picker.js";

/** The h1 word for the current path — the doc title minus the " · Rhēma" suffix (COPY-sourced). */
function routeHeading(pathname: string): string {
  return docMetaFor(pathname).title.replace(/ — [^·]+ · Rhēma$/, "").replace(/ · Rhēma$/, "");
}

/**
 * The server-document handoff: document-navigation to THIS url so the server re-runs its fixed
 * handler order (session gate → server redirects → the Page family's forced-SSR check) — landing
 * on the forced-SSR Page, a server-owned 302, or (on a stale/malformed boot map) the shell again,
 * which hands straight back. Rendered while the navigation resolves so the paint is a skeleton,
 * never blank. The handoff is REPLACE-mode (REQ-NAVM-5): the client commit for this URL already
 * occupies the history slot, so a push would duplicate it and Back would bounce forward into the
 * handoff again — `replaceDocument` eats the transient entry.
 */
export function SsrHandoff(): ReactNode {
  const href = useLocation({ select: (l) => l.href });
  useEffect(() => {
    replaceDocument(href);
  }, [href]);
  return <SurfaceShell />;
}

/** The skeleton chrome every pending/handoff/unbuilt surface paints — h1 + ide-sk rows, no copy. */
export function SurfaceShell({ children }: { children?: ReactNode }): ReactNode {
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <main data-spa-surface>
      <h1>{routeHeading(pathname)}</h1>
      <ShellSkeleton />
      {children}
    </main>
  );
}

/** The router's `defaultPendingComponent` — skeleton rows while a lazy leaf or loader resolves. */
export function PendingShell(): ReactNode {
  return <SurfaceShell />;
}

/**
 * R7RO.1 (REQ-RELOAD-5; ADR-128's REQ-ED-12 item) — SPACAP.3's `twinForcesSsr` handoff is gone:
 * a showcase row's Page-family document is the SPA shell now (the server verdict is phone-only),
 * so no row fact ever sends a client navigation back to a document load. The twins still carry
 * `project.showcase` plus `project.readOnlyProject` — the read-only mechanism's row fact the
 * leaves consume (`readOnlyProjectFor` in ./read-only.tsx).
 */

/**
 * The leaf's boot-map branch: an SPA-verdict route renders its surface and a "ssr"-verdict route
 * (phone `pageMount`, server-owned) hands off to the server. The verdict comes from the boot map
 * the server stamped, so the client can never disagree about which document owns the route.
 */
export function SurfaceBoundary({ routeId }: { routeId: string }): ReactNode {
  if (!isSpaEnabled(getSpaBoot(), routeId)) return <SsrHandoff />;
  return <SurfaceShell />;
}

/**
 * The skeleton leaf's `component` — a named factory so every leaf file keeps a literal
 * `component:` property the autoCodeSplitting plugin can hoist into the leaf's own chunk
 * (REQ-TL-9: no eager import of a surface outside its own chunk).
 */
export function surfaceComponent(routeId: string): () => ReactNode {
  return function SurfaceLeaf() {
    return <SurfaceBoundary routeId={routeId} />;
  };
}

/**
 * `defaultNotFoundComponent` (design/25 F9, REQ-NAV-10). The unmatched path may be a server-owned
 * redirect-only GET (`surfaces === null` — `/settings`, `/app/settings` bare, `/app/usage/r/$runId`,
 * `/p/$p/edit/$d`, `/p/$p/f/$fid`): those take the document nav so the server's canonical 302 still
 * answers. Anything else under SPA space renders the NotFoundPage equivalent — the client owns
 * not-found once the shell is up.
 */
export function SpaNotFound(): ReactNode {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { surfaces } = spaRouteFor(pathname);
  if (surfaces === null) return <SsrHandoff />;
  // R7SHELL.1a (REQ-SHELL-1; UXC-29, D6) — the 404 renders inside the AppShell whenever the path
  // is SPA space: at leaf position the layout's shell already wraps it (InShell), at a position
  // with no mounted layout (the fuzzy root boundary) this component mounts the shell itself.
  const inShell = useInAppShell();
  // R7SYNC.1 (REQ-SYNC-3; R5 G3) — the in-project 404 publishes the project-scoped chrome
  // (the versions twin's `ide` bag): the Timeline tab shows the REAL round log here too.
  const slug = /^\/p\/([^/]+)\//.exec(pathname)?.[1];
  useProjectChromeFallback(slug != null ? decodeURIComponent(slug) : null);
  const body = (
    <main data-spa-surface>
      <h1>{COPY.notFound.heading}</h1>
      <p>{COPY.notFound.body}</p>
      <p>
        <a href="/app">{COPY.notFound.home}</a>
      </p>
    </main>
  );
  return inShell ? body : <AppShell>{body}</AppShell>;
}

/** The route `errorComponent` — a designed state, not a stack trace (REQ-UX-6; §5.9). */
export function SpaRouteError(): ReactNode {
  const pathname = useLocation({ select: (l) => l.pathname });
  // R7SHELL.1a — the error state renders inside the shell too (same InShell rule as the 404),
  // on SPA-space paths only — a non-SPA path keeps the bare boundary.
  const inShell = useInAppShell();
  const { surfaces } = spaRouteFor(pathname);
  const body = (
    <main data-spa-surface data-spa-error>
      <h1>{COPY.spaError.heading}</h1>
      <p>{COPY.spaError.body}</p>
      <p>
        <a href={pathname}>{COPY.spaError.retry}</a>
      </p>
    </main>
  );
  return inShell || surfaces === null ? body : <AppShell>{body}</AppShell>;
}
