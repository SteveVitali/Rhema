// `/p/$project/import/preview` — the conversion-poll leg (design/25 `p.importPreview`):
// `?qk` required — a bare entry redirects to `../import` (the SSR handler's contract
// verbatim; the twin answers it as `{ok,redirect}` too). The twin's `pollAfterSeconds`
// drives `refetchInterval` — the server owns the cadence (REQ-BFF-15). The `import_`
// escape keeps it a sibling of `p.import`.

import { useEffect } from "react";
import { createFileRoute, notFound, redirect, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { BffError } from "../../bff.js";
import { projectImportPreviewQuery } from "../../queries.js";
import { strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { ImportPreviewSurface } from "../../surfaces/onboarding.js";

export const Route = createFileRoute("/_authenticated/p/$project/import_/preview")({
  validateSearch: validateSearchParams({ qk: strParam, src: strParam }),
  beforeLoad: ({ search, params }) => {
    if (search.qk == null) {
      throw redirect({ to: "/p/$project/import", params: { project: params.project }, replace: true });
    }
  },
  pendingComponent: PendingShell,
  loader: async ({ context, params, location }) => {
    if (!isSpaEnabled(context.boot, "/p/$project/import/preview")) return null;
    const s = location.search as Record<string, string>;
    try {
      await context.queryClient.ensureQueryData(
        projectImportPreviewQuery(params.project, { qk: s.qk, src: s.src }),
      );
    } catch (e) {
      if (e instanceof BffError && e.status === 404) throw notFound();
      throw e;
    }
    return null;
  },
  component: function ImportPreviewLeaf() {
    const boot = getSpaBoot();
    if (!isSpaEnabled(boot, "/p/$project/import/preview")) return <SsrHandoff />;
    const { project } = Route.useParams();
    const search = Route.useSearch();
    const q = useQuery(projectImportPreviewQuery(project, {
      qk: search.qk as string | undefined,
      src: search.src as string | undefined,
    }));
    if (q.isPending) return <SurfaceShell />;
    if (q.data == null && q.isError) {
      if (q.error instanceof BffError && q.error.status === 404) throw notFound();
      throw q.error;
    }
    if (q.data == null) return <SurfaceShell />;
    // The twin's own redirect leg (e.g. a `qk` the read-back refuses) — follow it.
    if (q.data.ok === true && q.data.redirect) {
      return <SsrHandoffHref href={q.data.redirect} />;
    }
    if (q.data.importPreview == null) return <SurfaceShell />;
    return (
      <ImportPreviewSurface
        data={q.data.importPreview}
        compact={boot?.deviceClass === "phone"}
      />
    );
  },
});

/** In-router hop for the twin's `{ok,redirect}` leg — the target is another SPA route. */
function SsrHandoffHref({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    void router.navigate({ href });
  }, [router, href]);
  return <SurfaceShell />;
}
