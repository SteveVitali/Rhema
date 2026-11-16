import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchStripePort, StripeRequestError, STRIPE_API_VERSION, type CheckoutSessionRequest } from "./stripe-port.js";

// BILL.3 (REQ-BILL-16; ADR-030) — the Checkout request contract, asserted byte-for-byte. The 2026-10-01
// prod finding: `customer_update[address]` sent beside `customer_email` 400'd EVERY checkout
// ("`customer_update` can only be used with `customer` or `customer_account`") — the api then collapsed
// it into "billing is temporarily unavailable". This file pins the outgoing params for each arm and the
// error-classification seam the api's truthful-copy mapping rides on.

interface CapturedCall {
  url: string;
  auth: string;
  headers: Record<string, string>;
  idempotencyKey: string;
  params: URLSearchParams;
}

function stubFetch(body: Record<string, unknown>, status = 200): CapturedCall[] {
  const calls: CapturedCall[] = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      auth: String(headers.authorization ?? ""),
      headers,
      idempotencyKey: String(headers["idempotency-key"] ?? headers["Idempotency-Key"] ?? ""),
      params: new URLSearchParams(String(init?.body)),
    });
    return new Response(JSON.stringify(body), { status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const BASE_REQ: CheckoutSessionRequest = {
  sessionId: "chk_1",
  kind: "topup",
  billingAccountId: "ba_1",
  workspaceId: "ws_1",
  userId: "usr_1",
  pack: { id: "topup_10", usd: 10, credits: 1000 },
  successUrl: "https://app.test/billing/return?session_id=chk_1",
  cancelUrl: "https://app.test/billing/return?session_id=chk_1&cancelled=1",
};

describe("FetchStripePort.createCheckoutSession — the request contract", () => {
  it("customer present: `customer` carries the id and `customer_update[address]` is legal", async () => {
    const calls = stubFetch({ id: "cs_live_1", url: "https://checkout.stripe.com/pay/cs_live_1" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const out = await port.createCheckoutSession({ ...BASE_REQ, customerId: "cus_1" });
    const p = calls[0]!.params;
    expect(p.get("customer")).toBe("cus_1");
    expect(p.get("customer_update[address]")).toBe("auto");
    expect(p.get("customer_email")).toBeNull();
    expect(p.get("customer_creation")).toBeNull(); // a known customer — nothing to create
    expect(out).toEqual({ id: "cs_live_1", url: "https://checkout.stripe.com/pay/cs_live_1" });
    expect(calls[0]!.url).toBe("https://api.stripe.test/v1/checkout/sessions");
    expect(calls[0]!.auth).toBe("Bearer sk_test_x");
  });

  it("customer ABSENT (the prod-400 shape): NO `customer_update`; `customer_email` + `customer_creation` carry it", async () => {
    const calls = stubFetch({ id: "cs_live_2", url: "https://checkout.stripe.com/pay/cs_live_2" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession({ ...BASE_REQ, customerEmail: "u@example.com" });
    const p = calls[0]!.params;
    expect(p.get("customer")).toBeNull();
    // THE contract: customer_update is never sent without a customer (the field 400'd the whole session).
    expect(p.get("customer_update[address]")).toBeNull();
    expect(p.get("customer_email")).toBe("u@example.com");
    // payment mode mints the Customer so session.customer resolves → the account reaches the Portal.
    expect(p.get("customer_creation")).toBe("always");
    expect(p.get("mode")).toBe("payment");
  });

  it("no customer and no email: still no `customer_update`; payment mode still creates the customer", async () => {
    const calls = stubFetch({ id: "cs_live_3", url: "https://checkout.stripe.com/pay/cs_live_3" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession(BASE_REQ);
    const p = calls[0]!.params;
    expect(p.get("customer_update[address]")).toBeNull();
    expect(p.get("customer_email")).toBeNull();
    expect(p.get("customer_creation")).toBe("always");
  });

  it("subscribe mode (no customer): never `customer_creation` — subscription mode always makes one", async () => {
    const calls = stubFetch({ id: "cs_live_4", url: "https://checkout.stripe.com/pay/cs_live_4" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession({
      ...BASE_REQ,
      kind: "subscribe",
      pack: undefined,
      plan: { tier: "writer", display: "Writer", cycle: "monthly", unitAmountCents: 2000 },
    });
    const p = calls[0]!.params;
    expect(p.get("mode")).toBe("subscription");
    expect(p.get("customer_creation")).toBeNull();
    expect(p.get("customer_update[address]")).toBeNull();
    expect(p.get("line_items[0][price_data][unit_amount]")).toBe("2000");
    expect(p.get("line_items[0][price_data][recurring][interval]")).toBe("month");
  });

  it("automatic tax: OFF by default; the opt-in sends `enabled=true` (operator-activated Tax only)", async () => {
    const off = stubFetch({ id: "cs_1", url: "https://checkout.stripe.com/x" });
    await new FetchStripePort("sk_test_x", "https://api.stripe.test").createCheckoutSession(BASE_REQ);
    expect(off[0]!.params.get("automatic_tax[enabled]")).toBe("false");

    const on = stubFetch({ id: "cs_2", url: "https://checkout.stripe.com/y" });
    await new FetchStripePort("sk_test_x", "https://api.stripe.test", { automaticTax: true }).createCheckoutSession(
      BASE_REQ,
    );
    expect(on[0]!.params.get("automatic_tax[enabled]")).toBe("true");
  });

  it("3DS: `request_three_d_secure` only when the caller asks (> $200/day)", async () => {
    const calls = stubFetch({ id: "cs_5", url: "https://checkout.stripe.com/z" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession({ ...BASE_REQ, require3ds: true });
    expect(calls[0]!.params.get("payment_method_options[card][request_three_d_secure]")).toBe("any");
  });
});

describe("FetchStripePort — the Stripe-Version pin (RH-9; 268_R6BILL.1)", () => {
  it("pins STRIPE_API_VERSION = `2025-03-31.basil` — the version the handlers' field reads are written for", () => {
    // Basil is the FIRST release carrying invoice.parent.subscription_details.subscription +
    // item-level current_period_*; clover/dahlia/endive add breaking changes this integration has
    // not audited (e.g. Clover's flexible-billing default on Checkout-minted subscriptions).
    expect(STRIPE_API_VERSION).toBe("2025-03-31.basil");
  });

  it("EVERY request carries `Stripe-Version` — checkout, portal, subscription update, off-session charge", async () => {
    const calls = stubFetch({ id: "x_1", url: "https://x.test", status: "succeeded" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession(BASE_REQ);
    await port.createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test/billing" });
    await port.setSubscriptionCancelAtPeriodEnd({ subscriptionId: "sub_1", cancelAtPeriodEnd: true });
    await port.chargeOffSession({ customerId: "cus_1", amountCents: 1000, idempotencyKey: "k1", description: "d" });
    expect(calls).toHaveLength(4);
    for (const c of calls) expect(c.headers["stripe-version"]).toBe("2025-03-31.basil");
    // and it pins the exported constant, not a drifting literal.
    for (const c of calls) expect(c.headers["stripe-version"]).toBe(STRIPE_API_VERSION);
  });
});

describe("FetchStripePort — Idempotency-Key on EVERY POST (RH-3)", () => {
  it("chargeOffSession forwards the call-site key verbatim — a sweep retry replays the SAME charge request", async () => {
    const calls = stubFetch({ id: "pi_1", status: "succeeded" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const out = await port.chargeOffSession({
      customerId: "cus_1",
      amountCents: 1000,
      idempotencyKey: "auto-reload:ba_1:2026-09:1",
      description: "Rhema auto-reload: 1,000 credits",
      billingAccountId: "ba_1",
      workspaceId: "ws_1",
      packId: "topup_10",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.idempotencyKey).toBe("auto-reload:ba_1:2026-09:1");
    expect(out).toEqual({ paymentIntentId: "pi_1", status: "succeeded" });
    // the reconcile arm resolves the account/workspace/pack off the intent's metadata.
    const p = calls[0]!.params;
    expect(p.get("metadata[kind]")).toBe("auto_reload");
    expect(p.get("metadata[billing_account_id]")).toBe("ba_1");
    expect(p.get("metadata[workspace_id]")).toBe("ws_1");
    expect(p.get("metadata[pack_id]")).toBe("topup_10");
  });

  it("createCheckoutSession keys on our durable checkout_sessions row id — a retry collapses", async () => {
    const calls = stubFetch({ id: "cs_1", url: "https://checkout.stripe.com/pay/cs_1" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createCheckoutSession(BASE_REQ); // sessionId "chk_1"
    expect(calls[0]!.idempotencyKey).toBe("checkout-session:chk_1");
    await port.createCheckoutSession(BASE_REQ); // a retried create for the same row
    expect(calls[1]!.idempotencyKey).toBe("checkout-session:chk_1");
  });

  it("createPortalSession sends a fresh per-request key (no call-site key exists)", async () => {
    const calls = stubFetch({ id: "bps_1", url: "https://billing.stripe.com/s/bps_1" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test/billing" });
    expect(calls[0]!.idempotencyKey).toBeTruthy();
    await port.createPortalSession({ customerId: "cus_1", returnUrl: "https://app.test/billing" });
    expect(calls[1]!.idempotencyKey).toBeTruthy();
    expect(calls[1]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey);
  });

  it("setSubscriptionCancelAtPeriodEnd sends a fresh per-request key — the op is state-idempotent", async () => {
    const calls = stubFetch({ id: "sub_1" });
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    await port.setSubscriptionCancelAtPeriodEnd({ subscriptionId: "sub_1", cancelAtPeriodEnd: true });
    expect(calls[0]!.idempotencyKey).toBeTruthy();
    // A deterministic key would replay-stale a flag toggled twice inside Stripe's 24h window —
    // a cancel → uncancel → cancel cycle must reach Stripe every time.
    await port.setSubscriptionCancelAtPeriodEnd({ subscriptionId: "sub_1", cancelAtPeriodEnd: true });
    expect(calls[1]!.idempotencyKey).not.toBe(calls[0]!.idempotencyKey);
  });
});

describe("FetchStripePort — classified failures (BILL.3)", () => {
  it("a 400 becomes StripeRequestError{rejected:true} with Stripe's type/code", async () => {
    stubFetch(
      {
        error: {
          message: "`customer_update` can only be used with `customer` or `customer_account`.",
          type: "invalid_request_error",
          code: "parameter_invalid_empty",
        },
      },
      400,
    );
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const err = await port.createCheckoutSession(BASE_REQ).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err.status).toBe(400);
    expect(err.rejected).toBe(true);
    expect(err.stripeType).toBe("invalid_request_error");
    expect(err.stripeCode).toBe("parameter_invalid_empty");
    expect(err.message).toContain("customer_update");
  });

  it("a 502 becomes StripeRequestError{rejected:false} — Stripe's outage, not our shape", async () => {
    stubFetch({ error: { message: "upstream", type: "api_error" } }, 502);
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const err = await port.createCheckoutSession(BASE_REQ).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err.rejected).toBe(false);
  });

  it("the portal path throws the same classified error", async () => {
    stubFetch({ error: { message: "No such customer", type: "invalid_request_error" } }, 404);
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const err = await port.createPortalSession({ customerId: "cus_x", returnUrl: "https://app.test/billing" }).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err.rejected).toBe(true);
  });

  it("a transport failure becomes StripeRequestError{status:0,rejected:false} — never a request rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const err = await port.createCheckoutSession(BASE_REQ).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err.status).toBe(0);
    expect(err.rejected).toBe(false);
  });

  it("a non-JSON Stripe error body still classifies by HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("bad gateway", { status: 502 })));
    const port = new FetchStripePort("sk_test_x", "https://api.stripe.test");
    const err = await port.createCheckoutSession(BASE_REQ).catch((e) => e);
    expect(err).toBeInstanceOf(StripeRequestError);
    expect(err.status).toBe(502);
    expect(err.rejected).toBe(false);
  });
});
