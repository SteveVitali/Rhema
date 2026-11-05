// SPA.4 — the SPA entry. Mounts TanStack Router over the committed `routeTree.gen.ts` (file-based,
// autoCodeSplitting — every auth'd document route registered day one, REQ-NAV-1), seeds the
// `["session"]` query from the `data-spa-boot` embed (a seed, not a grant — spec §3.2), binds the
// 401 leg (`invalidate session → document-nav /login`), and mounts under StrictMode (the
// double-mount contract — every effect here is idempotent).
//
// SPA.28 — every SPA-space route is the client's to render; the only leaves that still hand the
// document back are the structural "ssr" verdicts (phone `pageMount` — REQ-ED-12 — and the
// server-owned `surfaces:null` routes), which take `SsrHandoff`'s document nav by design.

import { StrictMode } from "react";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import type { RouterHistory } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";
import { demoInternalPath, demoPublicPath } from "@rhema/contracts";
import { routeTree } from "./routeTree.gen.js";
import { readSpaBoot, setSpaBoot, type SpaBoot } from "./boot.js";
import { setSessionExpiredHandler } from "./bff.js";
import { navigateDocument } from "./dom.js";
import { installSpaClickInterceptor } from "./nav-intercept.js";
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
  const boot = opts?.boot === undefined ? readSpaBoot() : opts.boot;
  const queryClient = opts?.queryClient ?? makeSpaQueryClient({ demo: boot?.demo != null });
  setSpaBoot(boot);
  // The boot principal seeds (never grants) the session query — `/session` stays the oracle and the
  // query stays refetchable.
  if (boot?.principal != null) queryClient.setQueryData(sessionQuery.queryKey, boot.principal);
  // REQ-FW-6's 401 leg: drop any cached principal and hand the document to /login (outside the
  // tree ⇒ a real document navigation). `setQueryData(undefined)` + `invalidateQueries` — NOT
  // `removeQueries`: destroying the query mid-flight cancels the pending `ensureQueryData`, which
  // would surface a CancelledError instead of the BffError the auth gate keys its redirect on.
  // R7DEM.4b — the leg NEVER fires inside a demo boot: `/login` is a workspace exit the demo
  // surface must never take (a demo twin can only answer public data anyway — no 401 exists).
  const demoBoot = boot?.demo != null;
  setSessionExpiredHandler(() => {
    if (demoBoot) return;
    queryClient.setQueryData(sessionQuery.queryKey, undefined);
    void queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey, refetchType: "none" });
    navigateDocument("/login");
  });
  const router = createRouter({
    routeTree,
    context: { queryClient, boot } satisfies SpaContext,
    // REQ-NAVM-7 (NAVC.1, spec §2.6) — NO preload at ship: `defaultPreload:"intent"` is
    // deliberately NOT set. Every preload runs `beforeLoad`+`loader`, and several are
    // side-effecting — `postProjectHandoff` POST (`p.$project.index`), `confirmEmail`
    // token consumption, mark-read twin GETs (r5_a3 audit). A future PRELOAD_SAFE
    // routeId allowlist (a delegated pointerover/focusin leg) is gated on each listed
    // route certifying its beforeLoad+loader side-effect-free first.
    // `defaultPreloadStaleTime: 0` stays — the REQ-FW-7 query convention, inert while
    // nothing preloads.
    defaultPreloadStaleTime: 0,
    scrollRestoration: true,
    // NAVC.4/REQ-NAVC-16 — `.ide-page` is the IDE's INNER page scroller (`packages/ui`'s
    // IdeShell emits it; the only inner scroll port on the SPA surfaces). The router tops it
    // on push/replace commits (resetScroll !== false) while the generic keyed restoration
    // still re-applies its last observed position on pop — document-nav parity for the real
    // scroller, not just window.
    scrollToTopSelectors: [".ide-page"],
    // R7DEM.4b (REQ-DWEB-9; S-1; ADR-126) — the public↔internal demo URL rewrite, the spike's
    // chosen arm: input maps the PUBLIC `/demo/<essay>/…` document URL onto the internal
    // `/p/demo~<essay>/…` route shape (registered essays only — `/demo` itself is the SSR hub,
    // an unregistered essay falls through to the server's terminal 404); output maps every
    // hand-built `/p/demo~*` href back to `/demo/<essay>/…` for the address bar. Nothing in the
    // ~120 `/p/${slug}` emitters changes — the rewrite is router-level only.
    rewrite: {
      input: ({ url }) => {
        const internal = demoInternalPath(url.pathname);
        if (internal == null) return;
        url.pathname = internal;
        return url;
      },
      output: ({ url }) => {
        const pub = demoPublicPath(url.pathname);
        if (pub == null) return;
        url.pathname = pub;
        return url;
      },
    },
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
  // REQ-NAVM-1/2 — ONE delegated bubble-phase `click` listener on `document`, installed
  // at mount (never inside `createSpaRouter` — the router-direct dom suites must stay
  // un-intercepted). The listener outlives the mount for the document's lifetime.
  installSpaClickInterceptor(router);
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}

const mountPoint = document.querySelector("[data-spa-root]");
if (mountPoint instanceof HTMLElement) mountSpa(mountPoint);
