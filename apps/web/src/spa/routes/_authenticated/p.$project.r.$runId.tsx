// `/p/$project/r/$runId` — the `run-report` surface (design/25 `p.runReport` — IDE-framed,
// REQ-SEQ-12's `run-report` × `ide-chrome` AND-gate). A "spa" verdict warms
// `runReportQuery(slug, runId, <server-owned search>)` in the loader and mounts
// `RunReportSurface` inside the `IdeProjectLayout` chrome — the twin's `ide.feed` slice
// publishes onto the chrome so `useIdeFeed` binds the one same-origin SSE (the ticket's
// live-meter KEY PORT, REQ-UX-15). Anything else is `SsrHandoff` — the server re-decides.
// The twin's 404 maps to the router's not-found — the document's own `notFoundElement`
// answer for a missed slug or a missing report.
//
// Search split: BOTH keys are server-owned — `advanced` selects the Level-4 report read
// (the report model is split; the plain page never carries token rows) and `focus` seeds
// the chrome's Focus view — so both forward verbatim onto the twin GET. There are no
// leaf-owned keys.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { runReportQuery, type RunReportTwinSearch } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { RunReportSurface } from "../../surfaces/run-report.js";

export const Route = createFileRoute("/_authenticated/p/$project/r/$runId")({
  validateSearch: validateSearchParams({ advanced: strParam, focus: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/r/$runId")) return null;
    try {
      await context.queryClient.ensureQueryData(
        runReportQuery(params.project, params.runId, location.search as RunReportTwinSearch),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function RunReportLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/r/$runId")) return <SsrHandoff />;
    const { project, runId } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(runReportQuery(project, runId, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/missing report is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <RunReportSurface data={q.data} compact={boot?.deviceClass === "phone"} />;
  },
});
