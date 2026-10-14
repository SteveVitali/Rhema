// SPA.4 — the root route: carries the typed context (QueryClient + boot) and mounts the head
// manager beside every match. `notFoundMode:"fuzzy"` + `SpaNotFound` come from the router options
// in main.tsx. SPA.9 — the QueryClientProvider so chrome/surface components can `useQuery`
// (the same per-boot client the context carries — REQ-BFF-10).

import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import type { SpaContext } from "../main.js";
import { HeadManager } from "../head.js";

export const Route = createRootRouteWithContext<SpaContext>()({
  component: function RootComponent() {
    const { queryClient } = Route.useRouteContext();
    return (
      <QueryClientProvider client={queryClient}>
        <HeadManager />
        <Outlet />
      </QueryClientProvider>
    );
  },
});
