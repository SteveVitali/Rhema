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
import { getSpaBoot, isSpaEnabled } from "./boot.js";
import { replaceDocument } from "./dom.js";

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
 * SPACAP.3 (G2) — the showcase leg of the Page family's forced-SSR truth. The document forces
 * the SSR Page on `isPhoneRequest(c) || row.showcase === true`; the boot map owns the phone leg
 * (a request fact) and the Page-family twins own the showcase leg (a ROW fact the request-scoped
 * boot payload cannot see — the map is route-keyed, not slug-keyed). A leaf whose twin says the
 * row is showcase hands the navigation back to a document load through the same `SsrHandoff`
 * path the phone leg takes — the server's fixed order then lands the forced-SSR arm, so the
 * client's effective verdict mirrors the server's `phone || showcase` predicate exactly.
 */
export function twinForcesSsr(
  twin: { readonly project?: { readonly showcase?: boolean } } | null | undefined,
): boolean {
  return twin?.project?.showcase === true;
}

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
  return (
    <main data-spa-surface>
      <h1>{COPY.notFound.heading}</h1>
      <p>{COPY.notFound.body}</p>
      <p>
        <a href="/">{COPY.notFound.home}</a>
      </p>
    </main>
  );
}

/** The route `errorComponent` — a designed state, not a stack trace (REQ-UX-6; §5.9). */
export function SpaRouteError(): ReactNode {
  const pathname = useLocation({ select: (l) => l.pathname });
  return (
    <main data-spa-surface data-spa-error>
      <h1>{COPY.spaError.heading}</h1>
      <p>{COPY.spaError.body}</p>
      <p>
        <a href={pathname}>{COPY.spaError.retry}</a>
      </p>
    </main>
  );
}
