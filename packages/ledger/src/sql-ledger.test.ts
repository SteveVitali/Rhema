import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InsufficientBalanceError, type SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
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

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

function ledger() {
  return new SqlHoldLedger(testEntryDeps());
}
/** Run one op inside a tenant-scoped transaction (as the orchestrator would). */
function inTx<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.txRunner.run(WS, fn);
}

describe("SqlHoldLedger.hold", () => {
  it("reserves the cap across buckets in consumption order, moving available → held", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { trial_pocket: 100, included: 900, topup: 500 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "queued", capCredits: 840 });
    const led = ledger();

    const res = await inTx((tx) =>
      led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }),
    );
    expect(res.bucket).toBe("trial_pocket"); // the primary (first-drawn) bucket

    const bal = await readBalances(db, BA);
    // 100 from trial_pocket, then 740 from included; topup untouched.
    expect(bal.trial_pocket).toEqual({ available: 0, held: 100 });
    expect(bal.included).toEqual({ available: 160, held: 740 });
    expect(bal.topup).toEqual({ available: 500, held: 0 });
  });

  it("rejects with InsufficientBalanceError (never bills) when the total balance cannot fit the cap", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 300, topup: 200 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "queued", capCredits: 840 });
    const led = ledger();
    await expect(
      inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" })),
    ).rejects.toBeInstanceOf(InsufficientBalanceError);
    // no ledger rows, balance untouched
    expect(await readLedgerRows(db, "run1")).toHaveLength(0);
    expect((await readBalances(db, BA)).included.available).toBe(300);
  });

  it("AC2 (row lock): two runs the balance can only fit once — exactly one hold succeeds", async () => {
    // The `select … for update` on the billing account serializes two concurrent holds so they cannot both
    // read the same balance and both fit (REQ-SPEC-24.2; §12.4 step 2). PGlite is single-connection, so we
    // assert the serialized outcome the lock guarantees: the second hold sees the balance the first reserved
    // and cannot fit.
    await seedBalances(db, { billingAccountId: BA, balances: { included: 840 } }); // fits exactly one 840 cap
    await seedRun(db, { runId: "runA", workspaceId: WS, state: "queued", capCredits: 840 });
    await seedRun(db, { runId: "runB", workspaceId: WS, state: "queued", capCredits: 840 });
    const led = ledger();

    const outcomes: ("ok" | "insufficient")[] = [];
    for (const runId of ["runA", "runB"]) {
      try {
        await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: 840, idempotencyKey: `hold:${runId}` }));
        outcomes.push("ok");
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientBalanceError);
        outcomes.push("insufficient");
      }
    }
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "insufficient")).toHaveLength(1);
    // the balance is fully held by the winner, never double-committed
    expect((await readBalances(db, BA)).included).toEqual({ available: 0, held: 840 });
  });

  it("holds against the entitlement (not credits) for a trial run and consumes it", async () => {
    await db.pg.query(
      "insert into trial_entitlements(id, billing_account_id, state) values ('ent1',$1,'unused')",
      [BA],
    );
    const led = ledger();
    const res = await inTx((tx) =>
      led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1", entitlementId: "ent1" }),
    );
    expect(res.bucket).toBe("trial_pocket");
    expect(await readLedgerRows(db, "run1")).toHaveLength(0); // no credit rows on an entitlement run
    const ent = (await db.client.query("select state, consumed_by_run_id from trial_entitlements where id='ent1'")).rows[0];
    expect(ent).toEqual({ state: "consumed", consumed_by_run_id: "run1" });
  });

  it("an entitlement run never touches the credit ledger on debit (Included; §14.3)", async () => {
    await db.pg.query("insert into trial_entitlements(id, billing_account_id, state) values ('ent1',$1,'unused')", [BA]);
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840 });
    await db.txRunner.run(WS, (tx) => tx.query("update runs set entitlement_id = 'ent1' where id = 'run1'"));
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1", entitlementId: "ent1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 300, idempotencyKey: "debit:run1:p1:1" }));
    // no credit_ledger rows at all — not a debit, not an absorbed adjustment (would pollute the breaker).
    expect(await readLedgerRows(db, "run1")).toHaveLength(0);
  });

  it("is idempotent — a repeated hold with the same key does not double-reserve", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 900 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "queued", capCredits: 840 });
    const led = ledger();
    const a = await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    const b = await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    expect(b.ledgerId).toBe(a.ledgerId);
    expect((await readBalances(db, BA)).included).toEqual({ available: 60, held: 840 });
  });
});

describe("SqlHoldLedger.debit — cap clamp + absorbed adjustment (REQ-BILL-3; AC1)", () => {
  async function heldRun(cap: number) {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 5000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: cap });
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: cap, idempotencyKey: "hold:run1" }));
    return led;
  }

  it("debits the actual cost when under cap", async () => {
    const led = await heldRun(840);
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 312, idempotencyKey: "debit:run1:p1:1" }));
    const rows = await readLedgerRows(db, "run1");
    expect(rows.filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0)).toBe(312);
    expect(rows.some((r) => r.kind === "adjustment")).toBe(false);
    // held drops by the debit; total spend = 312
    expect((await readBalances(db, BA)).included).toEqual({ available: 4160, held: 528 });
  });

  it("fault-injected 3× usage yields debits == cap + an adjustment(absorbed) row (never over-charged)", async () => {
    const led = await heldRun(840);
    // one phase reports 3× the cap; the clamp charges the cap and absorbs the rest.
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 2520, idempotencyKey: "debit:run1:p1:1" }));
    const rows = await readLedgerRows(db, "run1");
    const debited = rows.filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0);
    const absorbed = rows.filter((r) => r.kind === "adjustment" && r.reason === "absorbed").reduce((s, r) => s + r.credits, 0);
    expect(debited).toBe(840); // exactly the cap
    expect(absorbed).toBe(1680); // 2520 − 840, booked to the variance reserve
    // a second phase at the cap debits nothing and absorbs it all
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p2", credits: 500, idempotencyKey: "debit:run1:p2:1" }));
    const rows2 = await readLedgerRows(db, "run1");
    expect(rows2.filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0)).toBe(840);
    expect(rows2.filter((r) => r.kind === "adjustment").reduce((s, r) => s + r.credits, 0)).toBe(2180);
  });

  it("is idempotent on the debit key across retries (no double charge)", async () => {
    const led = await heldRun(840);
    for (let i = 0; i < 3; i++) {
      await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 312, idempotencyKey: "debit:run1:p1:1" }));
    }
    const debited = (await readLedgerRows(db, "run1")).filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0);
    expect(debited).toBe(312);
  });
});

describe("the cap-guarantee DB trigger is an assertion that must never fire (REQ-BILL-3)", () => {
  it("rejects a raw debit that would push net debits past the cap", async () => {
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840 });
    // a debit exactly at the cap is allowed
    await expect(
      inTx((tx) =>
        tx.query(
          `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
           values ('l_ok',$1,$2,'debit',840,'included','run1','run','k_ok', now())`,
          [WS, BA],
        ),
      ),
    ).resolves.toBeDefined();
    // one credit past the cap fires the assertion (bypassing the clamp is a bug, surfaced loudly)
    await expect(
      inTx((tx) =>
        tx.query(
          `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
           values ('l_bad',$1,$2,'debit',1,'included','run1','run','k_bad', now())`,
          [WS, BA],
        ),
      ),
    ).rejects.toThrow(/exceed cap/);
  });
});

describe("SqlHoldLedger.release + refund", () => {
  it("release returns the run's unused held to available (≤60 s of terminal; REQ-RUN-13)", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 500, idempotencyKey: "debit:run1:p1:1" }));
    await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", holdLedgerId: "h", idempotencyKey: "release:run1" }));
    // spent 500; the other 340 of the hold returned; final available 500.
    expect((await readBalances(db, BA)).included).toEqual({ available: 500, held: 0 });
  });

  it("refund gives a failed run's debits back to available (full make-whole with release)", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 300, idempotencyKey: "debit:run1:p1:1" }));
    // failed run: refund debits, release the rest.
    await inTx((tx) => led.refund(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 300, idempotencyKey: "refund:run1" }));
    await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", holdLedgerId: "h", idempotencyKey: "release:run1" }));
    expect((await readBalances(db, BA)).included).toEqual({ available: 1000, held: 0 }); // whole again
  });
});
