import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { processStripeEvent, signStripePayload, SqlHoldLedger, STRIPE_EVENT_JOB } from "@rhema/ledger";
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
  it("returns the spendable sum + suspension + the beta Payment Link", async () => {
    await db.pg.query("insert into credit_balances(billing_account_id, bucket, available, held) values ($1,'included',1200,0),($1,'promo',300,0)", [BA]);
    const res = await app().request("/billing/balance");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      spendableCredits: 1500,
      suspended: false,
      clawbackDebt: 0,
      paymentLinkUrl: "https://buy.stripe.com/test_beta",
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
