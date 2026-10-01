import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { processStripeEvent, signStripePayload, SqlHoldLedger, STRIPE_EVENT_JOB, StubStripePort, type CheckoutSessionRequest } from "@rhema/ledger";
import { PRICING, priceCents } from "@rhema/contracts";
import { createBillingRoutes } from "./billing-routes.js";
import { createApp, type Principal } from "./index.js";

// PRB.08 billing routes (REQ-BETA-14/15; §14.6). Driven over PGlite via Hono's app.request — no network:
//  • POST /stripe/webhook — verify signature → insert stripe_events (unique id) → enqueue stripe.event → 200.
//    A replayed event id inserts/enqueues nothing (still 200); a bad signature 400s before any row exists.
//  • GET /billing/balance — the spendable sum + suspension + the beta Payment Link for the web shell.
//  • POST /billing/exhausted-prompt — credits.exhausted_prompt{action_taken} into analytics_events (REQ-BETA-12).
//  • the suspended account's 403s (REQ-SPEC-24.7) via createApp + a primed-suspended ledger.

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
const SECRET = "whsec_test_fixture";
const NOW = new Date("2026-09-20T12:00:00Z");

// ULID-shaped ids — the analytics envelope validates user_id/workspace_id at the write boundary.
const USER = "01JQ0000000000000000000MB1";
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";

const principal = (): Principal => ({ userId: USER, workspaceId: WS, billingAccountId: BA });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  seed = await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA, draftN: 1 });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

function app(over: Partial<Parameters<typeof createBillingRoutes>[0]> = {}) {
  return createBillingRoutes({
    principal,
    txRunner: db.txRunner,
    systemExec: db.client,
    queue: deps.queue,
    clock: deps.clock,
    ids: deps.ids,
    stripeWebhookSecret: SECRET,
    paymentLinkUrl: "https://buy.stripe.com/test_beta",
    ...over,
  });
}

const CHECKOUT = {
  id: "evt_checkout_http",
  type: "checkout.session.completed",
  data: { object: { id: "cs_http_1", amount_total: 5000, payment_intent: "pi_http_1", client_reference_id: BA, metadata: { workspace_id: WS } } },
};

async function postWebhook(body: string, header?: string) {
  return app().request("/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", ...(header ? { "stripe-signature": header } : {}) },
    body,
  });
}

describe("POST /stripe/webhook — §14.6 discipline (AC2)", () => {
  it("verify → insert → enqueue → 200", async () => {
    const body = JSON.stringify(CHECKOUT);
    const header = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: Math.floor(NOW.getTime() / 1000) });
    const res = await postWebhook(body, header);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });

    // the event row parked + the stripe.event job enqueued (the worker's half).
    const row = (await db.client.query("select id, type from stripe_events where id = $1", ["evt_checkout_http"])).rows[0];
    expect(row).toMatchObject({ id: "evt_checkout_http", type: "checkout.session.completed" });
    const jobs = deps.queue.ofName(STRIPE_EVENT_JOB);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ eventId: "evt_checkout_http" });

    // …and the queued half grants the top-up (the full purchase leg).
    const out = await processStripeEvent(db.client, {
      ids: deps.ids, clock: deps.clock, ledger: new SqlHoldLedger(deps),
      runTx: (w, fn) => db.txRunner.run(w, fn), eventWriter: deps.eventWriter, queue: deps.queue,
    }, "evt_checkout_http");
    expect(out.kind).toBe("topup_granted");
    const bal = (
      await db.client.query("select available::int as a from credit_balances where billing_account_id = $1 and bucket = 'topup'", [BA])
    ).rows[0] as { a: number };
    expect(bal.a).toBe(5000);
  });

  it("a replayed event id inserts nothing and enqueues nothing — still 200", async () => {
    const body = JSON.stringify(CHECKOUT);
    const header = signStripePayload({ secret: SECRET, rawBody: body, timestampSec: Math.floor(NOW.getTime() / 1000) });
    await postWebhook(body, header);
    const res = await postWebhook(body, header); // the replay
    expect(res.status).toBe(200);
    expect(deps.queue.ofName(STRIPE_EVENT_JOB)).toHaveLength(1); // the original enqueue covers it
    expect((await db.client.query("select count(*)::int n from stripe_events")).rows[0]).toEqual({ n: 1 });
  });

  it("a bad signature is a 400 BEFORE any row exists; no secret → 404", async () => {
    const res = await postWebhook(JSON.stringify(CHECKOUT), "t=1,v1=bogus");
    expect(res.status).toBe(400);
    expect((await db.client.query("select count(*)::int n from stripe_events")).rows[0]).toEqual({ n: 0 });

    const unconfigured = app({ stripeWebhookSecret: undefined });
    const body = JSON.stringify(CHECKOUT);
    const res2 = await unconfigured.request("/stripe/webhook", { method: "POST", body });
    expect(res2.status).toBe(404);
  });
});

describe("GET /billing/balance", () => {
  it("returns the spendable sum + held + suspension + the beta Payment Link (§14.5 level-0)", async () => {
    await db.pg.query("insert into credit_balances(billing_account_id, bucket, available, held) values ($1,'included',1200,0),($1,'promo',300,0),($1,'topup',0,140)", [BA]);
    const res = await app().request("/billing/balance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spendableCredits: 1500,
      heldCredits: 140, // PRB.12 — the chip's held-on-hover figure
      suspended: false,
      clawbackDebt: 0,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
      billingAccountId: BA, // PRB.19 (F32) — the web pins client_reference_id from it
    });
  });

  it("omits the link when not configured; 401 unauthenticated", async () => {
    const res = await app({ paymentLinkUrl: undefined }).request("/billing/balance");
    expect(((await res.json()) as Record<string, unknown>).paymentLinkUrl).toBeUndefined();
    const anon = createBillingRoutes({
      principal: () => null, txRunner: db.txRunner, systemExec: db.client,
      queue: deps.queue, clock: deps.clock, ids: deps.ids,
    });
    expect((await anon.request("/billing/balance")).status).toBe(401);
  });
});

describe("POST /billing/exhausted-prompt (REQ-BETA-12)", () => {
  it("writes credits.exhausted_prompt{action_taken} to analytics_events", async () => {
    const res = await app().request("/billing/exhausted-prompt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action_taken: "open_payment_link" }),
    });
    expect(res.status).toBe(200);
    const rows = (await db.client.query("select event, props, user_id, workspace_id from analytics_events")).rows as {
      event: string; props: Record<string, unknown>; user_id: string; workspace_id: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "credits.exhausted_prompt",
      props: { action_taken: "open_payment_link" },
      user_id: USER,
      workspace_id: WS,
    });
  });

  it("400 without action_taken; 401 unauthenticated", async () => {
    const res = await app().request("/billing/exhausted-prompt", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    expect(res.status).toBe(400);
    const anon = createBillingRoutes({
      principal: () => null, txRunner: db.txRunner, systemExec: db.client,
      queue: deps.queue, clock: deps.clock, ids: deps.ids,
    });
    const res2 = await anon.request("/billing/exhausted-prompt", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action_taken: "shown" }),
    });
    expect(res2.status).toBe(401);
  });
});

// P1.16 (§14.2/14.5/14.6) — the post-beta billing surface: the plan ladder read, the three Checkout
// kinds (subscribe / top-up / auto-reload setup) with the §14.2 fraud bounds enforced in-route (paid
// plan required, first-month $100 cap, >$200/day → 3DS), the Portal hand-off, the subscription read,
// cancel/change-plan, the ≤30 s checkout-return poll, opt-in auto-reload validation, the Team
// waitlist, and the usage/CSV reads. `StubStripePort` captures the port calls — no network.
describe("GET /billing/plans — the pricing.json publication", () => {
  it("serves the ladder + trial + packs verbatim", async () => {
    const res = await app().request("/billing/plans");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      version: string;
      plans: Record<string, { waitlist?: boolean; whatItCovers: string | null }>;
      trial: { windowDays: number; entitlement: { wordCap: number }; includedNote: string | null };
      topUpPacks: { id: string }[];
    };
    expect(body.version).toBe(PRICING.version);
    expect(Object.keys(body.plans)).toEqual(["free", "writer", "studio", "studio_max", "team"]);
    expect(body.plans["team"]?.waitlist).toBe(true);
    expect(body.trial.entitlement.wordCap).toBe(6000);
    expect(body.topUpPacks).toHaveLength(3);
    // HOT.1 — the claims gate is server-side: hidden claims transmit null on the DTO itself.
    expect(body.trial.includedNote).toBeNull();
    expect(body.plans["writer"]?.whatItCovers).toBeNull();
    expect(body.plans["studio"]?.whatItCovers).toBeNull();
    expect(body.plans["studio_max"]?.whatItCovers).toBeNull();
    expect(body.plans["team"]?.whatItCovers).toContain("Pooled credits");
  });
});

describe("POST /billing/checkout — subscribe", () => {
  const post = (a: ReturnType<typeof app>, body: unknown) =>
    a.request("/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

  it("mints a Checkout session, persists the row first, and returns the hosted URL", async () => {
    const stripe = new StubStripePort();
    const res = await post(app({ stripe, appBaseUrl: "https://app.test" }), {
      kind: "subscribe", plan: "writer", cycle: "annual", returnTo: "/settings/billing",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sessionId: string; url: string };
    expect(body.url).toContain("checkout.stripe.test");
    // the local row exists BEFORE Stripe is ever called back (the webhook resolves on it).
    const row = (
      await db.client.query(
        "select kind, plan, cycle, state, return_to from checkout_sessions where id = $1",
        [body.sessionId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    expect(row).toMatchObject({
      kind: "subscribe", plan: "writer", cycle: "annual",
      state: "open", return_to: "/settings/billing",
    });
    const req = stripe.calls[0]!.args as CheckoutSessionRequest;
    expect(req.kind).toBe("subscribe");
    expect(req.plan?.tier).toBe("writer");
    expect(req.plan?.unitAmountCents).toBe(priceCents("writer", "annual")); // −15% annual
  });

  it("Team is waitlisted (422); a missing/invalid plan is 400; no port is 503", async () => {
    const stripe = new StubStripePort();
    const a = app({ stripe, appBaseUrl: "https://app.test" });
    expect((await post(a, { kind: "subscribe", plan: "team" })).status).toBe(422);
    expect((await post(a, { kind: "subscribe", plan: "free" })).status).toBe(400);
    expect((await post(a, { kind: "subscribe" })).status).toBe(400);
    expect((await post(app({ appBaseUrl: "https://app.test" }), { kind: "subscribe", plan: "writer" })).status).toBe(503);
    expect(stripe.calls).toHaveLength(0);
  });
});

describe("POST /billing/checkout — top-up bounds (§14.2)", () => {
  const post = (a: ReturnType<typeof app>, body: unknown) =>
    a.request("/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

  it("Free can't top up (402 topups_require_plan); a paid account gets the pack's session + the attempt counters", async () => {
    const stripe = new StubStripePort();
    const a = app({ stripe, appBaseUrl: "https://app.test" });
    await db.pg.query("delete from subscriptions where billing_account_id = $1", [BA]); // → Free
    const res = await post(a, { kind: "topup", packId: "topup_10" });
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: "topups_require_plan" });
    expect(stripe.calls).toHaveLength(0); // refused before the port

    // restore the paid plan and buy — the row + counters land at session creation.
    await db.pg.query(
      `insert into subscriptions(id, billing_account_id, tier, period_start, period_end, status)
         values ('sub_top', $1, 'writer', now() - interval '1 day', now() + interval '1 month', 'active')`,
      [BA],
    );
    const ok = await post(a, { kind: "topup", packId: "topup_50" });
    expect(ok.status).toBe(200);
    const acct = (
      await db.client.query(
        "select first_month_topup_cents::int f, daily_topup_cents::int d from billing_accounts where id = $1",
        [BA],
      )
    ).rows[0] as { f: number; d: number };
    expect(acct).toEqual({ f: 5000, d: 5000 }); // $50 counted at attempt time (conservative)
  });

  it("the first-month $100 cap 402s; past it, >$200/day flags 3DS on the session", async () => {
    const stripe = new StubStripePort();
    const a = app({ stripe, appBaseUrl: "https://app.test" });
    // the seeded account is fresh — two $50 attempts hit the first-month cap on the third.
    await post(a, { kind: "topup", packId: "topup_50" });
    await post(a, { kind: "topup", packId: "topup_50" });
    const capped = await post(a, { kind: "topup", packId: "topup_10" });
    expect(capped.status).toBe(402);
    expect(await capped.json()).toEqual({ error: "first_month_cap" });

    // an older account has no first-month cap — but crossing >$200/day marks the session 3DS.
    await db.pg.query(
      "update billing_accounts set created_at = now() - interval '60 days' where id = $1",
      [BA],
    );
    const res = await post(a, { kind: "topup", packId: "topup_200" });
    expect(res.status).toBe(200);
    const req = stripe.calls.at(-1)!.args as CheckoutSessionRequest;
    expect(req.require3ds).toBe(true); // $100 already attempted today + $200 > $200/day
  });
});

describe("POST /billing/portal + the subscription read", () => {
  it("404s without a Stripe customer; hands back the Portal URL with one", async () => {
    const stripe = new StubStripePort();
    const a = app({ stripe, appBaseUrl: "https://app.test" });
    expect((await a.request("/billing/portal", { method: "POST" })).status).toBe(404);
    await db.pg.query("update billing_accounts set stripe_customer_id = 'cus_1' where id = $1", [BA]);
    const res = await a.request("/billing/portal", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ returnTo: "/settings/billing" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { url: string }).url).toContain("billing.stripe.test");
    expect((stripe.calls.at(-1)!.args as { customerId: string }).customerId).toBe("cus_1");
  });

  it("GET /billing/subscription returns the plan card + trial + auto-reload shape", async () => {
    const res = await app().request("/billing/subscription");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tier: string;
      subscription: { tier: string; status: string; cancelAtPeriodEnd: boolean };
      trial: { state: string | null };
      autoReload: { enabled: boolean };
      hasStripeCustomer: boolean;
    };
    expect(body.tier).toBe("studio_max"); // the seeded paid plan
    expect(body.subscription.status).toBe("active");
    expect(body.trial.state).toBeNull();
    expect(body.autoReload.enabled).toBe(false);
  });
});

describe("POST /billing/subscription/cancel + change-plan (§14.6)", () => {
  it("cancel sets cancel_at_period_end — access runs to the paid-through date", async () => {
    const res = await app().request("/billing/subscription/cancel", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: true });
    const sub = (
      await db.client.query(
        "select cancel_at_period_end, status from subscriptions where billing_account_id = $1",
        [BA],
      )
    ).rows[0] as { cancel_at_period_end: boolean; status: string };
    expect(sub).toEqual({ cancel_at_period_end: true, status: "active" }); // still active to period end
  });

  it("change-plan downgrades schedule to period end; no subscription is 404; Team is 422", async () => {
    const post = (body: unknown) =>
      app().request("/billing/subscription/change-plan", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
    const res = await post({ tier: "writer" }); // studio_max → writer is a downgrade
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ applied: "scheduled" });
    const sub = (
      await db.client.query(
        "select tier, scheduled_tier from subscriptions where billing_account_id = $1",
        [BA],
      )
    ).rows[0] as { tier: string; scheduled_tier: string };
    expect(sub).toEqual({ tier: "studio_max", scheduled_tier: "writer" });
    expect((await post({ tier: "team" })).status).toBe(422);

    await db.pg.query("delete from subscriptions where billing_account_id = $1", [BA]);
    expect((await post({ tier: "writer" })).status).toBe(404);
  });
});

describe("GET /billing/checkout-sessions/:id — the return-poll read (REQ-BILL-14)", () => {
  it("returns the session row the return page polls; unknown id 404s", async () => {
    const stripe = new StubStripePort();
    const a = app({ stripe, appBaseUrl: "https://app.test" });
    const created = await a.request("/billing/checkout", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "subscribe", plan: "studio" }),
    });
    const { sessionId } = (await created.json()) as { sessionId: string };
    const res = await a.request(`/billing/checkout-sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const session = (await res.json()) as { state: string; kind: string; returnTo: string | null };
    expect(session).toMatchObject({ state: "open", kind: "subscribe" });
    expect((await a.request("/billing/checkout-sessions/cs_nope")).status).toBe(404);
  });
});

describe("PUT /billing/auto-reload — opt-in, user-capped (REQ-BILL-17)", () => {
  const put = (body: unknown) =>
    app().request("/billing/auto-reload", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });

  it("a valid opt-in persists; a missing threshold/pack/cap is 422 — never silently enabled", async () => {
    expect((await put({ enabled: true })).status).toBe(422); // nothing typed
    const res = await put({ enabled: true, thresholdCredits: 100, packId: "topup_10", monthlyCapUsd: 50 });
    expect(res.status).toBe(200);
    const acct = (
      await db.client.query(
        `select auto_reload_enabled, auto_reload_threshold_credits::int t, auto_reload_pack_id,
                auto_reload_month_cap_cents::int m from billing_accounts where id = $1`,
        [BA],
      )
    ).rows[0] as Record<string, unknown>;
    expect(acct).toMatchObject({
      auto_reload_enabled: true, t: 100, auto_reload_pack_id: "topup_10", m: 5000,
    });
    expect((await put({ enabled: false })).status).toBe(200); // disabling needs nothing else
  });
});

describe("POST /billing/team-waitlist + the usage reads", () => {
  it("the waitlist row IS the product (201); a bad email 400s", async () => {
    const res = await app().request("/billing/team-waitlist", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "team@x.test", seats: 6, note: "nyc" }),
    });
    expect(res.status).toBe(201);
    const row = (
      await db.client.query("select email, seats from team_waitlist where email = 'team@x.test'")
    ).rows[0] as { email: string; seats: number };
    expect(row.seats).toBe(6);
    const bad = await app().request("/billing/team-waitlist", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "nope" }),
    });
    expect(bad.status).toBe(400);
  });

  it("GET /billing/usage/account + /billing/usage.csv serve the §14.5 reads", async () => {
    const res = await app().request("/billing/usage/account");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { level0: { plan: string } };
    expect(body.level0.plan).toBe("Studio Max");

    const csv = await app().request("/billing/usage.csv");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("date,project,run_id");
  });
});

describe("account_suspended → 403 (REQ-SPEC-24.7)", () => {
  it("a suspended account's run creation is refused 403 — never a silent queue", async () => {
    deps.ledger.primeSuspended();
    const full = createApp({ ...deps, principal });
    const res = await full.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "idem-susp-1",
        workflow: "review",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: { draftId: seed.draftId, sidecar: true },
        inputSnapshot: { wordCount: 5180 },
        draftId: seed.draftId,
        corrKind: "review",
        corrK: 1,
      }),
    });
    expect(res.status).toBe(403);
    expect((await res.json() as { error: string }).error).toBe("account_suspended");
    expect((await db.client.query("select count(*)::int n from runs")).rows[0]).toEqual({ n: 0 }); // rolled back
  });
});
