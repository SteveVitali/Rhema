// `/settings` — the legacy alias (design/25 `legacySettings`): client `throw redirect` →
// `/app/settings/account`; the server 302 is retained for hard loads during the strangler.
// `settings_.billing.tsx` escapes this route so the billing alias never inherits the redirect.

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/app/settings/account", replace: true });
  },
});
