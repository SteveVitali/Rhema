import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { createSearchRoutes, indexProjectDoc, upsertProjectSearchDoc, projectDocBody } from "./search.js";
import type { SqlClient } from "./invite.js";
import type { Principal } from "./run-routes.js";

// P1.04 — the §5.2/§11.4 server-side search (AC: title/Voice/venue/body matches via the tsvector index).
// Deterministic on PGlite (real Postgres semantics — to_tsvector/websearch_to_tsquery/ts_headline).

let db: OrchestratorTestDb;
let sql: SqlClient;
let seed: Awaited<ReturnType<typeof seedProject>>;
let idc = 0;
const ids = () => `psd_${++idc}`;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  seed = await seedProject(db);
  idc = 0;
});
afterEach(() => db.close());

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const app = (authed = true) =>
  createSearchRoutes({ principal: () => (authed ? principal() : null), db: sql, ids });

describe("project_search_docs — write paths", () => {
  it("indexProjectDoc composes title + venue + linked Voice name; upsert refreshes", async () => {
    await db.pg.query(`update projects set title='The Long Essay', venue='Plough' where id=$1`, [seed.projectId]);
    await db.pg.query(
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_v','ws_seed','Sebastian Voice','self','leaf','user')`,
    );
    await db.pg.query(`update projects set persona_id='per_v' where id=$1`, [seed.projectId]);
    await indexProjectDoc(sql, { projectId: seed.projectId, workspaceId: seed.workspaceId, id: ids });
    const doc = (
      await db.pg.query(
        `select kind, ref_id, body from project_search_docs where project_id=$1`,
        [seed.projectId],
      )
    ).rows[0] as { kind: string; ref_id: string; body: string };
    expect(doc).toMatchObject({ kind: "project", ref_id: "" });
    expect(doc.body).toContain("The Long Essay");
    expect(doc.body).toContain("Plough");
    expect(doc.body).toContain("Sebastian Voice");
    // rename refreshes the same row (the (project,kind,ref) unique key)
    await db.pg.query(`update projects set title='Renamed Essay' where id=$1`, [seed.projectId]);
    await indexProjectDoc(sql, { projectId: seed.projectId, workspaceId: seed.workspaceId, id: ids });
    const docs = await db.pg.query(`select body from project_search_docs where project_id=$1`, [seed.projectId]);
    expect(docs.rows).toEqual([{ body: expect.stringContaining("Renamed Essay") }]);
  });
});

describe("GET /projects/search — §5.2 interim search", () => {
  it("matches title, venue, Voice name, and materialized draft markdown", async () => {
    await db.pg.query(`update projects set title='Visibility Politics', venue='Plough' where id=$1`, [seed.projectId]);
    await db.pg.query(
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_v','ws_seed','Vladimir Propp','self','leaf','user')`,
    );
    await db.pg.query(`update projects set persona_id='per_v' where id=$1`, [seed.projectId]);
    await upsertProjectSearchDoc(sql, {
      projectId: seed.projectId, workspaceId: seed.workspaceId, kind: "draft", refId: "d1",
      body: "The morphology of the folktale reframes narrative structure.",
      id: ids,
    });
    for (const [q, why] of [
      ["Visibility", "title"],
      ["Plough", "venue"],
      ["Propp", "voice name"],
      ["folktale", "draft body"],
    ] as const) {
      const res = await app().request(`/projects/search?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      const { results } = (await res.json()) as { results: { title: string; slug: string; kind: string; snippet: string }[] };
      expect(results.length, `q=${q} (${why})`).toBeGreaterThan(0);
      expect(results[0]!.slug).toBe(`slug-${seed.projectId}`);
      expect(results[0]!.snippet.length).toBeGreaterThan(0);
    }
  });

  it("self-heals a project that was never indexed (title hits without a write-path call)", async () => {
    // no indexProjectDoc call — the handler's INSERT…SELECT refreshes the 'project' doc itself.
    const res = await app().request(`/projects/search?q=${encodeURIComponent("Seed")}`);
    const { results } = (await res.json()) as { results: { title: string }[] };
    expect(results.some((r) => r.title === "Seed project")).toBe(true);
  });

  it("excludes archived + deleted projects and other tenants' docs", async () => {
    await indexProjectDoc(sql, { projectId: seed.projectId, workspaceId: seed.workspaceId, id: ids });
    await db.pg.query(`update projects set archived_at=now() where id=$1`, [seed.projectId]);
    let res = await app().request(`/projects/search?q=Seed`);
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([]);
    await db.pg.query(`update projects set archived_at=null, deleted_at=now() where id=$1`, [seed.projectId]);
    res = await app().request(`/projects/search?q=Seed`);
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([]);
  });

  it("empty q → []; 401 unauthenticated", async () => {
    const res = await app().request(`/projects/search?q=`);
    expect(await res.json()).toEqual({ results: [] });
    expect((await app(false).request(`/projects/search?q=x`)).status).toBe(401);
  });
});

describe("projectDocBody", () => {
  it("joins only present fields", () => {
    expect(projectDocBody({ title: "T", venue: null, voiceName: null })).toBe("T");
    expect(projectDocBody({ title: "T", venue: "V", voiceName: "W" })).toBe("T\nV\nW");
  });
});

// ---------------------------------------------------------------------------
// R7SHELL.1c — `GET /search` (REQ-SHELL-7): the tenant-scoped workspace read.
// ---------------------------------------------------------------------------

describe("GET /search — R7SHELL.1c workspace read (REQ-SHELL-7)", () => {
  const seedDocs = async () => {
    await db.pg.query(`update projects set title='Visibility Politics' where id=$1`, [seed.projectId]);
    await db.pg.query(
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_v','ws_seed','Vladimir Propp','self','leaf','user')`,
    );
    await db.pg.query(`update projects set persona_id='per_v' where id=$1`, [seed.projectId]);
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state) values ('dft_v1',$1,1,'agent','working')`,
      [seed.projectId],
    );
    await upsertProjectSearchDoc(sql, {
      projectId: seed.projectId, workspaceId: seed.workspaceId, kind: "draft", refId: "dft_v1",
      body: "The morphology of the folktale reframes narrative structure.", id: ids,
    });
    await upsertProjectSearchDoc(sql, {
      projectId: seed.projectId, workspaceId: seed.workspaceId, kind: "letter", refId: "corr_1",
      body: "The folktale letter verdict arrives.", id: ids,
    });
    // a second tenant with a marker doc + voice — the workspace predicate must hide both.
    for (const q of [
      `insert into billing_accounts (id) values ('ba_other')`,
      `insert into workspaces (id, kind, name, billing_account_id) values ('ws_other','personal','Other','ba_other')`,
      `insert into "user" (id, email) values ('usr_other','o@x.test')`,
      `insert into projects (id, workspace_id, owner_id, title, slug)
         values ('prj_other','ws_other','usr_other','MARKER_B_TITLE','slug-other')`,
      `insert into personas (id, workspace_id, display_name, mode, kind, provenance)
         values ('per_other','ws_other','MARKER_B_VOICE','self','leaf','user')`,
      `insert into project_search_docs (id, project_id, workspace_id, kind, ref_id, body)
         values ('psd_other','prj_other','ws_other','draft','d_other','MARKER_B_SEARCHDOC body')`,
    ]) {
      await db.pg.query(q);
    }
  };

  it("returns grouped hits: project/draft/letter + voices by name", async () => {
    await seedDocs();
    const res = await app().request(`/search?q=${encodeURIComponent("folktale")}`);
    expect(res.status).toBe(200);
    const { results } = (await res.json()) as {
      results: { projects: unknown[]; drafts: { draftN?: number; refId?: string }[]; letters: { refId?: string }[]; voices: unknown[] };
    };
    expect(results.drafts.length).toBeGreaterThan(0);
    expect(results.drafts[0]!.draftN).toBe(1); // the /v/:n deep-link ordinal joins
    expect(results.letters.length).toBeGreaterThan(0);
    const vres = await app().request(`/search?q=${encodeURIComponent("Propp")}`);
    const v = (await vres.json()) as { results: { voices: { personaId?: string }[] } };
    expect(v.results.voices.some((x) => x.personaId === "per_v")).toBe(true);
  });

  it("scopes every group to ?project=<id> (linked Voice only)", async () => {
    await seedDocs();
    const res = await app().request(
      `/search?q=${encodeURIComponent("Propp")}&project=${seed.projectId}`,
    );
    const { results } = (await res.json()) as { results: { voices: { personaId?: string }[] } };
    expect(results.voices.map((v) => v.personaId)).toEqual(["per_v"]);
    const res2 = await app().request(
      `/search?q=${encodeURIComponent("folktale")}&project=prj_other`,
    );
    const { results: r2 } = (await res2.json()) as { results: { drafts: unknown[]; letters: unknown[] } };
    expect(r2.drafts).toEqual([]);
    expect(r2.letters).toEqual([]);
  });

  it("returns empty groups for empty q; 401 unauthenticated", async () => {
    const res = await app().request(`/search?q=`);
    expect(await res.json()).toEqual({
      results: { projects: [], drafts: [], letters: [], voices: [] },
    });
    expect((await app(false).request(`/search?q=x`)).status).toBe(401);
  });

  it("mutation: removing the workspace predicate leaks the foreign tenant's rows", async () => {
    // The isolation proof is only as good as the predicate: strip `d.workspace_id = $1` from the
    // emitted SQL and the foreign tenant's marker doc surfaces — the two-tenant probe's
    // query-bearing leg fails iff this mutation lands (REQ-SPEC-30).
    await seedDocs();
    const mutating: SqlClient = {
      query: (q, p) =>
        sql.query(
          // `$1` must stay REFERENCED (PGlite binds by position) — neutralize the predicate
          // semantically instead of removing the parameter.
          q.includes("from project_search_docs")
            ? q.replaceAll("d.workspace_id = $1 and ", "($1::text = $1::text or true) and ")
            : q,
          p,
        ),
    };
    const mutated = createSearchRoutes({ principal: () => principal(), db: mutating, ids });
    const res = await mutated.request(`/search?q=${encodeURIComponent("MARKER_B_SEARCHDOC")}`);
    const { results } = (await res.json()) as { results: { drafts: { title: string }[] } };
    expect(results.drafts.length).toBeGreaterThan(0); // the mutation DOES leak
    const clean = await app().request(`/search?q=${encodeURIComponent("MARKER_B_SEARCHDOC")}`);
    const { results: c } = (await clean.json()) as { results: { drafts: unknown[] } };
    expect(c.drafts).toEqual([]); // the shipped predicate does not
  });
});
