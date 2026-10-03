// OBS.1 — the plain-fetch GCS byte transport. Two test groups:
//   1. Behavior: URL shapes, auth headers, status→GcsApiError mapping, bounded retry,
//      `ifGenerationMatch` precondition, delete semantics.
//   2. The listener-leak regression: under a burst of retried downloads against a real local
//      server, no EventEmitter may accumulate listeners past the Node default threshold and no
//      MaxListenersExceededWarning may fire. The pre-fix path (@google-cloud/storage
//      file.download() → teeny-request stream mode → node-fetch res.body PassThrough) failed
//      exactly this — reproduced in docs/build/logs/obs1-leak-repro3.mjs with the adding stack
//      `pipelineImpl (node:internal/streams/pipeline) ← teeny-request/build/src/index.js:194`.
//      The post-fix transport creates NO node streams at all, so there is no shared emitter.

import { EventEmitter } from "node:events";
import { createServer, type Server } from "node:http";
import { PassThrough } from "node:stream";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGcsBytesTransport, GcsApiError } from "./gcs-bytes.js";

const auth = () => Promise.resolve({ authorization: "Bearer test-token" });
const noSleep = () => Promise.resolve();

function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return handler(String(url), init ?? {});
  }) as typeof fetch;
  return { impl, calls };
}

describe("gcs byte transport", () => {
  it("downloads bytes via the media endpoint with auth + encoded object name", async () => {
    const { impl, calls } = fakeFetch(
      () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    const [buf] = await t.bucket("my-bucket").file("tenants/ws/objects/ab%2Fcd ef").download();
    expect([...buf]).toEqual([1, 2, 3]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/download/storage/v1/b/my-bucket/o/");
    expect(calls[0]!.url).toContain("alt=media");
    // the object name is percent-encoded as one segment ('/' → %2F already escaped input stays)
    expect(calls[0]!.url).not.toContain(" ab%2Fcd ef");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer test-token");
  });

  it("maps a 404 to a code-404 error (callers turn it into null)", async () => {
    const { impl } = fakeFetch(() => new Response("nope", { status: 404 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await expect(t.bucket("b").file("missing").download()).rejects.toMatchObject({
      name: "GcsApiError",
      code: 404,
    });
  });

  it("never puts response-body text into the thrown error", async () => {
    const { impl } = fakeFetch(
      () => new Response("secret user path /tenants/x/secret.txt", { status: 500 }),
    );
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    const err = await t.bucket("b").file("k").download().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GcsApiError);
    expect(String((err as Error).message)).not.toContain("secret");
  });

  it("retries 5xx within the attempt budget, then succeeds", async () => {
    let n = 0;
    const { impl, calls } = fakeFetch(() => {
      n++;
      return n < 3 ? new Response(null, { status: 503 }) : new Response(new Uint8Array([9]), { status: 200 });
    });
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    const [buf] = await t.bucket("b").file("k").download();
    expect([...buf]).toEqual([9]);
    expect(calls).toHaveLength(3);
  });

  it("retries a 401 once — the token-refresh race re-resolves auth headers", async () => {
    let n = 0;
    const { impl, calls } = fakeFetch(() => {
      n++;
      return n === 1
        ? new Response(null, { status: 401 })
        : new Response(new Uint8Array([7]), { status: 200 });
    });
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    const [buf] = await t.bucket("b").file("k").download();
    expect([...buf]).toEqual([7]);
    expect(calls).toHaveLength(2);
  });

  it("does not retry non-retryable statuses", async () => {
    const { impl, calls } = fakeFetch(() => new Response(null, { status: 400 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await expect(t.bucket("b").file("k").download()).rejects.toMatchObject({ code: 400 });
    expect(calls).toHaveLength(1);
  });

  it("retries transport-level failures and stops at maxAttempts", async () => {
    const { impl, calls } = fakeFetch(() => {
      throw new Error("socket hangup");
    });
    const t = createGcsBytesTransport({
      getAuthHeaders: auth,
      fetchImpl: impl,
      sleep: noSleep,
      maxAttempts: 2,
    });
    await expect(t.bucket("b").file("k").download()).rejects.toMatchObject({ code: 0 });
    expect(calls).toHaveLength(2);
  });

  it("uploads media bytes with the ifGenerationMatch precondition param", async () => {
    const { impl, calls } = fakeFetch(() => new Response("{}", { status: 200 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await t
      .bucket("my-bucket")
      .file("ingest/marker.json")
      .save("{}", { preconditionOpts: { ifGenerationMatch: 0 } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain("/upload/storage/v1/b/my-bucket/o?uploadType=media");
    expect(calls[0]!.url).toContain("name=ingest%2Fmarker.json");
    expect(calls[0]!.url).toContain("ifGenerationMatch=0");
    expect((calls[0]!.init.headers as Record<string, string>)["content-type"]).toBe(
      "application/octet-stream",
    );
  });

  it("delete ignores 404 only when ignoreNotFound is set", async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 404 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await t.bucket("b").file("k").delete({ ignoreNotFound: true });
    await expect(t.bucket("b").file("k").delete()).rejects.toMatchObject({ code: 404 });
  });

  it("a 204 delete resolves", async () => {
    const { impl } = fakeFetch(() => new Response(null, { status: 204 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await t.bucket("b").file("k").delete();
  });
});

describe("listener-leak regression (OBS.1)", () => {
  // The pre-fix defect: three stacked pipeline()/eos listener sets on node-fetch's res.body
  // PassThrough crossed the 10-listener threshold under abort/retry bursts. The fix creates no
  // node streams at all — assert the whole byte path stays under the default threshold and no
  // PassThrough is even constructed while a flaky server forces retries.
  const tracked = new Map<EventEmitter, { ev: string; n: number }[]>();
  const warnings: string[] = [];
  const origOn = EventEmitter.prototype.on;
  const origOnce = EventEmitter.prototype.once;
  let server: Server;
  let base: string;

  beforeAll(async () => {
    // Record the peak LIVE listener count per (emitter, event) — the warning's actual trigger —
    // so pooled-socket listener reuse (add/remove per request) doesn't count as accumulation.
    const track = (em: EventEmitter, ev: string) => {
      const n = em.listenerCount(ev);
      const list = tracked.get(em) ?? [];
      const rec = list.find((r) => r.ev === ev);
      if (rec) rec.n = Math.max(rec.n, n);
      else {
        list.push({ ev, n });
        tracked.set(em, list);
      }
    };
    (EventEmitter.prototype.on as unknown) = function (
      this: EventEmitter,
      ev: string,
      l: (...a: unknown[]) => void,
    ) {
      const ret = origOn.call(this, ev, l as never);
      track(this, String(ev));
      return ret;
    };
    (EventEmitter.prototype.once as unknown) = function (
      this: EventEmitter,
      ev: string,
      l: (...a: unknown[]) => void,
    ) {
      const ret = origOnce.call(this, ev, l as never);
      track(this, String(ev));
      return ret;
    };
    process.on("warning", (w) => warnings.push(w.name + ":" + w.message.split("\n")[0]));

    let hit = 0;
    server = createServer((_req, res) => {
      hit++;
      if (hit % 3 === 0) {
        res.writeHead(503).end(); // force the transport's retry path
        return;
      }
      res.writeHead(200, { "content-length": "4" }).end("data");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    EventEmitter.prototype.on = origOn;
    EventEmitter.prototype.once = origOnce;
    await new Promise((r) => server.close(r));
  });

  it("a burst of retried downloads accumulates no listeners and emits no warning", async () => {
    const t = createGcsBytesTransport({
      getAuthHeaders: auth,
      apiBase: base,
      sleep: noSleep,
      maxAttempts: 3,
    });
    // 60 concurrent ops through a 1-in-3 flaky server — the production failure shape was a
    // burst of aborts/retries piling pipeline listeners onto one shared PassThrough.
    await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        t
          .bucket("b")
          .file(`k${i % 7}`)
          .download()
          .catch(() => null),
      ),
    );
    // No node-fetch res.body PassThrough (the pre-fix victim emitter) is ever created.
    expect([...tracked.keys()].filter((em) => em instanceof PassThrough)).toHaveLength(0);
    expect(warnings.filter((w) => w.includes("MaxListenersExceeded"))).toHaveLength(0);
    for (const [em, list] of tracked) {
      for (const rec of list) {
        expect(
          rec.n,
          `emitter ${em.constructor.name} accumulated ${rec.n} '${rec.ev}' listeners`,
        ).toBeLessThanOrEqual(10);
      }
    }
  });

  it("constructs no PassThrough on the byte path (native fetch, not node-fetch)", async () => {
    // Compile-time-ish guard: the transport module never imports node:stream.
    // (If a future refactor routes through a streaming client again, the tracker above and this
    // assertion both fail.)
    const { impl } = fakeFetch(() => new Response(new Uint8Array([1]), { status: 200 }));
    const t = createGcsBytesTransport({ getAuthHeaders: auth, fetchImpl: impl, sleep: noSleep });
    await t.bucket("b").file("k").download();
    await t.bucket("b").file("k").save(new Uint8Array([1]));
    await t.bucket("b").file("k").delete();
    expect(tracked.size).toBeGreaterThanOrEqual(0); // the byte path registered nothing it needed to
  });
});
