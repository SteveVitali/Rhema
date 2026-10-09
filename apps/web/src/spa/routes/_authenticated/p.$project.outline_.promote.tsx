// `/p/$project/outline/promote` — the `outline` surface's consent sheet (design/25
// `p.outlinePromote`; the escaped sibling of `p.outline`). SPA.18 mounts the real leaf: the loader
// warms `projectOutlinePromoteQuery(slug, scope/threadId/turnId/?slug)` on a "spa" verdict — the
// twin echoes the URL's own picks the document reads verbatim (`scope` defaults `thread`,
// `thread`/`turn` are the legacy aliases) — and `{outlinePromotion:null}` renders the sheet's
// not-found arm verbatim. Anything below a "spa" verdict is `SsrHandoff` — no BFF spend.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectOutlinePromoteQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { OutlinePromoteSurface } from "../../surfaces/outline.js";

/** The document's pick aliases: `?thread`/`?turn` fall through `validateSearch` untouched. */
function promoteOpts(search: Record<string, unknown>) {
  return {
    scope: typeof search.scope === "string" ? search.scope : undefined,
    threadId:
      typeof search.threadId === "string"
        ? search.threadId
        : typeof search.thread === "string"
          ? search.thread
          : undefined,
    turnId:
      typeof search.turnId === "string"
        ? search.turnId
        : typeof search.turn === "string"
          ? search.turn
          : undefined,
    slug: typeof search.slug === "string" ? search.slug : undefined,
  };
}

export const Route = createFileRoute("/_authenticated/p/$project/outline_/promote")({
  validateSearch: validateSearchParams({
    scope: strParam,
    threadId: strParam,
    turnId: strParam,
    slug: strParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/outline/promote")) return null;
    try {
      await context.queryClient.ensureQueryData(
        projectOutlinePromoteQuery(
          params.project,
          promoteOpts(location.search as Record<string, unknown>),
        ),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function OutlinePromoteLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/outline/promote")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectOutlinePromoteQuery(project, promoteOpts(search)));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return <OutlinePromoteSurface data={q.data.outlinePromotion} />;
  },
});
