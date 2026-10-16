// `/p/$project/revisions/$cid` — the `editor` surface's revision view (design/25 `p.revision`).
// `?focus` rides the twin; `?commented` merges leaf-side.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { revisionQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell, twinForcesSsr } from "../../states.js";
import { RevisionSurface } from "../../surfaces/editor.js";

export const Route = createFileRoute("/_authenticated/p/$project/revisions/$cid")({
  validateSearch: validateSearchParams({ commented: strParam, focus: flagParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/revisions/$cid")) return null;
    try {
      await context.queryClient.ensureQueryData(
        revisionQuery(params.project, params.cid, location.search as { focus?: string }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function RevisionLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/revisions/$cid")) return <SsrHandoff />;
    const { project, cid } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(revisionQuery(project, cid, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/response is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    // SPACAP.3 (G2) — the showcase leg of the forced-SSR truth: document-nav back so the server
    // lands the read-only SSR revision document (the boot map owns the phone leg; the twin owns this).
    if (twinForcesSsr(q.data)) return <SsrHandoff />;
    return <RevisionSurface data={q.data} compact={boot?.deviceClass === "phone"} search={search} />;
  },
});
