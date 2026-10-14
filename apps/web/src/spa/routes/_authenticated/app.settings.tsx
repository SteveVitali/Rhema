// `/app/settings` — the settings section layout (design/25 `settings`). The bare path's redirect
// lives on `app.settings.index` (`beforeLoad → ./account`); the layout itself never redirects so a
// section link (`/app/settings/preferences`) never detours through account.

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/app/settings")({
  component: Outlet,
});
