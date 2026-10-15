// `/p/$project/visualize` — the `figures` surface's consent sheet (design/25 `p.visualize`).
// SPA.19 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4, REQ-BFF-11): a "spa" verdict warms
// `projectVisualizeQuery(slug, request/kind/figure/prior/entry)` — the twin echoes the URL's own
// entry-point picks (the `fig_`-prefix strip stays server-side) plus the server-computed
// estimate. Anything below a "spa" verdict is `SsrHandoff` — no BFF spend.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectVisualizeQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VisualizeSurface } from "../../surfaces/figures.js";

/** The document's entry-point params — `?figure` is the raw `fig_`-prefixed ref (the twin strips it). */
function visualizeOpts(search: Record<string, unknown>) {
  return {
    request: typeof search.request === "string" ? search.request : undefined,
    kind: typeof search.kind === "string" ? search.kind : undefined,
    figure: typeof search.figure === "string" ? search.figure : undefined,
    prior: typeof search.prior === "string" ? search.prior : undefined,
    entry: typeof search.entry === "string" ? search.entry : undefined,
  };
}

export const Route = createFileRoute("/_authenticated/p/$project/visualize")({
  validateSearch: validateSearchParams({
    request: strParam,
    kind: strParam,
    figure: strParam,
    prior: strParam,
    entry: strParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/visualize")) return null;
    try {
      await context.queryClient.ensureQueryData(
        projectVisualizeQuery(params.project, visualizeOpts(location.search as Record<string, unknown>)),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function VisualizeLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/visualize")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectVisualizeQuery(project, visualizeOpts(search)));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <VisualizeSurface data={q.data.visualize} contentKey={JSON.stringify(search)} />;
  },
});
