import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { apiOnError, instrumentReads, instrumentStoreFactory, requestContext } from "./observability.js";

function makeApp(gcpProject?: string) {
  const store = instrumentReads(
    {
      async get(_sha: string): Promise<Uint8Array | null> {
        throw new Error("gcs gone");
      },
    },
    ["get"],
  );
  const app = new Hono();
  app.use("*", requestContext(gcpProject));
  app.onError(apiOnError);
  app.get("/runs/:id/events", (c) => c.json({ ok: true }));
  app.get("/p/:slug/throw", () => {
    throw new Error("boom prompt-text should never reach logs: hunter2-secret");
  });
  app.get("/p/:slug/throw-nonerror", () => {
    throw { userText: "totally-unique-user-string" };
  });
  // A best-effort store read swallowed into a degraded <500 answer.
  app.get("/p/:slug/degraded", async (c) => {
    const bytes = await store.get("x").catch(() => null);
    return c.json({ bytes: bytes === null ? "missing" : "ok" });
  });
  // A store failure the route does NOT swallow — the error line is the trail, no degraded line.
  app.get("/p/:slug/hard-fail", async (c) => {
    await store.get("x");
    return c.json({ ok: true });
  });
  // A swallowed read that still faults: the 5xx sweep line stands, no double count.
  app.get("/p/:slug/degrade-then-503", async (c) => {
    await store.get("x").catch(() => null);
    return c.json({ error: "store_unavailable" }, 503);
  });
  return app;
}

describe("api request-context middleware + onError (OBS.1)", () => {
  it("echoes a minted request id on the response header of ordinary requests", async () => {
    const res = await makeApp().request("/runs/abc/events");
    expect(res.status).toBe(200);
    const id = res.headers.get("x-rhema-request-id");
    expect(id).toBeTruthy();
  });
  it("honors x-cloud-trace-context: requestId = trace id", async () => {
    const res = await makeApp("rhema-507501").request("/runs/abc/events", {
      headers: { "x-cloud-trace-context": `${"a".repeat(32)}/777;o=1` },
    });
    expect(res.headers.get("x-rhema-request-id")).toBe("a".repeat(32));
  });
  it("honors a web-forwarded x-rhema-request-id", async () => {
    const res = await makeApp().request("/runs/abc/events", {
      headers: { "x-rhema-request-id": "web-id-9" },
    });
    expect(res.headers.get("x-rhema-request-id")).toBe("web-id-9");
  });
  it("unhandled errors → exactly ONE structured line, a 500 with only the requestId", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp("rhema-507501").request("/p/alice-secret-slug/throw", {
        headers: { "x-cloud-trace-context": `${"b".repeat(32)}/9;o=1` },
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error: string; requestId: string };
      expect(body).toEqual({ error: "internal_error", requestId: "b".repeat(32) });
      expect(res.headers.get("x-rhema-request-id")).toBe("b".repeat(32));
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.severity).toBe("ERROR");
      expect(line.msg).toBe("unhandled_route_error");
      expect(line.service).toBe("api");
      expect(line.route).toBe("/p/:slug/throw"); // route TEMPLATE — the slug never logs
      expect(line.method).toBe("GET");
      expect(line.status).toBe(500);
      expect(line.requestId).toBe("b".repeat(32));
      expect(line["logging.googleapis.com/trace"]).toBe(`projects/rhema-507501/traces/${"b".repeat(32)}`);
      expect(line.errorClass).toBe("Error");
      expect(String(line.stack)).toContain("at ");
      expect(line.stack).not.toContain("hunter2-secret");
      expect(JSON.stringify(line)).not.toContain("alice-secret-slug");
      expect(JSON.stringify(line)).not.toContain("hunter2-secret");
    } finally {
      spy.mockRestore();
    }
  });
  it("non-Error throws still produce one line with a fixed class — the value never logs", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/p/x/throw-nonerror");
      expect(res.status).toBe(500);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.errorClass).toBe("NonErrorThrow");
      expect(JSON.stringify(line)).not.toContain("totally-unique-user-string");
    } finally {
      spy.mockRestore();
    }
  });
  it("a swallowed store read under a <500 answer emits ONE WARNING degraded_reads line", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/p/x/degraded");
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.severity).toBe("WARNING");
      expect(line.msg).toBe("degraded_reads");
      expect(line.degradedCount).toBe(1);
      expect(line.route).toBe("/p/:slug/degraded");
    } finally {
      spy.mockRestore();
    }
  });
  it("a thrown store failure emits the error line only — no degraded double-count", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/p/x/hard-fail");
      expect(res.status).toBe(500);
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.msg).toBe("unhandled_route_error");
      expect(line.degradedCount).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it("a degraded read that still answers ≥500 yields the ONE 5xx line, not both", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/p/x/degrade-then-503");
      expect(res.status).toBe(503);
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.msg).toBe("unlogged_5xx_response");
      expect(line.status).toBe(503);
      expect(line.degradedCount).toBeUndefined();
    } finally {
      spy.mockRestore();
    }
  });
  it("instrumentStoreFactory instruments the RESOLVED store, not the factory's promise (prod dossier 500)", async () => {
    // Regression for the OBS.1 deploy-time defect: wrapping the factory RESULT directly proxied a
    // Promise — `await` ran `Promise.prototype.then` through the trap with `this` = the proxy and
    // threw TypeError (`at Proxy.then`). Both factory shapes must yield an instrumented store.
    for (const factory of [
      async () => ({ async get(_s: string): Promise<Uint8Array | null> { return new Uint8Array([7]); } }),
      () => ({ async get(_s: string): Promise<Uint8Array | null> { return new Uint8Array([7]); } }),
    ]) {
      const bound = instrumentStoreFactory(factory, ["get", "put"]);
      const store = await bound("ws-1"); // this await is what TypeError'd in prod
      expect(store).toBeTruthy();
      await expect(store!.get("x")).resolves.toEqual(new Uint8Array([7]));
    }
    // And a null factory result passes through (the nullable contentStoreFor variants).
    const boundNull = instrumentStoreFactory(async () => null, ["get"]);
    await expect(boundNull("ws-1")).resolves.toBeNull();
  });
  it("omits the trace field when no trace hop header arrives", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await makeApp().request("/p/x/throw");
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect("logging.googleapis.com/trace" in line).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
