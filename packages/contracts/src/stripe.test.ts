import { describe, expect, it } from "vitest";
import { STRIPE_HOSTED_ORIGINS, isStripeHostedRedirect } from "./stripe.js";

// BILL.3 (ADR-027; REQ-BILL-16) — the single Stripe-hosted list that both the CSP `form-action`
// allowlist and the web's redirect-target validator consume. This file pins the allowlist's exact
// membership and the validator's refusal edge cases, so a redirect host dropped from the constant —
// or smuggled past the check — fails here.

describe("STRIPE_HOSTED_ORIGINS (BILL.3)", () => {
  it("is exactly the three Stripe-hosted surfaces — no wildcard, no extras", () => {
    expect(STRIPE_HOSTED_ORIGINS).toEqual([
      "https://checkout.stripe.com",
      "https://billing.stripe.com",
      "https://buy.stripe.com",
    ]);
    for (const origin of STRIPE_HOSTED_ORIGINS) {
      expect(origin).not.toContain("*");
      expect(origin).toMatch(/^https:\/\/[a-z.]+$/); // scheme + host only — no path/port
    }
  });
});

describe("isStripeHostedRedirect", () => {
  it("accepts any URL on the three hosted origins (path/query included)", () => {
    expect(isStripeHostedRedirect("https://checkout.stripe.com/c/pay/cs_test_123")).toBe(true);
    expect(isStripeHostedRedirect("https://billing.stripe.com/p/session/bps_1")).toBe(true);
    expect(isStripeHostedRedirect("https://buy.stripe.com/abc?client_reference_id=ba_1")).toBe(true);
  });

  it("refuses every other host — including look-alike subdomains and the API host", () => {
    for (const url of [
      "https://stripe.com/pay", // apex is not a hosted-surface host
      "https://api.stripe.com/v1/checkout/sessions", // the API is never a redirect target
      "https://checkout.stripe.com.evil.example/pay", // suffix spoof
      "https://evil-checkout.stripe.com/pay", // subdomain spoof
      "https://rhema.tools/billing", // our own origin is not Stripe-hosted
      "http://checkout.stripe.com/pay", // scheme downgrade
      "ftp://buy.stripe.com/x",
    ]) {
      expect(isStripeHostedRedirect(url), url).toBe(false);
    }
  });

  it("refuses non-URL input rather than throwing — the caller never redirects to it", () => {
    for (const bad of ["", "not a url", "javascript:alert(1)", "//buy.stripe.com", "checkout.stripe.com"]) {
      expect(isStripeHostedRedirect(bad), bad).toBe(false);
    }
  });
});
