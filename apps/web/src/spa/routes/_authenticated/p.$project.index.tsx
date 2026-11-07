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
  // R7SYNC.1 (REQ-SPEED-1; R6 UXC-33, R5 B14) — the serial handoff POST is OUT of beforeLoad:
  // the loader paints the leaf immediately and the unread-run_finished check fires post-paint
  // in the leaf's mount effect (the "defer" arm the requirement offers — the write stays
  // POST-only per REQ-BFF-22 and `?focus=1` still suppresses server-side).
  beforeLoad: ({ context }) => {
    if (!isSpaEnabled(context.boot, "/p/$project")) return;
  },
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project")) return null;
    // R7SYNC.1 (REQ-SPEED-1; R6 UXC-33, R5 B14) — the REQ-BFF-22 handoff now rides IN PARALLEL
    // with the twin GET, never serialized ahead of it: both requests issue in the same tick,
    // and the loader awaits the handoff's resolution only AFTER the page twin is in cache —
    // first paint is never held for a mark-read write. `?focus=1` suppression, the demo-boot
    // no-op, and the read-only withhold are the document's arms verbatim; the redirect still
    // commits in-router (R7RELOAD.1).
    const handoff =
      context.boot?.demo == null &&
      readOnlyProjectFor(context.boot, null, params.project) == null
        ? postProjectHandoff(params.project, {
            focus: String((location.search as Record<string, unknown>).focus ?? ""),
          }).catch(() => null)
        : Promise.resolve(null);
    try {
      await context.queryClient.ensureQueryData(
        projectPageQuery(params.project, location.search as { focus?: string }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    const out = await handoff;
    if (out?.data.handoff != null) throw redirect({ href: out.data.handoff.href });
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
