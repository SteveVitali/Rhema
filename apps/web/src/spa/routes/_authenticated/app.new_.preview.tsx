// `/app/new/preview` — the `onboarding` surface's pending-conversion leg (design/25
// app.newPreview). `?qk` is required — a bare entry redirects to `/app/new` (the SSR
// handler's contract verbatim; the twin answers it as `{ok,redirect}` too). The picks ride
// the query string so a refresh round-trips them (the document's `newProjectPollUrl`
// grammar verbatim); the twin's `pollAfterSeconds` drives `refetchInterval` — the server
// owns the cadence (REQ-BFF-15). The `new_` escape keeps it a sibling of `app.new`.

import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { newProjectPreviewQuery } from "../../queries.js";
import { oneParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { NewProjectPreviewSurface } from "../../surfaces/onboarding.js";

export const Route = createFileRoute("/_authenticated/app/new_/preview")({
  validateSearch: validateSearchParams({
    qk: strParam,
    src: strParam,
    entry: oneParam("scratch", "outline", "draft"),
    title: strParam,
    protocolId: strParam,
    venue: strParam,
    personaId: strParam,
    startVersion: strParam,
    heldToken: strParam,
  }),
  beforeLoad: ({ search }) => {
    if (search.qk == null) throw redirect({ to: "/app/new" });
  },
  pendingComponent: PendingShell,
  loader: async ({ context, location }) => {
    if (!isSpaEnabled(context.boot, "/app/new/preview")) return null;
    const s = location.search as Record<string, string>;
    await context.queryClient.ensureQueryData(newProjectPreviewQuery({
      entry: s.entry, qk: s.qk, title: s.title, protocolId: s.protocolId,
      venue: s.venue, personaId: s.personaId, startVersion: s.startVersion,
      heldToken: s.heldToken, src: s.src,
    }));
    return null;
  },
  component: function NewProjectPreviewLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/app/new/preview")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(newProjectPreviewQuery({
      entry: search.entry as string | undefined,
      qk: search.qk as string | undefined,
      title: search.title as string | undefined,
      protocolId: search.protocolId as string | undefined,
      venue: search.venue as string | undefined,
      personaId: search.personaId as string | undefined,
      startVersion: search.startVersion as string | undefined,
      heldToken: search.heldToken as string | undefined,
      src: search.src as string | undefined,
    }));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) throw q.error;
    if (q.data == null) return <SurfaceShell />;
    return (
      <NewProjectPreviewSurface
        twin={q.data}
        search={search as Record<string, string | undefined>}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
