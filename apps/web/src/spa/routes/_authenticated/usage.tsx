// `/usage` — the `usage` surface (design/25 usage).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/usage")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/usage"),
});
