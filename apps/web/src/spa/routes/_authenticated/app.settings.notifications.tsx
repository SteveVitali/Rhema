// `/app/settings/notifications` — the `settings` surface.

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/settings/notifications")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/settings/notifications"),
});
