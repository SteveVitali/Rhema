import { describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { noteDegradedUpstream, requestContext, webOnError } from "./observability.js";

function makeApp(gcpProject?: string) {
  const app = new Hono();
  app.use("*", requestContext(gcpProject));
  app.onError(webOnError);
  app.get("/ok", (c) => c.json({ ok: true }));
  app.get("/degraded", async (c) => {
    // Simulates a route whose `.catch(() => null)` swallowed two upstream failures.
    noteDegradedUpstream();
    noteDegradedUpstream();
    return c.json({ partial: true });
  });
  app.get("/wired-out-503", (c) => c.json({ error: "store_unavailable" }, 503));
  app.get("/throw", () => {
    throw new Error("boom prompt-text never logs: hunter2-secret");
  });
  app.get("/throw-nonerror", () => {
    throw { userText: "totally-unique-user-string" };
  });
  return app;
}

describe("web request-context middleware + onError (OBS.1)", () => {
  it("mints + echoes a request id; an inbound x-rhema-request-id is NOT honored", async () => {
    const res = await makeApp().request("/ok", {
      headers: { "x-rhema-request-id": "browser-forged" },
    });
    expect(res.status).toBe(200);
    const id = res.headers.get("x-rhema-request-id");
    expect(id).toBeTruthy();
    expect(id).not.toBe("browser-forged");
  });
  it("joins the LB trace: x-cloud-trace-context wins the id + the trace field", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp("rhema-507501").request("/throw", {
        headers: { "x-cloud-trace-context": `${"c".repeat(32)}/5;o=1` },
      });
      expect(res.headers.get("x-rhema-request-id")).toBe("c".repeat(32));
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.requestId).toBe("c".repeat(32));
      expect(line["logging.googleapis.com/trace"]).toBe(`projects/rhema-507501/traces/${"c".repeat(32)}`);
      expect(line.service).toBe("web");
    } finally {
      spy.mockRestore();
    }
  });
  it("unhandled Error → exactly ONE structured line + 500 naming only the requestId", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/throw");
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(text).toContain("internal error — reference ");
      expect(text).not.toContain("hunter2-secret");
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.severity).toBe("ERROR");
      expect(line.msg).toBe("unhandled_route_error");
      expect(line.route).toBe("/throw");
      expect(line.status).toBe(500);
      expect(JSON.stringify(line)).not.toContain("hunter2-secret");
    } finally {
      spy.mockRestore();
    }
  });
  it("non-Error throws reach onError via the middleware normalization", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/throw-nonerror");
      expect(res.status).toBe(500);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.errorClass).toBe("NonErrorThrow");
      expect(JSON.stringify(line)).not.toContain("totally-unique-user-string");
    } finally {
      spy.mockRestore();
    }
  });
  it("a route answering ≥500 without logging still leaves ONE unlogged_5xx_response line", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/wired-out-503");
      expect(res.status).toBe(503);
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.severity).toBe("ERROR");
      expect(line.msg).toBe("unlogged_5xx_response");
      expect(line.status).toBe(503);
      expect(line.route).toBe("/wired-out-503");
    } finally {
      spy.mockRestore();
    }
  });
  it("degraded upstream reads under a <500 page emit ONE WARNING degraded_reads line with the count", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/degraded");
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledTimes(1);
      const line = JSON.parse(String(spy.mock.calls[0]![0])) as Record<string, unknown>;
      expect(line.severity).toBe("WARNING");
      expect(line.msg).toBe("degraded_reads");
      expect(line.degradedCount).toBe(2);
      expect(line.status).toBe(200);
    } finally {
      spy.mockRestore();
    }
  });
  it("a quiet request logs nothing", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await makeApp().request("/ok");
      expect(res.status).toBe(200);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
