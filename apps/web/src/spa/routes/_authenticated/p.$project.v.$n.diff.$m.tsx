// `/p/$project/v/$n/diff/$m` — the `editor` surface's compare view (design/25 `p.diff`):
// `$n`/`$m` are positive ints — a non-numeric param is a scoped not-found (today's
// `resolveEditorDraft("abc")` ⇒ 404 parity, REQ-NAV-2).

import { createFileRoute, notFound } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/v/$n/diff/$m")({
  beforeLoad: ({ params }) => {
    if (!/^\d+$/.test(params.n) || !/^\d+$/.test(params.m)) throw notFound();
  },
  validateSearch: validateSearchParams({
    layout: oneParam("side", "inline", "moves"),
    commented: strParam,
    focus: strParam,
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/v/$n/diff/$m"),
});
