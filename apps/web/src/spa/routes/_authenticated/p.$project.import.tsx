// `/p/$project/import` — the `onboarding` × `ide-chrome` composite (the AND-gate resolves
// server-side into the boot map's verdict for this routeId). SPA.14 mounts the real leaf:
// a "spa" verdict warms `projectImportQuery(slug)` in the loader and maps the twin's 404
// to the router's not-found — the document's own `notFoundElement` answer for a missed
// slug. The surface publishes the twin's `ide` bag onto the React chrome (REQ-SEQ-12).
// Phone width gets the SSR's PhoneBlockedNote leg.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectImportQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ImportSurface } from "../../surfaces/onboarding.js";

export const Route = createFileRoute("/_authenticated/p/$project/import")({
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/import")) return null;
    try {
      await context.queryClient.ensureQueryData(projectImportQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ImportLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/import")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const q = useQuery(projectImportQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <ImportSurface data={q.data.import} compact={boot?.deviceClass === "phone"} />
    );
  },
});
