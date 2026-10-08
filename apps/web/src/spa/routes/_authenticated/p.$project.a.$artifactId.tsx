// `/p/$project/a/$artifactId` — the `editor` surface's read-only Page mount (design/25 `p.artifact`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/a/$artifactId")({
  validateSearch: validateSearchParams({ focus: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/a/$artifactId"),
});
