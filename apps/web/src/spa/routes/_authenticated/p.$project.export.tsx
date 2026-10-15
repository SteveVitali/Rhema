// `/p/$project/export` — the `export` surface AND the first IDE-framed flip (design/25 `p.export`;
// design/29 §route-map): the boot verdict for this routeId is the server-ANDed `export` ∧
// `ide-chrome` consult, so a "spa" verdict warms `projectExportQuery(slug)` in the loader and
// renders `ExportSurface` inside the `IdeProjectLayout` chrome (the leaf republishes the twin's
// `ide` bag — REQ-SEQ-12); anything else is `SsrHandoff` — the server re-decides. The twin's
// 404 maps to the router's not-found — the document's own `notFoundElement` answer for a missed
// slug or a refused dialog read. The export POST stays a native form POST (binary download —
// REQ-BFF-17); `?error`/`?added` are the flash params the redirects carry, never payload.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectExportQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ExportSurface } from "../../surfaces/export.js";

export const Route = createFileRoute("/_authenticated/p/$project/export")({
  validateSearch: validateSearchParams({ focus: strParam, error: strParam, added: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/export")) return null;
    try {
      await context.queryClient.ensureQueryData(projectExportQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ExportLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/export")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectExportQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <ExportSurface
        data={q.data.export}
        failed={search.error != null}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
