// `/p/$project/obligations/new` — the `dossier` surface's obligation form (design/25
// `p.obligationNew` — deliberately UNFRAMED, no IDE shell). `?back` is confined to same-origin
// `/p/…` paths at BOTH seams: the route's validateSearch drops an off-origin value, and the twin
// re-runs the server's `safeBack` verbatim so the serialized `back` is the authority.
// A "spa" verdict warms `obligationNewQuery` and mounts `ObligationNewSurface`; anything else
// hands the document back to the server.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { obligationNewQuery } from "../../queries.js";
import { validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ObligationNewSurface } from "../../surfaces/dossier.js";

export const Route = createFileRoute("/_authenticated/p/$project/obligations/new")({
  validateSearch: validateSearchParams({
    back: (v) => (typeof v === "string" && v.startsWith("/p/") ? v : undefined),
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/obligations/new")) return null;
    try {
      await context.queryClient.ensureQueryData(
        obligationNewQuery(params.project, (location.search as { back?: string }).back),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ObligationNewLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/obligations/new")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const { back } = Route.useSearch();
    const q = useQuery(obligationNewQuery(project, back));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <ObligationNewSurface data={q.data} />;
  },
});
