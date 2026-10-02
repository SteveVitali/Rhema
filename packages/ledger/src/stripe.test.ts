import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryQueue, InMemoryEventWriter } from "@rhema/orchestrator";
import {
  verifyStripeSignature,
  signStripePayload,
  insertStripeEvent,
  processStripeEvent,
  type StripeEventDeps,
} from "./stripe.js";
import { SqlHoldLedger } from "./sql-ledger.js";
import { activateSubscription } from "./subscriptions.js";
import { provisionTrial, gateTrialUnlock } from "./trial.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.08 — the §14.6 webhook discipline + the Payment-Link top-up (REQ-BETA-15). Deterministic fixtures only:
// the signature check is HMAC-SHA256 over the raw body (no SDK, no network); `signStripePayload` mints the
// test side of the signature. AC2: purchase → webhook → idempotent grant(topup); a replayed event id no-ops.

let db: LedgerTestDb;
// the analytics envelope validates user_id/workspace_id as ULIDs at the write boundary — use ULID-shaped ids.
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";
const SECRET = "whsec_test_fixture";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USER });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

const NOW = new Date("2026-09-20T12:00:00Z");

function deps(queue = new InMemoryQueue()): StripeEventDeps & { queue: InMemoryQueue } {
  const d = testEntryDeps(NOW);
  const ledger = new SqlHoldLedger(d);
  return {
    ...d,
    ledger,
    runTx: (workspaceId, fn) => db.txRunner.run(workspaceId, fn),
    eventWriter: new InMemoryEventWriter(),
    queue,
  };
}

function checkoutPayload(over: Record<string, unknown> = {}) {
  return {
    id: "evt_checkout_1",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_1",
        amount_total: 5000, // $50.00 → 5000 credits at the 1¢ = 1 credit peg
        payment_intent: "pi_test_1",
        client_reference_id: BA,
        metadata: { workspace_id: WS },
        ...over,
      },
    },
  };
}

async function stripeEventRow(id: string) {
  return (await db.client.query("select id, type, processed_at from stripe_events where id = $1", [id])).rows[0] as
    | { id: string; type: string; processed_at: string | null }
    | undefined;
}
async function topupGrants() {
  return (
    await db.client.query(
      "select kind, bucket, source, reason, credits, stripe_ref, expires_at from credit_ledger where billing_account_id = $1 and bucket = 'topup'",
      [BA],
    )
  ).rows as { kind: string; bucket: string; source: string; reason: string | null; credits: number; stripe_ref: string | null; expires_at: string | null }[];
}
async function analyticsRows() {
  return (await db.client.query("select event, props from analytics_events order by at, id")).rows as {
    event: string; props: Record<string, unknown>;
  }[];
}

describe("verifyStripeSignature (§14.6 step 1)", () => {
  const body = JSON.stringify(checkoutPayload());

  it("accepts a correctly-signed body within tolerance", () => {
    const header = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: Math.floor(NOW.getTime() / 1000) });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: header, now: NOW })).toBe(true);
  });
  it("rejects a tampered body / wrong secret / missing header / stale timestamp", () => {
    const ts = Math.floor(NOW.getTime() / 1000);
    const good = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: ts });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body + "x", signatureHeader: good, now: NOW })).toBe(false);
    expect(verifyStripeSignature({ secret: "whsec_other", rawBody: body, signatureHeader: good, now: NOW })).toBe(false);
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: undefined, now: NOW })).toBe(false);
    const stale = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: ts - 400 });
    expect(verifyStripeSignature({ secret: SECRET, rawBody: body, signatureHeader: stale, now: NOW })).toBe(false);
  });
});

describe("insertStripeEvent (§14.6 step 2 — the unique-id dedupe)", () => {
  it("inserts once; a replayed event id is a no-op", async () => {
    const a = await insertStripeEvent(db.client, { id: "evt_1", type: "checkout.session.completed", payload: {}, receivedAt: NOW });
    const b = await insertStripeEvent(db.client, { id: "evt_1", type: "checkout.session.completed", payload: {}, receivedAt: NOW });
    expect(a).toBe(true);
    expect(b).toBe(false);
    expect((await db.client.query("select count(*)::int n from stripe_events")).rows[0]).toEqual({ n: 1 });
  });
});

describe("processStripeEvent — checkout.session.completed → grant(topup) (AC2)", () => {
  it("grants topup credits (+12mo expiry, stripe_ref = payment intent) + purchase telemetry", async () => {
    await insertStripeEvent(db.client, { id: "evt_checkout_1", type: "checkout.session.completed", payload: checkoutPayload(), receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    expect(out.kind).toBe("topup_granted");
    if (out.kind !== "topup_granted") return;
    expect(out.applied).toBe(true);
    expect(out.credits).toBe(5000);
    expect(out.billingAccountId).toBe(BA);

    expect((await readBalances(db, BA)).topup).toEqual({ available: 5000, held: 0 });
    const [grant] = await topupGrants();
    expect(grant).toMatchObject({ kind: "grant", source: "stripe", reason: "topup", credits: 5000, stripe_ref: "pi_test_1" });
    // +12 months from the fixed clock.
    expect(new Date(grant!.expires_at!).getTime()).toBe(NOW.getTime() + 365 * 24 * 60 * 60 * 1000);

    // REQ-BETA-12: the purchase IS the WTP signal — topup.purchased + wtp.recorded{source:"purchase"}.
    const events = await analyticsRows();
    expect(events.map((e) => e.event)).toEqual(["topup.purchased", "wtp.recorded"]);
    expect(events[1]!.props).toEqual({ source: "purchase", amount: 50 });

    // §14.6 auditability: processed_at stamped.
    expect((await stripeEventRow("evt_checkout_1"))!.processed_at).not.toBeNull();
  });

  it("is idempotent — reprocessing a stored row does not double-grant (§14.6 replay)", async () => {
    await insertStripeEvent(db.client, { id: "evt_checkout_1", type: "checkout.session.completed", payload: checkoutPayload(), receivedAt: NOW });
    const a = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    const b = await processStripeEvent(db.client, deps(), "evt_checkout_1");
    expect(a.kind).toBe("topup_granted");
    expect(b.kind).toBe("topup_granted");
    if (b.kind === "topup_granted") expect(b.applied).toBe(false);
    expect((await readBalances(db, BA)).topup.available).toBe(5000); // not 10,000
    expect(await topupGrants()).toHaveLength(1);
  });

  it("a session with no resolvable account is 'unresolved' and NOT marked processed (retry stays live)", async () => {
    await insertStripeEvent(db.client, {
      id: "evt_orphan",
      type: "checkout.session.completed",
      payload: checkoutPayload({ client_reference_id: undefined, metadata: {} }),
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, deps(), "evt_orphan");
    expect(out.kind).toBe("unresolved");
    expect((await stripeEventRow("evt_orphan"))!.processed_at).toBeNull();
  });

  it("an unhandled event type is acknowledged (ignored) — intake is the dedupe boundary", async () => {
    await insertStripeEvent(db.client, { id: "evt_ping", type: "ping", payload: {}, receivedAt: NOW });
    const out = await processStripeEvent(db.client, deps(), "evt_ping");
    expect(out.kind).toBe("ignored");
    expect((await stripeEventRow("evt_ping"))!.processed_at).not.toBeNull();
  });
});

// ---- P1.16 — the §14.6 full-billing arms ------------------------------------------------------------
// checkout.session.completed's three kinds dispatch through our checkout_sessions row (subscribe →
// activateSubscription + trial conversion; topup → the PACK's credits, never amount_total;
// auto_reload_setup → the card on file). invoice.paid/payment_failed drive renewals + the Smart-Retries
// grace; customer.subscription.* sync + end. All idempotent — a replayed event is a no-op.

const P0 = new Date("2026-09-01T00:00:00Z");
const P1 = new Date("2026-10-01T00:00:00Z");
const unix = (d: Date) => Math.floor(d.getTime() / 1000);

async function checkoutSessionRow(args: {
  id: string;
  kind: "subscribe" | "topup" | "auto_reload_setup";
  plan?: string;
  cycle?: string;
  packId?: string;
  stripeSessionId: string;
  /** BILL.3 — the pending-email legs: the session's owner + return page + the poll's marker. */
  userId?: string;
  returnTo?: string;
  returnViewedAt?: Date;
  pendingEmailQueuedAt?: Date;
}) {
  await db.client.query(
    `insert into checkout_sessions
       (id, workspace_id, billing_account_id, user_id, kind, plan, cycle, pack_id, return_to, state, created_at, stripe_session_id, return_viewed_at, pending_email_queued_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12,$13)`,
    [
      args.id,
      WS,
      BA,
      args.userId ?? null,
      args.kind,
      args.plan ?? null,
      args.cycle ?? null,
      args.packId ?? null,
      args.returnTo ?? null,
      NOW,
      args.stripeSessionId,
      args.returnViewedAt ?? null,
      args.pendingEmailQueuedAt ?? null,
    ],
  );
}

async function emit(id: string, type: string, object: Record<string, unknown>) {
  await insertStripeEvent(db.client, { id, type, payload: { id, type, data: { object } }, receivedAt: NOW });
  return processStripeEvent(db.client, deps(), id);
}

async function subRowByStripeId(stripeId: string) {
  return (
    await db.client.query("select * from subscriptions where stripe_subscription_id = $1", [stripeId])
  ).rows[0] as Record<string, unknown> | undefined;
}

describe("processStripeEvent — the Checkout arms (P1.16; §14.6; REQ-BILL-14)", () => {
  it("a topup-kind session grants the PACK's credits — never amount_total (bonus credits)", async () => {
    await checkoutSessionRow({ id: "chk_topup", kind: "topup", packId: "topup_50", stripeSessionId: "cs_topup_1" });
    const out = await emit("evt_topup_pack", "checkout.session.completed", {
      id: "cs_topup_1",
      amount_total: 5000, // $50 — the pack grants 5,250 (the bonus), not 5,000
      payment_intent: "pi_pack_1",
      metadata: { checkout_session_id: "chk_topup" },
    });
    expect(out).toMatchObject({ kind: "topup_granted", credits: 5250, billingAccountId: BA, applied: true });
    expect((await readBalances(db, BA)).topup).toEqual({ available: 5250, held: 0 });
    const [grant] = await topupGrants();
    expect(grant).toMatchObject({ reason: "topup:topup_50", credits: 5250, stripe_ref: "pi_pack_1" });
    // the session row closed — a webhook replay finds state≠open and is ignored (no double grant)
    expect(
      (await db.client.query("select state from checkout_sessions where id = 'chk_topup'")).rows[0],
    ).toMatchObject({ state: "completed" });
    const replay = await emit("evt_topup_pack_2", "checkout.session.completed", {
      id: "cs_topup_1",
      metadata: { checkout_session_id: "chk_topup" },
    });
    expect(replay.kind).toBe("ignored");
    expect((await readBalances(db, BA)).topup.available).toBe(5250);
  });

  it("a subscribe-kind session activates the subscription + converts the trial to the 800-credit promo", async () => {
    // a trial_active account (unlocked entitlement + the granted 150-credit pocket) upgrading inside
    // the window — §14.3: the unused entitlement + unspent pocket convert to the promo grant.
    const trialDeps = testEntryDeps(NOW);
    await db.txRunner.run(WS, async (tx) => {
      await provisionTrial(tx, trialDeps, { billingAccountId: BA });
      const unlock = await gateTrialUnlock(tx, trialDeps, {
        billingAccountId: BA,
        workspaceId: WS,
        userId: USER,
        evidence: { billingAccountId: BA, userId: USER, disposableDomain: false },
      });
      expect(unlock.decision).toBe("allow");
    });
    expect((await readBalances(db, BA)).trial_pocket).toEqual({ available: 150, held: 0 });
    await checkoutSessionRow({ id: "chk_sub", kind: "subscribe", plan: "writer", cycle: "monthly", stripeSessionId: "cs_sub_1" });
    const out = await emit("evt_sub_1", "checkout.session.completed", {
      id: "cs_sub_1",
      subscription: "sub_live_1",
      customer: "cus_live_1",
      metadata: { checkout_session_id: "chk_sub" },
    });
    expect(out).toMatchObject({ kind: "subscription_activated", billingAccountId: BA, converted: true });
    const s = await subRowByStripeId("sub_live_1");
    expect(s).toMatchObject({ tier: "writer", status: "active", stripe_customer_id: "cus_live_1" });
    const bals = await readBalances(db, BA);
    expect(bals.included!.available).toBe(2000); // Writer's monthly included grant
    expect(bals.promo!.available).toBe(800); // the §14.3 upgrade promo
    expect(bals.trial_pocket!.available).toBe(0); // the unspent pocket was voided on conversion
    const acct = (
      await db.client.query("select trial_state from billing_accounts where id = $1", [BA])
    ).rows[0] as { trial_state: string };
    expect(acct.trial_state).toBe("free");
  });

  it("an auto_reload_setup session puts the card on file — no credits move", async () => {
    await checkoutSessionRow({ id: "chk_ar", kind: "auto_reload_setup", stripeSessionId: "cs_ar_1" });
    const out = await emit("evt_ar_1", "checkout.session.completed", {
      id: "cs_ar_1",
      customer: "cus_ar_1",
      metadata: { checkout_session_id: "chk_ar" },
    });
    expect(out).toMatchObject({ kind: "auto_reload_setup", billingAccountId: BA });
    expect(
      (await db.client.query("select stripe_customer_id from billing_accounts where id = $1", [BA])).rows[0],
    ).toMatchObject({ stripe_customer_id: "cus_ar_1" });
    expect(await topupGrants()).toHaveLength(0);
  });
});

describe("processStripeEvent — invoice + subscription arms (P1.16; §14.6)", () => {
  async function activate(stripeId = "sub_live_1") {
    await db.txRunner.run(WS, (tx) =>
      activateSubscription(tx, testEntryDeps(NOW), {
        workspaceId: WS,
        billingAccountId: BA,
        tier: "writer",
        cycle: "monthly",
        stripeSubscriptionId: stripeId,
        stripeCustomerId: "cus_live",
        periodStart: P0,
        periodEnd: P1,
        idempotencyKey: `evt:act:${stripeId}`,
      }),
    );
  }

  it("invoice.paid rolls the period and grants the new period's included credits (REQ-BILL-14)", async () => {
    await activate();
    const out = await emit("evt_inv_paid", "invoice.paid", {
      id: "in_1",
      subscription: "sub_live_1",
      customer: "cus_live",
      period_start: unix(P1),
      period_end: unix(new Date("2026-11-01T00:00:00Z")),
      metadata: { billing_account_id: BA },
    });
    expect(out).toMatchObject({ kind: "renewal_paid", billingAccountId: BA });
    const s = await subRowByStripeId("sub_live_1");
    expect(new Date(s!.period_start as string).toISOString()).toBe(P1.toISOString());
    // 2000 activation + 2000 renewal = exactly the 2× rollover cap
    expect((await readBalances(db, BA)).included!.available).toBe(4000);
  });

  it("invoice.payment_failed marks past_due + notifies — the plan stays up in the grace window", async () => {
    await activate();
    const sent: { reason: string }[] = [];
    const d = { ...deps(), notify: async (p: { reason: string }) => { sent.push(p); } };
    await insertStripeEvent(db.client, {
      id: "evt_inv_fail",
      type: "invoice.payment_failed",
      payload: { id: "evt_inv_fail", type: "invoice.payment_failed", data: { object: { id: "in_2", subscription: "sub_live_1", customer: "cus_live", metadata: { billing_account_id: BA } } } },
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, d, "evt_inv_fail");
    expect(out).toMatchObject({ kind: "renewal_failed", billingAccountId: BA });
    const s = await subRowByStripeId("sub_live_1");
    expect(s!.status).toBe("past_due");
    expect(s!.renewal_failed_at).not.toBeNull();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.reason).toContain("payment didn't go through");
  });

  it("customer.subscription.updated syncs the row (cancel_at_period_end from the Portal)", async () => {
    await activate();
    const out = await emit("evt_sub_upd", "customer.subscription.updated", {
      id: "sub_live_1",
      status: "active",
      cancel_at_period_end: true,
      metadata: { billing_account_id: BA },
    });
    expect(out).toMatchObject({ kind: "subscription_synced", billingAccountId: BA });
    expect((await subRowByStripeId("sub_live_1"))!.cancel_at_period_end).toBe(true);
  });

  it("customer.subscription.created for an unknown subscription activates it whole (the Checkout race arm)", async () => {
    const out = await emit("evt_sub_new", "customer.subscription.created", {
      id: "sub_race_1",
      status: "active",
      customer: "cus_race",
      current_period_start: unix(P0),
      current_period_end: unix(P1),
      metadata: { billing_account_id: BA, plan: "studio", cycle: "monthly" },
      items: { data: [{ plan: { interval: "month" } }] },
    });
    expect(out).toMatchObject({ kind: "subscription_synced", billingAccountId: BA });
    const s = await subRowByStripeId("sub_race_1");
    expect(s).toMatchObject({ tier: "studio", status: "active", stripe_customer_id: "cus_race" });
    expect((await readBalances(db, BA)).included!.available).toBe(12000); // Studio's included grant
  });

  it("customer.subscription.created then checkout.session.completed grants the first period ONCE (STB.4 double-grant)", async () => {
    // Stripe's usual ordering: subscription.created lands before checkout.session.completed.
    await checkoutSessionRow({ id: "chk_race", kind: "subscribe", plan: "writer", cycle: "monthly", stripeSessionId: "cs_race" });
    const created = await emit("evt_race_created", "customer.subscription.created", {
      id: "sub_race_1",
      status: "active",
      customer: "cus_race",
      current_period_start: unix(P0),
      current_period_end: unix(P1),
      metadata: { billing_account_id: BA, plan: "writer" },
      items: { data: [{ plan: { interval: "month" } }] },
    });
    expect(created).toMatchObject({ kind: "subscription_synced", billingAccountId: BA });
    const completed = await emit("evt_race_completed", "checkout.session.completed", {
      id: "cs_race",
      subscription: "sub_race_1",
      customer: "cus_race",
      metadata: { checkout_session_id: "chk_race" },
    });
    expect(completed).toMatchObject({ kind: "subscription_activated" });
    // STB.4 regression — without the period-scoped dedupe, this was two 2000-credit grants.
    const n = (
      await db.client.query(
        "select count(*)::int n from credit_ledger where billing_account_id=$1 and kind='grant' and bucket='included'",
        [BA],
      )
    ).rows[0] as { n: number };
    expect(n).toEqual({ n: 1 });
    expect((await readBalances(db, BA)).included!.available).toBe(2000);
    // the stored period stays Stripe-canonical (not the processing clock).
    expect(new Date((await subRowByStripeId("sub_race_1"))!.period_start as string).toISOString()).toBe(
      P0.toISOString(),
    );
  });

  it("checkout.session.completed first, then subscription.created + the create-invoice — still one grant", async () => {
    await checkoutSessionRow({ id: "chk_race2", kind: "subscribe", plan: "writer", cycle: "monthly", stripeSessionId: "cs_race2" });
    const completed = await emit("evt_race2_completed", "checkout.session.completed", {
      id: "cs_race2",
      subscription: "sub_race_2",
      customer: "cus_race2",
      metadata: { checkout_session_id: "chk_race2" },
    });
    expect(completed).toMatchObject({ kind: "subscription_activated" });
    // subscription.created for the known row → sync only (no grant); the create-invoice's paid arm
    // names the same period through invoice.period_start — the window dedupe must still skip it.
    await emit("evt_race2_created", "customer.subscription.created", {
      id: "sub_race_2",
      status: "active",
      customer: "cus_race2",
      current_period_start: unix(NOW),
      current_period_end: unix(new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000)),
      metadata: { billing_account_id: BA, plan: "writer" },
      items: { data: [{ plan: { interval: "month" } }] },
    });
    await emit("evt_race2_invoice", "invoice.paid", {
      id: "in_race2",
      subscription: "sub_race_2",
      customer: "cus_race2",
      billing_reason: "subscription_create",
      period_start: unix(NOW),
      period_end: unix(new Date(NOW.getTime() + 31 * 24 * 60 * 60 * 1000)),
      metadata: { billing_account_id: BA },
    });
    const n = (
      await db.client.query(
        "select count(*)::int n from credit_ledger where billing_account_id=$1 and kind='grant' and bucket='included'",
        [BA],
      )
    ).rows[0] as { n: number };
    expect(n).toEqual({ n: 1 });
    expect((await readBalances(db, BA)).included!.available).toBe(2000);
  });

  it("customer.subscription.deleted ends the plan", async () => {
    await activate("sub_live_9");
    const out = await emit("evt_sub_del", "customer.subscription.deleted", {
      id: "sub_live_9",
      customer: "cus_live",
      metadata: { billing_account_id: BA },
    });
    expect(out).toMatchObject({ kind: "subscription_ended", billingAccountId: BA });
    expect((await subRowByStripeId("sub_live_9"))!.status).toBe("ended");
  });

  it("an invoice for an unknown account stays unresolved (the retry stays live)", async () => {
    const out = await emit("evt_inv_orphan", "invoice.payment_failed", {
      id: "in_orphan",
      subscription: "sub_nowhere",
      customer: "cus_nobody",
    });
    expect(out.kind).toBe("unresolved");
    expect((await stripeEventRow("evt_inv_orphan"))!.processed_at).toBeNull();
  });
});

// ---- BILL.3 — the pending-checkout email (REQ-BILL-16 webhook lag; ADR-029) + the expired arm -----------
// The /billing/return page promises "we'll email you when it lands". The promise holds ONLY when the
// user actually waited on the open page: `return_viewed_at` (0048, stamped by the tenant poll) gates the
// send; the open→completed transition + the `checkout:<sessionId>` tag make it exactly-once under replay.

describe("processStripeEvent — the pending-checkout email (BILL.3)", () => {
  function notifySpy() {
    const calls: {
      type: string; workspaceId: string; userId?: string; billingAccountId?: string;
      reason: string; tag?: string; openPath?: string;
    }[] = [];
    return {
      calls,
      deps: { ...deps(), notify: async (p: (typeof calls)[number]) => { calls.push(p); } } as StripeEventDeps,
    };
  }

  it("completion AFTER the open view → exactly one mail, tagged checkout:<sessionId>, linked to returnTo", async () => {
    await checkoutSessionRow({
      id: "chk_mail", kind: "topup", packId: "topup_10", stripeSessionId: "cs_mail_1",
      userId: USER, returnTo: "/p/my-project/run", returnViewedAt: NOW,
    });
    const spy = notifySpy();
    await insertStripeEvent(db.client, {
      id: "evt_mail_1", type: "checkout.session.completed",
      payload: { id: "evt_mail_1", type: "checkout.session.completed", data: { object: { id: "cs_mail_1", payment_intent: "pi_m1", metadata: { checkout_session_id: "chk_mail" } } } },
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, spy.deps, "evt_mail_1");
    expect(out.kind).toBe("topup_granted");
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]).toMatchObject({
      type: "trial_payment",
      workspaceId: WS,
      userId: USER,
      billingAccountId: BA,
      tag: "checkout:chk_mail",
      openPath: "/p/my-project/run",
    });
    expect(spy.calls[0]!.reason).toBe("Your top-up landed — the credits are in");

    // a webhook replay (new event id, same session) finds state=completed → NO second mail.
    await insertStripeEvent(db.client, {
      id: "evt_mail_2", type: "checkout.session.completed",
      payload: { id: "evt_mail_2", type: "checkout.session.completed", data: { object: { id: "cs_mail_1", payment_intent: "pi_m1", metadata: { checkout_session_id: "chk_mail" } } } },
      receivedAt: NOW,
    });
    const replay = await processStripeEvent(db.client, spy.deps, "evt_mail_2");
    expect(replay.kind).toBe("ignored");
    expect(spy.calls).toHaveLength(1);
    expect(
      (
        await db.client.query(
          "select pending_email_queued_at is not null as queued from checkout_sessions where id = 'chk_mail'",
        )
      ).rows[0],
    ).toEqual({ queued: true });
  });

  it("a notify enqueue failure stays retryable: the completed row carries no queued marker and a worker retry mails once", async () => {
    await checkoutSessionRow({
      id: "chk_retry", kind: "topup", packId: "topup_10", stripeSessionId: "cs_retry_1",
      userId: USER, returnTo: "/app/settings/billing", returnViewedAt: NOW,
    });
    const calls: { tag?: string }[] = [];
    let fail = true;
    const retryDeps = {
      ...deps(),
      notify: async (p: { tag?: string }) => {
        if (fail) throw new Error("pg-boss unavailable");
        calls.push(p);
      },
    } as StripeEventDeps;
    await insertStripeEvent(db.client, {
      id: "evt_retry", type: "checkout.session.completed",
      payload: { id: "evt_retry", type: "checkout.session.completed", data: { object: { id: "cs_retry_1", payment_intent: "pi_r1", metadata: { checkout_session_id: "chk_retry" } } } },
      receivedAt: NOW,
    });
    await expect(processStripeEvent(db.client, retryDeps, "evt_retry")).rejects.toThrow("pg-boss unavailable");
    expect(calls).toHaveLength(0);
    expect(
      (await db.client.query("select state, pending_email_queued_at from checkout_sessions where id = 'chk_retry'"))
        .rows[0],
    ).toMatchObject({ state: "completed", pending_email_queued_at: null });
    // the event row stays unprocessed, so the worker's retry path is live (not a silently dropped mail).
    expect((await stripeEventRow("evt_retry"))!.processed_at).toBeNull();

    fail = false;
    await processStripeEvent(db.client, retryDeps, "evt_retry");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ tag: "checkout:chk_retry" });
    expect(
      (await db.client.query("select pending_email_queued_at is not null as queued from checkout_sessions where id = 'chk_retry'"))
        .rows[0],
    ).toEqual({ queued: true });
  });

  it("a viewed session already stamped pending_email_queued_at completes the grant but skips the second enqueue", async () => {
    await checkoutSessionRow({
      id: "chk_queued", kind: "topup", packId: "topup_10", stripeSessionId: "cs_queued_1",
      userId: USER, returnTo: "/app/settings/billing", returnViewedAt: NOW, pendingEmailQueuedAt: NOW,
    });
    const spy = notifySpy();
    await insertStripeEvent(db.client, {
      id: "evt_queued", type: "checkout.session.completed",
      payload: { id: "evt_queued", type: "checkout.session.completed", data: { object: { id: "cs_queued_1", payment_intent: "pi_q1", metadata: { checkout_session_id: "chk_queued" } } } },
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, spy.deps, "evt_queued");
    expect(out.kind).toBe("topup_granted");
    expect(spy.calls).toHaveLength(0);
    expect((await readBalances(db, BA)).topup.available).toBe(1000);
  });

  it("completion BEFORE the open view → grant lands but NO mail (the user never saw pending)", async () => {
    await checkoutSessionRow({
      id: "chk_nomail", kind: "topup", packId: "topup_10", stripeSessionId: "cs_nomail_1",
      userId: USER, returnTo: "/app/settings/billing", // no returnViewedAt
    });
    const spy = notifySpy();
    await insertStripeEvent(db.client, {
      id: "evt_nomail", type: "checkout.session.completed",
      payload: { id: "evt_nomail", type: "checkout.session.completed", data: { object: { id: "cs_nomail_1", payment_intent: "pi_m2", metadata: { checkout_session_id: "chk_nomail" } } } },
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, spy.deps, "evt_nomail");
    expect(out.kind).toBe("topup_granted");
    expect(spy.calls).toHaveLength(0);
    expect((await readBalances(db, BA)).topup.available).toBe(1000);
  });

  it("a subscribe completion after view mails with the plan copy", async () => {
    await checkoutSessionRow({
      id: "chk_submail", kind: "subscribe", plan: "writer", cycle: "monthly", stripeSessionId: "cs_submail",
      userId: USER, returnTo: "/app/settings/billing", returnViewedAt: NOW,
    });
    const spy = notifySpy();
    await insertStripeEvent(db.client, {
      id: "evt_submail", type: "checkout.session.completed",
      payload: { id: "evt_submail", type: "checkout.session.completed", data: { object: {
        id: "cs_submail", subscription: "sub_mail_1", customer: "cus_mail",
        metadata: { checkout_session_id: "chk_submail" } } } },
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, spy.deps, "evt_submail");
    expect(out.kind).toBe("subscription_activated");
    expect(spy.calls).toHaveLength(1);
    expect(spy.calls[0]!.reason).toBe("Your plan is active — the checkout finished");
    expect(spy.calls[0]!.tag).toBe("checkout:chk_submail");
  });

  it("a checkout row without a userId never mails (no recipient)", async () => {
    await checkoutSessionRow({
      id: "chk_nouser", kind: "topup", packId: "topup_10", stripeSessionId: "cs_nouser",
      returnTo: "/app", returnViewedAt: NOW, // viewed, but no owner — nothing to mail to
    });
    const spy = notifySpy();
    await insertStripeEvent(db.client, {
      id: "evt_nouser", type: "checkout.session.completed",
      payload: { id: "evt_nouser", type: "checkout.session.completed", data: { object: { id: "cs_nouser", payment_intent: "pi_m3", metadata: { checkout_session_id: "chk_nouser" } } } },
      receivedAt: NOW,
    });
    await processStripeEvent(db.client, spy.deps, "evt_nouser");
    expect(spy.calls).toHaveLength(0);
  });
});

describe("processStripeEvent — checkout.session.expired (BILL.3)", () => {
  it("expires our open row so the return poll renders the honest state; replay no-ops", async () => {
    await checkoutSessionRow({ id: "chk_exp", kind: "topup", packId: "topup_10", stripeSessionId: "cs_exp_1" });
    const out = await emit("evt_exp_1", "checkout.session.expired", {
      id: "cs_exp_1",
      metadata: { checkout_session_id: "chk_exp" },
    });
    expect(out.kind).toBe("ignored");
    expect(
      (await db.client.query("select state from checkout_sessions where id = 'chk_exp'")).rows[0],
    ).toMatchObject({ state: "expired" });
    // a replay is still ignored (no state churn, no grant attempt).
    const replay = await emit("evt_exp_2", "checkout.session.expired", {
      id: "cs_exp_1",
      metadata: { checkout_session_id: "chk_exp" },
    });
    expect(replay.kind).toBe("ignored");
    // and a Payment-Link session (no row) is simply ignored.
    const orphan = await emit("evt_exp_3", "checkout.session.expired", { id: "cs_unrelated" });
    expect(orphan.kind).toBe("ignored");
  });
});

describe("processStripeEvent — the customer id backfill (BILL.3)", () => {
  it("a Payment-Link purchase with a customer mints stripe_customer_id → the Portal unlocks", async () => {
    await insertStripeEvent(db.client, {
      id: "evt_pl_cus", type: "checkout.session.completed",
      payload: checkoutPayload({ customer: "cus_pl_1" }),
      receivedAt: NOW,
    });
    const out = await processStripeEvent(db.client, deps(), "evt_pl_cus");
    expect(out.kind).toBe("topup_granted");
    expect(
      (await db.client.query("select stripe_customer_id from billing_accounts where id = $1", [BA])).rows[0],
    ).toMatchObject({ stripe_customer_id: "cus_pl_1" });
  });
});
