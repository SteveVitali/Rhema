// `/app/settings/integrations` — the `settings` surface. SPA.12 mounts the real leaf (REQ-SEQ-9,
// REQ-BFF-1/9, REQ-DAT-4): the "spa" verdict warms `settingsIntegrationsQuery`; anything else is
// `SsrHandoff` — the server re-decides.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { settingsIntegrationsQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { IntegrationsSection, SettingsFrame } from "../../surfaces/settings.js";

export const Route = createFileRoute("/_authenticated/app/settings/integrations")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/app/settings/integrations")
      ? context.queryClient.ensureQueryData(settingsIntegrationsQuery)
      : null,
  component: function IntegrationsSettingsLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/app/settings/integrations")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(settingsIntegrationsQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return (
      <SettingsFrame section="integrations" saved={search.saved === "1"} contentKey={JSON.stringify(search)}>
        <IntegrationsSection integrations={q.data?.integrations ?? null} />
      </SettingsFrame>
    );
  },
});
