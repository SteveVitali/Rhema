// `/p/$project/figures` — the `figures` surface (design/25 `p.figures` — no IDE shell).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/figures")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/figures"),
});
