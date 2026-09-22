import { describe, it, expect } from "vitest";
import type { OutboundEvent } from "./event-buffer.js";
import { createFetchEventTransport } from "./event-transport.js";

const EVENTS: OutboundEvent[] = [{ type: "phase.progress", payload: { pct: 10 } }];
const okRes = { ok: true, status: 200, text: () => Promise.resolve("") };

describe("createFetchEventTransport (D-P0.08b-4)", () => {
  it("POSTs the batch to the internal endpoint with the run token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const transport = createFetchEventTransport({
      baseUrl: "http://api.internal/",
      runId: "run 1",
      runToken: "tok123",
      fetchImpl: (url, init) => {
        calls.push({ url, init });
        return Promise.resolve(okRes);
      },
    });
    await transport.post(EVENTS);
    expect(calls).toHaveLength(1);
    // trailing slash trimmed; runId URL-encoded; internal events path.
    expect(calls[0]!.url).toBe("http://api.internal/internal/runs/run%201/events");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok123");
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ events: EVENTS });
  });

  it("retries a 5xx with backoff, then succeeds", async () => {
    let n = 0;
    const slept: number[] = [];
    const transport = createFetchEventTransport({
      baseUrl: "http://api",
      runId: "r",
      runToken: "t",
      backoffMs: 10,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
      fetchImpl: () => Promise.resolve(n++ < 2 ? { ok: false, status: 503, text: () => Promise.resolve("busy") } : okRes),
    });
    await transport.post(EVENTS);
    expect(n).toBe(3); // two 503s then a 200
    expect(slept).toEqual([10, 20]); // exponential backoff
  });

  it("retries a network error then rejects after exhausting retries", async () => {
    let n = 0;
    const transport = createFetchEventTransport({
      baseUrl: "http://api",
      runId: "r",
      runToken: "t",
      retries: 1,
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        n++;
        return Promise.reject(new Error("ECONNREFUSED"));
      },
    });
    await expect(transport.post(EVENTS)).rejects.toThrow(/network/);
    expect(n).toBe(2); // initial + 1 retry
  });

  it("fails fast on a 4xx (no retry — it will not succeed)", async () => {
    let n = 0;
    const transport = createFetchEventTransport({
      baseUrl: "http://api",
      runId: "r",
      runToken: "t",
      sleep: () => Promise.resolve(),
      fetchImpl: () => {
        n++;
        return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve("unauthorized") });
      },
    });
    await expect(transport.post(EVENTS)).rejects.toThrow(/401/);
    expect(n).toBe(1); // no retry on a 4xx
  });
});
