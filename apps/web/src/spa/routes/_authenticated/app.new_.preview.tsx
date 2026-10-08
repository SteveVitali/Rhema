// `/app/new/preview` — the `onboarding` surface's pending-conversion leg (design/25 app.newPreview).
// `?qk` is required — a bare entry redirects to `/app/new` (the SSR handler's contract verbatim).
// The `new_` escape keeps it a sibling of `app.new`, not a child.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/new_/preview")({
  validateSearch: validateSearchParams({ qk: strParam, src: strParam }),
  beforeLoad: ({ search }) => {
    if (search.qk == null) throw redirect({ to: "/app/new" });
  },
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/new/preview"),
});
