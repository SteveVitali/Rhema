// `/p/$project/voice/reseed` — the `voices` surface's per-project reseed (design/25
// `p.voiceReseed`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/p/$project/voice/reseed")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/p/$project/voice/reseed"),
});
