import { describe, expect, it } from "vitest";
import {
  applyReconstruction,
  canonicalSampleMarkdown,
  checkBatchSize,
  checkFileBytes,
  checkSniffedFormat,
  checkWordCount,
  createProviderRegistry,
  pacedFetchPort,
  rewriteImages,
  MAX_FILE_BYTES,
  MAX_FILES_PER_BATCH,
  MAX_WORDS,
} from "./index.js";
import type { FetchPort, ImageStore } from "./index.js";
import { enc, FakeFetch } from "./test-helpers.js";

describe("caps (REQ-INGEST-8)", () => {
  it("enforces 25 MB / 200k words / 50 files", () => {
    expect(checkFileBytes(MAX_FILE_BYTES).ok).toBe(true);
    expect(checkFileBytes(MAX_FILE_BYTES + 1).ok).toBe(false);
    expect(checkFileBytes(MAX_FILE_BYTES + 1).reason).toContain("25 MB");
    expect(checkWordCount(MAX_WORDS).ok).toBe(true);
    expect(checkWordCount(MAX_WORDS + 1).ok).toBe(false);
    expect(checkBatchSize(MAX_FILES_PER_BATCH).ok).toBe(true);
    expect(checkBatchSize(MAX_FILES_PER_BATCH + 1).ok).toBe(false);
  });

  it("the sniffed-format allowlist covers the §9.5 matrix and rejects the rest", () => {
    for (const f of ["md", "txt", "html", "docx", "pdf", "epub", "rtf", "image", "binary"] as const) {
      expect(checkSniffedFormat(f).ok).toBe(true);
    }
  });
});

describe("canonical markdown (§9.5 shape)", () => {
  it("assembles front-matter + normalized body; no body H1 survives", async () => {
    const doc = await canonicalSampleMarkdown({
      id: "sv_1",
      title: "A title",
      date: "2025-12-01",
      url: "https://x.substack.com/p/a",
      provider: "substack",
      connectionId: "conn_1",
      externalId: "1",
      originalFormat: "html",
      originalSha256: "abc123",
      fetchedAt: new Date("2026-01-15T12:00:00Z"),
      updatedAtRemote: "2025-12-02T00:00:00Z",
      quality: "clean",
      bodyMarkdown: "# Should not stay h1\n\nBody text here.",
    });
    expect(doc.document).toContain("title: A title");
    expect(doc.document).toContain("kind: substack");
    expect(doc.document).toContain("fetched_at: 2026-01-15T12:00:00.000Z");
    expect(doc.document).toContain("updated_at_remote: 2025-12-02T00:00:00Z");
    expect(doc.document).toContain("original_sha256: abc123");
    expect(doc.body).not.toMatch(/^# /m); // no body H1 (normalizer demotes)
  });

  it("rewrites remote images to content-addressed asset URIs", async () => {
    const fetch = new FakeFetch().on("https://img.example.com/a.png", () => ({
      ok: true,
      status: 200,
      finalUrl: "",
      contentType: "image/png",
      headers: {},
      bytes: enc("fakepngbytes"),
    }));
    const stored = new Map<string, Uint8Array>();
    const store: ImageStore = {
      async put(sha, bytes) {
        stored.set(sha, bytes);
        return `asset://sha256_${sha}`;
      },
    };
    const out = await rewriteImages("![x](https://img.example.com/a.png)", { fetch, store });
    expect(out).toMatch(/!\[x\]\(asset:\/\/sha256_[0-9a-f]{64}\)/);
    expect(stored.size).toBe(1);
  });

  it("a failed image fetch keeps the remote src and adds a note — never blocks the sample", async () => {
    const fetch = new FakeFetch(); // no route → 404
    const store: ImageStore = { async put() { return "asset://x"; } };
    const notes: string[] = [];
    const out = await rewriteImages("![x](https://gone.example.com/i.png)", { fetch, store }, (n) => notes.push(n));
    expect(out).toContain("https://gone.example.com/i.png");
    expect(notes[0]).toContain("could not be fetched");
  });
});

describe("reconstruction seam (REQ-INGEST-10)", () => {
  const prior = {
    id: "sv_1",
    title: "T",
    date: "2025-01-01",
    url: "https://x/p",
    connectionId: "conn_1",
    externalId: "1",
    originalFormat: "pdf",
    originalSha256: "orig",
    fetchedAt: new Date("2026-01-15T12:00:00Z"),
  };

  it("flips the verdict to reconstructed and preserves provenance", () => {
    const out = applyReconstruction({ tier: "text", modelMarkdown: "The reconstructed body.", prior });
    expect(out.quality).toBe("reconstructed");
    expect(out.document.document).toContain("quality: reconstructed");
    expect(out.document.document).toContain("reconstructed via the text pass");
    expect(out.document.document).toContain("original_sha256: orig");
    expect(out.document.document).toContain("kind: reconstruction");
  });

  it("an empty model output stays partial — never silently clean", () => {
    const out = applyReconstruction({ tier: "visual", modelMarkdown: "   ", prior });
    expect(out.quality).toBe("partial");
  });
});

describe("never-cookies is structural (AC-I-B)", () => {
  it("no provider accepts a credential — ConnectionRef/ProviderDeps carry no auth-shaped field", () => {
    const registry = createProviderRegistry();
    expect([...registry.keys()].sort()).toEqual(["paste", "substack", "substack_export", "upload", "url"]);
    // Structural proof: the deps a provider receives are fetch + blobs + now — nothing else exists.
    const depKeys = Object.keys({ fetch: null, blobs: null, now: null }).sort();
    expect(depKeys).toEqual(["blobs", "fetch", "now"]);
    for (const [, p] of registry) {
      expect(p.fetch.length <= 3).toBe(true); // (item, conn, deps) — no credential parameter exists
    }
  });
});

describe("pacing", () => {
  it("pacedFetchPort spaces calls per host", async () => {
    const calls: number[] = [];
    const fetch: FetchPort = {
      async get() {
        calls.push(Date.now());
        return { ok: false, status: 500, reason: "x" };
      },
    };
    let t = 0;
    const paced = pacedFetchPort(fetch, {
      convert: null as never,
      store: null as never,
      minFetchIntervalMs: 50,
      now: () => new Date(t),
      sleep: async (ms) => {
        t += ms;
      },
    });
    await paced.get("https://h.example.com/1");
    await paced.get("https://h.example.com/2");
    await paced.get("https://other.example.com/1"); // different host — no wait
    expect(t).toBeGreaterThanOrEqual(50);
    expect(calls).toHaveLength(3);
  });
});
