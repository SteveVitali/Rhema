import { Hono } from "hono";

// api — Hono REST + SSE (skeleton service, P0.01). Real routes (Better Auth handler, run creation,
// Stripe webhooks, internal run API) land in P0.08. P0.01 ships a buildable app with a health check
// so `images` + deploy provenance can be exercised before any service has business logic.

export { createAuth } from "./auth.js";
export type { AuthSecrets, SendMagicLink } from "./auth.js";

export function createApp(): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "api" }));
  return app;
}

export const app = createApp();
