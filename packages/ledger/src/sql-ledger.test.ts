import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InsufficientBalanceError,
  absorbMeteredGap,
  meteredCredits,
  refundMeteredExcess,
  resettleRun,
  settleMeteredDebit,
  type SqlClient,
} from "@rhema/orchestrator";
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

describe("SqlHoldLedger.absorb — the platform-COGS record (DEF.2/F5; REQ-SPEC-24.8)", () => {
  it("books an adjustment(absorbed) row with NO balance effect, idempotent per episode key", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h" });
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 300, idempotencyKey: "debit:run1:p1:1" }));

    const res = await inTx((tx) =>
      led.absorb(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 65, idempotencyKey: "absorb:run1:1" }),
    );
    expect(res.ledgerId).toBeTruthy();
    const rows = (await readLedgerRows(db, "run1")) as { kind: string; reason: string | null; credits: number }[];
    const absorb = rows.find((r) => r.kind === "adjustment")!;
    expect(absorb).toMatchObject({ kind: "adjustment", reason: "absorbed", credits: 65 });
    // no balance effect: the hold − debit position is untouched by the accounting-record row.
    expect((await readBalances(db, BA)).included).toEqual({ available: 160, held: 540 });
    // a replay of the same episode key is a no-op.
    const again = await inTx((tx) =>
      led.absorb(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 65, idempotencyKey: "absorb:run1:1" }),
    );
    expect(again.ledgerId).toBe(res.ledgerId);
    expect(((await readLedgerRows(db, "run1")) as { kind: string }[]).filter((r) => r.kind === "adjustment")).toHaveLength(1);
  });
});

// -------------------------------------------------------------------------------------------------------
// ECON.1 — REQ-BILL-3 fault injection under BOTH debit modes: a run whose proxy meter inflates 3× past the
// cap must still settle to debits == cap, the overrun booked adjustment(absorbed), never a credit past the
// cap (the DB trigger would fire). `committed` and `metered` agree on the cap — the modes differ in WHO
// keeps the excess, never in whether the user can be charged past it.

async function seedProxyUsage(runId: string, credits: number): Promise<void> {
  await db.client.query(
    `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider,
                               model, model_tier, rate_table_version, list_cost_usd, credits, source)
     values ($1, now(), $2, $3, $4, 1, 'editor', 'anthropic', 'm', 'base', 1, $5, $6, 'proxy')`,
    [`u_${runId}`, WS, BA, runId, (credits / 140).toFixed(4), credits],
  );
}

async function capFixture(runId: string, metered: number): Promise<void> {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 5000 } });
  await seedRun(db, { runId, workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: `h_${runId}` });
  const led = ledger();
  await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: 840, idempotencyKey: `hold:${runId}` }));
  await seedProxyUsage(runId, metered);
}

function sums(rows: { kind: string; reason: string | null; credits: number }[]) {
  return {
    debited: rows.filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0),
    refunded: rows.filter((r) => r.kind === "refund").reduce((s, r) => s + r.credits, 0),
    absorbed: rows.filter((r) => r.kind === "adjustment" && r.reason === "absorbed").reduce((s, r) => s + r.credits, 0),
  };
}

describe("REQ-BILL-3 × debitMode (ECON.1) — the 3×-inflation settle clamps at cap under both modes", () => {
  it("committed: the metered settle debits exactly cap − debited; the overrun absorbs; Σ debits = cap", async () => {
    await capFixture("run_c", 2520); // 3× the 840 cap metered by the proxy
    const led = ledger();
    const r = await inTx((tx) =>
      resettleRun(tx, { ledger: led, debitMode: "committed" }, {
        runId: "run_c", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
      }),
    );
    expect(r.debited).toBe(2520); // requested the full gap — the LEDGER clamped the write to cap
    const s = sums(await readLedgerRows(db, "run_c") as { kind: string; reason: string | null; credits: number }[]);
    expect(s.debited).toBe(840); // == cap: the claim settled min(metered, cap)
    expect(s.absorbed).toBe(1680); // the clamped overrun booked absorbed (writeDebit's own leg)
    expect(s.refunded).toBe(0);
    expect(s.debited).toBeLessThanOrEqual(840); // Σ debits ≤ cap — always
  });

  it("metered: identical charge at cap — the above-cap overrun absorbs, no over-debit refund fires", async () => {
    await capFixture("run_m", 2520);
    const led = ledger();
    const r = await inTx((tx) =>
      resettleRun(tx, { ledger: led, debitMode: "metered" }, {
        runId: "run_m", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
      }),
    );
    const s = sums(await readLedgerRows(db, "run_m") as { kind: string; reason: string | null; credits: number }[]);
    expect(s.debited).toBe(840);
    expect(s.absorbed).toBe(1680);
    expect(s.refunded).toBe(0); // debited ≤ metered ⇒ refundMeteredExcess is a no-op
    expect(r.refunded).toBe(0);
  });

  it("metered: a settled-then-inflated run refunds the over-debit AND clamps the catch-up at cap", async () => {
    // phase commits debited 900 under committed floor semantics (the pod claim exceeded the meter);
    // the meter then settled at 632 — under `metered` the 268 excess returns to the user, and the
    // cap trigger never fires (refunds lower net debited before any further debit).
    await seedBalances(db, { billingAccountId: BA, balances: { included: 5000 } });
    await seedRun(db, { runId: "run_od", workspaceId: WS, state: "running", capCredits: 840, holdLedgerId: "h_od" });
    const led = ledger();
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_od", credits: 840, idempotencyKey: "hold:run_od" }));
    // cap-clamped commit (900 asked → 840 charged + 60 absorbed) — the floor's shape on a slow meter.
    await inTx((tx) =>
      led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_od", credits: 900, idempotencyKey: "debit:run_od:craft:1" }),
    );
    await seedProxyUsage("run_od", 632);
    const excess = await inTx((tx) =>
      refundMeteredExcess(tx, { ledger: led }, { runId: "run_od", workspaceId: WS, billingAccountId: BA, attempt: 1 }),
    );
    expect(excess).toBe(208); // debited 840 − metered 632 → the user's money returns (ADR-031)
    const s = sums(await readLedgerRows(db, "run_od") as { kind: string; reason: string | null; credits: number }[]);
    expect(s.debited - s.refunded).toBe(632); // net charge = the metered figure exactly
    expect(await inTx((tx) => meteredCredits(tx, "run_od", 1))).toBe(632);
    // the absorb path then books nothing more: the metered burn was fully paid.
    expect(
      await inTx((tx) =>
        absorbMeteredGap(tx, { ledger: led }, { runId: "run_od", workspaceId: WS, billingAccountId: BA }),
      ),
    ).toBe(0);
  });
});
