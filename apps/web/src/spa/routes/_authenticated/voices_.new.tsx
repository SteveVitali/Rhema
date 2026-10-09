// `/voices/new` — the `voices` surface's §9.2 creation sheet (design/25 `voicesNew` — a sibling of
// `voices`, escaped). SPA.13 mounts the real leaf (REQ-SEQ-9, REQ-BFF-1/9, REQ-DAT-4): a boot
// verdict of "spa" warms `voiceNewQuery` (the options seam — static copy today) and renders
// `VoiceNewSurface`; anything else is `SsrHandoff`. Phone width gets the SSR's PhoneBlockedNote
// leg — voice building is §10.1 ✗.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { voiceNewQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VoiceNewSurface } from "../../surfaces/voices.js";

export const Route = createFileRoute("/_authenticated/voices_/new")({
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/voices/new")
      ? context.queryClient.ensureQueryData(voiceNewQuery)
      : null,
  component: function VoiceNewLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/voices/new")) return <SsrHandoff />;
    const q = useQuery(voiceNewQuery);
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) throw q.error;
    return <VoiceNewSurface compact={boot?.deviceClass === "phone"} />;
  },
});
