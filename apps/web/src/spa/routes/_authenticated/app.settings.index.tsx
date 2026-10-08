// `/app/settings` bare — client `throw redirect` → `./account` (design/25 §redirect surfaces; the
// server 302 is retained for hard loads during the strangler).

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/app/settings/account", replace: true });
  },
});
