import { describe, it, expect } from "vitest";
import { parseRobots, robotsAllows } from "./robots.js";
import { HostRateLimiter } from "./rate-limit.js";
import { createFetcherApp } from "./server.js";
import type { Forwarder, ForwardResponse } from "./fetch-guarded.js";

async function* bytes(s: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(s);
}
const html = (s: string): ForwardResponse => ({ status: 200, headers: { "content-type": "text/html" }, body: bytes(s) });
const forwarder = (map: Record<string, ForwardResponse>): Forwarder => async (u) => {
  const r = map[u];
  if (!r) throw new Error("no response");
  return r;
};

describe("robots.txt", () => {
  it("respects a Disallow for our agent (and *)", () => {
    const txt = `User-agent: *\nDisallow: /private\nAllow: /private/ok`;
    const rules = parseRobots(txt, "rhemabot");
    expect(robotsAllows(rules, "/public")).toBe(true);
    expect(robotsAllows(rules, "/private/secret")).toBe(false);
    expect(robotsAllows(rules, "/private/ok")).toBe(true); // longer Allow wins
  });
  it("Disallow: / blocks everything; empty Disallow allows all", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /", "rhemabot"), "/x")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow:", "rhemabot"), "/x")).toBe(true);
  });
});

describe("HostRateLimiter (≤1 req/s/host)", () => {
  it("allows the first hit and denies an immediate second to the same host", () => {
    let t = 1000;
    const rl = new HostRateLimiter(1000, () => t);
    expect(rl.take("a.example")).toBe(true);
    expect(rl.take("a.example")).toBe(false);
    expect(rl.take("b.example")).toBe(true); // different host is independent
    t += 1000;
    expect(rl.take("a.example")).toBe(true); // allowed after the interval
  });
});

describe("createFetcherApp", () => {
  const deps = {
    resolve: async () => ["93.184.216.34"],
    forward: forwarder({ "https://good.example/a": html("<p>ok</p>") }),
    rateLimiter: new HostRateLimiter(1000, () => 5000),
  };

  it("fetches a public URL and returns base64 bytes + metadata (parses nothing)", async () => {
    const app = createFetcherApp(deps);
    const res = await app.request("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://good.example/a" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; contentType: string; bytesBase64: string };
    expect(body.ok).toBe(true);
    expect(body.contentType).toBe("text/html");
    expect(Buffer.from(body.bytesBase64, "base64").toString()).toBe("<p>ok</p>");
  });

  it("403s an SSRF target", async () => {
    const app = createFetcherApp({ ...deps, rateLimiter: new HostRateLimiter(0) });
    const res = await app.request("/fetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "http://169.254.169.254/" }),
    });
    expect(res.status).toBe(403);
  });

  it("429s when the per-host rate limit is exceeded", async () => {
    const app = createFetcherApp({ ...deps, rateLimiter: new HostRateLimiter(1000, () => 9000) });
    const body = JSON.stringify({ url: "https://good.example/a" });
    const h = { "content-type": "application/json" };
    expect((await app.request("/fetch", { method: "POST", headers: h, body })).status).toBe(200);
    expect((await app.request("/fetch", { method: "POST", headers: h, body })).status).toBe(429);
  });
});
