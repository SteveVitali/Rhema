import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryQueue } from "@rhema/orchestrator";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { buildAccountZip } from "@rhema/archive";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.18 — the account-export/import routes on PGlite (REQ-ACCT-3): "Export everything" inserts the
// account_exports row + enqueues `account.export` idempotently (a repeat request dedupes while a
// build runs or a link still lives); the token-gated download resolves through presignGet and
// 410s past its seven days; the import half replays a real buildAccountZip archive into a fresh
// workspace — a re-import is a no-op.

const MD = `# Manuscript\n\nBody text.\n`;

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let queue: InMemoryQueue;
let seed: Awaited<ReturnType<typeof seedProject>>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const presigned: string[] = [];
const presignGet = async (key: string): Promise<string> => {
  const url = `https://objects.test/${key}?sig=test`;
  presigned.push(url);
  return url;
};

const app = (over: { systemExec?: SqlClient } = {}) =>
  createApp({
    ...deps,
    principal: () => principal(),
    db: sql,
    // CAP.3 (D-STB.5a-1) — the emailed token link resolves on the system exec; the PGlite pool
    // stands in for the BYPASSRLS role. Pass `systemExec: undefined` explicitly to test the
    // fail-closed path.
    systemExec: "systemExec" in over ? over.systemExec : sql,
    contentStore: store,
    queue,
    exportPresign: presignGet,
  });

/** Seed one draft artifact so the archive carries a real file. */
async function seedArtifact() {
  const artId = deps.ids("art");
  const verId = deps.ids("av");
  const { sha256 } = await store.putText(seed.workspaceId, MD);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
    [artId, seed.workspaceId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'text/markdown',$5::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(MD), JSON.stringify({ kind: "human" })],
  );
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
     values ($1,$2,1,'imported','frozen',$3)`,
    [deps.ids("dft"), seed.projectId, verId],
  );
}

/** What the worker's account.export handler leaves behind (the build leg, minus the email). */
async function completeExportRow(exportId: string, token: string) {
  const zip = await buildAccountZip({
    exec: sql,
    store,
    workspaceId: seed.workspaceId,
    exportedAt: deps.clock.now(),
  });
  const { key } = await store.put(seed.workspaceId, zip.sha256, zip.bytes);
  await db.pg.query(
    `update account_exports set status='ready', sha256=$2, bytes=$3, s3_key=$4, token_sha256=$5,
        ready_at=now(), expires_at=$6 where id = $1`,
    [
      exportId,
      zip.sha256,
      zip.bytes.byteLength,
      key,
      sha256Hex(token),
      new Date(deps.clock.now().getTime() + 7 * 24 * 60 * 60 * 1000),
    ],
  );
}

beforeEach(async () => {
  presigned.length = 0;
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  queue = new InMemoryQueue();
  seed = await seedProject(db);
});
afterEach(() => db.close());

describe("POST + GET /account/export (REQ-ACCT-3)", () => {
  it("enqueues the build once; a repeat request dedupes while the row is building", async () => {
    const res = await app().request("/account/export", { method: "POST" });
    expect(res.status).toBe(202);
    const dto = (await res.json()) as { export: { id: string; status: string }; deduped: boolean };
    expect(dto.export.status).toBe("building");
    expect(dto.deduped).toBe(false);
    expect(queue.sent.map((j) => j.name)).toEqual(["account.export"]);
    expect((queue.sent[0]!.payload as { exportId: string }).exportId).toBe(dto.export.id);

    // a double-click while the build runs answers the same row — no second job.
    const again = await app().request("/account/export", { method: "POST" });
    const dto2 = (await again.json()) as { export: { id: string }; deduped: boolean };
    expect(dto2.export.id).toBe(dto.export.id);
    expect(dto2.deduped).toBe(true);
    expect(queue.sent).toHaveLength(1);

    // the state read reports the building row.
    const st = await app().request("/account/export");
    const stDto = (await st.json()) as { export: { id: string; status: string } };
    expect(stDto.export.status).toBe("building");
  });

  it("a ready, unexpired export answers the repeat request; the download routes resolve", async () => {
    await seedArtifact();
    const res = await app().request("/account/export", { method: "POST" });
    const { export: ex } = (await res.json()) as { export: { id: string } };
    const token = "tok_download_1";
    await completeExportRow(ex.id, token);

    // repeat request → the same ready row (the link still lives).
    const again = await app().request("/account/export", { method: "POST" });
    const dto = (await again.json()) as { export: { id: string; status: string }; deduped: boolean };
    expect(dto.export.id).toBe(ex.id);
    expect(dto.deduped).toBe(true);

    // the state read exposes the in-app download path.
    const st = (await (await app().request("/account/export")).json()) as {
      export: { status: string; downloadPath?: string; expired: boolean };
    };
    expect(st.export.status).toBe("ready");
    expect(st.export.expired).toBe(false);
    expect(st.export.downloadPath).toContain("/account/export/download");

    // the session download → a presigned object URL.
    const dl = await app().request(`/account/export/download?id=${ex.id}`);
    expect(dl.status).toBe(200);
    expect(((await dl.json()) as { downloadUrl: string }).downloadUrl).toBe(presigned[0]);

    // the emailed token link → a 302 to the object URL (no session needed).
    const pub = await app().request(`/export/download?token=${token}`);
    expect(pub.status).toBe(302);
    expect(pub.headers.get("location")).toBe(presigned[1]);
    const bad = await app().request(`/export/download?token=wrong`);
    expect(bad.status).toBe(404);
  });

  // D-STB.5a-1 (CAP.3) — the token lookup is cross-tenant by design: the anonymous route must run
  // it on `systemExec` (BYPASSRLS), never the FORCE-RLS user pool (which reads zero rows → a 404 on
  // every valid emailed link, the live prod defect). This test fails pre-fix: the route used
  // `deps.db`, so the system-bound probe saw no query and the unbound case still resolved.
  it("the token route resolves through systemExec and fails closed without it", async () => {
    await seedArtifact();
    const res = await app().request("/account/export", { method: "POST" });
    const { export: ex } = (await res.json()) as { export: { id: string } };
    const token = "tok_sysbound";
    await completeExportRow(ex.id, token);

    // a `db` that records every query + a `systemExec` spy prove which pool the lookup rides.
    const sysQueries: string[] = [];
    const spySys: SqlClient = {
      query: (q, p) => {
        sysQueries.push(q);
        return db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }>;
      },
    };
    const recordingDb: SqlClient = {
      query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }>,
    };
    const spyApp = createApp({
      ...deps,
      principal: () => principal(),
      db: recordingDb,
      systemExec: spySys,
      contentStore: store,
      queue,
      exportPresign: presignGet,
    });
    const pub = await spyApp.request(`/export/download?token=${token}`);
    expect(pub.status).toBe(302);
    expect(
      sysQueries.some((q) => q.includes("from account_exports where token_sha256")),
      "the token lookup must run on systemExec",
    ).toBe(true);

    // no system binding ⇒ the route refuses rather than silently querying the RLS-blind pool.
    const unbound = app({ systemExec: undefined });
    const res2 = await unbound.request(`/export/download?token=${token}`);
    expect(res2.status).toBe(503);
    expect(((await res2.json()) as { error: string }).error).toBe("download_unavailable");
  });

  it("the token link 410s past its seven days", async () => {
    const res = await app().request("/account/export", { method: "POST" });
    const { export: ex } = (await res.json()) as { export: { id: string } };
    const token = "tok_expired";
    await completeExportRow(ex.id, token);
    await db.pg.query(`update account_exports set expires_at = $2 where id = $1`, [
      ex.id,
      new Date(deps.clock.now().getTime() - 3600_000),
    ]);
    const pub = await app().request(`/export/download?token=${token}`);
    expect(pub.status).toBe(410);
    expect(((await pub.json()) as { error: string }).error).toBe("export_link_expired");
    // and a new request starts a fresh build (the expired link no longer dedupes).
    const again = await app().request("/account/export", { method: "POST" });
    expect(again.status).toBe(202);
    const dto = (await again.json()) as { export: { id: string }; deduped: boolean };
    expect(dto.export.id).not.toBe(ex.id);
  });
});

describe("POST /account/import (REQ-ACCT-3 — the fresh-account half)", () => {
  it("replays a real account zip into a fresh workspace; a re-import is a no-op", async () => {
    await seedArtifact();
    const zip = await buildAccountZip({
      exec: sql,
      store,
      workspaceId: seed.workspaceId,
      exportedAt: deps.clock.now(),
    });
    expect(zip.sha256).toBeTruthy();

    // a second account imports the archive.
    const other = await seedProject(db, {
      userId: "usr_b",
      billingAccountId: "ba_b",
      workspaceId: "ws_b",
      projectId: "prj_b",
    });
    const otherApp = createApp({
      ...deps,
      principal: () => ({ userId: other.userId, workspaceId: other.workspaceId, billingAccountId: other.billingAccountId }),
      db: sql,
      contentStore: store,
      queue,
      exportPresign: presignGet,
    });
    const imp = await otherApp.request("/account/import", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip.bytes,
    });
    expect(imp.status).toBe(200);
    const dto = (await imp.json()) as { projects: number; files: number; deduped: boolean };
    expect(dto.projects).toBe(1);
    expect(dto.files).toBeGreaterThan(0);
    expect(dto.deduped).toBe(false);

    // the imported project row exists under the fresh workspace with a derived id.
    const rows = (
      await db.pg.query(`select id, slug, title from projects where workspace_id = $1`, [other.workspaceId])
    ).rows as { id: string; slug: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(2); // seedProject's own + the imported one
    expect(rows.some((r) => r.id.startsWith("prj_imp_"))).toBe(true);

    // a re-import of the same zip inserts nothing.
    const again = await otherApp.request("/account/import", {
      method: "POST",
      headers: { "content-type": "application/zip" },
      body: zip.bytes,
    });
    const dto2 = (await again.json()) as { deduped: boolean };
    expect(dto2.deduped).toBe(true);
  });

  it("rejects a non-export body", async () => {
    const res = await app().request("/account/import", {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: Buffer.from("not a zip at all"),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("not_a_rhema_export");
  });
});
