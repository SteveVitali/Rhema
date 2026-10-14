// `/p/$project/run` — the `run-sheet` surface (design/25 `p.run`; `toggle.*` keys pass through as
// unknown keys — forward-compatible by contract).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/run")({
  validateSearch: validateSearchParams({
    workflow: strParam,
    scope: strParam,
    words: strParam,
    protocol: strParam,
    rigor: strParam,
    tier: strParam,
    modelTier: strParam,
    draftId: strParam,
    corrKind: strParam,
    notice: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/run"),
});
