import { Hono } from "hono";
import { serve } from "@hono/node-server";

// The collab Cloud Run service entrypoint (PRB.15). The Hocuspocus Yjs impl is still a skeleton — the
// service's real surface lands with its own ticket — but the PROD deploy needs a real, healthy image,
// not a sleeper: this is the honest minimum (a healthz listener Cloud Run's startup probe answers).
// Anything more here (the WSS endpoint, presence, per-workspace auth) belongs to the collab ticket —
// this file deliberately does not fake that surface.

export function createCollabApp(): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "collab" }));
  return app;
}

export function startCollabServer(): void {
  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: createCollabApp().fetch, port });
  console.log(`[collab] listening on :${port} (skeleton — healthz only)`);
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startCollabServer();
}
