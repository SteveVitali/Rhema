// `/p/$project/figures/$figureId` — the `figures` surface's card (design/25 `p.figureCard`;
// escaped sibling of `p.figures`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/figures_/$figureId")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/figures/$figureId"),
});
