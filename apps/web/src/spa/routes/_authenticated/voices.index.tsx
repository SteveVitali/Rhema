// `/voices` — the `voices` surface (design/25 `voices`). SPA.13 mounts the real leaf
// (REQ-SEQ-9, REQ-BFF-1/9, REQ-DAT-4): a boot verdict of "spa" warms `voicesQuery` in the loader
// and renders `VoicesSurface`; anything else is `SsrHandoff` — the server re-decides. The loader
// skips its read when the verdict isn't "spa" so the handoff path never spends a BFF call it
// throws away. `compact` rides the boot's deviceClass — the §10.1 ✗ suppression legs are the
// SSR's own branches.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { voicesQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VoicesSurface } from "../../surfaces/voices.js";

export const Route = createFileRoute("/_authenticated/voices/")({
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/voices") ? context.queryClient.ensureQueryData(voicesQuery) : null,
  component: function VoicesLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/voices")) return <SsrHandoff />;
    const q = useQuery(voicesQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return <VoicesSurface voices={q.data?.voices ?? null} compact={boot?.deviceClass === "phone"} />;
  },
});
