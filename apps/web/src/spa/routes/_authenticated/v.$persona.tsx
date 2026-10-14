// `/v/$persona` — the `voices` surface's voice detail (design/25 `voiceDetail`). SPA.13 mounts the
// real leaf (REQ-SEQ-9, REQ-BFF-1/8/9, REQ-DAT-4): a boot verdict of "spa" warms
// `voiceDetailQuery(persona, {tab, sample})` in the loader — the twin carries the tab/sample search
// verbatim so `?tab=samples` also pulls connections + the open drawer — maps a twin 404 to the
// router's not-found (the document's own `notFoundElement` answer), and renders
// `VoiceDetailSurface`; anything else is `SsrHandoff`.
//
// `?tab` accepts the full five-tab grammar the document reads (`overview` absent is the same
// landing); the flash params (`saved`/`added`/`cancelled`/`corrected`/`reconstruct`/`build_failed`)
// are URL state the leaf maps through `voiceNoticeFor` — the document's own notice composition.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { voiceDetailQuery } from "../../queries.js";
import { flagParam, oneParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VoiceDetailSurface, voiceNoticeFor } from "../../surfaces/voices.js";

export const Route = createFileRoute("/_authenticated/v/$persona")({
  validateSearch: validateSearchParams({
    tab: oneParam("overview", "description", "samples", "profile", "runs"),
    sample: strParam,
    // The `?x=1` flashes parse as JSON numbers through the router's default search codec —
    // `flagParam` accepts both the "1" string and the 1 number (settings leaf precedent).
    saved: flagParam,
    added: flagParam,
    cancelled: flagParam,
    corrected: flagParam,
    build_failed: flagParam,
    reconstruct: strParam,
  }),
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/v/$persona")) return null;
    const search = location.search as { tab?: string; sample?: string };
    try {
      await context.queryClient.ensureQueryData(
        voiceDetailQuery(params.persona, { tab: search.tab, sample: search.sample }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function VoiceDetailLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/v/$persona")) return <SsrHandoff />;
    const { persona } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(voiceDetailQuery(persona, { tab: search.tab, sample: search.sample }));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      // Parity with the document's 404 — a missed persona is not-found, never a stack page.
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      // The search key remounts the surface on an envelope-nav — the seed editor's uncontrolled
      // inputs re-read the (already-invalidated) server truth like the SSR 302 repaint did.
      <VoiceDetailSurface
        key={JSON.stringify(search)}
        voice={q.data.voice}
        tab={typeof search.tab === "string" ? search.tab : q.data.voice.tab}
        notice={voiceNoticeFor(search)}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
