import { serve } from "@hono/node-server";
import { createWebApp } from "./server.js";
import { apiDataSource } from "./data.js";
import type { SessionHeaders } from "./data.js";

// Container entrypoint. The Phase-0 session stand-in reads the gateway-injected identity headers (the same
// `x-rhema-*` contract the api's `headerPrincipal` consumes) and forwards them to the api; the live Better
// Auth cookie → session/OAuth binding (Google + magic link on dev) is D-P0.01-3. Runs only when invoked
// directly, so importing this module in tests never starts a listener.

const IDENTITY_HEADERS = ["x-rhema-user-id", "x-rhema-workspace-id", "x-rhema-billing-account-id"] as const;

export function startWebServer(): void {
  const apiBaseUrl = process.env.API_BASE_URL ?? "http://api:8080";
  const port = Number(process.env.PORT ?? 8080);
  const app = createWebApp({
    dataSource: apiDataSource(apiBaseUrl),
    // PRB.08 — the final-month beta-plan offer (copy + a link only; set by the deploy when the window opens).
    ...(process.env.BETA_PLAN_OFFER_URL ? { betaPlanOfferUrl: process.env.BETA_PLAN_OFFER_URL } : {}),
    session(c) {
      const forwarded: Record<string, string> = {};
      for (const h of IDENTITY_HEADERS) {
        const v = c.req.header(h);
        if (!v) return null; // any missing ⇒ unauthenticated (redirect to /login)
        forwarded[h] = v;
      }
      const cookie = c.req.header("cookie");
      if (cookie) forwarded.cookie = cookie;
      return forwarded satisfies SessionHeaders;
    },
  });
  serve({ fetch: app.fetch, port });
  console.log(`[web] listening on :${port} (api ${apiBaseUrl})`);
}

if (process.argv[1] && process.argv[1].endsWith("main.js")) {
  startWebServer();
}
