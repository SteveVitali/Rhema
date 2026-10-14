// `/app/settings/data` — the `settings` surface (`/app/settings/data/export/download` stays a
// server binary endpoint — never a client route; design/25 §not-in-the-tree).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/settings/data")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/settings/data"),
});
