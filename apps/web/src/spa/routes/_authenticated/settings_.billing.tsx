// `/settings/billing` — the `billing` surface's legacy alias render (design/25
// `legacySettingsBilling` — parity, F7). The `settings_` escape keeps it OUT of the `/settings`
// redirect's subtree. SPA.16 mounts the real leaf: the flag's verdict covers BOTH mounts (the
// SSR's shared `billingPageHandler` consults `spaShellResponse(…, "billing")` on either path —
// the boot map keys the alias verdict by its own route id `/settings/billing`), and the same
// `BillingSurface` renders — its forms post to the canonical `/app/settings/billing/*` actions
// verbatim (the SSR emitted the same canonical actions on the alias mount).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { billingSettingsQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { BillingSurface } from "../../surfaces/billing.js";

export const Route = createFileRoute("/_authenticated/settings_/billing")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam }),
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/settings/billing")
      ? context.queryClient.ensureQueryData(billingSettingsQuery)
      : null,
  component: function LegacyBillingSettingsLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/settings/billing")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(billingSettingsQuery);
    if (q.isPending) return <SurfaceShell />;
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
