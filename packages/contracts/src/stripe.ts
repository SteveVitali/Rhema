// The Stripe-hosted surfaces the web may redirect/form-post to (BILL.3; REQ-BILL-16; §14.6).
// `checkout.stripe.com` hosts Checkout sessions (`/billing/checkout` + subscribe/top-up POSTs),
// `billing.stripe.com` hosts the customer Portal, `buy.stripe.com` hosts Payment Links (the run-sheet
// exhaustion panel). The CSP `form-action` allowlist and the redirect-target validator share this ONE
// list — a hosted page the app hands off to is always reachable by form submission AND always validated
// before a 302 is emitted (a Stripe URL the api returns is still checked here — defence in depth).

export const STRIPE_HOSTED_ORIGINS = [
  "https://checkout.stripe.com",
  "https://billing.stripe.com",
  "https://buy.stripe.com",
] as const;

/** True when `url` parses AND its origin is a Stripe-hosted surface above. Non-URL input ⇒ false —
 *  the caller never redirects to it. */
export function isStripeHostedRedirect(url: string): boolean {
  try {
    return (STRIPE_HOSTED_ORIGINS as readonly string[]).includes(new URL(url).origin);
  } catch {
    return false;
  }
}
