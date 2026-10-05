// The Stripe Billing port (P1.16; §14.2/14.6; REQ-BILL-14/16/17). The api/worker depend on this narrow
// interface; the live implementation is a thin REST client (no `stripe` SDK — the webhook's HMAC check is
// already hand-rolled in stripe.ts), and tests bind `StubStripePort`. Nothing in the ledger reaches the
// network directly: a port call is either pre-transaction (create a Checkout/Portal session → hand back a
// URL) or an explicitly-audited unattended charge (auto-reload — the ONLY one; REQ-BILL-17).

export interface CheckoutSessionRequest {
  /** our checkout_sessions row id — echoed in Stripe metadata so the webhook resolves the grant. */
  readonly sessionId: string;
  readonly kind: "subscribe" | "topup" | "auto_reload_setup";
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly userId?: string;
  readonly customerId?: string | null;
  readonly customerEmail?: string;
  /** subscribe: the plan + cycle the Checkout price_data renders. */
  readonly plan?: { tier: string; display: string; cycle: "monthly" | "annual"; unitAmountCents: number };
  /** topup/auto_reload_setup: the pack. */
  readonly pack?: { id: string; usd: number; credits: number };
  readonly successUrl: string;
  readonly cancelUrl: string;
  /** > $200/day forces 3-D Secure (§14.2) — the caller sets this from the account's daily counter. */
  readonly require3ds?: boolean;
}

export interface StripeSessionRef {
  readonly id: string;
  readonly url: string;
}

export interface OffSessionChargeResult {
  readonly paymentIntentId: string;
  readonly status: "succeeded" | "requires_action" | "failed";
  readonly declineCode?: string;
}

/** The Stripe operations P1.16 needs. Implementations MUST NOT write ledger rows. */
export interface StripePort {
  createCheckoutSession(req: CheckoutSessionRequest): Promise<StripeSessionRef>;
  createPortalSession(args: { customerId: string; returnUrl: string }): Promise<StripeSessionRef>;
  /** The auto-reload charge — off-session on the customer's default payment method (REQ-BILL-17). */
  chargeOffSession(args: {
    customerId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<OffSessionChargeResult>;
}

/**
 * Deterministic test/dev port. Records every call; mints stable ids; `prime*` knobs exercise the failure
 * arms (a card decline stays on Checkout; an off-session failure becomes a `failed` auto_reload_event).
 */
export class StubStripePort implements StripePort {
  readonly calls: { method: string; args: unknown }[] = [];
  private seq = 0;
  chargeResult: OffSessionChargeResult = { paymentIntentId: "pi_stub", status: "succeeded" };

  primeCharge(result: Partial<OffSessionChargeResult>): void {
    this.chargeResult = { paymentIntentId: "pi_stub", status: "succeeded", ...result } as OffSessionChargeResult;
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<StripeSessionRef> {
    this.calls.push({ method: "createCheckoutSession", args: req });
    const id = `cs_test_stub_${++this.seq}`;
    return { id, url: `https://checkout.stripe.test/${id}` };
  }
  async createPortalSession(args: { customerId: string; returnUrl: string }): Promise<StripeSessionRef> {
    this.calls.push({ method: "createPortalSession", args });
    const id = `bps_stub_${++this.seq}`;
    return { id, url: `https://billing.stripe.test/${id}` };
  }
  async chargeOffSession(args: {
    customerId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<OffSessionChargeResult> {
    this.calls.push({ method: "chargeOffSession", args });
    return this.chargeResult;
  }
}

/**
 * The live REST port — Stripe's form-encoded API over fetch (Node ≥ 20). Bound by the api only when
 * `STRIPE_SECRET_KEY` is configured; absent ⇒ checkout routes refuse with `stripe_unconfigured` (never a
 * silent fallback that pretends a real session exists).
 */
export class FetchStripePort implements StripePort {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = "https://api.stripe.com",
  ) {}

  private async post(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params).toString(),
    });
    const body = (await res.json()) as Record<string, unknown> & { error?: { message?: string } };
    if (!res.ok) throw new Error(`stripe ${path} failed: ${body.error?.message ?? res.status}`);
    return body;
  }

  async createCheckoutSession(req: CheckoutSessionRequest): Promise<StripeSessionRef> {
    const params: Record<string, string> = {
      mode: req.kind === "subscribe" ? "subscription" : "payment",
      success_url: req.successUrl,
      cancel_url: req.cancelUrl,
      "metadata[checkout_session_id]": req.sessionId,
      "metadata[kind]": req.kind,
      "metadata[billing_account_id]": req.billingAccountId,
      "metadata[workspace_id]": req.workspaceId,
      client_reference_id: req.billingAccountId,
      // Stripe Tax seam (§14.2): automatic tax on the address Checkout collects.
      "automatic_tax[enabled]": "true",
      "customer_update[address]": "auto",
    };
    if (req.customerId) params.customer = req.customerId;
    else if (req.customerEmail) params.customer_email = req.customerEmail;
    if (req.require3ds) params["payment_method_options[card][request_three_d_secure]"] = "any";
    if (req.pack) {
      params["line_items[0][price_data][currency]"] = "usd";
      params["line_items[0][price_data][unit_amount]"] = String(req.pack.usd * 100);
      params["line_items[0][price_data][product_data][name]"] = `${req.pack.credits.toLocaleString("en-US")} credits`;
      params["line_items[0][quantity]"] = "1";
      params["metadata[pack_id]"] = req.pack.id;
      params["payment_intent_data[metadata][billing_account_id]"] = req.billingAccountId;
      params["payment_intent_data[metadata][pack_id]"] = req.pack.id;
    }
    if (req.plan) {
      params["line_items[0][price_data][currency]"] = "usd";
      params["line_items[0][price_data][unit_amount]"] = String(req.plan.unitAmountCents);
      params["line_items[0][price_data][recurring][interval]"] = req.plan.cycle === "annual" ? "year" : "month";
      params["line_items[0][price_data][product_data][name]"] = `Rhema ${req.plan.display}`;
      params["line_items[0][quantity]"] = "1";
      params["metadata[plan]"] = req.plan.tier;
      params["metadata[cycle]"] = req.plan.cycle;
      params["subscription_data[metadata][billing_account_id]"] = req.billingAccountId;
      params["subscription_data[metadata][plan]"] = req.plan.tier;
      params["subscription_data[metadata][cycle]"] = req.plan.cycle;
    }
    const body = await this.post("/v1/checkout/sessions", params);
    return { id: String(body.id), url: String(body.url) };
  }

  async createPortalSession(args: { customerId: string; returnUrl: string }): Promise<StripeSessionRef> {
    const body = await this.post("/v1/billing_portal/sessions", {
      customer: args.customerId,
      return_url: args.returnUrl,
    });
    return { id: String(body.id), url: String(body.url) };
  }

  async chargeOffSession(args: {
    customerId: string;
    amountCents: number;
    idempotencyKey: string;
    description: string;
  }): Promise<OffSessionChargeResult> {
    try {
      const body = await this.post("/v1/payment_intents", {
        customer: args.customerId,
        amount: String(args.amountCents),
        currency: "usd",
        confirm: "true",
        off_session: "true",
        description: args.description,
      });
      const status = String(body.status);
      return {
        paymentIntentId: String(body.id),
        status: status === "succeeded" ? "succeeded" : status === "requires_action" ? "requires_action" : "failed",
      };
    } catch (err) {
      return { paymentIntentId: "", status: "failed", declineCode: err instanceof Error ? err.message : "error" };
    }
  }
}
