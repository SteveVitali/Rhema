// `/billing/return` — the `billing` surface's Stripe-return poll (design/25 billingReturn;
// meta-refresh → Query refetch lands with the billing ticket — REQ-NAV-11).

import { createFileRoute } from "@tanstack/react-router";
import { PendingShell, surfaceComponent } from "../../states.js";
import { oneParam, validateSearchParams } from "../../search.js";

export const Route = createFileRoute("/_authenticated/billing/return")({
  validateSearch: validateSearchParams({ cancelled: oneParam("1") }),
  pendingComponent: PendingShell,
  component: surfaceComponent("/billing/return"),
});
