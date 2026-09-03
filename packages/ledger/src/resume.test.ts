import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import { refundPhases, reDebitRefundedPhases } from "./resume.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  readLedgerRows,
  type LedgerTestDb,
} from "./testing/index.js";

// AC5 (§12.4 step 9; REQ-SPEC-24.6): a user stop debits completed phases and releases the rest; a refunded
// partial that is later resumed re-debits its refunded phases first.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps();

describe("stop-mid-run: completed phases debited, the rest released", () => {
  it("debits the three completed phases and releases the remaining hold", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = new SqlHoldLedger(deps());
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    // three completed phases
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p2", credits: 120, idempotencyKey: "debit:run1:p2:1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p3", credits: 92, idempotencyKey: "debit:run1:p3:1" }));
    // user stops → release the rest of the hold
    await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", holdLedgerId: "h", idempotencyKey: "release:run1" }));

    const debited = (await readLedgerRows(db, "run1")).filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0);
    expect(debited).toBe(312); // 100 + 120 + 92
    // spent 312 of 1000; the unused 528 of the hold is released; nothing left held.
    expect((await readBalances(db, BA)).included).toEqual({ available: 688, held: 0 });
  });
});

describe("resume-after-refund re-debits the refunded phases first (REQ-SPEC-24.6)", () => {
  it("refunds a phase then re-debits exactly that phase on resume", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = new SqlHoldLedger(deps());
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p2", credits: 150, idempotencyKey: "debit:run1:p2:1" }));

    // Refund only p1 (a partial refund, e.g. the completed-run window / a stop that returns one phase).
    const refunded = await inTx((tx) => refundPhases(tx, deps(), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:1" }));
    expect(refunded).toEqual([{ phaseId: "p1", credits: 100 }]);
    // net charge now 150 (only p2); p1 is refunded.
    let rows = await readLedgerRows(db, "run1");
    expect(rows.filter((r) => r.kind === "refund" && r.phase_id === "p1").reduce((s, r) => s + r.credits, 0)).toBe(100);

    // Resume: re-debit the refunded phases FIRST. Only p1 was refunded, so only p1 is re-charged.
    const reDebited = await inTx((tx) => reDebitRefundedPhases(tx, led, { workspaceId: WS, billingAccountId: BA, runId: "run1", idempotencyKey: "resume:run1:2" }));
    expect(reDebited).toEqual([{ phaseId: "p1", credits: 100 }]);

    rows = await readLedgerRows(db, "run1");
    // p1 carries a re-debit row; net charge for p1 is back to 100; p2 untouched at 150.
    const reDebitRow = rows.find((r) => r.kind === "debit" && r.reason === "re-debit" && r.phase_id === "p1");
    expect(reDebitRow?.credits).toBe(100);
    const netP1 = rows.filter((r) => r.phase_id === "p1").reduce((s, r) => s + (r.kind === "debit" ? r.credits : r.kind === "refund" ? -r.credits : 0), 0);
    const netP2 = rows.filter((r) => r.phase_id === "p2").reduce((s, r) => s + (r.kind === "debit" ? r.credits : r.kind === "refund" ? -r.credits : 0), 0);
    expect(netP1).toBe(100);
    expect(netP2).toBe(150);
    // total net charge = 250, well under the 840 cap; the trigger never fired.
    expect(netP1 + netP2).toBe(250);
  });

  it("re-debit is idempotent — a repeat does not re-charge an already-recharged phase", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = new SqlHoldLedger(deps());
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) => refundPhases(tx, deps(), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:1" }));
    // two re-debits of the SAME resume episode (same key) — the second is a no-op.
    await inTx((tx) => reDebitRefundedPhases(tx, led, { workspaceId: WS, billingAccountId: BA, runId: "run1", idempotencyKey: "resume:run1:2" }));
    const second = await inTx((tx) => reDebitRefundedPhases(tx, led, { workspaceId: WS, billingAccountId: BA, runId: "run1", idempotencyKey: "resume:run1:2" }));
    expect(second).toEqual([{ phaseId: "p1", credits: 0 }]); // nothing left to re-debit within this episode
    const reDebits = (await readLedgerRows(db, "run1")).filter((r) => r.kind === "debit" && r.reason === "re-debit");
    expect(reDebits).toHaveLength(1);
  });

  it("survives repeated refund → resume → refund cycles without losing money (review #1/#2)", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = new SqlHoldLedger(deps());
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 100, idempotencyKey: "debit:run1:p1:1" }));

    // Episode 1: refund p1, resume re-debits it.
    const r1 = await inTx((tx) => refundPhases(tx, deps(), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:1" }));
    expect(r1).toEqual([{ phaseId: "p1", credits: 100 }]);
    await inTx((tx) => reDebitRefundedPhases(tx, led, { workspaceId: WS, billingAccountId: BA, runId: "run1", idempotencyKey: "resume:run1:2" }));

    // Episode 2: refund p1 AGAIN — a distinct episode key, so it must actually refund (not silently dedupe).
    const r2 = await inTx((tx) => refundPhases(tx, deps(), { workspaceId: WS, billingAccountId: BA, runId: "run1", phaseIds: ["p1"], idempotencyKey: "refund:run1:3" }));
    expect(r2).toEqual([{ phaseId: "p1", credits: 100 }]); // the re-debited 100 is genuinely returned

    // net charge for p1 is back to 0; the user is not out any credits from the churn.
    const rows = await readLedgerRows(db, "run1");
    const netP1 = rows.filter((r) => r.phase_id === "p1").reduce((s, r) => s + (r.kind === "debit" ? r.credits : r.kind === "refund" ? -r.credits : 0), 0);
    expect(netP1).toBe(0);
    // release the rest of the hold; the account returns whole (started at 1000).
    await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", holdLedgerId: "h", idempotencyKey: "release:run1" }));
    expect((await readBalances(db, BA)).included).toEqual({ available: 1000, held: 0 });
  });
});
