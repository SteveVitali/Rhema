import { describe, it, expect, afterEach } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { handleProjectPurge, handleAccountHardDelete, handleTestTenantPurge } from "./jobs.js";

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

// JOURNEY.1 — the test-tenant auto-purge sweep (REQ-SPEC-29; ADR-020): flagged workspaces past the
// window route through the existing account.hard-delete pipeline with the grace bypassed.
describe("handleTestTenantPurge (test-tenant.purge consumer)", () => {
  async function seedFlaggedTenant(db2: NonNullable<typeof db>, args: { stale: boolean; flagged?: boolean }) {
    const seed = await seedProject(db2, {});
    await db2.pg.query(
      `insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
      [seed.workspaceId, seed.userId],
    );
    if (args.flagged !== false) {
      await db2.pg.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    }
    if (args.stale) {
      await db2.pg.query(`update workspaces set created_at = now() - interval '30 days' where id = $1`, [
        seed.workspaceId,
      ]);
    }
    return seed;
  }

  it("purges a flagged tenant past the window through account.hard-delete (grace bypassed)", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedFlaggedTenant(db, { stale: true });
    const sent: { name: string; payload: Record<string, unknown> }[] = [];
    const queue = {
      async send(name: string, payload: Record<string, unknown>) {
        sent.push({ name, payload });
      },
    };
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, { systemExec: db.client, queue });
    expect(r.purgedWorkspaces).toEqual([seed.workspaceId]);
    expect(r.enqueuedDeletes).toBe(1);
    expect(sent[0]?.name).toBe("account.hard-delete");
    expect(sent[0]?.payload.userId).toBe(seed.userId);
    // the stamped marker sits past the 14-day grace — the hard-delete handler reads hard-delete.
    const u = (
      await db.client.query(`select deletion_requested_at from "user" where id = $1`, [seed.userId])
    ).rows[0] as { deletion_requested_at: Date };
    expect(u.deletion_requested_at).toBeTruthy();
    expect(Date.now() - u.deletion_requested_at.getTime()).toBeGreaterThan(14 * 24 * 60 * 60 * 1000);
  });

  it("never touches an unflagged workspace, however stale", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedFlaggedTenant(db, { stale: true, flagged: false });
    const sent: unknown[] = [];
    const queue = { async send(_n: string, _p: Record<string, unknown>) { sent.push(1); } };
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, { systemExec: db.client, queue });
    expect(r.enqueuedDeletes).toBe(0);
    expect(sent).toEqual([]);
    const u = (
      await db.client.query(`select deletion_requested_at from "user" where id = $1`, [seed.userId])
    ).rows[0] as { deletion_requested_at: Date | null };
    expect(u.deletion_requested_at).toBeNull();
  });

  it("a flagged workspace inside the window is left for a later sweep", async () => {
    db = await createOrchestratorTestDb();
    await seedFlaggedTenant(db, { stale: false });
    const sent: unknown[] = [];
    const queue = { async send(_n: string, _p: Record<string, unknown>) { sent.push(1); } };
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, { systemExec: db.client, queue });
    expect(r.enqueuedDeletes).toBe(0);
    expect(sent).toEqual([]);
  });

  it("without a system pool or queue the sweep is a no-op (test seam)", async () => {
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, {});
    expect(r).toEqual({ scanned: 0, purgedWorkspaces: [], enqueuedDeletes: 0 });
  });
});
