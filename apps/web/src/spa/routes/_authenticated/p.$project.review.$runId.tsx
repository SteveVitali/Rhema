// `/p/$project/review/$runId` — the `dossier` surface (design/25 `p.review` — the heaviest search
// schema: disposition/gate/bulk flash keys + the triage filter set; REQ-SEQ-12's `dossier` ×
// `ide-chrome` AND-gate). A "spa" verdict warms `dossierQuery(slug, runId, <server-owned search>)`
// in the loader and mounts `DossierSurface` inside the `IdeProjectLayout` chrome (the leaf
// republishes the twin's `ide` bag + its pane bodies); anything else is `SsrHandoff` — the server
// re-decides. The twin's 404 maps to the router's not-found — the document's own
// `notFoundElement` answer for a missed slug or an undelivered run.
//
// Search split (design/22 OQ8 (b)): the SERVER-owned keys (`disposed`/`gate`/`bulk`/`bsec`/
// `bulkdone`/`bulkskip`/`applied`/`promoted`/`obligated`/`ferr`/`fmsg`/`focus`) forward verbatim
// onto the twin GET — a mutation's redirect lands the changed server truth + the flash in one
// read. The leaf-owned filter keys (`triage`/`sev`/`kind`/`disp`/`sec`/`url`/`sug`/`obl`) never
// ride the twin — `visibleDossierFindings` re-derives the identical filtered set client-side, so
// a filter nav is an instant re-render off the cached aggregate.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { dossierQuery, type DossierTwinSearch } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { DossierSurface } from "../../surfaces/dossier.js";

export const Route = createFileRoute("/_authenticated/p/$project/review/$runId")({
  validateSearch: validateSearchParams({
    disposed: strParam,
    gate: strParam,
    bulk: strParam,
    bsec: strParam,
    bulkdone: strParam,
    bulkskip: strParam,
    applied: strParam,
    promoted: strParam,
    obligated: strParam,
    ferr: strParam,
    fmsg: strParam,
    triage: strParam,
    sev: strParam,
    kind: strParam,
    disp: strParam,
    sec: strParam,
    url: strParam,
    sug: strParam,
    obl: strParam,
    focus: strParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/review/$runId")) return null;
    try {
      await context.queryClient.ensureQueryData(
        dossierQuery(params.project, params.runId, location.search as DossierTwinSearch),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function DossierLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/review/$runId")) return <SsrHandoff />;
    const { project, runId } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(dossierQuery(project, runId, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/undelivered run is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <DossierSurface data={q.data} search={search} compact={boot?.deviceClass === "phone"} />
    );
  },
});
