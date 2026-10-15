// `/p/$project/figures/$figureId` — the `figures` surface's card (design/25 `p.figureCard`;
// escaped sibling of `p.figures`). SPA.19 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4,
// REQ-BFF-11): a "spa" verdict warms `projectFigureCardQuery(slug, figureId)` — a missed slug or
// figure maps to the router's not-found / the leaf's `{figure:null}` arm verbatim — and
// `?saved`/`?notice` stay validated URL flash state the leaf renders. Anything below a "spa"
// verdict is `SsrHandoff` — no BFF spend.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectFigureCardQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { FigureCardSurface } from "../../surfaces/figures.js";

export const Route = createFileRoute("/_authenticated/p/$project/figures_/$figureId")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/figures/$figureId")) return null;
    try {
      await context.queryClient.ensureQueryData(
        projectFigureCardQuery(params.project, params.figureId),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function FigureCardLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/figures/$figureId")) return <SsrHandoff />;
    const { project, figureId } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectFigureCardQuery(project, figureId));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <FigureCardSurface
        data={q.data.figure}
        saved={search.saved === "1"}
        notice={typeof search.notice === "string" ? search.notice : undefined}
      />
    );
  },
});
