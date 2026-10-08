// `/app/inbox` — the `inbox` surface (design/25 app.inbox).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/inbox"),
});
