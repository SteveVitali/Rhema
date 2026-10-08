// `/app/inbox` — the `inbox` surface (design/25 app.inbox). SPA.11 mounts the real leaf
// (REQ-SEQ-9, REQ-BFF-1/9, REQ-DAT-4): a boot verdict of "spa" warms `inboxQuery` in the loader
// and renders `InboxSurface`; anything else is `SsrHandoff` — the server re-decides. The loader
// skips its read when the verdict isn't "spa" so the handoff path never spends a BFF call it
// throws away; `compact` rides the boot's deviceClass (the same phone verdict the SSR reads).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { inboxQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { InboxSurface } from "../../surfaces/inbox.js";

export const Route = createFileRoute("/_authenticated/app/inbox")({
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/app/inbox") ? context.queryClient.ensureQueryData(inboxQuery) : null,
  component: function InboxLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/app/inbox")) return <SsrHandoff />;
    const q = useQuery(inboxQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    if (q.data == null) return <SurfaceShell />;
    return <InboxSurface inbox={q.data} compact={boot?.deviceClass === "phone"} />;
  },
});
