// SPA.4 — the shared route states. `SsrHandoff` is the strangler's exit (REQ-FW-3/4, design/25
// §strangler): an unflipped leaf document-navigates to its own URL so the server re-decides the
// renderer — the settle probes see at most one boundary cross. `PendingShell`/`SpaRouteError`/
// `SpaNotFound` are the skeleton/error/404 halves (REQ-NAV-10, REQ-UX-6): a pending route renders
// skeleton rows, never blank; every user-facing string resolves to a `COPY` leaf (REQ-UX-12).

import { useEffect, type ReactNode } from "react";
import { useLocation } from "@tanstack/react-router";
import { spaRouteFor } from "@rhema/contracts";
import { ShellSkeleton } from "@rhema/ui";
import { COPY } from "../copy.js";
import { docMetaFor } from "../doc-meta.js";
import { getSpaBoot, isSpaEnabled } from "./boot.js";
import { navigateDocument } from "./dom.js";

/** The h1 word for the current path — the doc title minus the " · Rhēma" suffix (COPY-sourced). */
function routeHeading(pathname: string): string {
  return docMetaFor(pathname).title.replace(/ — [^·]+ · Rhēma$/, "").replace(/ · Rhēma$/, "");
}

/**
 * The strangler boundary: document-navigation to THIS url so the server re-runs the fixed handler
 * order (session gate → server redirects → renderer consult) — landing on the SSR twin, a 302, or
 * (on a stale/malformed boot map) the shell again, which hands straight back. Rendered while the
 * navigation resolves so the paint is a skeleton, never blank.
 */
export function SsrHandoff(): ReactNode {
  const href = useLocation({ select: (l) => l.href });
  useEffect(() => {
    navigateDocument(href);
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
 * The leaf's strangler branch: a flagged surface renders its (SPA.4) stub — real content lands with
 * the surface's owner ticket — and an unflipped one hands off to the server. The verdict comes from
 * the boot map the server consulted, so the client can never disagree about the effective flag set.
 */
export function SurfaceBoundary({ routeId }: { routeId: string }): ReactNode {
  if (!isSpaEnabled(getSpaBoot(), routeId)) return <SsrHandoff />;
  return <SurfaceShell />;
}

/**
 * The skeleton leaf's `component` — a named factory so every leaf file keeps a literal
 * `component:` property the autoCodeSplitting plugin can hoist into the leaf's own chunk
 * (REQ-TL-9: no eager import of a surface outside its own chunk — SPA.4 leaves carry no surface
 * code at all; the real component lands with the surface's owner ticket).
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
