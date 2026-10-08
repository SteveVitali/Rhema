// `/p/$project/import/preview` — the conversion-poll leg (design/25 `p.importPreview`): `?qk`
// required — a bare entry redirects to `../import` (the SSR handler's contract verbatim). The
// `import_` escape keeps it a sibling of `p.import`.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/p/$project/import_/preview")({
  validateSearch: validateSearchParams({ qk: strParam, src: strParam }),
  beforeLoad: ({ search, params }) => {
    if (search.qk == null) {
      throw redirect({ to: "/p/$project/import", params: { project: params.project }, replace: true });
    }
  },
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/import/preview"),
});
