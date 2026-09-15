import { describe, expect, it } from "vitest";
import { createTestDb } from "./testing/pglite.js";
import { applyMigrations, readMigrations } from "./migrate.js";

// AC2: migrations apply cleanly against the seed; the backlog_items → source='agenda' obligations migration
// passes (REQ-OBJ-7). Deterministic.

async function one(db: Awaited<ReturnType<typeof createTestDb>>, sql: string, params?: unknown[]) {
  const r = await db.query(sql, params);
  return r.rows[0] as Record<string, unknown>;
}

describe("migrations (REQ-DATA-3)", () => {
  it("apply cleanly and are idempotent", async () => {
    const db = await createTestDb();
    // re-running applies nothing new
    const again = await applyMigrations(db);
    expect(again).toEqual([]);
    const { n } = await one(
      db,
      "select count(*)::int n from information_schema.tables where table_schema='public'",
    );
    expect(Number(n)).toBeGreaterThan(50);
    // the limited roles exist (REQ-ARCH-25): the three product roles + the dedicated benchmark-runner role (0013)
    const roles = (
      await db.query("select rolname from pg_roles where rolname like 'rhema%' order by 1")
    ).rows.map((r) => (r as { rolname: string }).rolname);
    expect(roles).toEqual(["rhema_app", "rhema_benchmark", "rhema_collab", "rhema_harvester"]);
    // backlog_items is dropped by the final migration
    const { exists } = await one(
      db,
      "select to_regclass('public.backlog_items') is not null as exists",
    );
    expect(exists).toBe(false);
    await db.close();
  });

  it("records the full forward-only history", async () => {
    const db = await createTestDb();
    const names = (await db.query("select name from _migrations order by name")).rows.map(
      (r) => (r as { name: string }).name,
    );
    expect(names).toEqual(readMigrations().map((m) => m.name));
    await db.close();
  });

  it("migrates backlog_items → source='agenda' obligations, then drops the table (REQ-OBJ-7)", async () => {
    // apply through 0004 (backlog_items still exists), seed a backlog row, then apply 0005 (migrate + drop).
    const db = await createTestDb({ until: "0004_rls.sql" });
    const { exists } = await one(
      db,
      "select to_regclass('public.backlog_items') is not null as exists",
    );
    expect(exists).toBe(true);

    await db.exec(`
      insert into billing_accounts (id) values ('bill_x');
      insert into workspaces (id, kind, name, billing_account_id) values ('ws_x','personal','X','bill_x');
      insert into "user" (id, email) values ('user_x','x@example.com');
      insert into projects (id, workspace_id, owner_id, title, slug) values ('proj_x','ws_x','user_x','X','x');
      insert into backlog_items (id, project_id, text) values ('bl_1','proj_x','Address the unanswered Posner counterargument next round');
    `);

    await applyMigrations(db); // applies 0005

    const gone = await one(db, "select to_regclass('public.backlog_items') is null as gone");
    expect(gone.gone).toBe(true);
    const obl = await one(
      db,
      "select id, source, title, state from revision_obligations where id='bl_1'",
    );
    expect(obl).toMatchObject({
      id: "bl_1",
      source: "agenda",
      state: "open",
      title: "Address the unanswered Posner counterargument next round",
    });
    await db.close();
  });
});
