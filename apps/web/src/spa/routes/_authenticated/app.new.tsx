// `/app/new` — the `onboarding` surface's §5.3 new-project sheet (design/25 `app.new`).
// SPA.14 mounts the real leaf: a boot verdict of "spa" warms `newProjectQuery` in the loader;
// `?entry=` picks the sheet's entry (validated), `?held=1` is the landing hold signal (the
// surface hydrates the file input itself — ONB.1). Phone width gets the SSR's
// PhoneBlockedNote leg.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { newProjectQuery } from "../../queries.js";
import { oneParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { NewProjectSurface } from "../../surfaces/onboarding.js";

export const Route = createFileRoute("/_authenticated/app/new")({
  validateSearch: validateSearchParams({
    entry: oneParam("scratch", "outline", "draft"),
    held: oneParam("1"),
  }),
  pendingComponent: PendingShell,
  loader: async ({ context }) => {
    if (!isSpaEnabled(context.boot, "/app/new")) return null;
    await context.queryClient.ensureQueryData(newProjectQuery);
    return null;
  },
  component: function NewProjectLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/app/new")) return <SsrHandoff />;
    const { entry } = Route.useSearch();
    const q = useQuery(newProjectQuery);
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) throw q.error;
    if (q.data == null) return <SurfaceShell />;
    return (
      <NewProjectSurface
        newProject={q.data.newProject}
        entry={entry ?? "scratch"}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});
