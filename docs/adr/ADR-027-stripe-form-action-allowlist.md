# ADR-027: CSP `form-action` allows exactly the Stripe-hosted origins from one shared constant

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** BILL.3
- **Requirement ids:** REQ-BETA-15, REQ-GROWTH-13, REQ-BILL-16
- **Spec:** §14.6, §13.3 (the P1.22 CSP audit)

## Context

P1.22 (`23fabce`, 2026-09-25) hardened the Content-Security-Policy to `form-action 'self'`. That
directive governs not just the form's `action` URL but the *post-submit redirect chain*: a
same-origin POST that answers `302 → checkout.stripe.com` is blocked, so every purchase entry point
(run-sheet *Add credits* → `buy.stripe.com`, billing *Buy* / *Choose Writer* → `checkout.stripe.com`,
the Portal → `billing.stripe.com`) silently did nothing — PR-J2's `06-billing-unavailable.jpg`.
BILL.3 had to reopen exactly the Stripe hand-off without weakening the policy's protection against
form-action injection (the whole point of the header is that an injected form cannot exfiltrate a
POST off-origin).

## Decision

The web's `cspFor` emits `form-action 'self'` **plus the literal origins in
`@rhema/contracts`' `STRIPE_HOSTED_ORIGINS`** (`https://checkout.stripe.com`,
`https://billing.stripe.com`, `https://buy.stripe.com`) — host allowlist, no wildcards, no
subdomain spans. The same constant also feeds the server-side redirect validator
(`isStripeHostedRedirect`), which every billing POST runs before emitting its 302: a URL the api
returned that is not on the list is refused (logged, generic notice) rather than followed. One
constant, two enforcement layers — the CSP can never admit a host the server would not redirect to,
and a compromised/misconfigured api response can never smuggle a host the CSP would block anyway.

## Consequences

- The three purchase hand-offs work; every other off-origin form target stays blocked.
- Adding a fourth Stripe surface (e.g. a future hosted surface) is a one-line change to
  `STRIPE_HOSTED_ORIGINS`; both layers pick it up, and the `billing-surfaces` test pins the exact
  list so a dropped host or a `*` turns red.
- The allowlist names hosts, not paths — a Stripe-hosted URL of any path shape is admissible, which
  matches Stripe's own URL evolution (checkout links, payment links, portal sessions).

## Alternatives considered

- **Same-origin GET hand-off page** (`/billing/go?to=…` rendering a link/auto-navigate): works
  without touching `form-action`, but adds a hop, an open-redirect surface of our own to guard, and
  a second failure mode — the host allowlist is strictly smaller.
- **`form-action https:` or a `*.stripe.com` wildcard**: admits far more than the app ever needs;
  rejected for the same reason the bare `'self'` regression was wrong in the other direction.
- **Per-route CSP**: the header is response-wide; narrowing scope per page would complicate
  `cspFor` for no benefit — the three hosts are only ever targets, never embedding surfaces.

## Revisit trigger

Reopen if Stripe documents a hosted surface outside the three origins (e.g. a region-specific host),
or if a CSP level adds a narrower directive for post-submit redirects that should replace the
host list.
