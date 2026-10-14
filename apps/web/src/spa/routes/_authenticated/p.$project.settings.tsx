// `/p/$project/settings` — the `settings` surface's project section (design/25 `p.settings`).
// SPA.12 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4, REQ-BFF-11): the loader warms
// `projectSettingsQuery(slug)` when the boot verdict is "spa" and maps the twin's 404 to the
// router's not-found — the same answer the SSR document's `notFoundElement` 404 gives. The route
// is NOT IDE-framed, so no `ide-chrome` AND-gate applies.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectSettingsQuery } from "../../queries.js";
import { flagParam, oneParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ProjectSettingsSurface } from "../../surfaces/settings.js";

export const Route = createFileRoute("/_authenticated/p/$project/settings")({
  validateSearch: validateSearchParams({
    saved: flagParam,
    notice: strParam,
    approvals: oneParam("saved", "invalid"),
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/settings")) return null;
    try {
      await context.queryClient.ensureQueryData(projectSettingsQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ProjectSettingsLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/p/$project/settings")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectSettingsQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <ProjectSettingsSurface
        projectSettings={q.data.projectSettings}
        saved={search.saved === "1"}
        notice={typeof search.notice === "string" ? search.notice : undefined}
        contentKey={JSON.stringify(search)}
      />
    );
  },
});
