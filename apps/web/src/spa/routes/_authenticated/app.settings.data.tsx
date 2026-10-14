// `/app/settings/data` — the `settings` surface. SPA.12 mounts the real leaf (REQ-SEQ-9,
// REQ-BFF-1/9/17, REQ-DAT-4): the "spa" verdict warms `settingsDataQuery`; anything else is
// `SsrHandoff` — the server re-decides. `/app/settings/data/export/download` stays a server binary
// endpoint — never a client route (design/25 §not-in-the-tree).
//
// The flash params (`?notice`, `?p`,`?v`,`?f`) map to the section's notice/import-count props with
// the SAME composition the document's PageData ran — URL state, never payload.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getSpaBoot, isSpaEnabled } from "../../boot.js";
import { settingsDataQuery } from "../../queries.js";
import { flagParam, numParam, strParam, validateSearchParams } from "../../search.js";
import { PendingShell, SsrHandoff, SurfaceShell } from "../../states.js";
import { DataSection, SettingsFrame } from "../../surfaces/settings.js";

export const Route = createFileRoute("/_authenticated/app/settings/data")({
  validateSearch: validateSearchParams({
    saved: flagParam,
    notice: strParam,
    // The import counts arrive numeric — the router's parse turns `?p=2` into 2 and the mutation
    // envelope's redirect emits bare digits; `numParam` keeps both and drops garbage.
    p: numParam,
    v: numParam,
    f: numParam,
  }),
  pendingComponent: PendingShell,
  loader: ({ context }) =>
    isSpaEnabled(context.boot, "/app/settings/data")
      ? context.queryClient.ensureQueryData(settingsDataQuery)
      : null,
  component: function DataSettingsLeaf() {
    if (!isSpaEnabled(getSpaBoot(), "/app/settings/data")) return <SsrHandoff />;
    const search = Route.useSearch();
    const q = useQuery(settingsDataQuery);
    if (q.isPending) return <SurfaceShell />;
    // A non-401 read failure is the route's designed error state (REQ-UX-6); a 401 already
    // triggered the session-expired document nav inside `bffFetch`.
    if (q.data == null && q.isError) throw q.error;
    const notice = typeof search.notice === "string" ? search.notice : undefined;
    // The document's imported-count composition, verbatim: `?p` present ⇒ the import landed counts.
    const imported =
      search.p != null
        ? {
            projects: Number(search.p),
            voices: Number(search.v ?? 0),
            files: Number(search.f ?? 0),
          }
        : undefined;
    return (
      <SettingsFrame section="data" saved={search.saved === "1"} contentKey={JSON.stringify(search)}>
        <DataSection
          privacy={{
            analyticsOptOut: q.data?.privacy.analyticsOptOut ?? false,
            saved: search.saved === "1",
          }}
          data={q.data?.data ?? null}
          accountExport={{ export: q.data?.accountExport.export ?? null }}
          notice={notice}
          imported={imported}
        />
      </SettingsFrame>
    );
  },
});
