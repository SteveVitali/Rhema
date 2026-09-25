import { describe, it, expect, afterEach } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { handleProjectPurge, handleAccountHardDelete } from "./jobs.js";

let db: OrchestratorTestDb | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

describe("handleProjectPurge (project.purge consumer)", () => {
  it("does not purge before 30 days", async () => {
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      { now: day(29) },
    );
    expect(r).toEqual({ projectId: "p", purged: false });
  });
  it("purges at the 30-day mark", async () => {
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      { now: day(30) },
    );
    expect(r.purged).toBe(true);
  });

  it("no-ops when the tombstone was cleared (restore inside the window)", async () => {
    const systemExec = {
      async query() {
        return { rows: [{ deleted_at: null }] };
      },
    };
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      { systemExec, now: day(40) },
    );
    expect(r).toEqual({ projectId: "p", purged: false, restored: true });
  });

  it("reschedules off the CURRENT tombstone when the row was re-deleted later", async () => {
    const systemExec = {
      async query() {
        return { rows: [{ deleted_at: day(20) }] };
      },
    };
    const sent: { name: string; opts?: { startAfterMs?: number; singletonKey?: string } }[] = [];
    const queue = {
      async send(name: string, _p: Record<string, unknown>, opts?: { startAfterMs?: number; singletonKey?: string }) {
        sent.push({ name, opts });
      },
    };
    // job carries the ORIGINAL tombstone (day 0 → fires at day 30); the row now shows day 20,
    // whose grace ends at day 50 — at day 30 the handler must re-arm, never purge.
    const r = await handleProjectPurge(
      { tenantId: "t", projectId: "p", tombstonedAt: day(0).toISOString() },
      { systemExec, queue, now: day(30) },
    );
    expect(r).toEqual({ projectId: "p", purged: false, rescheduled: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].name).toBe("project.purge");
    expect(sent[0].opts?.singletonKey).toBe("project.purge:p");
    expect(sent[0].opts?.startAfterMs).toBeCloseTo(20 * 24 * 60 * 60 * 1000, -6);
  });

  it("STB.2 — past grace, the sweep hard-deletes the project tree + its unreferenced object keys", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db, { draftN: 1 });
    // an artifact + version carrying an object key (the purge's storage leg)
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_1',$1,$2,'draft','project','drafts/v1.md')`,
      [seed.workspaceId, seed.projectId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_1','art_1',1,'sha_a','tenants/${seed.workspaceId}/objects/sha_a',100,'text/markdown','{"kind":"system"}'::jsonb)`,
      [],
    );
    // a SIBLING project sharing the same content-addressed object — the key must survive the purge.
    const sib = await seedProject(db, { projectId: "prj_sib", draftN: 1 });
    void sib;
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_sib',$1,'prj_sib','draft','project','drafts/v1.md')`,
      [seed.workspaceId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_sib','art_sib',1,'sha_b','tenants/${seed.workspaceId}/objects/sha_b',90,'text/markdown','{"kind":"system"}'::jsonb),
              ('av_shared','art_sib',2,'sha_a','tenants/${seed.workspaceId}/objects/sha_a',100,'text/markdown','{"kind":"system"}'::jsonb)`,
      [],
    );
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    const deletedKeys: string[] = [];
    const r = await handleProjectPurge(
      { tenantId: seed.workspaceId, projectId: seed.projectId, tombstonedAt: day(0).toISOString() },
      {
        systemExec: db.client,
        blobs: { delete: async (k) => void deletedKeys.push(k) },
      },
    );
    expect(r.purged).toBe(true);
    expect(r.deleted?.projects).toBe(1);
    // the project + its cascade are gone; the sibling survives
    expect(
      (await db.pg.query(`select 1 from projects where id = $1`, [seed.projectId])).rows.length,
    ).toBe(0);
    expect(
      (await db.pg.query(`select 1 from projects where id = 'prj_sib'`, [])).rows.length,
    ).toBe(1);
    expect(
      (await db.pg.query(`select 1 from artifact_versions where artifact_id = 'art_1'`, [])).rows.length,
    ).toBe(0);
    // sha_a is still referenced by the sibling ⇒ kept; nothing else of the project's remains.
    expect(deletedKeys).toEqual([]);
  });

  it("STB.2 — the unshared object key IS deleted when no workspace row references it", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_1',$1,$2,'draft','project','drafts/v1.md')`,
      [seed.workspaceId, seed.projectId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_1','art_1',1,'sha_a','tenants/${seed.workspaceId}/objects/sha_a',100,'text/markdown','{"kind":"system"}'::jsonb)`,
      [],
    );
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    const deletedKeys: string[] = [];
    const r = await handleProjectPurge(
      { tenantId: seed.workspaceId, projectId: seed.projectId, tombstonedAt: day(0).toISOString() },
      {
        systemExec: db.client,
        blobs: { delete: async (k) => void deletedKeys.push(k) },
      },
    );
    expect(r.purged).toBe(true);
    expect(deletedKeys).toEqual([`tenants/${seed.workspaceId}/objects/sha_a`]);
    expect(r.objectsDeleted).toBe(1);
  });
});

describe("handleAccountHardDelete (account.hard-delete consumer)", () => {
  it("stays in grace before 14 days", async () => {
    const r = await handleAccountHardDelete(
      { tenantId: "t", userId: "u", deletionRequestedAt: day(0).toISOString() },
      { now: day(10) },
    );
    expect(r.phase).toBe("grace");
    expect(r.userId).toBe("u");
  });
  it("hard-deletes at 14 days, retaining tax-required data", async () => {
    const r = await handleAccountHardDelete(
      { tenantId: "t", userId: "u", deletionRequestedAt: day(0).toISOString() },
      { now: day(14) },
    );
    expect(r.phase).toBe("hard-delete");
    expect(r.retain).toContain("anonymized-ledger-rows");
    expect(r.retain).toContain("stripe-customer");
  });
});
