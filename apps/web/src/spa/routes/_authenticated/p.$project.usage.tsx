// `/p/$project/usage` — the `usage` surface's project section (design/25 `p.projectUsage`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/p/$project/usage")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/usage"),
});
