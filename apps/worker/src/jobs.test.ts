import { describe, it, expect, afterEach } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import {
  handleAccountDeleteSweep,
  handleProjectPurge,
  handleProjectPurgeSweep,
  handleAccountHardDelete,
  handleTestTenantPurge,
  type ProjectPurgeJob,
} from "./jobs.js";

let db: OrchestratorTestDb | undefined;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const day = (n: number) => new Date(Date.UTC(2026, 0, 1 + n));

/** a `pgboss.job` stub for the sweep's live-arm check (PGlite carries no pg-boss schema). */
const stubQueueTable = async (db2: NonNullable<typeof db>) => {
  await db2.pg.query(`create schema if not exists pgboss`);
  await db2.pg.query(
    `create table if not exists pgboss.job(name text, singleton_key text, state text)`,
  );
};
const fakeQueue = () => {
  const sent: {
    name: string;
    payload: Record<string, unknown>;
    opts?: { startAfterMs?: number; singletonKey?: string };
  }[] = [];
  return {
    sent,
    async send(
      name: string,
      payload: Record<string, unknown>,
      opts?: { startAfterMs?: number; singletonKey?: string },
    ) {
      sent.push({ name, payload, opts });
    },
  };
};

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
      async send(
        name: string,
        _p: Record<string, unknown>,
        opts?: { startAfterMs?: number; singletonKey?: string },
      ) {
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
    expect((await db.pg.query(`select 1 from projects where id = 'prj_sib'`, [])).rows.length).toBe(
      1,
    );
    expect(
      (await db.pg.query(`select 1 from artifact_versions where artifact_id = 'art_1'`, [])).rows
        .length,
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

  // F-R7DEPMAIN-1 / BL-113 (live-proven 2026-11-15): the re-armed `project.purge:01M3SK38…`
  // failed ×3 on `claims_draft_id_fkey` — `delete from projects` only reaches CASCADE edges while
  // prod `pg_constraint` marks the review-output leaves NO ACTION. Seed EVERY leaf class (the
  // verbatim prod set + self-FKs + cross-project survivors) and prove the purge completes
  // leaf-first like `handleAccountHardDelete`.
  it("purges a tombstoned project carrying the full NO-ACTION leaf set (F-R7DEPMAIN-1)", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db, { draftN: 1 });
    const ws = seed.workspaceId;
    const d1 = seed.draftId as string;
    // a second, frozen draft chained on the first — drafts.base_draft_id + promoted_version_id.
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_p',$1,$2,'draft','project','drafts/v2.md')`,
      [ws, seed.projectId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_p','art_p',1,'sha_p','tenants/${ws}/objects/sha_p',100,'text/markdown','{"kind":"system"}'::jsonb)`,
      [],
    );
    await db.pg.query(
      `insert into provenance_maps(draft_version_id, granularity, spans) values ('av_p','block','[]'::jsonb)`,
    );
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id, base_draft_id)
       values ('dft_p2',$1,2,'agent','frozen','av_p',$2)`,
      [seed.projectId, d1],
    );
    // live_doc + restore_point + a working copy referencing all three drafts/live_docs edges.
    await db.pg.query(
      `insert into live_docs(id, draft_id, y_state, state_vector) values ('ld_p',$1,'\\x00'::bytea,'\\x00'::bytea)`,
      [d1],
    );
    await db.pg.query(
      `insert into restore_points(id, live_doc_id, s3_key, kind, cause) values ('rp_p','ld_p','restores/rp_p','snapshot','auto')`,
    );
    await db.pg.query(
      `insert into working_copies(id, base_draft_id, live_doc_id, reconciled_into)
       values ('wc_p',$1,'ld_p','dft_p2')`,
      [d1],
    );
    // a run tree: parent + in-project child (self-FK) + step + gated step + decision.
    await seedRun(db, {
      runId: "run_p",
      workspaceId: ws,
      projectId: seed.projectId,
      state: "finished",
    });
    await seedRun(db, {
      runId: "run_c",
      workspaceId: ws,
      projectId: seed.projectId,
      state: "finished",
    });
    await db.pg.query(`update runs set parent_run_id = 'run_p' where id = 'run_c'`);
    await db.client.query(
      `insert into steps(id, run_id, phase, ordinal, state) values ('stp_p','run_p','verify',1,'done')`,
    );
    await seedGate(db, {
      gateId: "gt_p",
      runId: "run_p",
      stepId: "stp_p",
      kind: "confirm",
      onExpiry: "proceed",
    });
    await db.client.query(
      `insert into decisions(gate_id, by_actor, action) values ('gt_p','usr','proceed')`,
    );
    // the review-output leaves on draft 1: correspondence → claims (+sources) → findings →
    // dispositions → obligations/links/transitions → decision_requests.
    await db.client.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('ci_p',$1,'review',$2,'run_p',now(),'{}'::text[])`,
      [seed.projectId, d1],
    );
    await db.client.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, verdict)
       values ('cl_p','ci_p',$1,1,'the claim','supported')`,
      [d1],
    );
    await db.client.query(
      `insert into claim_sources(claim_id, ordinal, url, normalized_url, accessed_at, stance)
       values ('cl_p',1,'https://example.test/a','example.test/a',now(),'supports')`,
    );
    await db.client.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('fnd_p','ci_p',$1,1,'contradiction','major','agent','T','B')`,
      [d1],
    );
    await db.client.query(
      `insert into dispositions(id, finding_id, response_id, kind, by_actor)
       values ('dp_p','fnd_p','ci_p','accept','{"kind":"user"}'::jsonb)`,
    );
    await db.client.query(
      `insert into revision_obligations(id, project_id, source, severity, kind, title, state, opened_on_draft_id, finding_id, created_by)
       values ('ro_p',$1,'finding','major','fix','O','open',$2,'fnd_p','{"kind":"user"}'::jsonb)`,
      [seed.projectId, d1],
    );
    await db.client.query(
      `insert into obligation_findings(obligation_id, finding_id, correspondence_id, relation)
       values ('ro_p','fnd_p','ci_p','root')`,
    );
    await db.client.query(
      `insert into obligation_transitions(id, obligation_id, to_state, cause, by_actor)
       values ('ot_p','ro_p','open','opened','{"kind":"user"}'::jsonb)`,
    );
    await db.client.query(
      `insert into decision_requests(id, project_id, text, options, state, obligation_id)
       values ('dr_p',$1,'q','{}'::text[],'open','ro_p')`,
      [seed.projectId],
    );
    // hygiene rows the FK graph does not reach.
    await db.client.query(
      `insert into analytics_events(id, user_id, workspace_id, project_id, event) values ('ae_p',$1,$2,$3,'landing.viewed')`,
      [seed.userId, ws, seed.projectId],
    );
    await db.client.query(
      `insert into inbox_items(id, user_id, project_id, kind, payload) values ('ib_p',$1,$2,'review_delivered','{}'::jsonb)`,
      [seed.userId, seed.projectId],
    );
    // CROSS-PROJECT survivors: a sibling draft chained onto the dying draft and a sibling run
    // parented on the dying run — the sever pass must null these, not fail the purge.
    const sib = await seedProject(db, {
      userId: "usr_sib",
      billingAccountId: "ba_sib",
      workspaceId: ws,
      projectId: "prj_sib",
      draftN: 1,
    });
    await db.pg.query(`update drafts set base_draft_id = $1 where id = $2`, [d1, sib.draftId]);
    await seedRun(db, {
      runId: "run_sib",
      workspaceId: ws,
      projectId: "prj_sib",
      state: "finished",
    });
    await db.pg.query(`update runs set parent_run_id = 'run_p' where id = 'run_sib'`);

    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    const r = await handleProjectPurge(
      { tenantId: ws, projectId: seed.projectId, tombstonedAt: day(0).toISOString() },
      { systemExec: db.client },
    );
    expect(r.purged).toBe(true);
    expect(r.deleted?.projects).toBe(1);
    for (const t of [
      "working_copies",
      "provenance_maps",
      "analytics_events",
      "inbox_items",
      "gates",
      "decision_requests",
      "obligation_findings",
      "revision_obligations",
      "dispositions",
      "findings",
      "claims",
      "correspondence_items",
    ]) {
      expect(r.deleted?.[t], `${t} count`).toBe(1);
    }
    expect(r.severed).toEqual({ "drafts.base_draft_id": 1, "runs.parent_run_id": 1 });
    // nothing of the project tree remains; the sibling tree survives with its refs severed.
    const left = await db.pg.query(
      `select (select count(*)::int from projects where id=$1) p,
              (select count(*)::int from drafts where project_id=$1) d,
              (select count(*)::int from claims where draft_id=$2) c,
              (select count(*)::int from findings where draft_id=$2) f,
              (select count(*)::int from correspondence_items where project_id=$1) ci,
              (select count(*)::int from runs where project_id=$1) r,
              (select count(*)::int from artifact_versions where artifact_id='art_p') av,
              (select count(*)::int from inbox_items where project_id=$1) ib`,
      [seed.projectId, d1],
    );
    expect(left.rows[0]).toEqual({ p: 0, d: 0, c: 0, f: 0, ci: 0, r: 0, av: 0, ib: 0 });
    const sibRefs = await db.pg.query(
      `select (select base_draft_id from drafts where id=$1) bd,
              (select parent_run_id from runs where id='run_sib') pr`,
      [sib.draftId],
    );
    expect(sibRefs.rows[0]).toEqual({ bd: null, pr: null });
    expect((await db.pg.query(`select 1 from projects where id = 'prj_sib'`, [])).rows.length).toBe(
      1,
    );
  });

  // The deployed repair loop, end to end: the sweep detects the orphaned tombstone, re-arms the
  // job, and the fired handler now purges the project that prod failed on ×3 (BL-113).
  it("sweep re-arm → purge completes on the prod failure shape (BL-113)", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.client.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('ci_p',$1,'review',$2,'run_x',now(),'{}'::text[])`,
      [seed.projectId, seed.draftId],
    );
    await db.client.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, verdict)
       values ('cl_p','ci_p',$1,1,'the claim','supported')`,
      [seed.draftId],
    );
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    const queue = fakeQueue();
    const s = await handleProjectPurgeSweep({ systemExec: db.client, queue });
    expect(s).toEqual({ scanned: 1, rearmed: [seed.projectId] });
    const r = await handleProjectPurge(queue.sent[0].payload as ProjectPurgeJob, {
      systemExec: db.client,
    });
    expect(r.purged).toBe(true);
    expect(r.deleted?.claims).toBe(1);
    expect(
      (await db.pg.query(`select 1 from projects where id = $1`, [seed.projectId])).rows.length,
    ).toBe(0);
  });
});

// F-R6WATCH.2-1 (BL-112) — the tombstone watchdog: an armed `project.purge` job vanished live
// without firing and nothing noticed the orphaned past-grace tombstone. The sweep re-arms any
// tombstone lacking a live (created/retry/active) job, at its own grace end.
describe("handleProjectPurgeSweep (F-R6WATCH.2-1 re-arm watchdog)", () => {
  it("re-arms a past-grace tombstone whose purge job vanished (fires on the next poll)", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    const queue = fakeQueue();
    const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 1, rearmed: [seed.projectId] });
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0].name).toBe("project.purge");
    expect(queue.sent[0].opts?.singletonKey).toBe(`project.purge:${seed.projectId}`);
    expect(queue.sent[0].opts?.startAfterMs).toBe(0);
    expect(queue.sent[0].payload.tenantId).toBe(seed.workspaceId);
  });

  it("re-arms an in-grace tombstone AT its grace end, not immediately", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(`update projects set deleted_at = now() - interval '10 days' where id = $1`, [
      seed.projectId,
    ]);
    const queue = fakeQueue();
    const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
    expect(r.rearmed).toEqual([seed.projectId]);
    // ~20 days remain of the 30-day grace — the arm lands at the tombstone's own grace end.
    const ms = queue.sent[0].opts?.startAfterMs ?? -1;
    expect(ms).toBeGreaterThan(19 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(21 * 24 * 60 * 60 * 1000);
  });

  it("leaves a tombstone alone when a live job still holds its singleton key", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    for (const state of ["created", "retry", "active"]) {
      await db.pg.query(
        `insert into pgboss.job(name, singleton_key, state) values ('project.purge', $1, $2)`,
        [`project.purge:${seed.projectId}`, state],
      );
      const queue = fakeQueue();
      const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
      expect(r).toEqual({ scanned: 0, rearmed: [] });
      expect(queue.sent).toEqual([]);
      await db.pg.query(`delete from pgboss.job`);
    }
  });

  it("re-arms again once the surviving job row is terminal (completed/failed)", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(`update projects set deleted_at = now() - interval '31 days' where id = $1`, [
      seed.projectId,
    ]);
    for (const state of ["completed", "failed", "cancelled"]) {
      await db.pg.query(
        `insert into pgboss.job(name, singleton_key, state) values ('project.purge', $1, $2)`,
        [`project.purge:${seed.projectId}`, state],
      );
      const queue = fakeQueue();
      const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
      expect(r.rearmed).toEqual([seed.projectId]);
      await db.pg.query(`delete from pgboss.job`);
    }
  });

  it("skips a fresh tombstone (<1h) — the api's own arm may still be in flight", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(
      `update projects set deleted_at = now() - interval '30 minutes' where id = $1`,
      [seed.projectId],
    );
    const queue = fakeQueue();
    const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 0, rearmed: [] });
    expect(queue.sent).toEqual([]);
  });

  it("never touches a live (non-tombstoned) project", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    await seedProject(db, { draftN: 1 });
    const queue = fakeQueue();
    const r = await handleProjectPurgeSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 0, rearmed: [] });
    expect(queue.sent).toEqual([]);
  });

  it("without a system pool or queue the sweep is a no-op (test seam)", async () => {
    const r = await handleProjectPurgeSweep({});
    expect(r).toEqual({ scanned: 0, rearmed: [] });
  });
});

// RH-4 (270_R6OPS.4) — the deletion-request watchdog: `user.deletion_requested_at` is the state,
// the delayed `account.hard-delete` job is the timer; the same silent-loss class as F-R6WATCH.2-1
// leaves the promised destruction undone forever. The sweep re-arms any marker lacking a live job.
describe("handleAccountDeleteSweep (RH-4 re-arm watchdog)", () => {
  const markDeletion = (userId: string, ago: string) =>
    db!.pg.query(`update "user" set deletion_requested_at = now() - interval '${ago}' where id = $1`, [
      userId,
    ]);

  it("re-arms a past-grace marker whose hard-delete job vanished (fires on the next poll)", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(
      `insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
      [seed.workspaceId, seed.userId],
    );
    await markDeletion(seed.userId, "20 days");
    const queue = fakeQueue();
    const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 1, rearmed: [seed.userId] });
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0].name).toBe("account.hard-delete");
    expect(queue.sent[0].opts?.singletonKey).toBe(`account.hard-delete:${seed.userId}`);
    expect(queue.sent[0].opts?.startAfterMs).toBe(0);
    expect(queue.sent[0].payload.tenantId).toBe(seed.workspaceId);
    expect(queue.sent[0].payload.userId).toBe(seed.userId);
    expect(queue.sent[0].payload.deletionRequestedAt).toBeTruthy();
  });

  it("re-arms an in-grace marker AT its grace end, not immediately", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await markDeletion(seed.userId, "2 days");
    const queue = fakeQueue();
    const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
    expect(r.rearmed).toEqual([seed.userId]);
    const ms = queue.sent[0].opts?.startAfterMs ?? -1;
    expect(ms).toBeGreaterThan(11 * 24 * 60 * 60 * 1000);
    expect(ms).toBeLessThan(13 * 24 * 60 * 60 * 1000);
  });

  it("leaves a pending request alone when a live job still holds its singleton key", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await markDeletion(seed.userId, "20 days");
    for (const state of ["created", "retry", "active"]) {
      await db.pg.query(
        `insert into pgboss.job(name, singleton_key, state) values ('account.hard-delete', $1, $2)`,
        [`account.hard-delete:${seed.userId}`, state],
      );
      const queue = fakeQueue();
      const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
      expect(r).toEqual({ scanned: 0, rearmed: [] });
      expect(queue.sent).toEqual([]);
      await db.pg.query(`delete from pgboss.job`);
    }
  });

  it("re-arms again once the surviving job row is terminal (completed/failed)", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await markDeletion(seed.userId, "20 days");
    for (const state of ["completed", "failed", "cancelled"]) {
      await db.pg.query(
        `insert into pgboss.job(name, singleton_key, state) values ('account.hard-delete', $1, $2)`,
        [`account.hard-delete:${seed.userId}`, state],
      );
      const queue = fakeQueue();
      const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
      expect(r.rearmed).toEqual([seed.userId]);
      await db.pg.query(`delete from pgboss.job`);
    }
  });

  it("skips a fresh marker (<1h) — the api's own arm may still be in flight", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await markDeletion(seed.userId, "30 minutes");
    const queue = fakeQueue();
    const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 0, rearmed: [] });
    expect(queue.sent).toEqual([]);
  });

  it("never touches a live (non-deleting) user", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    await seedProject(db, { draftN: 1 });
    const queue = fakeQueue();
    const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
    expect(r).toEqual({ scanned: 0, rearmed: [] });
    expect(queue.sent).toEqual([]);
  });

  it("still arms a memberless account — the user row is owed deletion regardless", async () => {
    db = await createOrchestratorTestDb();
    await stubQueueTable(db);
    const seed = await seedProject(db, { draftN: 1 });
    await db.pg.query(`delete from workspace_members where user_id = $1`, [seed.userId]);
    await markDeletion(seed.userId, "20 days");
    const queue = fakeQueue();
    const r = await handleAccountDeleteSweep({ systemExec: db.client, queue });
    expect(r.rearmed).toEqual([seed.userId]);
    expect(queue.sent[0].payload.userId).toBe(seed.userId);
    expect(queue.sent[0].payload.tenantId).toBe(seed.userId); // no membership → self id
  });

  it("without a system pool or queue the sweep is a no-op (test seam)", async () => {
    const r = await handleAccountDeleteSweep({});
    expect(r).toEqual({ scanned: 0, rearmed: [] });
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

  // JOURNEY.1 (live finding, 2026-10-01): the purge sweep's first real hard-delete failed on
  // `claims_draft_id_fkey` — the projects cascade never reaches NO ACTION children of the content
  // tree. Seed the full leaf chain (gate→step→run, decision_request→revision_obligation→finding,
  // disposition→finding, obligation_findings, claim/correspondence→draft) and prove the delete
  // completes leaf-first.
  it("hard-deletes a tenant whose claims/findings/correspondence reference drafts (leaf-first)", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db, { draftN: 1 });
    const ws = seed.workspaceId;
    await db.pg.query(`update "user" set deletion_requested_at = $1 where id = $2`, [
      day(0).toISOString(),
      seed.userId,
    ]);
    const { seedRun, seedGate } = await import("@rhema/orchestrator/testing");
    await seedRun(db, {
      runId: "run_hd",
      workspaceId: ws,
      projectId: seed.projectId,
      state: "finished",
    });
    await db.client.query(
      `insert into steps(id, run_id, phase, ordinal, state) values ('stp_hd','run_hd','verify',1,'done')`,
    );
    await seedGate(db, {
      gateId: "gt_hd",
      runId: "run_hd",
      stepId: "stp_hd",
      kind: "confirm",
      onExpiry: "proceed",
    });
    await db.client.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('ci_hd', $1, 'review', $2, 'run_hd', now(), '{}'::text[])`,
      [seed.projectId, seed.draftId],
    );
    await db.client.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, verdict)
       values ('cl_hd','ci_hd',$1,1,'the claim','supported')`,
      [seed.draftId],
    );
    await db.client.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('fnd_hd','ci_hd',$1,1,'contradiction','major','agent','T','B')`,
      [seed.draftId],
    );
    await db.client.query(
      `insert into revision_obligations(id, project_id, source, severity, kind, title, state, opened_on_draft_id, finding_id, created_by)
       values ('ro_hd',$1,'finding','major','fix','O','open',$2,'fnd_hd',jsonb_build_object('kind','user','id',$3::text))`,
      [seed.projectId, seed.draftId, seed.userId],
    );
    await db.client.query(
      `insert into obligation_findings(obligation_id, finding_id, correspondence_id, relation)
       values ('ro_hd','fnd_hd','ci_hd','root')`,
    );
    await db.client.query(
      `insert into decision_requests(id, project_id, text, options, state, obligation_id)
       values ('dr_hd',$1,'q','{}'::text[],'open','ro_hd')`,
      [seed.projectId],
    );
    await db.client.query(
      `insert into dispositions(id, finding_id, kind, by_actor) values ('dp_hd','fnd_hd','accept',jsonb_build_object('kind','user'))`,
    );

    const r = await handleAccountHardDelete(
      { tenantId: ws, userId: seed.userId, deletionRequestedAt: day(0).toISOString() },
      { systemExec: db.client, now: day(14) },
    );
    expect(r.phase).toBe("hard-delete");
    expect(r.deleted?.["projects"]).toBe(1);
    expect(r.deleted?.["claims"]).toBe(1);
    expect(r.deleted?.["correspondence_items"]).toBe(1);
    const left = await db.client.query(
      `select (select count(*)::int from "user" where id=$1) u,
              (select count(*)::int from projects where workspace_id=$2) p,
              (select count(*)::int from claims where draft_id=$3) c`,
      [seed.userId, ws, seed.draftId],
    );
    expect(left.rows[0]).toEqual({ u: 0, p: 0, c: 0 });
  });
});

// JOURNEY.1 — the test-tenant auto-purge sweep (REQ-SPEC-29; ADR-020): flagged workspaces past the
// window route through the existing account.hard-delete pipeline with the grace bypassed.
describe("handleTestTenantPurge (test-tenant.purge consumer)", () => {
  async function seedFlaggedTenant(
    db2: NonNullable<typeof db>,
    args: { stale: boolean; flagged?: boolean },
  ) {
    const seed = await seedProject(db2, {});
    await db2.pg.query(
      `insert into workspace_members (workspace_id, user_id, role) values ($1,$2,'admin') on conflict do nothing`,
      [seed.workspaceId, seed.userId],
    );
    if (args.flagged !== false) {
      await db2.pg.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    }
    if (args.stale) {
      await db2.pg.query(
        `update workspaces set created_at = now() - interval '30 days' where id = $1`,
        [seed.workspaceId],
      );
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
    expect(Date.now() - u.deletion_requested_at.getTime()).toBeGreaterThan(
      14 * 24 * 60 * 60 * 1000,
    );
  });

  it("never touches an unflagged workspace, however stale", async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedFlaggedTenant(db, { stale: true, flagged: false });
    const sent: unknown[] = [];
    const queue = {
      async send(_n: string, _p: Record<string, unknown>) {
        sent.push(1);
      },
    };
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
    const queue = {
      async send(_n: string, _p: Record<string, unknown>) {
        sent.push(1);
      },
    };
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, { systemExec: db.client, queue });
    expect(r.enqueuedDeletes).toBe(0);
    expect(sent).toEqual([]);
  });

  it("without a system pool or queue the sweep is a no-op (test seam)", async () => {
    const r = await handleTestTenantPurge({ olderThanHours: 26 }, {});
    expect(r).toEqual({ scanned: 0, purgedWorkspaces: [], enqueuedDeletes: 0 });
  });
});
