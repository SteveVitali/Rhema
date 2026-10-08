// `/p/$project/visualize` — the `figures` surface's visualize sheet (design/25 `p.visualize`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/p/$project/visualize")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/visualize"),
});
