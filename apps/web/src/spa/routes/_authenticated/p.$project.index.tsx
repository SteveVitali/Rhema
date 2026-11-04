// `/p/$project` — the `editor` surface's Page mount (design/25 `p.index`; the IDE-framed AND-gate
// — `editor` × `ide-chrome` — is already folded into the boot map's per-route verdict).
// REQ-BFF-22 — the hand-off runs in `beforeLoad`: an unread `run_finished` row POSTs
// `/bff/p/:slug/handoff`, marks itself read server-side, and the leaf redirects to the row's
// workflow-shaped href — the document's inline check verbatim (`?focus=1` suppresses; a document
// nav keeps the flag-safety the SSR 302 had). A "spa" verdict then warms `projectPageQuery`
// and mounts `ProjectPageSurface` inside the `IdeProjectLayout` chrome.

import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { postProjectHandoff, projectPageQuery } from "../../queries.js";
import { readOnlyProjectFor } from "../../read-only.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ProjectPageSurface } from "../../surfaces/editor.js";

export const Route = createFileRoute("/_authenticated/p/$project/")({
  validateSearch: validateSearchParams({
    // `flagParam` (not `strParam`) — the JSON-shaped parse turns `?focus=1` into the NUMBER 1.
    focus: flagParam,
    rename: strParam,
    created: strParam,
    cn: strParam,
    cu: strParam,
    hc: strParam,
    derror: strParam,
    obligation: strParam,
    voice_locked: strParam,
  }),
  beforeLoad: async ({ context, params, search }) => {
    if (!isSpaEnabled(context.boot, "/p/$project")) return;
    // R7DEM.4b (R3 §4 row 11) — the handoff POST is a no-op in a demo boot: the twin can never
    // carry an unread run_finished row and a demo path never issues a write.
    if (context.boot?.demo != null) return;
    // REQ-BFF-22 — the hand-off is a side effect, so it is POST-only and server-decided: the twin
    // answers `{handoff:{href}}` only when an unread run_finished row exists (the same find the
    // document ran inline); `?focus=1` suppresses it verbatim. The href is already workflow-shaped
    // — a document navigation lands the target under its own flag verdict.
    // R7RO.1 — a read-only project never issues the POST before any request: the boot slot (the
    // document-level stamp for THIS slug) says so up front; a stale stamp for another slug can't.
    if (readOnlyProjectFor(context.boot, null, params.project) != null) return;
    const out = await postProjectHandoff(params.project, { focus: (search as Record<string, string | undefined>).focus });
    if (out.data.handoff != null) {
      throw redirect({ href: out.data.handoff.href, reloadDocument: true });
    }
  },
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project")) return null;
    try {
      await context.queryClient.ensureQueryData(
        projectPageQuery(params.project, location.search as { focus?: string }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ProjectPageLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(projectPageQuery(project, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;

    return <ProjectPageSurface data={q.data} compact={boot?.deviceClass === "phone"} search={search} />;
  },
});
