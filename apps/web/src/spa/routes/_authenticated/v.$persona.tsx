// `/v/$persona` — the `voices` surface's voice detail (design/25 `voiceDetail`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/v/$persona")({
  validateSearch: validateSearchParams({
    tab: oneParam("description", "samples"),
    sample: strParam,
    saved: strParam,
    added: strParam,
    cancelled: strParam,
    corrected: strParam,
    reconstruct: strParam,
    build_failed: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/v/$persona"),
});
