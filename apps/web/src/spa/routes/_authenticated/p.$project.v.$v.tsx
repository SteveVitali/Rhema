// `/p/$project/v/$v` — the `editor` surface's Page mount (design/25 `p.page`): `$v` ∈
// `"working" | /^\d+$/` — a failed parse is a scoped not-found, never an error page (REQ-NAV-2).

import { createFileRoute, notFound } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/v/$v")({
  beforeLoad: ({ params }) => {
    if (params.v !== "working" && !/^\d+$/.test(params.v)) throw notFound();
  },
  validateSearch: validateSearchParams({
    restore: strParam,
    restored: strParam,
    noted: strParam,
    hc: strParam,
    focus: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/v/$v"),
});
