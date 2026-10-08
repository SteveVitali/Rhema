// `/p/$project/usage` — the `usage` surface's project section (design/25 `p.projectUsage`).
// SPA.10 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4, REQ-BFF-11): the loader warms
// `projectUsageQuery(slug)` when the boot verdict is "spa" and maps the twin's 404 to the
// router's not-found — the same answer the SSR document's `notFoundElement` 404 gives. The
// route is NOT IDE-framed (design/29 route-map), so no `ide-chrome` AND-gate applies.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectUsageQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ProjectUsageSurface } from "../../surfaces/usage.js";

export const Route = createFileRoute("/_authenticated/p/$project/usage")({
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/usage")) return null;
    try {
      await context.queryClient.ensureQueryData(projectUsageQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ProjectUsageLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/p/$project/usage")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const q = useQuery(projectUsageQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/rollup is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <ProjectUsageSurface usageProject={q.data.usageProject} />;
  },
});
