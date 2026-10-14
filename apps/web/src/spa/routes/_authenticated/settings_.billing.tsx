// `/settings/billing` — the `billing` surface's legacy alias render (design/25
// `legacySettingsBilling` — parity, F7). The `settings_` escape keeps it OUT of the `/settings`
// redirect's subtree.

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/settings_/billing")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/settings/billing"),
});
