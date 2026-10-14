// `/app/settings/billing` — the `billing` surface.

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/settings/billing")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/settings/billing"),
});
