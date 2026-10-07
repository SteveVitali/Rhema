import { afterEach, describe, expect, it, vi } from "vitest";
import { FetchStripePort, StripeRequestError, type CheckoutSessionRequest } from "./stripe-port.js";

// BILL.3 (REQ-BILL-16; ADR-030) — the Checkout request contract, asserted byte-for-byte. The 2026-10-01
// prod finding: `customer_update[address]` sent beside `customer_email` 400'd EVERY checkout
// ("`customer_update` can only be used with `customer` or `customer_account`") — the api then collapsed
// it into "billing is temporarily unavailable". This file pins the outgoing params for each arm and the
// error-classification seam the api's truthful-copy mapping rides on.

interface CapturedCall {
  url: string;
  auth: string;
  params: URLSearchParams;
}

function stubFetch(body: Record<string, unknown>, status = 200): CapturedCall[] {
  const calls: CapturedCall[] = [];
  vi.stubGlobal("fetch", async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      auth: String((init?.headers as Record<string, string>)?.authorization ?? ""),
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
