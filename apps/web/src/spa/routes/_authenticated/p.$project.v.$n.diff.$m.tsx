// `/p/$project/v/$n/diff/$m` — the `editor` surface's compare view (design/25 `p.diff`):
// `$n` is a positive int; `$m` is a positive int OR `"working"` (the document's own arm — the api
// resolves it) — anything else is a scoped not-found (REQ-NAV-2). `?focus` rides the twin;
// `?layout`/`?commented` merge leaf-side.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { compareQuery } from "../../queries.js";
import { flagParam, oneParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VersionPicker } from "../../version-picker.js";
import { CompareSurface } from "../../surfaces/editor.js";

export const Route = createFileRoute("/_authenticated/p/$project/v/$n/diff/$m")({
  beforeLoad: ({ params }) => {
    if (!/^\d+$/.test(params.n) || (params.m !== "working" && !/^\d+$/.test(params.m))) throw notFound();
  },
  validateSearch: validateSearchParams({
    layout: oneParam("side", "inline", "moves"),
    commented: strParam,
    focus: flagParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/v/$n/diff/$m")) return null;
    try {
      await context.queryClient.ensureQueryData(
        compareQuery(params.project, params.n, params.m, location.search as { focus?: string }),
      );
    } catch (e) {
      // R7SYNC.1 (REQ-SYNC-4; R5 G4) — a missed pair endpoint renders the versions picker
      // inside the shell (the leaf's errored query below), never the bare 404.
      if (e instanceof BffError && e.status === 404) return null;
      throw e;
    }
    return null;
  },
  component: function CompareLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/v/$n/diff/$m")) return <SsrHandoff />;
    const { project, n, m } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(compareQuery(project, n, m, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // REQ-SYNC-4 — the versions picker inside the shell (name the missing end of the pair).
      if (q.error instanceof BffError && q.error.status === 404)
        return <VersionPicker slug={project} missing={!/^\d+$/.test(m) && m !== "working" ? m : n} />;
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    // lands the read-only SSR compare (the boot map owns the phone leg; the twin owns this one).
    return <CompareSurface data={q.data} compact={boot?.deviceClass === "phone"} search={search} />;
  },
});
