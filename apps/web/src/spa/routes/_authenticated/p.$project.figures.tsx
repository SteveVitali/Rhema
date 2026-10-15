// `/p/$project/figures` — the `figures` surface's pane (design/25 `p.figures` — no IDE shell).
// SPA.19 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4, REQ-BFF-11): a "spa" verdict warms
// `projectFiguresQuery(slug)` in the loader — the twin's 404 maps to the router's not-found (the
// document's own `notFoundElement` answer); `items:[]` renders the designed empty arm, never a
// fabricated row. Anything below a "spa" verdict is `SsrHandoff` — no BFF spend.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectFiguresQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { FiguresSurface } from "../../surfaces/figures.js";

export const Route = createFileRoute("/_authenticated/p/$project/figures")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/figures")) return null;
    try {
      await context.queryClient.ensureQueryData(projectFiguresQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function FiguresLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/figures")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const q = useQuery(projectFiguresQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <FiguresSurface data={q.data.figures} />;
  },
});
