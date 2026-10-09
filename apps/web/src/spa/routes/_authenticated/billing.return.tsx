// `/billing/return` — the `billing` surface's Stripe-return poll (design/25 billingReturn;
// REQ-BILL-14, REQ-NAV-11). SPA.16 mounts the real leaf: the document's meta-refresh becomes the
// twin's `refetchInterval` — `GET /bff/billing/return` emits `pollAfterSeconds` only while the
// checkout is `open ∧ ¬cancelled ∧ <30 s old` (§14.6's webhook-lag bound stays server-owned,
// REQ-BFF-15), so the poll stops itself on `completed`/`expired`/`cancelled`/past-window. `?qk`-style
// search rides the query string verbatim — `session_id` and `cancelled` are validated search, never
// payload.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { billingReturnQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { BillingReturnSurface } from "../../surfaces/billing.js";

export const Route = createFileRoute("/_authenticated/billing/return")({
  // `flagParam` (not `oneParam("1")`) — the router's JSON-shaped parse turns `?cancelled=1` into
  // the NUMBER 1; the SPA.15 normalizer keeps it alive as "1".
  validateSearch: validateSearchParams({ cancelled: flagParam, session_id: strParam }),
  pendingComponent: PendingShell,
  loader: async ({ context, location }) => {
    if (!isSpaEnabled(context.boot, "/billing/return")) return null;
    // `location.search` is the router's JSON-shaped parse — `?cancelled=1` arrives as the NUMBER 1
    // (the flagParam fix's hazard); normalize through String so the warm key equals the leaf's
    // `useQuery` key verbatim.
    const s = location.search as Record<string, unknown>;
    await context.queryClient.ensureQueryData(billingReturnQuery({
      session_id: s.session_id != null ? String(s.session_id) : undefined,
      cancelled: s.cancelled != null ? String(s.cancelled) : undefined,
    }));
    return null;
  },
  component: function BillingReturnLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/billing/return")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(billingReturnQuery({
      session_id: search.session_id as string | undefined,
      cancelled: search.cancelled as string | undefined,
    }));
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    if (q.data == null) return <SurfaceShell />;
    return <BillingReturnSurface twin={q.data} />;
  },
});
