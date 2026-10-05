import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { CURRENT_RATE_TABLE_VERSION } from "@rhema/contracts";
import { repriceParkedRun } from "./reprice.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  type LedgerTestDb,
} from "./testing/index.js";

// §14.6 "rate-table change while parked" — repriceParkedRun recomputes the frozen estimate under the
// CURRENT table and stamps the run; the resume path (steering.reprice seam) turns a positive delta into
// a confirm_cost gate.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const PRJ = "prj_seed";
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, projectId: PRJ });
});
afterEach(() => db.close());

describe("repriceParkedRun", () => {
  it("is a no-op when the run is already on the current table", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ }); // rate_table_version = current
    const out = await inTx((tx) =>
      repriceParkedRun(tx, {
        runId: "run_1",
        reestimate: async () => {
          throw new Error("reestimate must not run when the table is current");
        },
      }),
    );
    expect(out.changed).toBe(false);
    expect(out.fromVersion).toBe(CURRENT_RATE_TABLE_VERSION);
    expect(out.deltaCredits).toBe(0);
  });

  it("re-estimates under the current table and stamps the run when the table moved", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    // pin the run to an older table version (a table that has since been superseded)
    await db.pg.query("update runs set rate_table_version = 0, estimate_credits = 200, cap_credits = 300 where id = 'run_1'");
    const out = await inTx((tx) =>
      repriceParkedRun(tx, {
        runId: "run_1",
        reestimate: async (r) => {
          expect(r.rateTableVersion).toBe(0);
          expect(r.estimateCredits).toBe(200);
          expect(r.modelTier).toBe("balanced");
          // the new table prices the same frozen scope 20% higher
          return { estimateCredits: 240, capCredits: 360 };
        },
      }),
    );
    expect(out.changed).toBe(true);
    expect(out.fromVersion).toBe(0);
    expect(out.toVersion).toBe(CURRENT_RATE_TABLE_VERSION);
    expect(out.newCapCredits).toBe(360);
    expect(out.deltaCredits).toBe(60);
    const row = (
      await db.client.query(
        "select estimate_credits::int as e, cap_credits::int as c, rate_table_version::int as v, repriced_from_version::int as fv, repriced_at from runs where id = 'run_1'",
      )
    ).rows[0] as { e: number; c: number; v: number; fv: number; repriced_at: string | null };
    expect(row).toMatchObject({ e: 240, c: 360, v: CURRENT_RATE_TABLE_VERSION, fv: 0 });
    expect(row.repriced_at).not.toBeNull();
  });

  it("a cheaper table yields a negative delta — the resume path proceeds without consent", async () => {
    await seedRun(db, { runId: "run_1", workspaceId: WS, projectId: PRJ });
    await db.pg.query("update runs set rate_table_version = 0, estimate_credits = 200, cap_credits = 300 where id = 'run_1'");
    const out = await inTx((tx) =>
      repriceParkedRun(tx, {
        runId: "run_1",
        reestimate: async () => ({ estimateCredits: 150, capCredits: 225 }),
      }),
    );
    expect(out.changed).toBe(true);
    expect(out.deltaCredits).toBe(-75); // resume proceeds — no consent needed for a lower price
  });
});
