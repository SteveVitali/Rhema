// 223 R7DEM.6b (REQ-TOUR-9; REQ-DACC-3; ADR-126) — the `/a/demo` relay, proven end-to-end on
// the outer app: a valid beacon forwards `{event, essay, step, src}` to the api seam with
// NO session headers; oversize/out-of-enum/malformed payloads are 204 with no forward; the
// per-instance token bucket drops bursts; no Set-Cookie is ever stamped — signed in or out.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource, SessionHeaders } from "./data.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, "..", "..", "..", "packages", "demo-corpus", "fixtures", "synthetic");

function spaAssetRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "rhema-demo-spa-"));
  mkdirSync(join(dir, ".vite"), { recursive: true });
  writeFileSync(
    join(dir, ".vite", "manifest.json"),
    JSON.stringify({ "src/main.tsx": { file: "assets/spa/main.js", isEntry: true } }),
  );
  return dir;
}

interface DemoCall {
  event: string;
  essay?: string;
  step?: number;
  src?: string;
}

function makeApp(calls: DemoCall[], sessionHeaders: (c: { req: { header: (n: string) => string | undefined } }) => SessionHeaders | null) {
  const deps: WebDeps = {
    dataSource: { recordDemoEvent: async (req: DemoCall) => { calls.push(req); return { ok: true }; } } as unknown as DataSource,
    session: sessionHeaders,
    demoCorpusRoot: FIXTURE,
    spaAssetRoot: spaAssetRoot(),
  };
  return createWebApp(deps);
}

const sessionFor = (c: { req: { header: (n: string) => string | undefined } }): SessionHeaders | null =>
  c.req.header("cookie") ? { cookie: c.req.header("cookie") } : null;

const post = (app: ReturnType<typeof makeApp>, body: unknown, headers: Record<string, string> = {}) =>
  app.request("/a/demo", {
    method: "POST",
    headers: { "content-type": "text/plain", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /a/demo — the one sanctioned demo write (REQ-TOUR-9)", () => {
  it("forwards a valid event to the api seam — anonymous AND with a session cookie", async () => {
    const calls: DemoCall[] = [];
    const app = makeApp(calls, sessionFor);
    for (const headers of [
      {},
      { cookie: "rhema.session_token=signed-in-visitor", authorization: "Bearer tok" },
    ]) {
      const res = await post(app, { event: "demo.hub_viewed", src: "jrn" }, headers);
      expect(res.status).toBe(204);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
    expect(calls).toEqual([
      { event: "demo.hub_viewed", src: "jrn" },
      { event: "demo.hub_viewed", src: "jrn" },
    ]);
  });

  it("oversize, out-of-enum, malformed and non-JSON bodies are 204 with no forward", async () => {
    const calls: DemoCall[] = [];
    const app = makeApp(calls, sessionFor);
    const res1 = await post(app, { event: "demo.evil" });
    const res2 = await post(app, { event: "demo.hub_viewed", essay: "x".repeat(400) });
    const res3 = await post(app, "this is not json");
    const res4 = await post(app, JSON.stringify({ event: "demo.hub_viewed" }).padEnd(300, " "));
    for (const r of [res1, res2, res3, res4]) {
      expect(r.status).toBe(204);
      expect(r.headers.get("set-cookie")).toBeNull();
    }
    expect(calls).toEqual([]);
  });

  it("the token bucket drops bursts past the bound (60/min per instance)", async () => {
    const calls: DemoCall[] = [];
    const app = makeApp(calls, () => null);
    let answered = 0;
    for (let i = 0; i < 80; i++) {
      const res = await post(app, { event: "demo.hub_viewed" });
      expect(res.status).toBe(204);
      if (calls.length > answered) answered = calls.length;
    }
    // the bucket admitted at most its capacity; the rest were dropped — still 204s.
    expect(calls.length).toBeLessThanOrEqual(60);
    expect(calls.length).toBeGreaterThan(0);
  });

  it("never reads x-forwarded-for or the user agent — the handler holds no identity path", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile(new URL("./server.ts", import.meta.url), "utf8"),
    );
    // slice the handler body (app.post("/a/demo") → its closing `});`), strip comments, then
    // prove no header/session API is invoked — the forward can carry no identity.
    const start = src.indexOf('app.post("/a/demo"');
    const end = src.indexOf("\n  });", start);
    const route = src
      .slice(start, end)
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    for (const banned of [
      "req.header(",
      "x-forwarded-for",
      "user-agent",
      "deps.session",
      "clientIp(",
      "cookie",
      "authorization",
    ]) {
      expect(route, `handler must not reference ${banned}`).not.toContain(banned);
    }
  });
});
