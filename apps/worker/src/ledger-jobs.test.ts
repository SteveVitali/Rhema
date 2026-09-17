import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeDeps } from "@rhema/orchestrator/testing";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  readLedgerRows,
  type LedgerTestDb,
} from "@rhema/ledger/testing";
import { SqlHoldLedger, refundPhases } from "@rhema/ledger";
import type { SqlClient } from "@rhema/orchestrator";
import { handleParkedSweep, reDebitOnResume, type WorkerLedgerDeps } from "./ledger-jobs.js";

// D-P0.11-1 (PRB.14) — the WORKER call-sites for the ledger ops (the ops' semantics live in
// @rhema/ledger's tests; this file proves the deploy wiring):
//  • `reDebitOnResume` — invoked from the `run.resume` consumer in main.ts BEFORE the relaunched task's new
//    phase work is debited, keyed `resume:<runId>:<attempt>` per episode. These tests drive it against a real
//    SqlHoldLedger on PGlite: refund → resume re-debits, a repeated call is a no-op, and a second
//    refund→resume EPISODE re-debits again (the key's per-episode shape is what keeps the cycle honest).
//  • `handleParkedSweep` — the `run.sweep_parked` cron handler: a parked run past its 30-day deadline is
//    cancelled through the ordinary transition and its hold released in the same tx.

let db: LedgerTestDb;
let ledger: SqlHoldLedger;
let deps: WorkerLedgerDeps;
const WS = "ws_seed";
const BA = "ba_seed";
const NOW = new Date("2026-10-05T00:00:00Z");

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
  ledger = new SqlHoldLedger(testEntryDeps(NOW));
  deps = { ...makeDeps(db, { now: NOW }), ledger, systemExec: db.client };
});
afterEach(() => db.close());

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

async function seedHeldRun(runId: string, state: string, capCredits = 840): Promise<void> {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
  await seedRun(db, { runId, workspaceId: WS, state, capCredits, holdLedgerId: `h_${runId}` });
  await inTx((tx) =>
    ledger.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: capCredits, idempotencyKey: `hold:${runId}` }),
  );
}

describe("reDebitOnResume — the run.resume call-site (REQ-SPEC-24.6)", () => {
  it("re-debits the refunded phases under the per-episode resume:<run>:<attempt> key", async () => {
    await seedHeldRun("run1", "waiting_gate");
    await inTx((tx) => ledger.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) => ledger.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p2", credits: 150, idempotencyKey: "debit:run1:p2:1" }));
    // a stop refunded p1 (partial refund episode 1)
    await inTx((tx) =>
      refundPhases(tx, testEntryDeps(NOW), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:1" }),
    );

    // the call-site resolves the billing account itself and applies the resume:run1:2 episode key
    const out = (await reDebitOnResume(deps, { runId: "run1", workspaceId: WS, attempt: 2 })) as { phaseId: string; credits: number }[];
    expect(out).toEqual([{ phaseId: "p1", credits: 100 }]);
    const rows = await readLedgerRows(db, "run1");
    expect(rows.filter((r) => r.kind === "debit" && r.reason === "re-debit")).toHaveLength(1);
  });

  it("a second call for the SAME attempt is a no-op; a refund→resume→refund→resume cycle re-debits each episode", async () => {
    await seedHeldRun("run1", "waiting_gate");
    await inTx((tx) => ledger.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) =>
      refundPhases(tx, testEntryDeps(NOW), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:1" }),
    );

    await reDebitOnResume(deps, { runId: "run1", workspaceId: WS, attempt: 2 });
    const replay = (await reDebitOnResume(deps, { runId: "run1", workspaceId: WS, attempt: 2 })) as { phaseId: string; credits: number }[];
    expect(replay).toEqual([{ phaseId: "p1", credits: 0 }]); // same episode ⇒ nothing left to re-charge

    // Episode 2: refunded again after the resume — the NEXT attempt's key re-debits it again.
    await inTx((tx) =>
      refundPhases(tx, testEntryDeps(NOW), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:3" }),
    );
    const again = (await reDebitOnResume(deps, { runId: "run1", workspaceId: WS, attempt: 4 })) as { phaseId: string; credits: number }[];
    expect(again).toEqual([{ phaseId: "p1", credits: 100 }]);
    const reDebits = (await readLedgerRows(db, "run1")).filter((r) => r.kind === "debit" && r.reason === "re-debit");
    expect(reDebits).toHaveLength(2); // one row per episode — never silently deduped across cycles
  });

  it("a run with no refunds is a no-op (the common resume)", async () => {
    await seedHeldRun("run1", "waiting_gate");
    const out = (await reDebitOnResume(deps, { runId: "run1", workspaceId: WS, attempt: 2 })) as unknown[];
    expect(out).toEqual([]);
  });
});

describe("handleParkedSweep — the run.sweep_parked cron handler (REQ-SPEC-24.4)", () => {
  it("cancels a parked run past its deadline and releases its hold in the same pass", async () => {
    await seedHeldRun("run_parked", "waiting_gate");
    await db.txRunner.run(WS, (tx) =>
      tx.query("update runs set parked_until = $2 where id = $1", ["run_parked", new Date(NOW.getTime() - 1000)]),
    );

    const result = await handleParkedSweep(deps);
    expect(result).toEqual({ swept: 1, runIds: ["run_parked"] });

    const state = (await db.client.query("select state from runs where id = 'run_parked'", [])).rows[0] as { state: string };
    expect(state.state).toBe("cancelled");
    // the hold released: the account's held bucket drains back to available
    const bal = await readBalances(db, BA);
    expect(bal.included).toEqual({ available: 1000, held: 0 });
  });

  it("leaves a still-parked run alone (deadline in the future)", async () => {
    await seedHeldRun("run_fresh", "awaiting_consent");
    await db.txRunner.run(WS, (tx) =>
      tx.query("update runs set parked_until = $2 where id = $1", ["run_fresh", new Date(NOW.getTime() + 86_400_000)]),
    );
    const result = await handleParkedSweep(deps);
    expect(result).toEqual({ swept: 0, runIds: [] });
    expect(((await db.client.query("select state from runs where id = 'run_fresh'", [])).rows[0] as { state: string }).state).toBe("awaiting_consent");
  });
});
