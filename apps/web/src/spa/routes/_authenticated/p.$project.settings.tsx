// `/p/$project/settings` — the `settings` surface's project section (design/25 `p.settings`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/settings")({
  validateSearch: validateSearchParams({
    saved: strParam,
    notice: strParam,
    approvals: oneParam("saved", "invalid"),
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/settings"),
});
