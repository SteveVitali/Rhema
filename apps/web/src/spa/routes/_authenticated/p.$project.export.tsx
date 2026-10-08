// `/p/$project/export` — the `export` surface (design/25 `p.export`; the POST legs produce binary
// downloads — document navigations, never fetch-and-save).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/export")({
  validateSearch: validateSearchParams({ focus: strParam, error: strParam, added: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/export"),
});
