// `/app/settings/account` — the `settings` surface (design/25 settings.account). SPA.12 mounts the
// real leaf (REQ-SEQ-9, REQ-BFF-1/9/21, REQ-DAT-4): a boot verdict of "spa" warms
// `settingsAccountQuery` in the loader and renders `SettingsFrame` + `AccountSection`; anything
// else is `SsrHandoff` — the server re-decides. The loader skips its read when the verdict isn't
// "spa" so the handoff path never spends a BFF call it throws away.
//
// `?confirmEmail=<token>` (REQ-BFF-21): the SSR document consumes the magic link before the
// strangler consult, so a hard load never lands the token in the shell — but a CLIENT-side entry
// can. `beforeLoad` posts `/bff/settings/account/confirm-email` and throws the envelope's notice
// redirect, exactly the document's consume-then-302 order.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { bffFetch } from "../../bff.js";
import { settingsAccountQuery } from "../../queries.js";
import { flagParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { AccountSection, SettingsFrame } from "../../surfaces/settings.js";

export const Route = createFileRoute("/_authenticated/app/settings/account")({
  validateSearch: validateSearchParams({ saved: flagParam, notice: strParam, confirmEmail: strParam }),
  beforeLoad: async ({ search }) => {
    const token = typeof search.confirmEmail === "string" ? search.confirmEmail : "";
    if (token === "") return;
    // The consume is a POST (a one-shot side-effect never rides a GET). Both arms land on the
    // notice URL the document GET would 302 to — a malformed token is the failed notice, never
    // an error page (the handler already maps the api's refusal there; a transport failure gets
    // the same answer).
    const out = await bffFetch<{ ok: true; redirect?: string }>("/bff/settings/account/confirm-email", {
      method: "POST",
      json: { token },
    }).catch(() => ({ ok: true as const, redirect: "/app/settings/account?notice=email-confirm-failed" }));
    throw redirect({ href: out.redirect ?? "/app/settings/account?notice=email-confirm-failed", replace: true });
  },
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/app/settings/account")
      ? context.queryClient.ensureQueryData(settingsAccountQuery)
      : null,
  component: function AccountSettingsLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/app/settings/account")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(settingsAccountQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    return (
      <SettingsFrame section="account" saved={search.saved === "1"} contentKey={JSON.stringify(search)}>
        <AccountSection account={q.data?.account ?? null} />
      </SettingsFrame>
    );
  },
});
