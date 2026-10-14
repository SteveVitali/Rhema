// `/p/$project/edit/$draftId` — a server-owned redirect surface (design/25 `p.editRedirect`; the
// BFF-canonical 302 → `/v/:draftN`). The registered `beforeLoad` document-navigates so the server's
// redirect answers a client-side entry exactly like a hard load; `?noted` rides the same href
// through the 302.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/p/$project/edit/$draftId")({
  beforeLoad: ({ location }) => {
    throw redirect({ href: location.publicHref, reloadDocument: true });
  },
});
