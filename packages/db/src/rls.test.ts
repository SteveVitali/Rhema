import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createTestDb, type TestDb } from "./testing/pglite.js";
import { withTenant } from "./rls.js";

// AC3 (REQ-DATA-4): a two-tenant pooled-connection isolation test — one connection reused across two tenants
// under the wrapper leaks nothing. Deterministic.

let db: TestDb;
beforeEach(async () => {
  db = await createTestDb();
  // Seed two tenants as the superuser (RLS is bypassed for the owner, so this sets up cross-tenant data).
  await db.exec(`
    insert into billing_accounts (id) values ('bill_a'),('bill_b');
    insert into workspaces (id, kind, name, billing_account_id) values
      ('ws_a','personal','A','bill_a'), ('ws_b','personal','B','bill_b');
    insert into "user" (id, email) values ('ua','a@example.com'),('ub','b@example.com');
    insert into projects (id, workspace_id, owner_id, title, slug) values
      ('pa','ws_a','ua','Alpha','alpha'), ('pb','ws_b','ub','Beta','beta');
    insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path) values
      ('aa','ws_a','pa','draft','shared','drafts/v1.md'),
      ('ab','ws_b','pb','draft','shared','drafts/v1.md');
  `);
  // Become the non-owner application role so FORCE ROW LEVEL SECURITY binds (a pooled connection authenticates
  // as this role in production; PGlite connects as the superuser, so we switch explicitly here).
  await db.exec("set role rhema_app");
});
afterEach(async () => {
  await db.exec("reset role");
  await db.close();
});

const ids = (rows: unknown[]) => rows.map((r) => (r as { id: string }).id).sort();

describe("two-tenant isolation on one pooled connection (REQ-DATA-4 AC)", () => {
  it("each tenant sees only its own rows, on the same reused connection", async () => {
    const a = await withTenant(db, "ws_a", (tx) => tx.query("select id from projects"));
    expect(ids(a.rows)).toEqual(["pa"]);

    // SAME connection, reused for the other tenant — SET LOCAL is transaction-scoped, so nothing leaks.
    const b = await withTenant(db, "ws_b", (tx) => tx.query("select id from projects"));
    expect(ids(b.rows)).toEqual(["pb"]);

    // And the artifacts table (also RLS-forced) isolates identically.
    const aa = await withTenant(db, "ws_a", (tx) => tx.query("select id from artifacts"));
    expect(ids(aa.rows)).toEqual(["aa"]);
  });

  it("with no tenant set, the connection sees nothing (deny-by-default)", async () => {
    // outside the wrapper, app.tenant_id is unset → current_tenant() is null → no row matches.
    const r = await db.query("select id from projects");
    expect(r.rows).toEqual([]);
  });

  it("cross-tenant writes are refused by the policy WITH CHECK", async () => {
    await expect(
      withTenant(db, "ws_a", (tx) =>
        tx.query(
          "insert into projects (id, workspace_id, owner_id, title, slug) values ('evil','ws_b','ua','X','x')",
        ),
      ),
    ).rejects.toThrow();
    // nothing was written (rolled back) — verify from the superuser view
    await db.exec("reset role");
    const check = await db.query("select id from projects where id='evil'");
    expect(check.rows).toEqual([]);
    await db.exec("set role rhema_app");
  });

  it("withTenant refuses an empty tenant id", async () => {
    await expect(withTenant(db, "", async () => undefined)).rejects.toThrow(/non-empty tenantId/);
  });
});
