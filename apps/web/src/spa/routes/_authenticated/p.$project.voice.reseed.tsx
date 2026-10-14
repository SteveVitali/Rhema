// `/p/$project/voice/reseed` — the `voices` surface's §9.6 charter-diff preview (design/25
// `p.voiceReseed`). SPA.13 mounts the real leaf (REQ-SEQ-9, REQ-BFF-11): a boot verdict of "spa"
// warms `projectVoiceReseedQuery(slug)` in the loader and maps the twin's 404 to the router's
// not-found — the document's own `notFoundElement` answer for a missed slug or preview seam.
// Phone width gets the SSR's PhoneBlockedNote leg.

import { createFileRoute, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectVoiceReseedQuery } from "../../queries.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { VoiceReseedSurface } from "../../surfaces/voices.js";

export const Route = createFileRoute("/_authenticated/p/$project/voice/reseed")({
  pendingComponent: PendingShell,
  loader: async ({ context, params }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/voice/reseed")) return null;
    try {
      await context.queryClient.ensureQueryData(projectVoiceReseedQuery(params.project));
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function VoiceReseedLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/voice/reseed")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const q = useQuery(projectVoiceReseedQuery(project));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    return (
      <VoiceReseedSurface voiceReseed={q.data.voiceReseed} compact={boot?.deviceClass === "phone"} />
    );
  },
});
