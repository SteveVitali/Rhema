// `/voices` — the `voices` surface (design/25 `voices`).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/voices/")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/voices"),
});
