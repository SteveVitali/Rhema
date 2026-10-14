// `/usage` — the `usage` surface (design/25 usage). SPA.10 mounts the real leaf (REQ-SEQ-9,
// REQ-DAT-1/4): a boot verdict of "spa" warms `usageQuery` in the loader and renders
// `UsageSurface`; anything else is `SsrHandoff` — the server re-decides. The loader skips its
// read when the verdict isn't "spa" so the handoff path never spends a BFF call it throws away.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { usageQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { UsageSurface } from "../../surfaces/usage.js";

export const Route = createFileRoute("/_authenticated/usage")({
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/usage") ? context.queryClient.ensureQueryData(usageQuery) : null,
  component: function UsageLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/usage")) return <SsrHandoff />;
    const q = useQuery(usageQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return <UsageSurface usage={q.data?.usage ?? null} account={q.data?.account ?? null} />;
  },
});
