// `/p/$project` — the project layout (design/25 `p.$project`): owns the IDE shell scope. SPA.4
// wires the shared loader seam here — the server-built feed-label maps (`GET /bff/feed-labels`,
// REQ-BFF-24) warm once per project subtree, the consumer the feed surfaces' formatters read.

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { feedLabelsQuery } from "../../queries.js";

export const Route = createFileRoute("/_authenticated/p/$project")({
  loader: ({ context }) => context.queryClient.ensureQueryData(feedLabelsQuery),
  component: Outlet,
});
