// `/app/usage/r/$runId` — a server-owned redirect surface (design/25 app.usageRun): the server
// canonical 302 → `/p/:slug/r/:runId#report`. The registered route's `beforeLoad` performs a
// DOCUMENT navigation so a client-side entry lands on the server's redirect exactly like a hard
// load — the SPA never resolves the slug itself.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/usage/r/$runId")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: location.publicHref, reloadDocument: true });
  },
});
