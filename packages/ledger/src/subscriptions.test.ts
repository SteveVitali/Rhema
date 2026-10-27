import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { planOf } from "@rhema/contracts";
import {
  activateSubscription,
  applyRenewalPaid,
  applyRenewalFailed,
  syncSubscription,
  endSubscription,
  changePlan,
  grantIncludedCredits,
  effectivePlanTier,
  runBillingPeriodTick,
  requestCancellation,
  RENEWAL_GRACE_MS,
  type SubDeps,
} from "./subscriptions.js";
import { StubStripePort, StripeRequestError } from "./stripe-port.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// §14.2/14.6 subscription lifecycle — activate, renew, fail→grace→Free, plan changes, the hourly period
// tick (included grants idempotent per period, scheduled downgrades, daily Free allowance, rollover cap).

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";
const NOW = new Date("2026-09-03T00:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const P0 = new Date("2026-09-01T00:00:00Z");
const P1 = new Date("2026-10-01T00:00:00Z");
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps(NOW);
const subDeps = (sent: { reason: string }[] = []): SubDeps => ({
  ...deps(),
  runTx: (ws, fn) => db.txRunner.run(ws, fn),
  notify: async (p) => {
    sent.push(p);
  },
});

async function subRow() {
  return (
    await db.client.query("select * from subscriptions where billing_account_id = $1 order by created_at desc limit 1", [BA])
  ).rows[0] as Record<string, unknown> | undefined;
}

beforeEach(async () => {
  db = await createLedgerTestDb();
  // plan:null — these tests own the subscription lifecycle themselves (no seeded paid row).
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR, plan: null });
});
afterEach(() => db.close());

describe("activateSubscription", () => {
  it("creates the row, records the Stripe ids, and grants the first period's included credits", async () => {
    const out = await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        stripeCustomerId: "cus_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
    expect(out.applied).toBe(true);
    const s = await subRow();
    expect(s?.tier).toBe("writer");
    expect(s?.status).toBe("active");
    expect(s?.stripe_customer_id).toBe("cus_1");
    expect((await readBalances(db, BA)).included).toEqual({
      available: planOf("writer").includedCreditsMonthly,
      held: 0,
    });
    expect(await inTx((tx) => effectivePlanTier(tx, BA))).toBe("writer");
  });

  it("is idempotent on the Stripe subscription id — a redelivered event does not double-grant", async () => {
    const args = {
      workspaceId: WS,
      billingAccountId: BA,
      tier: "writer" as const,
      cycle: "monthly" as const,
      stripeSubscriptionId: "sub_stripe_1",
      periodStart: P0,
      periodEnd: P1,
      idempotencyKey: "evt:act:1",
    };
    await inTx((tx) => activateSubscription(tx, deps(), args));
    const again = await inTx((tx) => activateSubscription(tx, deps(), args));
    expect(again.applied).toBe(false);
    expect((await readBalances(db, BA)).included.available).toBe(planOf("writer").includedCreditsMonthly);
  });
});

describe("renewals (§14.6)", () => {
  async function activate() {
    return inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
  }

  it("applyRenewalPaid rolls the period and grants the new period's included credits", async () => {
    await activate();
    const out = await inTx((tx) =>
      applyRenewalPaid(tx, deps(), {
        stripeSubscriptionId: "sub_stripe_1",
        workspaceId: WS,
        periodStart: P1,
        periodEnd: new Date("2026-11-01T00:00:00Z"),
      }),
    );
    expect(out.applied).toBe(true);
    const s = await subRow();
    expect(new Date(s!.period_start as string).toISOString()).toBe(P1.toISOString());
    // both periods' grants land (rollover balance ≤ 2× cap — here 4000 = exactly the cap)
    expect((await readBalances(db, BA)).included.available).toBe(planOf("writer").includedCreditsMonthly * 2);
  });

  it("applyRenewalFailed marks past_due and notifies; the balance still spends", async () => {
    await activate();
    const sent: { reason: string }[] = [];
    const out = await inTx((tx) =>
      applyRenewalFailed(tx, subDeps(sent), {
        stripeSubscriptionId: "sub_stripe_1",
        workspaceId: WS,
        userId: USR,
      }),
    );
    expect(out.applied).toBe(true);
    const s = await subRow();
    expect(s?.status).toBe("past_due");
    expect(s?.renewal_failed_at).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.reason).toContain("payment didn't go through");
    // a second failure event does not reset the grace window start
    const failedAt = s!.renewal_failed_at;
    await inTx((tx) =>
      applyRenewalFailed(tx, subDeps(), { stripeSubscriptionId: "sub_stripe_1", workspaceId: WS }),
    );
    expect((await subRow())?.renewal_failed_at).toEqual(failedAt);
  });

  it("the period tick warns at +7d and lapses to Free at +14d (Smart Retries window)", async () => {
    await activate();
    await inTx((tx) =>
      applyRenewalFailed(tx, subDeps(), { stripeSubscriptionId: "sub_stripe_1", workspaceId: WS }),
    );
    const sent: { reason: string }[] = [];
    // +8 days: the warning fires once
    const warn = await runBillingPeriodTick(db.client, subDeps(sent), new Date(NOW.getTime() + 8 * DAY));
    expect(warn.warningsSent).toBe(1);
    expect(sent[0]!.reason).toContain("drops to Free");
    const again = await runBillingPeriodTick(db.client, subDeps(sent), new Date(NOW.getTime() + 9 * DAY));
    expect(again.warningsSent).toBe(0); // warned once
    // +15 days: the grace window lapses the plan to ended (the account's effective tier is then free)
    const lapse = await runBillingPeriodTick(
      db.client,
      subDeps(sent),
      new Date(NOW.getTime() + RENEWAL_GRACE_MS + DAY),
    );
    expect(lapse.pastDueLapsed).toBe(1);
    expect((await subRow())?.status).toBe("ended");
    expect(await inTx((tx) => effectivePlanTier(tx, BA))).toBe("free");
    expect(sent.some((m) => m.reason.includes("on Free now"))).toBe(true);
  });
});

describe("changePlan (§14.6)", () => {
  async function activate(tier: "writer" | "studio" = "writer") {
    return inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier,
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
  }

  it("an upgrade applies now with the new tier's included grant; a downgrade schedules to period end", async () => {
    const { subscriptionId } = await activate("writer");
    const up = await inTx((tx) =>
      changePlan(tx, deps(), {
        subscriptionId,
        billingAccountId: BA,
        workspaceId: WS,
        newTier: "studio",
      }),
    );
    expect(up.applied).toBe("now");
    expect((await subRow())?.tier).toBe("studio");
    expect((await readBalances(db, BA)).included.available).toBe(
      planOf("writer").includedCreditsMonthly + planOf("studio").includedCreditsMonthly,
    );

    const down = await inTx((tx) =>
      changePlan(tx, deps(), {
        subscriptionId,
        billingAccountId: BA,
        workspaceId: WS,
        newTier: "writer",
      }),
    );
    expect(down.applied).toBe("scheduled");
    expect((await subRow())?.scheduled_tier).toBe("writer");
    expect((await subRow())?.tier).toBe("studio"); // keeps what they paid for until period end
  });

  it("the period tick applies a scheduled downgrade at period end", async () => {
    const { subscriptionId } = await activate("studio");
    await inTx((tx) =>
      changePlan(tx, deps(), {
        subscriptionId,
        billingAccountId: BA,
        workspaceId: WS,
        newTier: "writer",
      }),
    );
    const res = await runBillingPeriodTick(db.client, subDeps(), new Date(P1.getTime() + 1000));
    expect(res.downgradesApplied).toBe(1);
    const s = await subRow();
    expect(s?.tier).toBe("writer");
    expect(s?.scheduled_tier).toBeNull();
    // the new period grants the DOWNGRADED tier's included credits
    expect((await readBalances(db, BA)).included.available).toBeGreaterThanOrEqual(
      planOf("writer").includedCreditsMonthly,
    );
  });
});

describe("runBillingPeriodTick — daily Free allowance + grant idempotency", () => {
  it("grants 10 daily credits to a free account, once per day", async () => {
    const res = await runBillingPeriodTick(db.client, subDeps(), NOW);
    expect(res.dailyGrants).toBe(1);
    expect((await readBalances(db, BA)).daily).toEqual({ available: 10, held: 0 });
    const again = await runBillingPeriodTick(db.client, subDeps(), new Date(NOW.getTime() + 3600_000));
    expect(again.dailyGrants).toBe(0); // same UTC day — the idempotency key dedupes
    const tomorrow = await runBillingPeriodTick(db.client, subDeps(), new Date(NOW.getTime() + DAY));
    expect(tomorrow.dailyGrants).toBe(1);
  });

  it("a subscribed account gets no daily allowance; a mid-period tick doesn't double-grant included", async () => {
    await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "studio",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
    const res = await runBillingPeriodTick(db.client, subDeps(), new Date("2026-09-15T00:00:00Z"));
    expect(res.dailyGrants).toBe(0);
    expect(res.includedGrants).toBe(0); // the activation already granted this period
    expect((await readBalances(db, BA)).included.available).toBe(planOf("studio").includedCreditsMonthly);
  });
});

describe("grantIncludedCredits — the rollover rule (§14.2)", () => {
  it("caps the included balance at 2× monthly — the excess rolls off as an expire row", async () => {
    // seed a balance already at the cap
    await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
    const monthly = planOf("writer").includedCreditsMonthly; // 2000
    // second month's grant: 2000 + 2000 = 4000 = exactly the 2× cap, no roll-off
    const g2 = await inTx((tx) =>
      grantIncludedCredits(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        subscriptionId: "sub_stripe_1",
        tier: "writer",
        periodStart: P1,
        periodEnd: new Date("2026-11-01T00:00:00Z"),
      }),
    );
    expect(g2.granted).toBe(monthly);
    expect(g2.rolledOff).toBe(0);
    // a third grant pushes past 2× → the excess expires as rollover_cap
    const g3 = await inTx((tx) =>
      grantIncludedCredits(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        subscriptionId: "sub_stripe_1",
        tier: "writer",
        periodStart: new Date("2026-11-01T00:00:00Z"),
        periodEnd: new Date("2026-12-01T00:00:00Z"),
      }),
    );
    expect(g3.rolledOff).toBe(monthly); // 6000 → capped back to 4000
    expect((await readBalances(db, BA)).included.available).toBe(monthly * 2);
  });
});

describe("syncSubscription + endSubscription", () => {
  it("syncs fields and ends the plan", async () => {
    await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
    const synced = await inTx((tx) =>
      syncSubscription(tx, deps(), {
        stripeSubscriptionId: "sub_stripe_1",
        cancelAtPeriodEnd: true,
      }),
    );
    expect(synced.applied).toBe(true);
    expect((await subRow())?.cancel_at_period_end).toBe(true);
    const ended = await inTx((tx) => endSubscription(tx, deps(), { stripeSubscriptionId: "sub_stripe_1" }));
    expect(ended.applied).toBe(true);
    expect(await inTx((tx) => effectivePlanTier(tx, BA))).toBe("free");
    // idempotent
    expect((await inTx((tx) => endSubscription(tx, deps(), { stripeSubscriptionId: "sub_stripe_1" }))).applied).toBe(false);
  });

  it("F-R6FIX.5: a Stripe-side tier change supersedes the locally-scheduled downgrade; a tier-less sync preserves it", async () => {
    const { subscriptionId } = await inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "studio",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
    // a downgrade is scheduled locally — the tick would apply it at period end
    await inTx((tx) =>
      changePlan(tx, deps(), { subscriptionId, billingAccountId: BA, workspaceId: WS, newTier: "writer" }),
    );
    expect((await subRow())?.scheduled_tier).toBe("writer");
    // a sync carrying no effective tier (e.g. the cancel flag only) must NOT stomp the schedule
    await inTx((tx) =>
      syncSubscription(tx, deps(), { stripeSubscriptionId: "sub_stripe_1", cancelAtPeriodEnd: true }),
    );
    expect((await subRow())?.scheduled_tier).toBe("writer");
    // …but a sync reporting a DIFFERENT effective tier (a Stripe/Portal-side switch) supersedes it —
    // otherwise the tick would apply a downgrade the Stripe-side change already replaced.
    await inTx((tx) =>
      syncSubscription(tx, deps(), { stripeSubscriptionId: "sub_stripe_1", tier: "writer" }),
    );
    const s = await subRow();
    expect(s?.tier).toBe("writer");
    expect(s?.scheduled_tier).toBeNull();
  });
});

describe("requestCancellation — the Stripe propagation (F-R6FIX.5-1)", () => {
  async function activateWriter() {
    return inTx((tx) =>
      activateSubscription(tx, deps(), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: "sub_stripe_1",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: "evt:act:1",
      }),
    );
  }

  it("propagates cancel_at_period_end to Stripe inside the tx when the row carries a stripe id", async () => {
    const { subscriptionId } = await activateWriter();
    const stripe = new StubStripePort();
    const res = await inTx((tx) =>
      requestCancellation(tx, { ...deps(), stripe }, { subscriptionId, billingAccountId: BA }),
    );
    expect(res.applied).toBe(true);
    expect((await subRow())?.cancel_at_period_end).toBe(true);
    expect(stripe.calls).toEqual([
      {
        method: "setSubscriptionCancelAtPeriodEnd",
        args: { subscriptionId: "sub_stripe_1", cancelAtPeriodEnd: true },
      },
    ]);
  });

  it("makes no Stripe call when no port is bound — or when the row carries no stripe id (a local row)", async () => {
    const { subscriptionId } = await activateWriter();
    const stripe = new StubStripePort();
    // no port bound → local flag only (the pre-0036 shape / a Stripe-less fixture stays legal)
    const res = await inTx((tx) =>
      requestCancellation(tx, deps(), { subscriptionId, billingAccountId: BA }),
    );
    expect(res.applied).toBe(true);
    expect(stripe.calls).toHaveLength(0);
    // a row WITHOUT stripe_subscription_id (a comped/local sub) propagates nothing
    await db.client.query(
      `insert into subscriptions (id, billing_account_id, tier, status, period_start, period_end)
         values ('sub_local_1', $1, 'writer', 'active', $2, $3)`,
      [BA, P0, P1],
    );
    const res2 = await inTx((tx) =>
      requestCancellation(tx, { ...deps(), stripe }, { subscriptionId: "sub_local_1", billingAccountId: BA }),
    );
    expect(res2.applied).toBe(true);
    expect(stripe.calls).toHaveLength(0);
  });

  it("a Stripe failure rolls the flag back with the tx — the user is told the cancel failed, never silently divergent", async () => {
    const { subscriptionId } = await activateWriter();
    const stripe = new StubStripePort();
    stripe.setSubscriptionCancelAtPeriodEnd = async () => {
      throw new StripeRequestError("/v1/subscriptions/sub_stripe_1", 500, "upstream");
    };
    await expect(
      inTx((tx) =>
        requestCancellation(tx, { ...deps(), stripe }, { subscriptionId, billingAccountId: BA }),
      ),
    ).rejects.toThrow("upstream");
    expect((await subRow())?.cancel_at_period_end).toBe(false); // rolled back — no divergence
  });
});
