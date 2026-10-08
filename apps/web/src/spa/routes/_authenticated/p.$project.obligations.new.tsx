// `/p/$project/obligations/new` — the `dossier` surface's obligation form (design/25
// `p.obligationNew`): `?back` is confined to same-origin `/p/…` paths (the server's `safeBack`
// rule verbatim — an off-origin value drops the key).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/obligations/new")({
  validateSearch: validateSearchParams({
    back: (v) => (typeof v === "string" && v.startsWith("/p/") ? v : undefined),
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/obligations/new"),
});
