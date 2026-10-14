// SPA.4 (REQ-FW-5, REQ-BND-7, REQ-INV-2's auth-gate leg) — THE auth boundary: ONE `beforeLoad` on
// the pathless layout every authenticated document nests under. It resolves session presence through
// the `["session"]` query (the boot payload seeds it; `GET /session` is the oracle). A 401/dead
// session throws a `reloadDocument` redirect — `/login` is outside the SPA tree, so this is a real
// document navigation, never an in-router fetch. Non-401 failures (transport down, 5xx) propagate to
// the route's error boundary — a lie that says "signed out" is worse than a designed error state.

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { BffError } from "../bff.js";
import { sessionQuery } from "../queries.js";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ context }) => {
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
  component: Outlet,
});
