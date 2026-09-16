import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryQueue, InMemoryEventWriter, AccountSuspendedError, type SqlClient } from "@rhema/orchestrator";
import { insertStripeEvent, processStripeEvent, RUN_DELIVER_JOB, type StripeEventDeps } from "./stripe.js";
import { applyChargeback, applyDisputeWon } from "./chargeback.js";
import { applyLedgerEntry } from "./entries.js";
import { SqlHoldLedger } from "./sql-ledger.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.08 — AC5: the chargeback fixture (REQ-SPEC-24.7; §14.6 failure states). A dispute suspends the account
// (new holds refuse), claws the disputed credits back newest-money-first (the already-spent remainder becomes
// clawback_debt — balances never go negative), cancels queued/parked runs WITH hold release, and withholds
// in-flight deliveries. A won dispute restores, reinstates, and re-drives the stashed deliveries.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const NOW = new Date("2026-09-20T12:00:00Z");

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

function inTx<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.txRunner.run(WS, fn);
}

function deps(queue = new InMemoryQueue()): StripeEventDeps & { queue: InMemoryQueue } {
  const d = testEntryDeps(NOW);
  return {
    ...d,
    ledger: new SqlHoldLedger(d),
    runTx: (workspaceId, fn) => db.txRunner.run(workspaceId, fn),
    eventWriter: new InMemoryEventWriter(),
    queue,
  };
}

/** Seed the topup grant whose stripe_ref is how a dispute resolves this account (processStripeEvent path). */
async function seedDisputedTopup(paymentIntent = "pi_disputed") {
  await inTx((tx) =>
    applyLedgerEntry(tx, testEntryDeps(), {
      workspaceId: WS, billingAccountId: BA,
      kind: "grant", credits: 500, bucket: "topup", source: "stripe", reason: "topup",
      stripeRef: paymentIntent, idempotencyKey: `stripe:checkout:cs_disputed`,
    }),
  );
}

/** Place a real hold for a run and pin it on the run row (what run-creation does). */
async function holdFor(runId: string, credits: number) {
  const led = new SqlHoldLedger(testEntryDeps());
  const h = await inTx((tx) =>
    led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits, idempotencyKey: `hold:${runId}` }),
  );
  await inTx((tx) => tx.query("update runs set hold_ledger_id = $2 where id = $1", [runId, h.ledgerId]));
}

async function runRow(runId: string) {
  return (await db.client.query("select state, delivery_withheld_at from runs where id = $1", [runId])).rows[0] as
    | { state: string; delivery_withheld_at: string | null }
    | undefined;
}
async function account() {
  return (await db.client.query("select suspended_at, clawback_debt::int as debt from billing_accounts where id = $1", [BA])).rows[0] as {
    suspended_at: string | null; debt: number;
  };
}
async function clawbackRows() {
  return (
    await db.client.query(
      "select kind, bucket, credits, stripe_ref, reason from credit_ledger where billing_account_id = $1 and reason like 'chargeback%' order by at, id",
      [BA],
    )
  ).rows as { kind: string; bucket: string; credits: number; stripe_ref: string | null; reason: string }[];
}

describe("applyChargeback (AC5)", () => {
  beforeEach(async () => {
    await seedDisputedTopup(); // topup available 500
    await seedBalances(db, { billingAccountId: BA, balances: { promo: 200, included: 300 } });
    // one run per lifecycle class the chargeback treats differently
    await seedRun(db, { runId: "run_queued", workspaceId: WS, state: "queued", capCredits: 100 });
    await holdFor("run_queued", 100); // promo 200 → 100 avail / 100 held
    await seedRun(db, { runId: "run_parked", workspaceId: WS, state: "waiting_gate", capCredits: 50 });
    await holdFor("run_parked", 50); // promo 100 → 50 avail / 150 held
    await seedRun(db, { runId: "run_inflight", workspaceId: WS, state: "finalizing", capCredits: 40 });
    await holdFor("run_inflight", 40); // included 300 → 260 avail / 40 held
    // available now: topup 500, promo 50, included 260 (held: promo 150, included 40)
  });

  it("suspends, claws newest-money-first, cancels queued/parked with release, withholds in-flight", async () => {
    const res = await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1", credits: 700 });

    expect(res.suspended).toBe(true);
    expect(res.clawed).toBe(700); // topup 500 + promo 50 + included 150 — available only, never held
    expect(res.debt).toBe(0);
    expect(res.cancelled.sort()).toEqual(["run_parked", "run_queued"]);
    expect(res.withheld).toEqual(["run_inflight"]);

    const acct = await account();
    expect(acct.suspended_at).not.toBeNull();
    expect(acct.debt).toBe(0);

    // queued + parked cancelled, their holds released back to available; in-flight keeps its hold.
    expect((await runRow("run_queued"))!.state).toBe("cancelled");
    expect((await runRow("run_parked"))!.state).toBe("cancelled");
    expect((await runRow("run_inflight"))!.state).toBe("finalizing");
    expect((await runRow("run_inflight"))!.delivery_withheld_at).not.toBeNull();

    const bal = await readBalances(db, BA);
    expect(bal.topup).toEqual({ available: 0, held: 0 });
    expect(bal.included).toEqual({ available: 110, held: 0 }); // 300 − 190 clawed
    expect(bal.promo).toEqual({ available: 150, held: 40 }); // 10 − 10 clawed + 150 released; the withheld run's hold intact

    // clawback rows: expire kind, stripe_ref = the dispute id, newest-money-first (topup → promo → included).
    const rows = await clawbackRows();
    expect(rows.map((r) => r.bucket)).toEqual(["topup", "promo", "included"]);
    expect(rows.every((r) => r.kind === "expire" && r.stripe_ref === "dp_1" && r.reason === "chargeback_clawback")).toBe(true);
  });

  it("the already-spent remainder becomes clawback_debt — balances never go negative", async () => {
    const res = await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_big", credits: 5000 });
    expect(res.clawed).toBe(810); // everything available
    expect(res.debt).toBe(4190); // the spent remainder is owed, not negative-booked
    expect((await account()).debt).toBe(4190);
    const bal = await readBalances(db, BA);
    for (const b of Object.values(bal)) expect(b.available).toBeGreaterThanOrEqual(0);
  });

  it("a suspended account takes no NEW holds (AccountSuspendedError)", async () => {
    await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1", credits: 10 });
    await seedRun(db, { runId: "run_new", workspaceId: WS, state: "queued", capCredits: 10 });
    const led = new SqlHoldLedger(testEntryDeps());
    await expect(
      inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_new", credits: 10, idempotencyKey: "hold:run_new" })),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it("a replayed dispute id is a no-op (suspend stays; balances/debt untouched)", async () => {
    const first = await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1", credits: 700 });
    const second = await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1", credits: 700 });
    expect(first.clawed).toBe(700);
    expect(second.clawed).toBe(0);
    expect((await clawbackRows())).toHaveLength(3); // no second claw set
    // the cancel/withhold arms re-scan idempotently — the runs are already terminal/withheld.
    expect(second.cancelled).toHaveLength(0);
    expect((await account()).suspended_at).not.toBeNull();
  });
});

describe("the Stripe event path (dispute events through processStripeEvent)", () => {
  beforeEach(async () => {
    await seedDisputedTopup();
    await seedBalances(db, { billingAccountId: BA, balances: { included: 300 } });
    await seedRun(db, { runId: "run_queued", workspaceId: WS, state: "queued", capCredits: 100 });
    await holdFor("run_queued", 100); // promo empty → included 300 → 200 avail / 100 held
    await seedRun(db, { runId: "run_inflight", workspaceId: WS, state: "running", capCredits: 40 });
  });

  it("charge.dispute.created resolves the account via the topup grant's stripe_ref (payment intent)", async () => {
    const payload = {
      id: "evt_dp",
      type: "charge.dispute.created",
      data: { object: { id: "dp_1", amount: 600, status: "needs_response", payment_intent: "pi_disputed" } },
    };
    await insertStripeEvent(db.client, { id: "evt_dp", type: payload.type, payload, receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_dp");
    expect(out.kind).toBe("chargeback");
    if (out.kind !== "chargeback") return;
    expect(out.billingAccountId).toBe(BA);
    expect(out.cancelled).toEqual(["run_queued"]);
    expect(out.withheld).toEqual(["run_inflight"]);
    // 600 disputed: topup 500 + included 100 (avail 200) → debt 0
    expect(out.clawed).toBe(600);
    expect(out.debt).toBe(0);
  });

  it("charge.dispute.closed won restores the clawed credits, clears debt+suspension, re-drives withheld runs", async () => {
    // the dispute first
    await insertStripeEvent(db.client, {
      id: "evt_dp", type: "charge.dispute.created", receivedAt: NOW,
      payload: { id: "evt_dp", type: "charge.dispute.created", data: { object: { id: "dp_1", amount: 600, payment_intent: "pi_disputed" } } },
    });
    await processStripeEvent(db.client, deps(), "evt_dp");
    const queue = new InMemoryQueue();
    // mark the withheld run's stash (what the refused deliverRun writes)
    await inTx((tx) => tx.query("update runs set pending_delivery = $1::jsonb where id = 'run_inflight'", [JSON.stringify({ stashed: true })]));
    // then the win
    const won = {
      id: "evt_won", type: "charge.dispute.closed",
      data: { object: { id: "dp_1", status: "won", payment_intent: "pi_disputed" } },
    };
    await insertStripeEvent(db.client, { id: "evt_won", type: won.type, payload: won, receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(queue), "evt_won");
    expect(out.kind).toBe("dispute_won");
    if (out.kind !== "dispute_won") return;
    expect(out.restored).toBe(600); // the clawed amount re-granted
    expect(out.redeliver).toEqual(["run_inflight"]);

    const acct = await account();
    expect(acct.suspended_at).toBeNull();
    expect(acct.debt).toBe(0);
    expect((await readBalances(db, BA)).topup.available).toBe(600); // restored as topup money
    expect((await runRow("run_inflight"))!.delivery_withheld_at).toBeNull();
    // the run.deliver re-drive went out for the withheld run (the stash is consumed by the job).
    const redrives = queue.ofName(RUN_DELIVER_JOB);
    expect(redrives).toHaveLength(1);
    expect(redrives[0]!.payload).toMatchObject({ runId: "run_inflight", workspaceId: WS });
  });

  it("a lost/withdrawn dispute keeps the suspension + debt (the operator settles)", async () => {
    await insertStripeEvent(db.client, {
      id: "evt_dp", type: "charge.dispute.created", receivedAt: NOW,
      payload: { id: "evt_dp", type: "charge.dispute.created", data: { object: { id: "dp_1", amount: 600, payment_intent: "pi_disputed" } } },
    });
    await processStripeEvent(db.client, deps(), "evt_dp");
    const lost = {
      id: "evt_lost", type: "charge.dispute.closed",
      data: { object: { id: "dp_1", status: "lost", payment_intent: "pi_disputed" } },
    };
    await insertStripeEvent(db.client, { id: "evt_lost", type: lost.type, payload: lost, receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_lost");
    expect(out.kind).toBe("ignored");
    expect((await account()).suspended_at).not.toBeNull(); // still suspended
    expect((await readBalances(db, BA)).topup.available).toBe(0); // no restore
  });
});

describe("applyDisputeWon directly", () => {
  it("is idempotent — a replayed won event restores nothing twice", async () => {
    await seedDisputedTopup();
    await applyChargeback(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1", credits: 500 });
    const a = await applyDisputeWon(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1" });
    const b = await applyDisputeWon(db.client, deps(), { billingAccountId: BA, disputeId: "dp_1" });
    expect(a.restored).toBe(500);
    expect(b.restored).toBe(0);
    expect((await readBalances(db, BA)).topup.available).toBe(500);
  });
});
