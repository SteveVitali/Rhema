// `/app/settings/billing` — the `billing` surface (design/25 settings.billing / design/22 §2
// `app.settings.billing`). SPA.16 mounts the real leaf (REQ-SEQ-9, REQ-BFF-1/9, REQ-DAT-4): a boot
// verdict of "spa" warms `billingSettingsQuery` in the loader and renders `BillingSurface`;
// anything else is `SsrHandoff` — the server re-decides. The loader skips its read when the
// verdict isn't "spa" so the handoff path never spends a BFF call it throws away. `saved`/`notice`
// are the flash params the mutation envelopes' `redirect` arms carry — validated search, never
// payload.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { billingSettingsQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { BillingSurface } from "../../surfaces/billing.js";

export const Route = createFileRoute("/_authenticated/app/settings/billing")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/app/settings/billing")
      ? context.queryClient.ensureQueryData(billingSettingsQuery)
      : null,
  component: function BillingSettingsLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/app/settings/billing")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(billingSettingsQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return (
      <BillingSurface
        twin={q.data ?? { billing: null, balance: null }}
        saved={search.saved === "1"}
        notice={typeof search.notice === "string" ? search.notice : undefined}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
