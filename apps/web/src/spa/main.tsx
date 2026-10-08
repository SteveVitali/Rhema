// SPA.4 — the SPA entry. Mounts TanStack Router over the committed `routeTree.gen.ts` (file-based,
// autoCodeSplitting — every auth'd document route registered day one, REQ-NAV-1), seeds the
// `["session"]` query from the `data-spa-boot` embed (a seed, not a grant — spec §3.2), binds the
// 401 leg (`invalidate session → document-nav /login`), and mounts under StrictMode (the
// double-mount contract — every effect here is idempotent).
//
// Flag-∅ posture: nothing in this module renders a surface; an unflipped route's leaf renders
// `SsrHandoff` and hands the document straight back to the server.

import { StrictMode } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { routeTree } from "./routeTree.gen.js";
import { readSpaBoot, setSpaBoot, type SpaBoot } from "./boot.js";
import { setSessionExpiredHandler } from "./bff.js";
import { navigateDocument } from "./dom.js";
import { makeSpaQueryClient, sessionQuery } from "./queries.js";
import { PendingShell, SpaNotFound, SpaRouteError } from "./states.js";

/** The router context — loaders read `queryClient` for `ensureQueryData`; leaves read `boot`. */
export interface SpaContext {
  readonly queryClient: QueryClient;
  readonly boot: SpaBoot | null;
}

export function createSpaRouter(opts?: {
  boot?: SpaBoot | null;
  queryClient?: QueryClient;
  /** Test seam — a memory history; production uses the default browser history. */
  history?: RouterHistory;
}) {
  const queryClient = opts?.queryClient ?? makeSpaQueryClient();
  const boot = opts?.boot === undefined ? readSpaBoot() : opts.boot;
  setSpaBoot(boot);
  // The boot principal seeds (never grants) the session query — `/session` stays the oracle and the
  // query stays refetchable.
  if (boot?.principal != null) queryClient.setQueryData(sessionQuery.queryKey, boot.principal);
  // REQ-FW-6's 401 leg: drop any cached principal and hand the document to /login (outside the
  // tree ⇒ a real document navigation). `setQueryData(undefined)` + `invalidateQueries` — NOT
  // `removeQueries`: destroying the query mid-flight cancels the pending `ensureQueryData`, which
  // would surface a CancelledError instead of the BffError the auth gate keys its redirect on.
  setSessionExpiredHandler(() => {
    queryClient.setQueryData(sessionQuery.queryKey, undefined);
    void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey, refetchType: "none" });
    navigateDocument("/login");
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, boot } satisfies SpaContext,
    // REQ-FW-7 + design/20 F2: primary-nav hover/focus warms the route's queries.
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // design/25 F9: nearest-scope not-found — `p.$project` and per-surface notFoundComponents can
    // override later; `SpaNotFound` is the root default and also hands server-owned redirect paths
    // back to the server.
    notFoundMode: "fuzzy",
    defaultPendingComponent: PendingShell,
    defaultNotFoundComponent: SpaNotFound,
    defaultErrorComponent: SpaRouteError,
    ...(opts?.history != null ? { history: opts.history } : {}),
  });
  return { router, queryClient };
}

/** Mount onto the shell's `[data-spa-root]` node (the server already stamped `data-renderer="spa"`). */
export function mountSpa(root: HTMLElement): void {
  const { router } = createSpaRouter();
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

const mountPoint = document.querySelector("[data-spa-root]");
if (mountPoint instanceof HTMLElement) mountSpa(mountPoint);
