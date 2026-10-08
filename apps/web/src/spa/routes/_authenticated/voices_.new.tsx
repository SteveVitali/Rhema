// `/voices/new` — the `voices` surface (design/25 `voicesNew` — a sibling of `voices`, escaped).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";

export const Route = createFileRoute("/_authenticated/voices_/new")({
  pendingComponent: PendingShell,
  component: surfaceComponent("/voices/new"),
});
