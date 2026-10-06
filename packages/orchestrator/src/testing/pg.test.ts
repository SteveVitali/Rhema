import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { USER_SERVING_ROLE } from "@rhema/db";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "./pg.js";

// SEC.1 (REQ-SPEC-30; ADR-017/018) — the suite-as-the-user-role guard. `txRunner` is the seam every
// user-serving transaction rides; these pins make the harness FAIL LOUDLY if that seam ever runs as a
// superuser or a BYPASSRLS role again (the exact misconfiguration that let the post-0026 leaks hide
// from the suite — PGlite's bootstrap user is a superuser and bypasses everything unless we bind the
// prod-shaped role inside the transaction).

let db: OrchestratorTestDb;
beforeEach(async () => {
  db = await createOrchestratorTestDb();
});
afterEach(() => db.close());

describe("the tenant handle runs as the user-serving role (SEC.1 guard)", () => {
  it("txRunner transactions run as rhema_app_login — never a superuser or BYPASSRLS role", async () => {
    const seen = await db.txRunner.run("ws_guard", async (tx) => {
      const who = (await tx.query("select current_user as u")).rows[0] as { u: string };
      const attrs = (
        await tx.query(
          "select rolsuper, rolbypassrls from pg_roles where rolname = current_user",
        )
      ).rows[0] as { rolsuper: boolean; rolbypassrls: boolean };
      return { who: who.u, ...attrs };
    });
    expect(seen.who).toBe(USER_SERVING_ROLE);
    expect(seen.rolsuper).toBe(false);
    expect(seen.rolbypassrls).toBe(false);
  });

  it("the role's grants bind inside the tx: the proxy credential tables deny reads", async () => {
    await expect(
      db.txRunner.run("ws_guard", (tx) => tx.query("select count(*) from proxy_credentials")),
    ).rejects.toThrow(/permission denied/);
  });

  it("RLS binds under the role: tenant B cannot read tenant A's row, and the deny-by-default holds", async () => {
    const a = await seedProject(db, { workspaceId: "ws_a", projectId: "prj_a" });
    void a;
    await db.txRunner.run("ws_b", async (tx) => {
      const rows = (await tx.query("select id from projects")).rows as { id: string }[];
      expect(rows.map((r) => r.id)).toEqual([]);
    });
    await db.txRunner.run("ws_a", async (tx) => {
      const rows = (await tx.query("select id from projects")).rows as { id: string }[];
      expect(rows.map((r) => r.id)).toEqual(["prj_a"]);
    });
  });

  it("the seeding/system handle stays privileged (the BYPASSRLS analogue — the split is real)", async () => {
    // `db.client` is the suite's system seam (systemExec fakes bind it): it must still reach the
    // system tables the user role is denied — otherwise the harness silently lost its admin handle.
    const res = await db.client.query("select count(*)::int as c from proxy_credentials");
    expect((res.rows[0] as { c: number }).c).toBe(0); // reachable: no throw
  });
});
