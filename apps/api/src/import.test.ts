import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import type { ConversionResult } from "@rhema/contracts";
import { createImportedDraft, createImportRoutes, type Converter, type ImportUploadDeps } from "./import.js";
import { quarantineKey, type SignedUrlProvider } from "@rhema/contracts";
import type { SqlClient } from "./invite.js";
import type { Principal } from "./run-routes.js";

// PRB.02 draft creation (deliverable 5): an imported v1 (origin=human_upload) is created from a
// ConversionResult, with its normalized bytes stored content-addressed. Deterministic on PGlite.

let db: OrchestratorTestDb;
let sql: SqlClient;
let seed: Awaited<ReturnType<typeof seedProject>>;
let store: InMemoryContentStore;
let idc = 0;
const ids = () => `id_${++idc}`;

const RESULT: ConversionResult = {
  sourceFormat: "docx",
  markdown: "## A Manuscript\n\nHello world, this is imported prose.\n",
  counts: { words: 6, footnotes: 0, citationSpans: 0, tables: 0, figures: 0 },
  warnings: [],
  unconverted: [],
  quality: "clean",
  qualityNotes: [],
};

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  seed = await seedProject(db, { draftN: 1 });
  store = new InMemoryContentStore();
  idc = 0;
});
afterEach(() => db.close());

describe("createImportedDraft", () => {
  it("creates v(n) origin=human_upload + an immutable markdown version with the word count", async () => {
    const created = await createImportedDraft(
      { db: sql, contentStore: store, ids },
      { projectId: seed.projectId, workspaceId: seed.workspaceId, actor: { kind: "user", userId: seed.userId }, result: RESULT },
    );
    expect(created.n).toBe(2); // seedProject already made v1
    expect(created.wordCount).toBe(6);

    const draft = (await db.pg.query(`select origin, state, promoted_version_id from drafts where id=$1`, [created.draftId])).rows[0] as { origin: string; state: string; promoted_version_id: string };
    expect(draft.origin).toBe("human_upload");
    expect(draft.state).toBe("frozen");
    expect(draft.promoted_version_id).toBe(created.versionId);

    const ver = (await db.pg.query(`select media_type, word_count, immutable, content_sha256, bytes from artifact_versions where id=$1`, [created.versionId])).rows[0] as { media_type: string; word_count: number; immutable: boolean; content_sha256: string; bytes: number };
    expect(ver.media_type).toBe("text/markdown");
    expect(ver.word_count).toBe(6);
    expect(ver.immutable).toBe(true);

    // the stored bytes are the normalized markdown
    const bytes = await store.get(created.contentSha256);
    expect(bytes).not.toBeNull();
    expect(new TextDecoder().decode(bytes!)).toBe(RESULT.markdown);
  });
});

describe("createImportRoutes", () => {
  const converter: Converter = { preview: async () => RESULT };
  const principal: Principal = { userId: "user_seed", workspaceId: "", billingAccountId: "" };
  const QK = () => quarantineKey(seed.workspaceId, "u1");

  const uploads: ImportUploadDeps = {
    bucket: "rhema-dev-user-content",
    provider: {
      signedPut: async (a) => ({
        url: `https://storage.example/${a.bucket}/${a.key}?sig`,
        requiredHeaders: { "x-goog-content-length-range": `0,${a.maxBytes}` },
      }),
    } satisfies SignedUrlProvider,
  };

  function app(withUploads = true) {
    return createImportRoutes({
      principal: () => ({ ...principal, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId, userId: seed.userId }),
      db: sql,
      contentStore: store,
      converter,
      ids,
      ...(withUploads ? { uploads } : {}),
    });
  }

  it("preview returns the ConversionResult; create makes the draft (201)", async () => {
    const prev = await app().request("/projects/p/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: QK() }),
    });
    expect(prev.status).toBe(200);
    expect(((await prev.json()) as { preview: ConversionResult }).preview.markdown).toBe(RESULT.markdown);

    const create = await app().request(`/projects/${seed.projectId}/import/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: QK() }),
    });
    expect(create.status).toBe(201);
    const draftId = ((await create.json()) as { draft: { draftId: string } }).draft.draftId;
    const exists = (await db.pg.query(`select 1 from drafts where id=$1 and origin='human_upload'`, [draftId])).rows.length;
    expect(exists).toBe(1);
  });

  it("401s an unauthenticated import", async () => {
    const noauth = createImportRoutes({ principal: () => null, db: sql, contentStore: store, converter, ids });
    const res = await noauth.request("/projects/p/import/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: "k" }),
    });
    expect(res.status).toBe(401);
  });

  it("403s a key under another tenant's quarantine prefix; 400s a malformed key (PRB.20)", async () => {
    const other = await app().request(`/projects/${seed.projectId}/import/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: "quarantine/other-ws/u1" }),
    });
    expect(other.status).toBe(403);
    const bad = await app().request(`/projects/${seed.projectId}/import/preview`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: "quarantine/../u1" }),
    });
    expect(bad.status).toBe(400);
    // create checks the same wall AND the project row — a cross-tenant project id 404s before convert.
    const noProject = await app().request(`/projects/proj_nope/import/create`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ quarantineKey: QK() }),
    });
    expect(noProject.status).toBe(404);
  });
});

describe("POST /import/presign (PRB.20)", () => {
  const converter: Converter = { preview: async () => RESULT };
  let seen: { bucket: string; key: string; maxBytes: number } | null = null;
  const provider: SignedUrlProvider = {
    signedPut: async (a) => {
      seen = { bucket: a.bucket, key: a.key, maxBytes: a.maxBytes };
      return { url: `https://storage.example/${a.bucket}/${a.key}?sig`, requiredHeaders: { "x-goog-content-length-range": `0,${a.maxBytes}` } };
    },
  };

  function app(authed = true) {
    return createImportRoutes({
      principal: () => (authed ? { userId: seed.userId, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId } : null),
      db: sql,
      contentStore: store,
      converter,
      ids,
      uploads: { provider, bucket: "rhema-dev-user-content" },
    });
  }

  it("mints a workspace-scoped quarantine key + a ≤25 MB signed PUT (the workspace segment is the tenant's)", async () => {
    seen = null;
    const res = await app().request("/import/presign", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; key: string; maxBytes: number; requiredHeaders: Record<string, string> };
    expect(body.key).toMatch(/^quarantine\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/);
    // the key is under THE SESSION's workspace — the tenant wall is in the key itself.
    expect(body.key.startsWith(`quarantine/${seed.workspaceId}/`)).toBe(true);
    expect(seen!.key).toBe(body.key);
    expect(body.maxBytes).toBe(25 * 1024 * 1024);
    expect(body.requiredHeaders["x-goog-content-length-range"]).toBe(`0,${body.maxBytes}`);
  });

  it("401s unauthenticated; unmounted without the binding", async () => {
    const res = await app(false).request("/import/presign", { method: "POST" });
    expect(res.status).toBe(401);
    const bare = createImportRoutes({
      principal: () => ({ userId: seed.userId, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId }),
      db: sql,
      contentStore: store,
      converter,
      ids,
    });
    expect((await bare.request("/import/presign", { method: "POST" })).status).toBe(404);
  });
});
