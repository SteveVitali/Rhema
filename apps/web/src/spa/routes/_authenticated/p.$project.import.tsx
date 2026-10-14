// `/p/$project/import` — the `onboarding` × `ide-chrome` composite (the AND-gate resolves
// server-side into the boot map's verdict for this routeId).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/p/$project/import")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/import"),
});
