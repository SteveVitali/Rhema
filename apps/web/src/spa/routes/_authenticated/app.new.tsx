// `/app/new` — the `onboarding` surface (design/25 app.new).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/new")({
  validateSearch: validateSearchParams({
    entry: oneParam("scratch", "outline", "draft"),
    held: oneParam("1"),
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/new"),
});
