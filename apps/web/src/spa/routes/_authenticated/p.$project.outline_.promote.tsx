// `/p/$project/outline/promote` — the `outline` surface's promote sheet (design/25
// `p.outlinePromote`; escaped sibling of `p.outline`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/outline_/promote")({
  validateSearch: validateSearchParams({
    scope: strParam,
    threadId: strParam,
    turnId: strParam,
    slug: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/outline/promote"),
});
