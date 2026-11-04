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
    // the limited roles exist (REQ-ARCH-25/REQ-SPEC-30): the three product roles + the benchmark-runner
    // role (0013) + the SEC.1 user-serving LOGIN member `rhema_app_login` (0045) + the R7DEM.6b
    // NOLOGIN insert-only demo-metrics role `rhema_demo_writer` (0061)
    const roles = (
      await db.query("select rolname from pg_roles where rolname like 'rhema%' order by 1")
    ).rows.map((r) => (r as { rolname: string }).rolname);
    expect(roles).toEqual([
      "rhema_app",
      "rhema_app_login",
      "rhema_benchmark",
      "rhema_collab",
      "rhema_demo_writer",
      "rhema_harvester",
    ]);
    // backlog_items is dropped by the final migration
    const { exists } = await one(
      db,
      "select to_regclass('public.backlog_items') is not null as exists",
    );
    expect(exists).toBe(false);
    await db.close();
  });

  // DEF.4 (0055): the AC's deterministic half — every fresh stage ends with the held>=0 check
  // VALIDATED, matching prod's post-DEF.2-repair state (0044 added it NOT VALID on purpose; the
  // validate lived only in prod's manual repair until 0055).
  it("validates credit_balances_held_nonnegative on a fresh database (0055 parity)", async () => {
    const db = await createTestDb();
    const { convalidated } = await one(
      db,
      "select convalidated from pg_constraint where conname = 'credit_balances_held_nonnegative'",
    );
    expect(convalidated).toBe(true);
    // and the refund-window table landed with its tenant guard (the RLS census pins the policy).
    const { rls } = await one(
      db,
      "select relforcerowsecurity as rls from pg_class where relname = 'user_refund_requests'",
    );
    expect(rls).toBe(true);
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

  // EDIT.1 (migration 0053): the collab role's store path needs UPDATE on provenance_maps —
  // saveManualRevision's provenance write is `insert … on conflict do update`, and Postgres
  // requires UPDATE for the conflict branch even when no row conflicts. Prod denied it (42501)
  // on the live N8 walk; PGlite's superuser never ACL-checks DML, but `has_table_privilege` reads
  // the grant catalog faithfully, so the least-privilege matrix is assertable here.
  it("grants rhema_collab the exact store-path privileges (0028/0053 vs saveManualRevision)", async () => {
    const db = await createTestDb();
    // table → privileges the collab service's materialization/fork/sweep paths actually issue.
    const need: Record<string, string[]> = {
      drafts: ["SELECT", "INSERT", "UPDATE"],
      live_docs: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      restore_points: ["SELECT", "INSERT", "DELETE"],
      working_copies: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      artifacts: ["SELECT", "INSERT", "UPDATE"],
      artifact_versions: ["SELECT", "INSERT"],
      provenance_maps: ["SELECT", "INSERT", "UPDATE"],
      findings: ["SELECT", "UPDATE"],
      timeline_events: ["SELECT", "INSERT"],
      projects: ["SELECT"],
      runs: ["SELECT"],
      session: ["SELECT"],
      workspace_members: ["SELECT"],
      workspaces: ["SELECT"],
      subscriptions: ["SELECT"],
    };
    for (const [table, privs] of Object.entries(need)) {
      for (const priv of privs) {
        const { ok } = await one(
          db,
          `select has_table_privilege('rhema_collab', 'public.${table}', '${priv}') as ok`,
        );
        expect(ok, `rhema_collab ${priv} on ${table}`).toBe(true);
      }
    }
    await db.close();
  });
});
