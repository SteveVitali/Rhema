// `/app/settings/account` — the `settings` surface (design/25 settings.account; `?confirmEmail`
// consumption is the account surface's own ticket).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { strParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/app/settings/account")({
  validateSearch: validateSearchParams({ saved: strParam, notice: strParam, confirmEmail: strParam }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/app/settings/account"),
});
