import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { quarantineKey, type ConversionResult } from "@rhema/contracts";
import { createProjectRoutes, slugify } from "./project-routes.js";
import type { Converter } from "./import.js";
import { listProjectStates } from "./project-list.js";
import type { SqlClient } from "./invite.js";
import type { Principal } from "./run-routes.js";

// P1.04 — the §5.2/§5.3 project-home routes (AC: row actions, three-entry create, REQ-GENRE-4 defaults,
// REQ-PROD-8 start-version, the grouping preference). Deterministic on PGlite; no status column is ever
// written — archived_at/deleted_at are visibility markers and every row's state re-derives through
// projectState (asserted via listProjectStates after each write).

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

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

function app(opts: { authed?: boolean; converter?: Converter } = {}) {
  return createProjectRoutes({
    principal: () => (opts.authed === false ? null : principal()),
    db: sql,
    txRunner: db.txRunner,
    ids,
    clock: { now: () => new Date() },
    ...(opts.converter ? { converter: opts.converter } : {}),
    contentStore: store,
  });
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("slugify", () => {
  it("lowercases, hyphenates, trims punctuation, and clamps", () => {
    expect(slugify("The Politics of Visibility!")).toBe("the-politics-of-visibility");
    expect(slugify("   ")).toBe("untitled");
    expect(slugify("a".repeat(80)).length).toBeLessThanOrEqual(60);
    // R7DEM.4 (REQ-DWEB-1) — the `demo~` slug namespace can never collide with a tenant slug:
    // the api's slug grammar emits only [a-z0-9-], so `~` is impossible by construction.
    for (const t of ["demo~x", "a~b", "tilde~~~", "demo~the-governable-mind", " x ~ y "]) {
      const s = slugify(t);
      expect(s.includes("~"), `${t} → ${s}`).toBe(false);
      expect(/^[a-z0-9-]+$/.test(s), `${t} → ${s}`).toBe(true);
    }
  });
});

describe("GET /protocols — the §5.3 protocol cards", () => {
  it("returns the four cards with picker metadata (never protocol bodies)", async () => {
    const res = await app().request("/protocols");
    expect(res.status).toBe(200);
    const { protocols } = (await res.json()) as { protocols: { id: string; name: string; typicalReviewCredits?: number }[] };
    expect(protocols.map((p) => p.id)).toEqual(["essay", "academic", "op-ed", "memo"]);
    for (const p of protocols) {
      expect(typeof p.name).toBe("string");
      expect(p.typicalReviewCredits).toBeGreaterThan(0); // the estimator priced the band
    }
  });

  it("401s unauthenticated", async () => {
    expect((await app({ authed: false }).request("/protocols")).status).toBe(401);
  });
});

describe("POST /projects — the three-entry create (§5.3)", () => {
  it("scratch: creates an empty project (Essay default for no Voice), lands no draft", async () => {
    const res = await app().request("/projects", post({ title: "My Essay", entry: "scratch" }));
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string; slug: string; draftId: string | null } };
    expect(project.slug).toBe("my-essay");
    expect(project.draftId).toBeNull();
    const row = (await db.pg.query(`select protocol_id from projects where id=$1`, [project.id])).rows[0] as {
      protocol_id: string;
    };
    expect(row.protocol_id).toBe("essay"); // REQ-GENRE-4 — Unfiled ⇒ Essay
    const rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === project.id)?.state.key).toBe("empty");
  });

  it("draft: adopts the quarantined conversion as v3 (REQ-PROD-8 startVersion)", async () => {
    const converter: Converter = { preview: async () => RESULT };
    const qk = quarantineKey(seed.workspaceId, "u1");
    const res = await app({ converter }).request(
      "/projects",
      post({ title: "Imported Draft", entry: "draft", quarantineKey: qk, startVersion: 3 }),
    );
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string; draftN: number } };
    expect(project.draftN).toBe(3);
    const draft = (
      await db.pg.query(`select n, origin, state from drafts where project_id=$1`, [project.id])
    ).rows[0] as { n: number; origin: string; state: string };
    expect(draft).toEqual({ n: 3, origin: "human_upload", state: "frozen" });
    const rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === project.id)?.state.key).toBe("draft");
  });

  it("outline: the conversion lands as the outline artifact → state 'outlined'", async () => {
    const converter: Converter = { preview: async () => RESULT };
    const qk = quarantineKey(seed.workspaceId, "u2");
    const res = await app({ converter }).request(
      "/projects",
      post({ title: "Outlined", entry: "outline", quarantineKey: qk }),
    );
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string } };
    const art = (
      await db.pg.query(`select kind from artifacts where project_id=$1`, [project.id])
    ).rows[0] as { kind: string };
    expect(art.kind).toBe("outline");
    const rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === project.id)?.state.key).toBe("outlined");
  });

  it("ONB.1 (REQ-GROWTH-1) — the document's leading H1 is the title default when none was typed; a typed title still wins", async () => {
    const titled: ConversionResult = { ...RESULT, title: "The Document's Own Heading" };
    const converter: Converter = { preview: async () => titled };
    // no typed title at all → the conversion's extracted H1 names the project
    const res = await app({ converter }).request(
      "/projects",
      post({ entry: "draft", quarantineKey: quarantineKey(seed.workspaceId, "u_h1") }),
    );
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string; slug: string } };
    const row = (
      await db.pg.query(`select title from projects where id=$1`, [project.id])
    ).rows[0] as { title: string };
    expect(row.title).toBe("The Document's Own Heading");
    expect(project.slug).toBe("the-document-s-own-heading"); // slugify drops the apostrophe
    // a typed title beats the H1 — the author's choice is authoritative
    const res2 = await app({ converter }).request(
      "/projects",
      post({ title: "My Typed Title", entry: "draft", quarantineKey: quarantineKey(seed.workspaceId, "u_h2") }),
    );
    expect(res2.status).toBe(201);
    const { project: p2 } = (await res2.json()) as { project: { id: string } };
    const row2 = (
      await db.pg.query(`select title from projects where id=$1`, [p2.id])
    ).rows[0] as { title: string };
    expect(row2.title).toBe("My Typed Title");
  });

  it("ONB.1 — a draft entry with NO title anywhere still 422s (the H1 default needs a conversion that produced one)", async () => {
    const untitled: Converter = { preview: async () => RESULT }; // RESULT.title is absent
    const res = await app({ converter: untitled }).request(
      "/projects",
      post({ entry: "draft", quarantineKey: quarantineKey(seed.workspaceId, "u_nt") }),
    );
    expect(res.status).toBe(422);
  });

  it("a still-converting key → 409 conversion_pending; another tenant's key → 403", async () => {
    const pending: Converter = { preview: async () => null };
    const res = await app({ converter: pending }).request(
      "/projects",
      post({ title: "Slow", entry: "draft", quarantineKey: quarantineKey(seed.workspaceId, "u3") }),
    );
    expect(res.status).toBe(409);
    const cross = await app({ converter: pending }).request(
      "/projects",
      post({ title: "X", entry: "draft", quarantineKey: "quarantine/other-ws/u1" }),
    );
    expect(cross.status).toBe(403);
  });

  it("REQ-GENRE-4 — a Voice whose structure repertoire records apparatus:full defaults Academic", async () => {
    // a persona + its structure_repertoire artifact head (content-addressed bytes in the store).
    await db.pg.query(
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_full','ws_seed','Full Apparatus','self','leaf','user')`,
    );
    const body = "structure:\n  apparatus: full\n";
    const sha = sha256Hex(new TextEncoder().encode(body));
    await store.put(seed.workspaceId, sha, new TextEncoder().encode(body));
    await db.pg.query(
      `insert into artifacts (id, workspace_id, persona_id, kind, namespace, mirror_path)
         values ('art_rep','ws_seed','per_full','structure_repertoire','shared','structure.md')`,
    );
    await db.pg.query(
      `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_rep','art_rep',1,$1,'k',0,'text/markdown','{}')`,
      [sha],
    );
    await db.pg.query(`update artifacts set head_version_id='av_rep' where id='art_rep'`);

    const res = await app({ converter: { preview: async () => RESULT } }).request(
      "/projects",
      post({ title: "Voiced", entry: "scratch", personaId: "per_full" }),
    );
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string } };
    const row = (
      await db.pg.query(`select protocol_id, persona_id from projects where id=$1`, [project.id])
    ).rows[0] as { protocol_id: string; persona_id: string };
    expect(row.protocol_id).toBe("academic");
    expect(row.persona_id).toBe("per_full");
  });

  it("REQ-GENRE-4 — a Voice without apparatus:full leaves protocol null (the sheet asks once)", async () => {
    await db.pg.query(
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_plain','ws_seed','Plain','self','leaf','user')`,
    );
    const res = await app().request(
      "/projects",
      post({ title: "Voiced Plain", entry: "scratch", personaId: "per_plain" }),
    );
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string } };
    const row = (
      await db.pg.query(`select protocol_id from projects where id=$1`, [project.id])
    ).rows[0] as { protocol_id: string | null };
    expect(row.protocol_id).toBeNull();
  });

  it("422s a missing title and an unknown entry", async () => {
    expect((await app().request("/projects", post({ entry: "scratch" }))).status).toBe(422);
    expect((await app().request("/projects", post({ title: "T", entry: "import" }))).status).toBe(422);
  });
});

describe("row actions (§5.2)", () => {
  it("rename updates the title (the slug stays)", async () => {
    const res = await app().request(`/projects/${seed.projectId}/rename`, post({ title: "New Title" }));
    expect(res.status).toBe(200);
    const row = (
      await db.pg.query(`select title, slug from projects where id=$1`, [seed.projectId])
    ).rows[0] as { title: string; slug: string };
    expect(row.title).toBe("New Title");
    expect(row.slug).toBe(`slug-${seed.projectId}`);
  });

  it("duplicate copies drafts + outline + voice link with origin=duplicate and no correspondence", async () => {
    // the seed has v1; add a review correspondence row that must NOT copy.
    await db.pg.query(
      `insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids, protocol_id, protocol_version)
         values ('corr_src','prj_seed','review',$1,'run_x', now(), '{}','essay',1)`,
      [seed.draftId],
    );
    const res = await app().request(`/projects/${seed.projectId}/duplicate`, post({}));
    expect(res.status).toBe(201);
    const { project } = (await res.json()) as { project: { id: string; slug: string } };
    expect(project.id).not.toBe(seed.projectId);
    const drafts = (
      await db.pg.query(`select n, origin from drafts where project_id=$1`, [project.id])
    ).rows as { n: number; origin: string }[];
    expect(drafts).toEqual([{ n: 1, origin: "duplicate" }]);
    const corr = await db.pg.query(`select count(*)::int n from correspondence_items where project_id=$1`, [
      project.id,
    ]);
    expect((corr.rows[0] as { n: number }).n).toBe(0);
    // the copy derives its own state — Draft v1 (the orphaned review did not travel).
    const rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === project.id)?.state.key).toBe("draft");
  });

  it("archive hides the row from the list; unarchive returns it; delete removes it; restore brings it back", async () => {
    expect((await app().request(`/projects/${seed.projectId}/archive`, post({}))).status).toBe(200);
    let rows = await listProjectStates(sql, principal());
    // archived rows stay in the list payload (the Archived affordance filters client-side) — the
    // marker is archivedAt + the derived state flips to 'archived'.
    const archived = rows.find((r) => r.id === seed.projectId);
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.state.key).toBe("archived");

    expect((await app().request(`/projects/${seed.projectId}/unarchive`, post({}))).status).toBe(200);
    rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === seed.projectId)?.archivedAt).toBeNull();

    expect((await app().request(`/projects/${seed.projectId}/delete`, post({}))).status).toBe(200);
    rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === seed.projectId)).toBeUndefined(); // deleted rows leave every read

    expect((await app().request(`/projects/${seed.projectId}/restore`, post({}))).status).toBe(200);
    rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === seed.projectId)).toBeDefined();
    // a deleted row refuses everything (the 404 wall)
    await db.pg.query(`update projects set deleted_at = now() where id = $1`, [seed.projectId]);
    expect(
      (await app().request(`/projects/${seed.projectId}/rename`, post({ title: "X" }))).status,
    ).toBe(404);
  });

  it("STB.2 / D-P1.04-2 — delete enqueues project.purge at the +30d grace end, keyed on the project", async () => {
    const sent: { name: string; payload: Record<string, unknown>; opts?: { startAfterMs?: number; singletonKey?: string } }[] = [];
    const queue = {
      async send(name: string, payload: Record<string, unknown>, opts?: { startAfterMs?: number; singletonKey?: string }) {
        sent.push({ name, payload, opts });
      },
    };
    const appWithQueue = createProjectRoutes({
      principal: () => principal(),
      db: sql,
      txRunner: db.txRunner,
      ids,
      clock: { now: () => new Date("2026-09-25T12:00:00Z") },
      contentStore: store,
      queue,
    });
    const res = await appWithQueue.request(`/projects/${seed.projectId}/delete`, post({}));
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("project.purge");
    expect(sent[0].payload.tenantId).toBe(seed.workspaceId);
    expect(sent[0].payload.projectId).toBe(seed.projectId);
    expect(sent[0].payload.tombstonedAt).toBe("2026-09-25T12:00:00.000Z");
    expect(sent[0].opts?.startAfterMs).toBe(30 * 24 * 60 * 60 * 1000);
    expect(sent[0].opts?.singletonKey).toBe(`project.purge:${seed.projectId}`);
  });

  it("STB.2 — a delete still lands the tombstone when the queue send fails", async () => {
    const queue = {
      async send() {
        throw new Error("boss down");
      },
    };
    const appWithQueue = createProjectRoutes({
      principal: () => principal(),
      db: sql,
      txRunner: db.txRunner,
      ids,
      clock: { now: () => new Date() },
      contentStore: store,
      queue,
    });
    const res = await appWithQueue.request(`/projects/${seed.projectId}/delete`, post({}));
    expect(res.status).toBe(200);
    const rows = await listProjectStates(sql, principal());
    expect(rows.find((r) => r.id === seed.projectId)).toBeUndefined();
  });
});

describe("settings/project-grouping — the per-user /app grouping pref", () => {
  it("defaults attention; PUT persists voice", async () => {
    const got = await app().request("/settings/project-grouping");
    expect((await got.json()) as { groupBy: string }).toEqual({ groupBy: "attention" });
    const put = await app().request("/settings/project-grouping", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupBy: "voice" }),
    });
    expect(put.status).toBe(200);
    const got2 = await app().request("/settings/project-grouping");
    expect(((await got2.json()) as { groupBy: string }).groupBy).toBe("voice");
    const bad = await app().request("/settings/project-grouping", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ groupBy: "size" }),
    });
    expect(bad.status).toBe(422);
  });
});
