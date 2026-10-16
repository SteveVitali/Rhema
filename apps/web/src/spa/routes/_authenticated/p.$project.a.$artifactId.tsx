// `/p/$project/a/$artifactId` — the `editor` surface's read-only Page mount (design/25
// `p.artifact`). The twin's 404/415 collapse answers the document's 404 verbatim;
// `?focus` rides the twin.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { artifactQuery } from "../../queries.js";
import { flagParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell, twinForcesSsr } from "../../states.js";
import { ArtifactPageSurface } from "../../surfaces/editor.js";

export const Route = createFileRoute("/_authenticated/p/$project/a/$artifactId")({
  validateSearch: validateSearchParams({ focus: flagParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/a/$artifactId")) return null;
    try {
      await context.queryClient.ensureQueryData(
        artifactQuery(params.project, params.artifactId, location.search as { focus?: string }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ArtifactLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/a/$artifactId")) return <SsrHandoff />;
    const { project, artifactId } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(artifactQuery(project, artifactId, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/artifact is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    // SPACAP.3 (G2) — the showcase leg of the forced-SSR truth: document-nav back so the server
    // lands the read-only SSR artifact Page (the boot map owns the phone leg; the twin owns this).
    if (twinForcesSsr(q.data)) return <SsrHandoff />;
    return <ArtifactPageSurface data={q.data} compact={boot?.deviceClass === "phone"} search={search} />;
  },
});
