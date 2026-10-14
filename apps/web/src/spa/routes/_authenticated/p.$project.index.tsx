// `/p/$project` — the `editor` surface's Page mount (design/25 `p.index`; the IDE-framed AND-gate
// — `editor` × `ide-chrome` — is already folded into the boot map's per-route verdict).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/")({
  validateSearch: validateSearchParams({
    focus: strParam,
    rename: strParam,
    created: strParam,
    cn: strParam,
    cu: strParam,
    hc: strParam,
    derror: strParam,
    obligation: strParam,
    voice_locked: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project"),
});
