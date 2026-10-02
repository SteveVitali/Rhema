# ADR-029: The pending-checkout email triggers on `return_viewed_at`, sent post-commit at open→completed

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** BILL.3 (absorbs BL-09)
- **Requirement ids:** REQ-BILL-16, REQ-BILL-14
- **Spec:** §14.6 (webhook lag: poll ≤ 30 s, then email), §5.11 (the email row)

## Context

The `/billing/return` page promises "we'll email you when it lands" — a page lie, because no job
ever sent that mail (STB.4 Leg A (f), D-PRB.08-6). The trigger needed three properties: fire **only
for a user who actually saw the pending state** (a completion that lands before the first return
view renders "confirmed" immediately — mailing would be noise), be **exactly-once** under Stripe's
at-least-once webhooks and worker retries, and carry **no Stripe secrets or card data** (manifest
invariant #10).

## Decision

Two additive columns on `checkout_sessions` (migration 0048) make the send a pure state machine:

- `return_viewed_at` — stamped by the **tenant-scoped return-poll route** on the first read that
  observes `state='open'`, written *before* the read so a racing webhook's `open→completed` update
  sees the marker (the poll is the only writer; the workspace predicate keeps a guessed session id
  from being marked cross-tenant).
- `pending_email_queued_at` — stamped **after** the notify enqueue returns, so a worker crash
  between the completion write and the enqueue leaves the mail retryable on event redrive, while a
  redrive after a successful enqueue finds the marker and does not enqueue a second.

The `checkout.session.completed` handler sends the `trial_payment` mail **only on the
`open→completed` transition** (`completeCheckoutSession` returns the transitioned row, else null),
post-commit (a rolled-back grant never mails), when `return_viewed_at` is set and
`pending_email_queued_at` is not. The payload rides the existing notify queue with
`tag: checkout:<sessionId>` — the `notification_deliveries` dedup key makes a duplicated/retried
job send once — and `openPath: <returnTo>` deep-links back to the page the user came from (in-app
paths only; anything else falls back to `/settings/billing`).

## Consequences

- The page promise is now true: completion after an observed-open view produces exactly one
  transactional email; completion before any view produces none; a replay produces none.
- No sweeper job was added — the send is colocated with the state transition that creates the fact,
  so there is no polling loop to bound and no second writer to race.
- The mail carries a templated reason string + in-app path + ids only.

## Alternatives considered

- **A `pending-email` sweep job** over `checkout_sessions` (open past N seconds): adds a cron, a
  scan predicate, and a two-writer race with the webhook; the transition-side send is simpler and
  strictly more timely.
- **Triggering off the poll returning `open` N times** ("the user waited ≥30 s"): couples the mail
  to client polling behavior; the view-marker is the honest fact ("the user saw pending").
- **Mailing on every completion**: wrong — a fast checkout's return page already confirms; the mail
  exists for the *lag* case only.

## Revisit trigger

If Stripe-hosted completion emails are enabled account-side, or if the return page gains a
server-pushed channel (SSE/websocket) that makes "viewed pending" observable without the poll.
