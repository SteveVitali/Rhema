// SPA.4 — the root route: carries the typed context (QueryClient + boot) and mounts the head
// manager beside every match. `notFoundMode:"fuzzy"` + `SpaNotFound` come from the router options
// in main.tsx.

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import type { SpaContext } from "../main.js";
import { HeadManager } from "../head.js";

export const Route = createRootRouteWithContext<SpaContext>()({
  component: () => (
    <>
      <HeadManager />
      <Outlet />
    </>
  ),
});
