// `/p/$project/revisions/$cid` — the `editor` surface's revision view (design/25 `p.revision`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/revisions/$cid")({
  validateSearch: validateSearchParams({ commented: strParam, focus: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/revisions/$cid"),
});
