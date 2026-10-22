// P1.15 — the ingestion route surface end-to-end over PGlite (the deterministic AC legs): link →
// discover → confirm → inline sync → preview/versions/raw → include/omit → priced-reconstruct
// enqueue → Remove → voice delete. The fetcher/convert/queue seams are all faked — Stage B's live
// legs are operator-gated and never run here.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import type { ConversionResult } from "@rhema/contracts";
import { USERCONTENT_URL_TTL_SECONDS } from "@rhema/contracts";
import type { FetchPort, FetchResult } from "@rhema/ingest";
import { createApp, type Principal } from "./index.js";
import type { IngestBlobs } from "./ingest-routes.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
let store: InMemoryContentStore;
let blobs: IngestBlobs & { data: Map<string, Uint8Array> };
let sent: { name: string; payload: Record<string, unknown> }[];
let app: ReturnType<typeof createApp>;

const PAGE = "https://example.com/essays/post-1";
const PAGE_HTML = `<html><head><title>Essay One</title></head><body><article><p>A readable essay body.</p></article></body></html>`;

const fetcher: FetchPort = {
  async get(url): Promise<FetchResult> {
    if (url !== PAGE) return { ok: false, status: 404, reason: "not found", finalUrl: url };
    return {
      ok: true,
      status: 200,
      finalUrl: url,
      contentType: "text/html",
      headers: { etag: '"e1"' },
      bytes: new TextEncoder().encode(PAGE_HTML),
    };
  },
};

const conversion: ConversionResult = {
  sourceFormat: "html",
  markdown: "A readable essay body.",
  counts: { words: 4, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
  store = new InMemoryContentStore();
  sent = [];
  blobs = {
    data: new Map(),
    async read(key) {
      return this.data.get(key) ?? null;
    },
    async write(key, bytes) {
      this.data.set(key, bytes);
    },
  };
  app = createApp({
    ...deps,
    principal: () => principal(),
    db: db.client,
    contentStore: store,
    contentStoreFor: () => store,
    importConverter: { preview: async () => conversion },
    ingestFetcher: fetcher,
    ingestBlobs: blobs,
    inlineSync: true,
    queue: {
      send: async (name: string, payload: Record<string, unknown>) => {
        sent.push({ name, payload });
      },
    },
  });
});
afterEach(() => db.close());

const post = (path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
const patch = (path: string, body: unknown) =>
  app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const del = (path: string) => app.request(path, { method: "DELETE" });

async function createVoice(name = "Ada"): Promise<string> {
  const res = await post("/voices", { name, description: "A terse register." });
  expect(res.status).toBe(201);
  return ((await res.json()) as { personaId: string }).personaId;
}
async function linkUrl(personaId: string): Promise<string> {
  const res = await post(`/voices/${personaId}/connections`, { provider: "url", url: PAGE });
  expect(res.status).toBe(201);
  return ((await res.json()) as { connectionId: string }).connectionId;
}

describe("connections — the Sources pane", () => {
  it("links a url source, lists it, and Remove soft-detaches (items retained)", async () => {
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);

    const list = await app.request(`/voices/${personaId}/connections`);
    expect(list.status).toBe(200);
    const { connections } = (await list.json()) as { connections: { id: string; provider: string }[] };
    expect(connections.map((x) => x.id)).toEqual([cid]);
    expect(connections[0]!.provider).toBe("url");

    const gone = await del(`/voices/${personaId}/connections/${cid}`);
    expect(gone.status).toBe(200);
    const list2 = await app.request(`/voices/${personaId}/connections`);
    expect(((await list2.json()) as { connections: unknown[] }).connections).toHaveLength(0);
    // The row stays (soft detach) — the corpus it produced is still the user's data.
    const row = await db.client.query(`select removed_at from connections where id = $1`, [cid]);
    expect((row.rows[0] as { removed_at: string | null }).removed_at).not.toBeNull();
  });

  it("rejects a credential-shaped provider list — only substack | substack_export | url", async () => {
    const personaId = await createVoice();
    const res = await post(`/voices/${personaId}/connections`, {
      provider: "substack",
      handle: "not a host $$",
    });
    expect(res.status).toBe(400);
    const bad = await post(`/voices/${personaId}/connections`, { provider: "wordpress" });
    expect(bad.status).toBe(400);
  });

  it("substack_export requires a workspace-scoped quarantine key", async () => {
    const personaId = await createVoice();
    const res = await post(`/voices/${personaId}/connections`, { provider: "substack_export" });
    expect(res.status).toBe(400);
    const foreign = await post(`/voices/${personaId}/connections`, {
      provider: "substack_export",
      quarantineKey: `quarantine/other_ws/abc`,
    });
    expect(foreign.status).toBe(400);
  });
});

describe("discover → confirm → sync → preview (REQ-INGEST-3/4/5)", () => {
  it("discovery lists items without bodies; confirm+sync writes the version; preview reads it", async () => {
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);

    const disc = await post(`/voices/${personaId}/connections/${cid}/discover`);
    expect(disc.status).toBe(200);
    const { items } = (await disc.json()) as { items: { external_id: string; state: string }[] };
    expect(items).toHaveLength(1);
    expect(items[0]!.external_id).toBe(PAGE);
    expect(items[0]!.state).toBe("included"); // auto_include_new default + free access
    // REQ-INGEST-3: discovery wrote NO versions.
    expect((await db.client.query(`select id from sample_versions`, [])).rows).toHaveLength(0);

    const conf = await post(`/voices/${personaId}/connections/${cid}/confirm`, {
      items: [{ externalId: PAGE, include: true }],
    });
    expect(conf.status).toBe(200);
    const { report } = (await conf.json()) as { report: { newVersions: number } };
    expect(report.newVersions).toBe(1);

    const itemId = (
      (await db.client.query(`select id from discovered_items where connection_id = $1`, [cid]))
        .rows[0] as { id: string }
    ).id;
    const prev = await app.request(`/voices/${personaId}/samples/${itemId}`);
    expect(prev.status).toBe(200);
    const body = (await prev.json()) as { document: string | null; versions: { n: number }[] };
    expect(body.document).toContain("A readable essay body.");
    expect(body.document).toContain("content_sha256");
    expect(body.versions).toHaveLength(1);

    const vers = await app.request(`/voices/${personaId}/samples/${itemId}/versions`);
    expect(vers.status).toBe(200);
    expect(((await vers.json()) as { versions: unknown[] }).versions).toHaveLength(1);

    // The raw byte side (the fetched page) round-trips through the preview route.
    const raw = await app.request(`/voices/${personaId}/samples/${itemId}/raw`);
    expect(raw.status).toBe(200);
    expect(await raw.text()).toContain("readable essay body");
  });

  // R6UCD.1 (REQ-POST-7, ADR-113) — when the mint seam is bound the original_key leg answers a
  // 302 to a short-lived v4 signed GET instead of proxying bytes; the row's tenant scope IS the
  // check. The unbound-seam app above keeps exercising the proxy fallback.
  it("the /raw original_key leg 302s to a minted signed URL when the mint seam is bound (R6UCD.1)", async () => {
    const calls: Parameters<import("@rhema/contracts").UserContentSigner["signGet"]>[0][] = [];
    const signed = createApp({
      ...deps,
      principal: () => principal(),
      db: db.client,
      contentStore: store,
      contentStoreFor: () => store,
      importConverter: { preview: async () => conversion },
      ingestFetcher: fetcher,
      ingestBlobs: blobs,
      inlineSync: true,
      userContentSigner: {
        async signGet(a) {
          calls.push(a);
          return {
            url: `https://storage.googleapis.com/rhema-user-content/${a.key}?X-Goog-Signature=x`,
            expiresAt: Date.now() + a.expiresSeconds * 1_000,
          };
        },
      },
    });
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);
    const conf = await post(`/voices/${personaId}/connections/${cid}/confirm`, {
      items: [{ externalId: PAGE, include: true }],
    });
    expect(conf.status).toBe(200);
    const itemId = (
      (await db.client.query(`select id from discovered_items where connection_id = $1`, [cid]))
        .rows[0] as { id: string }
    ).id;
    const raw = await signed.request(`/voices/${personaId}/samples/${itemId}/raw`);
    expect(raw.status).toBe(302);
    const loc = raw.headers.get("location")!;
    expect(loc).toContain("ingest-originals/");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.expiresSeconds).toBeLessThanOrEqual(USERCONTENT_URL_TTL_SECONDS);
    expect(calls[0]!.responseType).toBe("application/octet-stream");
    expect(calls[0]!.responseDisposition).toBe("attachment");
  });

  it("the include/omit toggle drops the item from the corpus without deleting bytes", async () => {
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);
    await post(`/voices/${personaId}/connections/${cid}/confirm`, {
      items: [{ externalId: PAGE, include: true }],
    });
    const item = (
      (await db.client.query(`select id, state from discovered_items where connection_id = $1`, [cid]))
        .rows[0] as { id: string; state: string }
    );
    const off = await patch(`/voices/${personaId}/samples/${item.id}`, { included: false });
    expect(off.status).toBe(200);
    const after = await db.client.query(`select state from discovered_items where id = $1`, [item.id]);
    expect((after.rows[0] as { state: string }).state).toBe("omitted");
    expect((await db.client.query(`select id from sample_versions`, [])).rows).toHaveLength(1);
  });
});

describe("the priced reconstruction route (REQ-INGEST-10)", () => {
  it("shows the estimate first; confirmed:true enqueues the metered job", async () => {
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);
    await post(`/voices/${personaId}/connections/${cid}/discover`);
    await post(`/voices/${personaId}/connections/${cid}/confirm`, {
      items: [{ externalId: PAGE, include: true }],
    });
    await db.client.query(
      `update sample_versions set quality = 'partial' where discovered_item_id in
         (select id from discovered_items where connection_id = $1)`,
      [cid],
    );
    const itemId = (
      (await db.client.query(`select id from discovered_items where connection_id = $1`, [cid]))
        .rows[0] as { id: string }
    ).id;

    const ask = await post(`/voices/${personaId}/samples/${itemId}/reconstruct`, { tier: "text" });
    expect(ask.status).toBe(400);
    const estimate = (await ask.json()) as { estimateCredits: number; capCredits: number };
    expect(estimate.estimateCredits).toBe(4);

    const go = await post(`/voices/${personaId}/samples/${itemId}/reconstruct`, {
      tier: "text",
      confirmed: true,
    });
    expect(go.status).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe("ingest.reconstruct");
    expect(sent[0]!.payload).toMatchObject({ itemId, tier: "text", estimateCredits: 4, capCredits: 8 });
  });

  it("refuses a clean sample (nothing to reconstruct)", async () => {
    const personaId = await createVoice();
    const cid = await linkUrl(personaId);
    await post(`/voices/${personaId}/connections/${cid}/discover`);
    await post(`/voices/${personaId}/connections/${cid}/confirm`, {
      items: [{ externalId: PAGE, include: true }],
    });
    const itemId = (
      (await db.client.query(`select id from discovered_items where connection_id = $1`, [cid]))
        .rows[0] as { id: string }
    ).id;
    const res = await post(`/voices/${personaId}/samples/${itemId}/reconstruct`, {
      tier: "text",
      confirmed: true,
    });
    expect(res.status).toBe(422);
    expect(sent).toHaveLength(0);
  });
});

describe("DELETE /voices/:id (REQ-INGEST-16)", () => {
  it("stamps deleted_at, drops the voice from every read, and enqueues voice.purge", async () => {
    const personaId = await createVoice();
    const res = await del(`/voices/${personaId}`);
    expect(res.status).toBe(200);
    const row = await db.client.query(`select deleted_at from personas where id = $1`, [personaId]);
    expect((row.rows[0] as { deleted_at: string | null }).deleted_at).not.toBeNull();

    const list = await app.request("/voices");
    expect(((await list.json()) as { voices: unknown[] }).voices).toHaveLength(0);
    const get = await app.request(`/voices/${personaId}`);
    expect(get.status).toBe(404);
    expect(sent.map((s) => s.name)).toEqual(["voice.purge"]);
    expect(sent[0]!.payload).toMatchObject({ personaId });
  });
});
