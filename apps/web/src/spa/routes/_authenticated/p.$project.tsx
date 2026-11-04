// `/p/$project` — the project layout (design/25 `p.$project`): owns the IDE shell scope. SPA.4
// wires the shared loader seam here — the server-built feed-label maps (`GET /bff/feed-labels`,
// REQ-BFF-24) warm once per project subtree, the consumer the feed surfaces' formatters read.
// SPA.9 mounts `IdeProjectLayout`: an IDE-framed + flipped leaf renders inside `<IdeChrome>`
// (the React shell + controller); everything else stays a bare `<Outlet>`.

import { createFileRoute } from "@tanstack/react-router";
import { demoFeedLabelsQuery, feedLabelsQuery } from "../../queries.js";
import { IdeProjectLayout } from "../../ide/chrome.js";

export const Route = createFileRoute("/_authenticated/p/$project")({
  // R7DEM.4b (R3 P2) — the demo warms the same `["feed-labels"]` key from the PUBLIC
  // `/bff/demo/feed-labels`; the sessioned `/bff/feed-labels` GET (a 401 → /login breaker)
  // never fires in a demo boot.
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      context.boot?.demo != null ? demoFeedLabelsQuery : feedLabelsQuery,
    ),
  component: function ProjectLayout() {
    const { project } = Route.useParams();
    return <IdeProjectLayout project={project} />;
  },
});
