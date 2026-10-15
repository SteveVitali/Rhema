// `/p/$project/run` — the `run-sheet` surface (design/25 `p.run`; design/22 §2's `p.run`
// aggregate row): the ONLY paywall + the ONLY run creator. The boot verdict for this routeId is
// the server-ANDed `run-sheet` ∧ `ide-chrome` consult (IDE-framed — REQ-SEQ-2/12), so a "spa"
// verdict warms `projectRunSheetQuery(slug, <lever search>)` in the loader and renders
// `RunSheetSurface` inside the `IdeProjectLayout` chrome (the leaf republishes the twin's `ide`
// bag); anything else is `SsrHandoff` — the server re-decides. The twin's 404 maps to the
// router's not-found — the document's own `notFoundElement` answer for a missed slug.
//
// The lever deep-link keys (`workflow`/`rigor`/`tier`/`modelTier`/`scope`/`words`/`claims`/
// `draftId`/`corrKind` + `toggle.*` — the grammar is forward-compatible by contract: unknown keys
// pass `validateSearch` untouched) forward verbatim onto the twin GET — the document reads the
// same params off `c.req.query()`. `?notice=purchase_paused` stays URL flash state the leaf maps
// to the same COPY leaf the document emits — flashes never ride the twin. A lever-deep-link
// change remounts the form off server truth (`contentKey`) instead of trusting a stale state.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { COPY } from "../../../copy.js";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectRunSheetQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { RunSheetSurface } from "../../surfaces/run-sheet.js";

export const Route = createFileRoute("/_authenticated/p/$project/run")({
  validateSearch: validateSearchParams({
    workflow: strParam,
    scope: strParam,
    words: strParam,
    claims: strParam,
    protocol: strParam,
    rigor: strParam,
    tier: strParam,
    modelTier: strParam,
    draftId: strParam,
    corrKind: strParam,
    notice: strParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/run")) return null;
    try {
      await context.queryClient.ensureQueryData(
        projectRunSheetQuery(params.project, location.search as Record<string, string>),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function RunSheetLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/run")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch() as Record<string, string>;
    const q = useQuery(projectRunSheetQuery(project, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <RunSheetSurface
        data={q.data}
        // the document's own flash-code→copy mapping verbatim (`?notice=purchase_paused`).
        notice={search.notice === "purchase_paused" ? COPY.runSheet.purchasePaused : undefined}
        compact={boot?.deviceClass === "phone"}
        contentKey={JSON.stringify(search)}
      />
    );
  },
});
