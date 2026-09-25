import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { configureAutoReload, sweepAutoReload } from "./auto-reload.js";
import { StubStripePort } from "./stripe-port.js";
import { grant } from "./entries.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// REQ-BILL-17 auto-reload — the ONLY unattended charge path. Opt-in, threshold + monthly cap, every
// outcome audited in auto_reload_events, failures mail the user.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";
const NOW = new Date("2026-09-03T00:00:00Z");
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps(NOW);

async function events() {
  return (
    await db.client.query(
      "select reason, outcome, cents, stripe_ref from auto_reload_events where billing_account_id = $1 order by at, id",
      [BA],
    )
  ).rows as { reason: string; outcome: string; cents: number; stripe_ref: string | null }[];
}

function sweepDeps(stripe: StubStripePort, sent: { reason: string }[] = []) {
  return {
    ...deps(),
    stripe,
    runTx: (ws: string, fn: (tx: SqlClient) => Promise<void>) => db.txRunner.run(ws, fn),
    notify: async (p: { reason: string }) => {
      sent.push(p);
    },
  };
}

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR });
  await db.pg.query("update billing_accounts set stripe_customer_id = 'cus_1' where id = $1", [BA]);
});
afterEach(() => db.close());

describe("configureAutoReload — opt-in validation (REQ-BILL-17)", () => {
  it("requires a typed threshold, a known pack, and a monthly cap", async () => {
    await expect(
      inTx((tx) => configureAutoReload(tx, { billingAccountId: BA, enabled: true, thresholdCredits: 0, packId: "topup_10", monthlyCapCents: 5000 })),
    ).rejects.toThrow("threshold");
    await expect(
      inTx((tx) => configureAutoReload(tx, { billingAccountId: BA, enabled: true, thresholdCredits: 50, packId: "nope", monthlyCapCents: 5000 })),
    ).rejects.toThrow("top-up pack");
    await expect(
      inTx((tx) => configureAutoReload(tx, { billingAccountId: BA, enabled: true, thresholdCredits: 50, packId: "topup_10", monthlyCapCents: 0 })),
    ).rejects.toThrow("monthly cap");
    await inTx((tx) =>
      configureAutoReload(tx, { billingAccountId: BA, enabled: true, thresholdCredits: 50, packId: "topup_10", monthlyCapCents: 5000 }),
    );
    const row = (
      await db.client.query("select auto_reload_enabled, auto_reload_threshold_credits from billing_accounts where id = $1", [BA])
    ).rows[0] as { auto_reload_enabled: boolean; auto_reload_threshold_credits: number };
    expect(row.auto_reload_enabled).toBe(true);
    expect(row.auto_reload_threshold_credits).toBe(50);
  });
});

describe("sweepAutoReload", () => {
  async function optIn(capCents = 100_000) {
    await inTx((tx) =>
      configureAutoReload(tx, {
        billingAccountId: BA,
        enabled: true,
        thresholdCredits: 100,
        packId: "topup_10", // $10 / 1,000 credits
        monthlyCapCents: capCents,
      }),
    );
  }

  it("charges the pack off-session and grants topup credits when below the threshold", async () => {
    await optIn();
    await inTx((tx) =>
      grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 40, idempotencyKey: "g:1" }),
    );
    const stripe = new StubStripePort();
    const res = await sweepAutoReload(db.client, sweepDeps(stripe), NOW);
    expect(res).toEqual({ attempted: 1, charged: 1, skipped: 0, failed: 0 });
    expect(stripe.calls.filter((c) => c.method === "chargeOffSession")).toHaveLength(1);
    expect((await readBalances(db, BA)).topup.available).toBe(1000);
    const ev = await events();
    expect(ev).toEqual([{ reason: "below_threshold", outcome: "charged", cents: 1000, stripe_ref: "pi_stub" }]);
    // the monthly counter advanced
    const acc = (
      await db.client.query("select auto_reload_spend_cents::int as s, auto_reload_month from billing_accounts where id = $1", [BA])
    ).rows[0] as { s: number; auto_reload_month: string };
    expect(acc.s).toBe(1000);
    expect(acc.auto_reload_month).toBe(NOW.toISOString().slice(0, 7));
  });

  it("does nothing at/above the threshold", async () => {
    await optIn();
    await inTx((tx) =>
      grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 500, idempotencyKey: "g:1" }),
    );
    const stripe = new StubStripePort();
    const res = await sweepAutoReload(db.client, sweepDeps(stripe), NOW);
    expect(res.attempted).toBe(0);
    expect(stripe.calls).toHaveLength(0);
    expect(await events()).toHaveLength(0);
  });

  it("the monthly cap blocks the charge with an audited skip", async () => {
    await optIn(500); // $5 cap — a $10 pack can't fit
    const stripe = new StubStripePort();
    const res = await sweepAutoReload(db.client, sweepDeps(stripe), NOW);
    expect(res).toEqual({ attempted: 1, charged: 0, skipped: 1, failed: 0 });
    expect(stripe.calls).toHaveLength(0); // never charged over the cap
    expect((await events())[0]).toMatchObject({ reason: "monthly_cap", outcome: "skipped" });
  });

  it("a missing payment method skips with an audit row", async () => {
    await db.pg.query("update billing_accounts set stripe_customer_id = null where id = $1", [BA]);
    await optIn();
    const stripe = new StubStripePort();
    const res = await sweepAutoReload(db.client, sweepDeps(stripe), NOW);
    expect(res.skipped).toBe(1);
    expect((await events())[0]).toMatchObject({ reason: "no_payment_method", outcome: "skipped" });
  });

  it("a failed charge audits 'failed' and mails the user — no silent retry loop", async () => {
    await optIn();
    const stripe = new StubStripePort();
    stripe.primeCharge({ paymentIntentId: "pi_fail", status: "failed", declineCode: "card_declined" });
    const sent: { reason: string }[] = [];
    const res = await sweepAutoReload(db.client, sweepDeps(stripe, sent), NOW);
    expect(res.failed).toBe(1);
    expect((await events())[0]).toMatchObject({ reason: "payment_failed", outcome: "failed" });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.reason).toContain("auto-reload payment failed");
    // no grant landed
    expect((await readBalances(db, BA)).topup).toBeUndefined();
  });

  it("a suspended account never gets an unattended charge", async () => {
    await optIn();
    await db.pg.query("update billing_accounts set suspended_at = now() where id = $1", [BA]);
    const stripe = new StubStripePort();
    const res = await sweepAutoReload(db.client, sweepDeps(stripe), NOW);
    expect(res.attempted).toBe(0);
    expect(stripe.calls).toHaveLength(0);
  });
});
