# ADR-030: Checkout sessions scope `customer_update` to `customer` and ship `automatic_tax` opt-in

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** BILL.3
- **Requirement ids:** REQ-BILL-16, REQ-BILL-14
- **Spec:** §14.6 (checkout failure states), §14.2

## Context

Prod's "Billing is temporarily unavailable" was diagnosed (read-only Cloud Logging, 2026-10-01) as a
400 on every `POST /v1/checkout/sessions`: `` `customer_update` can only be used with `customer` or
`customer_account` ``. `FetchStripePort` sent `customer_update[address]=auto` unconditionally —
illegal for the never-purchased account that carries only `customer_email` — and the api collapsed
the refusal into the generic class (the three-layer failure the ticket exists to fix: bad request
shape → swallowed error → untruthful copy). The port also sent `automatic_tax[enabled]=true`
unconditionally, presuming a Tax registration the operator has not activated Stripe-side
(BL-33/HUMAN-H7 stays paused) — the next 400 in line.

## Decision

The Checkout request contract in `FetchStripePort.createCheckoutSession` is now:

- `customer` present ⇒ `customer_update[address]=auto` (legal — address collection on a known
  customer); absent ⇒ **no `customer_update` at all**, `customer_email` when supplied, and
  `customer_creation=always` on `payment` mode so the completed session mints the Customer the
  Portal needs (the webhook arm persists `session.customer` onto `billing_accounts` — the top-up,
  Payment-Link, and setup arms all backfill `stripe_customer_id` under an `is null` guard).
- `automatic_tax[enabled]` is **opt-in off by default** — `STRIPE_AUTOMATIC_TAX=true` on the api
  turns it on only once the operator activates a Tax registration; until then sessions are tax-free
  rather than rejected.
- Stripe failures throw `StripeRequestError` carrying HTTP status + Stripe `error.type`/`error.code`;
  the api maps `rejected` (4xx — our shape) to `502 stripe_rejected` and 5xx/transport to
  `503 stripe_unavailable`, logging the error class + the diagnosable session id (the row is
  inserted before the call precisely so a refused request is traceable).

`stripe-port.test.ts` pins the outgoing params byte-for-byte per arm, including the regression test
that reproduces the diagnosed prod failure (the no-customer shape must never carry
`customer_update`).

## Consequences

- Every account — first purchase included — gets a valid session; the request shape can no longer
  presume account-side configuration.
- Failure classes stay truthful end-to-end (Stripe 4xx ≠ Stripe down ≠ internal bug ≠ purchase
  closed), and each class maps to its own user-facing copy.
- `customer_creation=always` + the webhook backfill mean a first Payment-Link/Checkout purchase
  leaves the account Portal-ready.

## Alternatives considered

- **Dropping `customer_update` entirely**: loses address collection for returning customers (the
  future Tax seam needs it); scoping it to `customer`-present keeps both paths legal.
- **Keeping `automatic_tax` on and treating the 400 as the Tax-activation signal**: a presuming
  request shape is exactly the bug class being fixed; off-by-default degrades honestly.
- **Hiding the diagnosis behind retries**: a 4xx shape error is deterministic — retrying only delays
  the same refusal.

## Revisit trigger

Operator activates Stripe Tax (then `STRIPE_AUTOMATIC_TAX=true` is the documented flip) or Stripe
publishes a Checkout API version that changes the `customer_update`/`customer_creation` constraints —
the pinned request-shape tests should be re-derived against that version.
