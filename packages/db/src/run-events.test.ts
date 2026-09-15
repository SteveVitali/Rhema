import { describe, expect, it } from "vitest";
import { createTestDb } from "./testing/pglite.js";

// Structural guarantees of the run-event store (migration 0008), owned at the DB layer: partitioning, the RLS
// split, and the visibility CHECK that makes an internal-into-user mis-route impossible (AC2 as a constraint).

describe("run_events store — migration 0008 structure", () => {
  it("run_events is a RANGE-partitioned parent with a DEFAULT partition", async () => {
    const db = await createTestDb();
    const parent = (
      await db.query("select relkind from pg_class where relname = 'run_events'")
    ).rows[0] as { relkind: string };
    expect(parent.relkind).toBe("p"); // partitioned table
    const def = (
      await db.query("select relname from pg_class where relname = 'run_events_default'")
    ).rows;
    expect(def).toHaveLength(1); // the drop-nothing safety-net partition
    await db.close();
  });

  it("run_events and run_event_seq are FORCE-RLS; run_events_internal is not (system-scoped retention)", async () => {
    const db = await createTestDb();
    const rows = (
      await db.query(
        `select relname, relrowsecurity, relforcerowsecurity
           from pg_class where relname in ('run_events','run_event_seq','run_events_internal')`,
      )
    ).rows as { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[];
    const by = Object.fromEntries(rows.map((r) => [r.relname, r]));
    expect(by["run_events"].relrowsecurity).toBe(true);
    expect(by["run_events"].relforcerowsecurity).toBe(true);
    expect(by["run_event_seq"].relforcerowsecurity).toBe(true);
    expect(by["run_events_internal"].relrowsecurity).toBe(false); // not RLS → the retention sweep can delete
    await db.close();
  });

  it("the visibility CHECK rejects a non-user row inserted into run_events", async () => {
    const db = await createTestDb();
    // seed the FK chain minimally.
    await db.exec(`
      insert into billing_accounts(id) values ('ba1');
      insert into "user"(id, email) values ('u1','u1@x.test');
      insert into workspaces(id, kind, name, billing_account_id) values ('ws1','personal','w','ba1');
      insert into runs(id, workspace_id, workflow, state, inputs, model_profile, model_tier, rigor,
        estimate_credits, cap_credits, rate_table_version)
        values ('r1','ws1','review','running','{}'::jsonb,'balanced','balanced','standard',1,1,1);
    `);
    await expect(
      db.query(
        `insert into run_events(run_id, seq, workspace_id, day, type, payload, density, visibility, at)
         values ('r1',1,'ws1','2026-09-03','engine.error','{}'::jsonb,'internal','internal', now())`,
      ),
    ).rejects.toThrow(); // CHECK (visibility = 'user') fails loudly
    await db.close();
  });
});
