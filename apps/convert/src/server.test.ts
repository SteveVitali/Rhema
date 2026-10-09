import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serveConvert } from "./server.js";

// ONB.1 (ADR-044) — the warm convert service under a real listener + a real mounted-dir root:
// POST /convert reads `<root>/<quarantineKey>`, runs the same convertBytes the Job runs, writes
// `<root>/converted/<ws>/<id>.json`, and returns the ConversionResult — with NO outbound fetch
// anywhere in the round-trip (the no-egress probe, REQ-ARCH-4).

const WS = "ws01";
const ID = "up01";
const KEY = `quarantine/${WS}/${ID}`;

let root: string;
let port: number;
let server: { close(): void };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "convert-svc-"));
  await mkdir(join(root, "quarantine", WS), { recursive: true });
  const s = await serveConvert({ root, port: 0 });
  server = s.server;
  port = s.port;
});

afterEach(async () => {
  server.close();
  await rm(root, { recursive: true, force: true });
});

const post = (body: unknown) =>
  fetch(`http://127.0.0.1:${port}/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("the warm convert service (ADR-044)", () => {
  it("POST /convert converts the mounted bytes, writes converted/, returns the result", async () => {
    const md = "# Held Title\n\nBody words here.\n";
    await writeFile(join(root, KEY), md, "utf8");

    const res = await post({ quarantineKey: KEY });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { preview: { markdown: string; title?: string }; convertedKey: string };
    expect(body.preview.title).toBe("Held Title");
    expect(body.preview.markdown).not.toContain("Held Title");
    expect(body.convertedKey).toBe(`converted/${WS}/${ID}.json`);

    // write-through: the converted object landed in the mount (the replay read-back path).
    const written = JSON.parse(await readFile(join(root, "converted", WS, `${ID}.json`), "utf8"));
    expect(written.markdown).toBe(body.preview.markdown);
  });

  it("GET /healthz answers 200 (the Cloud Run startup/liveness probe)", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/healthz`);
    expect(res.status).toBe(200);
  });

  it("a missing quarantine object 404s; a malformed key 400s; no converted/ object is written", async () => {
    expect((await post({ quarantineKey: KEY })).status).toBe(404);
    expect((await post({ quarantineKey: "../escape" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    await expect(readFile(join(root, "converted", WS, `${ID}.json`), "utf8")).rejects.toThrow();
  });

  it("a conversion that references external resources makes ZERO outbound requests", async () => {
    // The no-egress probe (REQ-ARCH-4): an input engineered to tempt a fetch — an HTML doc with an
    // external img and a remote anchor — must not produce a single outbound call. The handler is
    // synchronous in-process, so a fetch stub across the round-trip catches any attempt.
    const calls: string[] = [];
    const realFetch = globalThis.fetch;
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith(`http://127.0.0.1:${port}`)) calls.push(url);
      return realFetch(input, init);
    });
    vi.stubGlobal("fetch", spy);
    try {
      const html =
        '<h1>Doc</h1><img src="https://evil.example/track.png"><a href="https://evil.example/x">l</a>';
      await writeFile(join(root, KEY), html, "utf8");
      const res = await post({ quarantineKey: KEY });
      expect(res.status).toBe(200);
      await res.json();
      expect(calls).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
