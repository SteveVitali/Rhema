// SPA.4 — `bffFetch` contract: same-origin + credentials + accept json; `{error, detail?}` envelope
// surfacing with status/code/requestId preserved; the 401 leg (invalidate → document-nav /login);
// and the REQ-BFF-30 one-shot fetch (no client retry machinery lives here — POST retries are a
// QueryClient concern and are off by default).

import { afterEach, describe, expect, it, vi } from "vitest";
import { BffError, bffFetch, setSessionExpiredHandler } from "./bff.js";

function jsonResponse(status: number, body: unknown, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(() => {});
});

describe("bffFetch", () => {
  it("issues one same-origin fetch with credentials + accept json", async () => {
    const f = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", f);
    const out = await bffFetch<{ ok: boolean }>("/session");
    expect(out).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    const [path, init] = f.mock.calls[0]!;
    expect(path).toBe("/session");
    expect((init as RequestInit).credentials).toBe("same-origin");
    expect((init as RequestInit).headers).toMatchObject({ accept: "application/json" });
    expect((init as RequestInit).method).toBe("GET");
  });

  it("serializes a POST body exactly once — no retry, no second request", async () => {
    const f = vi.fn(async () => jsonResponse(200, { saved: true }));
    vi.stubGlobal("fetch", f);
    await bffFetch("/p/acme/outline", { method: "POST", json: { a: 1 } });
    expect(f).toHaveBeenCalledTimes(1);
    const init = f.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
  });

  it("surfaces the {error, detail} envelope at the upstream status + the request id", async () => {
    const f = vi.fn(async () =>
      jsonResponse(422, { error: "voice_locked", detail: "the voice is locked" }, { "x-rhema-request-id": "req-9" }),
    );
    vi.stubGlobal("fetch", f);
    const err = await bffFetch("/x").then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(BffError);
    const be = err as BffError;
    expect(be.status).toBe(422);
    expect(be.code).toBe("voice_locked");
    expect(be.detail).toBe("the voice is locked");
    expect(be.requestId).toBe("req-9");
  });

  it("falls back to request_failed when the envelope has no code", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    const err = (await bffFetch("/x").catch((e: unknown) => e)) as BffError;
    expect(err.status).toBe(500);
    expect(err.code).toBe("request_failed");
  });

  it("401 → the session-expired leg fires before the throw", async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "unauthenticated" })));
    const err = (await bffFetch("/session").catch((e: unknown) => e)) as BffError;
    expect(expired).toHaveBeenCalledTimes(1);
    expect(err.status).toBe(401);
    expect(err.code).toBe("unauthenticated");
  });

  it("rejects absolute/other-origin paths before any fetch — the cookie never leaves origin", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const bad of ["https://evil.example/x", "//evil.example/x", "api.example.com/x"]) {
      const err = (await bffFetch(bad).catch((e: unknown) => e)) as BffError;
      expect(err).toBeInstanceOf(BffError);
      expect(err.code).toBe("bff_path_must_be_same_origin");
    }
    expect(f).not.toHaveBeenCalled();
  });
});
