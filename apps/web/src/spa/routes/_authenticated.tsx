// SPA.4 (REQ-FW-5, REQ-BND-7, REQ-INV-2's auth-gate leg) — THE auth boundary: ONE `beforeLoad` on
// the pathless layout every authenticated document nests under. It resolves session presence through
// the `["session"]` query (the boot payload seeds it; `GET /session` is the oracle). A 401/dead
// session throws a `reloadDocument` redirect — `/login` is outside the SPA tree, so this is a real
// document navigation, never an in-router fetch. Non-401 failures (transport down, 5xx) propagate to
// the route's error boundary — a lie that says "signed out" is worse than a designed error state.

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "../app-shell.js";
import { BffError } from "../bff.js";
import { isDemoGateSkip } from "../demo.js";
import { sessionQuery } from "../queries.js";
import { SpaNotFound, SpaRouteError } from "../states.js";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context, location }) => {
    // R7DEM.4b (R3 P1; REQ-DWEB-6) — a demo boot on a demo-namespace path never reads the
    // session: `/session` would 401 logged-out (one of the three /login breakers). The
    // predicate is the PATHNAME, not just the boot — an in-SPA hop to `/app` inside a demo
    // boot still hits the real gate.
    if (isDemoGateSkip(location.pathname)) return;
    try {
      await context.queryClient.ensureQueryData(sessionQuery);
    } catch (e) {
      // bffFetch's 401 leg already invalidated the session query + navigated; the redirect is the
      // router-level abort so the load pipeline never proceeds to render an authed leaf.
      if (e instanceof BffError && e.status === 401) {
        throw redirect({ href: "/login", reloadDocument: true });
      }
      throw e;
    }
  },
  // R7SHELL.1a (REQ-SHELL-1) — the ONE layout: every `/_authenticated` leaf renders inside the
  // persistent AppShell, so workspace↔project navigation never unmounts the chrome. The error
  // and not-found boundaries wrap the same shell — pending, error and 404 all render in-shell
  // (UXC-29/35, D6/D7). Leaves' own pendingComponent/error render at leaf position, inside it.
  component: function AuthenticatedLayout() {
    return (
      <AppShell>
        <Outlet />
      </AppShell>
    );
  },
  // R7SHELL.1a — the boundaries stay the shared states: each mounts the AppShell itself when it
  // renders at a position with no shell, and stays bare at leaf position inside it (the InShell
  // guard in states.tsx).
  errorComponent: SpaRouteError,
  notFoundComponent: SpaNotFound,
});
