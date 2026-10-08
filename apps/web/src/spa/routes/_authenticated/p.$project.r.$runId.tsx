// `/p/$project/r/$runId` — the `run-report` surface (design/25 `p.report`; the SSE transport
// `/events?after=` is NOT a route — it stays a same-origin EventSource, REQ-INV-4).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/r/$runId")({
  validateSearch: validateSearchParams({ advanced: strParam, focus: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/r/$runId"),
});
