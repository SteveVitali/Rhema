# ADR-028: `purchase.mode` is a fail-closed stage-config switch with an `is_test` allowlist

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** BILL.3
- **Requirement ids:** REQ-BILL-16, REQ-BETA-15
- **Spec:** §14.6, §14.2, Appendix A.13

## Context

BILL.3 fixes the purchase path end-to-end, but the operator's pause on **re-opening purchase to
real users** stands (HUMAN-H7's real-money verification and any Stripe-side config remain
operator-held). The ticket therefore needed a switch that (a) ships closed on every stage, (b)
cannot accidentally fail open, (c) still lets the JOURNEY.1-flagged test tenants walk the real
Stripe pages for step N9, and (d) is flipped by an auditable operator act, not a runtime flag that
could be half-set.

## Decision

`purchase.mode` lives in **stage config** (`infra/config/stages.ts`, injected to the api as
`PURCHASE_MODE`), parsed by `parsePurchaseMode` — **any value other than the literal `open` is
`closed`** (the same fail-closed posture as `signup.mode`, inverted). Enforcement is in the api:
`/billing/checkout`, `/billing/portal`, and the auto-reload opt-IN return `403 purchase_closed` for
non-test workspaces before any Stripe call (auto-reload opt-*out* is never gated — a safety-off is
not a purchase). JOURNEY.1's server-set `workspaces.is_test` is the only allowlist, evaluated inside
the tenant transaction per request. The api reports the effective per-account mode as `purchase` on
the balance/subscription DTOs; the web fails closed when the field is absent and renders the paused
note instead of the purchase forms. A closed mode also **withholds `paymentLinkUrl` from the balance
DTO** — a caller who has the link could otherwise pay outside the closed UI while the webhook would
still be obliged to grant.

## Consequences

- Re-opening is one committed stage-fact flip + deploy — auditable in git, impossible to set
  halfway (there is no third state), and identical across api instances.
- N9 exercises the real Stripe-hosted pages on flagged tenants while every real account sees the
  paused state — the gate and the proof coexist on one deploy.
- No DB write path exists for the mode, so no request, job, or injection can flip it; the
  `is_test` predicate is server-set at provisioning (0046) and unreachable from any API.

## Alternatives considered

- **DB flag on the workspace/account**: per-tenant flexibility we do not need (the only exception
  required is `is_test`, which already exists), at the cost of a mutable row that could be flipped
  without a deploy trail.
- **Env-only switch without a stage fact**: less auditable — the Pulumi stack would carry a
  free-form env rather than a typed stage fact reviewed in a diff.
- **Feature-flag service**: no flag infra exists; a dependency for a two-state switch is unjustified.

## Revisit trigger

The operator's re-open ruling (the `GATE DECISIONS` row this ticket emits) — flipping
`STAGES.*.purchaseMode` to `"open"` — retires the closed half; a later per-tenant purchase
entitlement would supersede the global mode.
