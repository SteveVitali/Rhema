// `/p/$project` — the project layout (design/25 `p.$project`): owns the IDE shell scope. SPA.4
// wires the shared loader seam here — the server-built feed-label maps (`GET /bff/feed-labels`,
// REQ-BFF-24) warm once per project subtree, the consumer the feed surfaces' formatters read.
// SPA.9 mounts `IdeProjectLayout`: an IDE-framed + flipped leaf renders inside `<IdeChrome>`
// (the React shell + controller); everything else stays a bare `<Outlet>`.

import { createFileRoute } from "@tanstack/react-router";
import { feedLabelsQuery } from "../../queries.js";
import { IdeProjectLayout } from "../../ide/chrome.js";

export const Route = createFileRoute("/_authenticated/p/$project")({
  loader: ({ context }) => context.queryClient.ensureQueryData(feedLabelsQuery),
  component: function ProjectLayout() {
    const { project } = Route.useParams();
    return <IdeProjectLayout project={project} />;
  },
});
