// `/billing` — R7SHELL.1a (REQ-SHELL-1; R5 D6): the alias resolves to `/app/settings/billing`.
// The in-router `throw redirect` covers SPA navigations (zero document loads); the server owns
// the 302 for hard document loads (the `surfaces:null` row + `app.get("/billing")`).

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/billing/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/settings/billing", replace: true });
  },
});
