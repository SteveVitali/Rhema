import { Hono } from "hono";
import { buildRatesPublication } from "@rhema/contracts";
import { createRunRoutes, type RunApiDeps } from "./run-routes.js";
import { createSseRoutes, type SseApiDeps } from "./sse-routes.js";

// api — Hono REST + SSE. P0.08 adds run creation + the internal run API (run-routes.ts); P0.08b adds the
// viewer-facing run-event SSE route (sse-routes.ts). Both mount when the orchestrator deps are supplied. The
// live deps (a pg pool, Redis heartbeats/subscriber, the pg-boss queue, the JWT service) are constructed at
// deploy; the route layer is fully unit-testable with injected deps.

export { createAuth } from "./auth.js";
export type { AuthSecrets, SendMagicLink } from "./auth.js";
export { createRunRoutes } from "./run-routes.js";
export type { RunApiDeps, Principal } from "./run-routes.js";
export { createSseRoutes, resolveSseAccess, parseAfterSeq } from "./sse-routes.js";
export type { SseApiDeps } from "./sse-routes.js";

/** The deps for the full api app: run creation + internal run API (P0.08) + the run-event SSE route (P0.08b). */
export type ApiDeps = RunApiDeps & SseApiDeps;

/** Build the api app. Pass `deps` to mount the run-creation, internal run API, and run-event SSE routes. */
export function createApp(deps?: ApiDeps): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "api" }));
  // Public rate publication (REQ-BILL-19; §14.6): current + previous rate tables with effective dates and the
  // 1.4 platform rate. No auth — every run report links to its version. The full pricing page is PRB.8/P1.16.
  app.get("/pricing/rates", (c) => c.json(buildRatesPublication()));
  if (deps) {
    app.route("/", createRunRoutes(deps));
    app.route("/", createSseRoutes(deps));
  }
  return app;
}

export const app = createApp();
