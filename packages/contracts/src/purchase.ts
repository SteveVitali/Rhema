// Purchase admission mode (BILL.3; REQ-BILL-16). `closed` = no Checkout session or Payment-Link hand-off
// is offered to a real user — every purchase entry point (billing subscribe/top-up forms, the run-sheet
// exhaustion panel) renders the paused note and the api refuses with `purchase_closed`. `open` = purchases
// flow to Stripe-hosted pages.
//
// JOURNEY.1-flagged test tenants (`workspaces.is_test` — server-set, never client-forgeable) are
// allowlisted past the closed gate so the N9 purchase journey can exercise the real Stripe pages while
// the mode stays closed for everyone else.
//
// Fail-closed: an unknown/absent value parses to `closed` — a deploy typo can never silently open purchase
// (the same posture as `parseSignupMode`, inverted: signup fail-closes to `invite`, purchase to `closed`).

export const PURCHASE_MODES = ["closed", "open"] as const;
export type PurchaseMode = (typeof PURCHASE_MODES)[number];

/** Parse a stage-config/env value; unknown or unset ⇒ `closed` (fail-closed — never fail open). */
export function parsePurchaseMode(raw: string | undefined | null): PurchaseMode {
  return raw === "open" ? "open" : "closed";
}

/** What the api reports on billing reads (`purchase` on the balance/subscription DTOs) — `closed` means
 *  the caller's surfaces render the paused note and the purchase POSTs would 403 anyway. */
export type PurchaseState = PurchaseMode;
