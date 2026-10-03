import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { fetchGuarded, type FetchGuardDeps } from "./fetch-guarded.js";
import { parseRobots, robotsAllows } from "./robots.js";
import { HostRateLimiter } from "./rate-limit.js";
import { undiciForwarder, dnsResolver } from "./undici-forwarder.js";
import { USER_AGENT } from "./fetch-guarded.js";

// The fetcher Cloud Run service (§12.1). The only arbitrary-egress component; it PARSES NOTHING — it returns
// the raw bytes (base64) + metadata for the convert service to parse. Per-host ≤1 req/s politeness + robots
// are applied here; the SSRF/size/redirect guards are `fetchGuarded`. The live run-token auth + the engine's
// tool wiring are the deploy leg (D-PRB.02-*); the guard + service handler are exercised deterministically.

const UA_TOKEN = "rhemabot";

export interface FetcherDeps extends FetchGuardDeps {
  readonly rateLimiter: HostRateLimiter;
  /** Fetch robots.txt for a host (returns null if unavailable ⇒ allow). Injected for tests. */
  readonly fetchRobots?: (origin: string) => Promise<string | null>;
}

export function createFetcherApp(deps: FetcherDeps): Hono {
  const app = new Hono();
  app.get("/healthz", (c) => c.json({ ok: true, service: "fetcher" }));

  app.post("/fetch", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { url?: unknown };
    const url = typeof body.url === "string" ? body.url : "";
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return c.json({ ok: false, denyReason: "error", reason: "invalid URL" }, 400);
    }

    if (!deps.rateLimiter.take(parsed.hostname)) {
      return c.json({ ok: false, denyReason: "rate_limited", reason: "≤1 request per second per host" }, 429);
    }

    if (deps.fetchRobots) {
      const robotsTxt = await deps.fetchRobots(parsed.origin).catch(() => null);
      if (robotsTxt != null) {
        const rules = parseRobots(robotsTxt, UA_TOKEN);
        if (!robotsAllows(rules, parsed.pathname)) {
          return c.json({ ok: false, denyReason: "robots", reason: "disallowed by robots.txt" }, 403);
        }
      }
    }

    const res = await fetchGuarded(url, deps);
    if (!res.ok) {
      const status = res.denyReason === "ssrf" || res.denyReason === "scheme" ? 403 : 502;
      return c.json({ ok: false, denyReason: res.denyReason, reason: res.reason }, status);
    }
    return c.json({
      ok: true,
      finalUrl: res.finalUrl,
      status: res.status,
      contentType: res.contentType,
      bytesBase64: Buffer.from(res.bytes).toString("base64"),
      hops: res.hops,
      // P1.15 — ETag/Last-Modified feed the url provider's change detection.
      headers: res.headers,
    });
  });

  return app;
}

export function startFetcherServer(): void {
  const port = Number(process.env.PORT ?? 8080);
  const app = createFetcherApp({
    resolve: dnsResolver,
    forward: undiciForwarder,
    rateLimiter: new HostRateLimiter(1000),
    fetchRobots: async (origin) => {
      const res = await fetchGuarded(`${origin}/robots.txt`, { resolve: dnsResolver, forward: undiciForwarder }, {
        contentTypeAllowlist: ["text/plain", "text/html", "application/octet-stream"],
        userAgent: USER_AGENT,
      });
      return res.ok ? new TextDecoder().decode(res.bytes) : null;
    },
  });
  serve({ fetch: app.fetch, port });
  console.log(`[fetcher] listening on :${port}`);
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startFetcherServer();
}
