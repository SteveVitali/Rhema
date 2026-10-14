// `/p/$project/review/$runId` — the `dossier` surface (design/25 `p.review` — the heaviest search
// schema: disposition/gate/bulk flash keys + the triage filter set).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/review/$runId")({
  validateSearch: validateSearchParams({
    disposed: strParam,
    gate: strParam,
    bulk: strParam,
    bsec: strParam,
    bulkdone: strParam,
    bulkskip: strParam,
    applied: strParam,
    promoted: strParam,
    obligated: strParam,
    ferr: strParam,
    fmsg: strParam,
    triage: strParam,
    sev: strParam,
    kind: strParam,
    disp: strParam,
    sec: strParam,
    url: strParam,
    sug: strParam,
    obl: strParam,
    focus: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/review/$runId"),
});
