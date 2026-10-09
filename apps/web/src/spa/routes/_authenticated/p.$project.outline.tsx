// `/p/$project/outline` — the `outline` surface's durable editor (design/25 `p.outline` — no IDE
// shell). SPA.18 mounts the real leaf (REQ-SEQ-9, REQ-DAT-4, REQ-BFF-11): a "spa" verdict warms
// `projectOutlineQuery(slug, ?slug)` in the loader — the twin's 404 maps to the router's not-found,
// the document's own `notFoundElement` answer — and `{outline:null}` renders the designed no-outline
// arm, not an error. `?saved`/`?notice` stay validated URL flash state the leaf renders; `?slug` is
// the server-echoed artifact pick. Anything below a "spa" verdict is `SsrHandoff` — no BFF spend.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { COPY } from "../../../copy.js";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectOutlineQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { OutlineSurface } from "../../surfaces/outline.js";

export const Route = createFileRoute("/_authenticated/p/$project/outline")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam, slug: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/outline")) return null;
    const s = location.search as Record<string, string>;
    try {
      await context.queryClient.ensureQueryData(
        projectOutlineQuery(params.project, { slug: typeof s.slug === "string" ? s.slug : undefined }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function OutlineLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/outline")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(
      projectOutlineQuery(project, {
        slug: typeof search.slug === "string" ? search.slug : undefined,
      }),
    );
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <OutlineSurface
        data={q.data.outline}
        saved={search.saved === "1"}
        // the document's own flash-code→copy mapping verbatim (`?notice=cited` → the cited leaf).
        notice={search.notice === "cited" ? COPY.outlinePage.citedNote : undefined}
        compact={boot?.deviceClass === "phone"}
        contentKey={JSON.stringify(search)}
      />
    );
  },
});
