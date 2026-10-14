// `/p/$project/f/$fid` — a server-owned redirect surface (design/25 `p.findingRedirect`; the
// server canonical 302 → the dossier `#anchor`). `beforeLoad` document-navigates so a client-side
// entry resolves through the server's 302, never through a guessed dossier URL.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/p/$project/f/$fid")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: location.publicHref, reloadDocument: true });
  },
});
