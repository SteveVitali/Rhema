// `/app` — the `project-home` surface (design/25 app.index; the first-five-minutes/showcase
// precedence stays server-side on the document request — REQ-BFF-20's fixed handler order).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/")({
  validateSearch: validateSearchParams({
    q: strParam,
    voice: strParam,
    protocol: strParam,
    sort: oneParam("title"),
    archived: oneParam("1"),
    deleted: oneParam("1"),
    verified: oneParam("1"),
    entry: strParam,
    held: oneParam("1"),
  }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app"),
});
