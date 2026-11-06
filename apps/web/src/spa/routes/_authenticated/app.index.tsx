// `/app` — the `project-home` surface (design/25 `app.index`; design/22 §2 `app` row). SPA.15
// mounts the real leaf (REQ-SEQ-9, REQ-BFF-1/9, REQ-DAT-4): a boot verdict of "spa" warms
// `projectHomeQuery` in the loader — only `?q`/`?deleted` ride the read's key, the display
// filters (`voice`/`protocol`/`sort`/`archived`) are client-side derivations off the cached
// aggregate — and renders `ProjectHomeSurface`; anything else is `SsrHandoff`, where the server
// re-decides (the loader skips its read on the handoff path so it never spends a BFF call it
// throws away). `?verified`/showcase/`?held`/carried-file precedence never reaches this leaf —
// the document's fixed handler order consumed it before the shell was served (REQ-BFF-20).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { projectHomeQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ProjectHomeSurface } from "../../surfaces/project-home.js";
import { flagIntParam, flagParam, oneParam, strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/")({
  validateSearch: validateSearchParams({
    q: strParam,
    voice: strParam,
    protocol: strParam,
    sort: oneParam("title"),
    // `=1` flags reach the router parsed as the NUMBER 1 — flagParam normalizes to "1" so the
    // leaf's `=== "1"` checks match the document's `c.req.query("x") === "1"` semantics.
    archived: flagIntParam,
    deleted: flagIntParam,
    verified: flagParam,
    entry: strParam,
    held: flagParam,
  }),
  pendingComponent: PendingShell,
  loader: ({ context, location }) => {
    if (!isSpaEnabled(context.boot, "/app")) return null;
    // `location.search` is the PARSED (pre-validation) object — `deleted` may arrive as the
    // number 1; normalize exactly like flagParam so the warm key equals the leaf's useQuery key.
    const s = location.search as { q?: unknown; deleted?: unknown };
    const deletedOn = s.deleted === "1" || s.deleted === 1;
    return context.queryClient.ensureQueryData(
      projectHomeQuery({
        q: typeof s.q === "string" ? s.q : undefined,
        deleted: deletedOn ? "1" : undefined,
      }),
    );
  },
  component: function ProjectHomeLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/app")) return <SsrHandoff />;
    const search = Route.useSearch();
    const deletedOn = search.deleted === "1" || (search.deleted as unknown) === 1;
    const q = useQuery(
      projectHomeQuery({ q: search.q as string | undefined, deleted: deletedOn ? "1" : undefined }),
    );
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return (
      <ProjectHomeSurface
        twin={q.data ?? { rows: [], voices: [], groupBy: "attention", balance: null, protocols: [], deletedRows: [] }}
        params={search}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
