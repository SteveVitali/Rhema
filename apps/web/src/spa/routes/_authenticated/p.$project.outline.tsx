// `/p/$project/outline` — the `outline` surface (design/25 `p.outline` — no IDE shell, parity F2).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/outline")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam, slug: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/outline"),
});
