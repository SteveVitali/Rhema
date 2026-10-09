// `/p/$project/v/$v` — the `editor` surface's Page mount (design/25 `p.page`): `$v` ∈
// `"working" | /^\d+$/` — a failed parse is a scoped not-found, never an error page (REQ-NAV-2).
// The `working`-miss arm answers `{ok:true, redirect:"/p/:slug"}` — the document's 302 verbatim;
// the leaf honors it in the loader AND on a stale re-read. `?restore`/`?focus` are the
// server-owned search keys (they ride the twin); `?restored`/`?noted`/`?hc` merge leaf-side.

import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { versionPageQuery, type VersionPageTwinSearch } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VersionPageSurface } from "../../surfaces/editor.js";

export const Route = createFileRoute("/_authenticated/p/$project/v/$v")({
  beforeLoad: ({ params }) => {
    if (params.v !== "working" && !/^\d+$/.test(params.v)) throw notFound();
  },
  validateSearch: validateSearchParams({
    restore: strParam,
    restored: strParam,
    noted: strParam,
    hc: strParam,
    // `flagParam` — `?focus=1` parses to the NUMBER 1 under the JSON-shaped parse.
    focus: flagParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/v/$v")) return null;
    try {
      const twin = await context.queryClient.ensureQueryData(
        versionPageQuery(params.project, params.v, location.search as VersionPageTwinSearch),
      );
      // EDIT.1's `working`-miss arm — the document's `302 /p/:slug` verbatim.
      if (twin.ok === true && twin.redirect != null) {
        throw redirect({ href: twin.redirect, reloadDocument: true });
      }
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function VersionPageLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/v/$v")) return <SsrHandoff />;
    const { project, v } = Route.useParams();
    const search = Route.useSearch() as Record<string, string | undefined>;
    const q = useQuery(versionPageQuery(project, v, search));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed slug/draft is not-found, never a stack.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    if (q.data.ok === true && q.data.redirect != null) {
      // a stale cache re-read landed the redirect arm — the document's 302 verbatim.
      throw redirect({ href: q.data.redirect, reloadDocument: true });
    }
    return <VersionPageSurface data={q.data} compact={boot?.deviceClass === "phone"} search={search} />;
  },
});
