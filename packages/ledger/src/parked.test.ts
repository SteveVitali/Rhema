import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import { findExpiredParkedRuns, sweepExpiredParkedRuns, type ParkedRunRef } from "./parked.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// REQ-SPEC-24.4 / §12.4: a run parked ≤ 30 days auto-cancels with its hold released. P0.08 stamps
// `parked_until`; this sweep finds the expired ones and cancels + releases each in one transaction.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const NOW = new Date("2026-10-05T00:00:00Z");

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

async function seedParkedHeldRun(runId: string, parkedUntil: Date, state = "waiting_gate"): Promise<void> {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
  await seedRun(db, { runId, workspaceId: WS, state, capCredits: 840, holdLedgerId: `h_${runId}` });
  const led = new SqlHoldLedger(testEntryDeps());
  await db.txRunner.run(WS, (tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: 840, idempotencyKey: `hold:${runId}` }));
  await db.txRunner.run(WS, (tx) => tx.query("update runs set parked_until = $2 where id = $1", [runId, parkedUntil]));
}

const sweepDeps = (cancel: (tx: SqlClient, ref: ParkedRunRef) => Promise<void>) => ({
  ledger: new SqlHoldLedger(testEntryDeps()),
  runTx: (ws: string, fn: (tx: SqlClient) => Promise<void>) => db.txRunner.run(ws, fn),
  cancel,
});

describe("parked-run auto-cancel with release", () => {
  it("finds only runs whose 30-day park has elapsed", async () => {
    await seedParkedHeldRun("expired", new Date(NOW.getTime() - 1000));
    await seedParkedHeldRun("fresh", new Date(NOW.getTime() + 1000));
    const found = await findExpiredParkedRuns(db.client, NOW);
    expect(found.map((r) => r.runId)).toEqual(["expired"]);
    expect(found[0]).toMatchObject({ workspaceId: WS, billingAccountId: BA, holdLedgerId: "h_expired" });
  });

  it("cancels the expired run AND releases its hold in one pass", async () => {
    await seedParkedHeldRun("expired", new Date(NOW.getTime() - 1000));
    // before: 840 held, 160 available
    expect((await readBalances(db, BA)).included).toEqual({ available: 160, held: 840 });

    const cancel = vi.fn(async (tx: SqlClient, ref: ParkedRunRef) => {
      await tx.query("update runs set state = 'cancelled', ended_at = now() where id = $1", [ref.runId]);
    });
    const res = await sweepExpiredParkedRuns(db.client, sweepDeps(cancel), NOW);

    expect(res).toEqual({ swept: 1, runIds: ["expired"] });
    expect(cancel).toHaveBeenCalledOnce();
    // the hold is fully released — no leaked reservation (REQ-SPEC-24.4)
    expect((await readBalances(db, BA)).included).toEqual({ available: 1000, held: 0 });
    const state = (await db.client.query("select state from runs where id='expired'")).rows[0];
    expect(state).toEqual({ state: "cancelled" });
  });

  it("leaves fresh parked runs untouched", async () => {
    await seedParkedHeldRun("fresh", new Date(NOW.getTime() + 24 * 60 * 60 * 1000));
    const cancel = vi.fn(async () => {});
    const res = await sweepExpiredParkedRuns(db.client, sweepDeps(cancel), NOW);
    expect(res.swept).toBe(0);
    expect(cancel).not.toHaveBeenCalled();
    expect((await readBalances(db, BA)).included).toEqual({ available: 160, held: 840 });
  });
});
