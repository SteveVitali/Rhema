import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { applyMigrations, seedRealProjects, type MigrationDb } from "@rhema/db";

// Closes D-P0.02-1: run the forward-only migrations + the real-project seed against a SERVER Postgres (the CI
// `postgres:16` service via DATABASE_URL), not only in-process PGlite. Proves the authoritative SQL DDL applies on a
// native Postgres and the seed lands. Skips when DATABASE_URL is unset (local runs use PGlite everywhere else).

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null;

afterAll(async () => { await pool?.end(); });

describe.skipIf(!DATABASE_URL)("migrations + real-project seed against a server Postgres (D-P0.02-1)", () => {
  const db: MigrationDb = {
    exec: (sql) => pool!.query(sql),
    query: (sql, params) => pool!.query(sql, params as unknown[]),
  };

  it("applies every migration and seeds the three real projects", async () => {
    const applied = await applyMigrations(db);
    // a fresh CI database applies the full history (0001…0015); an idempotent re-run applies none.
    expect(applied.length).toBeGreaterThanOrEqual(0);

    // every migration file is recorded (the authoritative DDL ran on native Postgres).
    const recorded = (await pool!.query("select count(*)::int n from _migrations")).rows[0] as { n: number };
    expect(recorded.n).toBeGreaterThanOrEqual(15);

    await seedRealProjects(db);
    // drafts is not RLS-forced, so a bare read is valid; seedRealProjects lands 2 versions × 3 projects.
    const drafts = (await pool!.query("select count(*)::int n from drafts")).rows[0] as { n: number };
    expect(drafts.n).toBeGreaterThanOrEqual(6);
  });

  // SEC.1 — the user-serving role on a REAL Postgres 16 (the CI leg PGlite approximates): enable
  // LOGIN on a throwaway password (the CI service is disposable; prod's Stage B does this for real),
  // then connect AS `rhema_app_login` and prove (a) it is not superuser/BYPASSRLS, (b) tenant txns
  // filter to the tenant, and (c) the system-table grant boundary holds.
  it("rhema_app_login on postgres:16 — NOBYPASSRLS, tenant-scoped, denied the system tables", async () => {
    await applyMigrations(db);
    await pool!.query(`alter role rhema_app_login login password 'sec1-ci-probe'`);
    const user = new pg.Pool({
      connectionString: DATABASE_URL!.replace("postgres:postgres@", "rhema_app_login:sec1-ci-probe@"),
      max: 1,
    });
    try {
      // (a) attributes
      const attrs = (
        await user.query(
          `select rolname, rolsuper, rolbypassrls from pg_roles where rolname = 'rhema_app_login'`,
        )
      ).rows[0] as { rolname: string; rolsuper: boolean; rolbypassrls: boolean };
      expect(attrs.rolsuper).toBe(false);
      expect(attrs.rolbypassrls).toBe(false);

      // (b) tenant isolation — seed two workspaces' projects as superuser, read as the user role
      // (same minimal shape seedProject uses — snake_case Better Auth columns)
      await pool!.query(`
        insert into "user" (id, email, email_verified)
          values ('usr_cia','a@probe.test',true), ('usr_cib','b@probe.test',true) on conflict do nothing;
        insert into billing_accounts (id) values ('ba_cia'), ('ba_cib') on conflict do nothing;
        insert into workspaces (id, kind, name, billing_account_id)
          values ('ws_cia','personal','A','ba_cia'), ('ws_cib','personal','B','ba_cib') on conflict do nothing;
        insert into projects (id, workspace_id, owner_id, title, slug)
          values ('prj_cia','ws_cia','usr_cia','A','cia'), ('prj_cib','ws_cib','usr_cib','B','cib')
          on conflict do nothing;
      `);
      const client = await user.connect();
      try {
        await client.query("begin");
        await client.query("select set_config('role','rhema_app_login',true)");
        await client.query("select set_config('app.tenant_id','ws_cia',true)");
        const rows = (await client.query("select id from projects order by id")).rows as { id: string }[];
        expect(rows.map((r) => r.id)).toEqual(["prj_cia"]);

        // (c) the system-table boundary: proxy_credentials is denied to the user role
        await expect(client.query("select id from proxy_credentials")).rejects.toThrow(
          /permission denied/i,
        );
        await client.query("rollback");
      } finally {
        client.release();
      }
    } finally {
      await user.end();
      await pool!.query(`alter role rhema_app_login nologin`);
    }
  });
});
