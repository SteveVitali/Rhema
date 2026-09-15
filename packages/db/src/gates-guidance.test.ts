import { describe, expect, it } from "vitest";
import { createTestDb } from "./testing/pglite.js";

// Structural guarantees of the P0.10 additive migration (0010): the §6.5 guidance delivery/retire fields and
// the run-level "Approve and run autonomously" flag. The gates/decisions columns already existed in 0002 —
// this asserts the additive extension applies and is back-compatible (defaults on existing/empty deploys).

async function columns(db: Awaited<ReturnType<typeof createTestDb>>, table: string): Promise<Set<string>> {
  const rows = (
    await db.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1",
      [table],
    )
  ).rows as { column_name: string }[];
  return new Set(rows.map((r) => r.column_name));
}

describe("gates/guidance schema — migration 0010 (P0.10)", () => {
  it("guidance carries the §6.5 delivery/retire fields (run_id, workflows, consumed_by, active)", async () => {
    const db = await createTestDb();
    const cols = await columns(db, "guidance");
    for (const c of ["run_id", "workflows", "consumed_by", "active", "standing", "body", "source"]) {
      expect(cols.has(c)).toBe(true);
    }
    await db.close();
  });

  it("guidance defaults are back-compatible: consumed_by='[]', active=true", async () => {
    const db = await createTestDb();
    await db.exec(`
      insert into billing_accounts (id) values ('ba_g');
      insert into workspaces (id, kind, name, billing_account_id) values ('ws_g','personal','G','ba_g');
      insert into "user" (id, email) values ('u_g','g@example.test');
      insert into projects (id, workspace_id, owner_id, title, slug) values ('p_g','ws_g','u_g','G','g');
      insert into guidance (id, project_id, source, body) values ('gdn_g','p_g','gate_text','remember this');
    `);
    const row = (
      await db.query("select consumed_by, active, standing from guidance where id='gdn_g'")
    ).rows[0] as { consumed_by: unknown; active: boolean; standing: boolean };
    expect(row.consumed_by).toEqual([]);
    expect(row.active).toBe(true);
    expect(row.standing).toBe(false);
    await db.close();
  });

  it("runs.gates_off exists and defaults false (Approve and run autonomously)", async () => {
    const db = await createTestDb();
    const cols = await columns(db, "runs");
    expect(cols.has("gates_off")).toBe(true);
    // gates table already carries the P0.10 columns from 0002.
    const gateCols = await columns(db, "gates");
    for (const c of ["blocking", "on_expiry", "held", "paused_while_reading", "presence_deadline_at", "resolved_at"]) {
      expect(gateCols.has(c)).toBe(true);
    }
    const decisionCols = await columns(db, "decisions");
    for (const c of ["by_actor", "presence", "action", "overlay_version_ids", "standing_rule", "changes"]) {
      expect(decisionCols.has(c)).toBe(true);
    }
    await db.close();
  });
});
