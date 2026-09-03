import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./testing/pglite.js";

// AC4 (immutability trigger, REQ-DATA-2) and AC5 (obligation transition trigger, REQ-OBJ-1). Deterministic.

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  // minimal project + artifact + draft scaffolding
  await db.exec(`
    insert into billing_accounts (id) values ('bill1');
    insert into workspaces (id, kind, name, billing_account_id) values ('ws1','personal','W','bill1');
    insert into "user" (id, email) values ('u1','u1@example.com');
    insert into projects (id, workspace_id, owner_id, title, slug) values ('p1','ws1','u1','P','p');
    insert into drafts (id, project_id, n, origin, state) values ('d1','p1',1,'imported','working');
    insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
      values ('a1','ws1','p1','editors_letter','shared','correspondence/v1-review/editors-letter.md');
    insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, immutable)
      values ('av1','a1',1, repeat('a',64), 'tenants/ws1/objects/'||repeat('a',64), 1200, 'text/markdown', '{"kind":"system"}'::jsonb, true);
  `);
});
afterEach(async () => {
  await db.close();
});

describe("immutability trigger (REQ-DATA-2)", () => {
  it("raises when a content column changes on an immutable=true version", async () => {
    await expect(
      db.query(
        `update artifact_versions set content_sha256 = ${quote("b".repeat(64))} where id='av1'`,
      ),
    ).rejects.toThrow(/immutable/i);
    await expect(
      db.query(`update artifact_versions set s3_key='tenants/ws1/objects/evil' where id='av1'`),
    ).rejects.toThrow(/immutable/i);
  });

  it("allows a non-content update on an immutable version (e.g. word_count backfill)", async () => {
    await expect(
      db.query(`update artifact_versions set word_count=1300 where id='av1'`),
    ).resolves.toBeTruthy();
  });

  it("allows content change while still mutable, then locks on freeze", async () => {
    await db.exec(`
      insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, immutable)
        values ('av2','a1',2, ${quote("c".repeat(64))}, 'k', 10, 'text/markdown', '{"kind":"system"}'::jsonb, false);
    `);
    await expect(
      db.query(
        `update artifact_versions set content_sha256=${quote("d".repeat(64))} where id='av2'`,
      ),
    ).resolves.toBeTruthy();
    await db.query(`update artifact_versions set immutable=true where id='av2'`);
    await expect(
      db.query(
        `update artifact_versions set content_sha256=${quote("e".repeat(64))} where id='av2'`,
      ),
    ).rejects.toThrow(/immutable/i);
  });
});

describe("obligation transition trigger (REQ-OBJ-1)", () => {
  beforeEach(async () => {
    await db.exec(`
      insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
        values ('c1','p1','review','d1','r1', now(), '{}');
      insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
        values ('f1','c1','d1',1,'argument','major','editor','Unanswered counterargument','Posner goes unanswered');
      insert into revision_obligations (id, project_id, source, finding_id, severity, title, state, opened_on_draft_id, created_by)
        values ('o1','p1','finding','f1','major','Unanswered counterargument','open','d1', '{"kind":"system"}'::jsonb);
    `);
  });

  it("raises on a direct UPDATE … SET state without a transition row", async () => {
    await expect(
      db.query(`update revision_obligations set state='discharged' where id='o1'`),
    ).rejects.toThrow(/only via an obligation_transitions row/i);
  });

  it("allows a non-state update directly (e.g. rounds_open)", async () => {
    await expect(
      db.query(`update revision_obligations set rounds_open=1 where id='o1'`),
    ).resolves.toBeTruthy();
  });

  it("state changes only through an inserted transition (the row caches the last transition)", async () => {
    await db.exec(`
      insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor)
        values ('t1','o1','open','addressed','accept_move','{"kind":"user","userId":"u1"}'::jsonb);
    `);
    const r = await db.query(`select state, closed_at from revision_obligations where id='o1'`);
    expect((r.rows[0] as { state: string }).state).toBe("addressed");
    // a discharging transition sets closed_at
    await db.exec(`
      insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor)
        values ('t2','o1','addressed','discharged','gap_check','{"kind":"system"}'::jsonb);
    `);
    const r2 = await db.query(`select state, closed_at from revision_obligations where id='o1'`);
    expect((r2.rows[0] as { state: string; closed_at: unknown }).state).toBe("discharged");
    expect((r2.rows[0] as { closed_at: unknown }).closed_at).not.toBeNull();
  });

  it("reopening a discharged obligation clears the stale closed_at", async () => {
    await db.exec(`
      insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor)
        values ('td1','o1','open','discharged','gap_check','{"kind":"system"}'::jsonb);
    `);
    expect(
      (await db.query(`select closed_at from revision_obligations where id='o1'`)).rows[0],
    ).not.toMatchObject({
      closed_at: null,
    });
    await db.exec(`
      insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor)
        values ('td2','o1','discharged','reopened','regression','{"kind":"system"}'::jsonb);
    `);
    const r = (await db.query(`select state, closed_at from revision_obligations where id='o1'`))
      .rows[0] as {
      state: string;
      closed_at: unknown;
    };
    expect(r.state).toBe("reopened");
    expect(r.closed_at).toBeNull();
  });

  it("the rebutted/deferred rationale check bites (DB-enforced)", async () => {
    await expect(
      db.query(
        `insert into revision_obligations (id, project_id, source, severity, title, state, created_by)
         values ('o2','p1','user','minor','No rationale','rebutted','{"kind":"user","userId":"u1"}'::jsonb)`,
      ),
    ).rejects.toThrow(/check|rationale/i);
  });
});

/** single-quote a value for inline SQL (tests only). */
function quote(v: string): string {
  return `'${v.replace(/'/g, "''")}'`;
}
