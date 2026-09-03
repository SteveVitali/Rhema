import { Hono } from "hono";
import { createRunRoutes, type RunApiDeps } from "./run-routes.js";

// api — Hono REST + SSE. P0.08 adds run creation + the internal run API (run-routes.ts), mounted when the
// orchestrator deps are supplied. The live deps (a pg pool, Redis heartbeats, the pg-boss queue, the JWT
// service) are constructed at deploy; the route layer is fully unit-testable with injected deps.

export { createAuth } from "./auth.js";
export type { AuthSecrets, SendMagicLink } from "./auth.js";
export { createRunRoutes } from "./run-routes.js";
export type { RunApiDeps, Principal } from "./run-routes.js";

/** Build the api app. Pass `deps` to mount the run creation + internal run API routes (P0.08). */
export function createApp(deps?: RunApiDeps): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "api" }));
  if (deps) app.route("/", createRunRoutes(deps));
  return app;
}

export const app = createApp();
