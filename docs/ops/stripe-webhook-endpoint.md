# Stripe webhook endpoint — `enabled_events` runbook (R6FIX.5; F-R6H11B-2)

> **Status: required at the R6LCH.1 launch deploy.** The prod endpoint
> `we_1UH99C2MLe3ETP9Sk4UQBKXs` was created **imperatively** in PRB.18 (Stripe API — not
> Pulumi; IaC owns only the `stripe-webhook-secret` container). Its `enabled_events` was
> authored when the processor had three arms; P1.16/BILL.3 added six more. The H11B live
> session proved the gap: a real Customer-Portal cancel-at-period-end fired
> `customer.subscription.updated`, the endpoint wasn't subscribed, and our row kept
> `cancel_at_period_end=false` — the UI said "Renews …" while Stripe had stopped renewing.

## The contract

`STRIPE_WEBHOOK_EVENT_TYPES` (`packages/ledger/src/stripe.ts`, exported from `@rhema/ledger`)
is the canonical list — one entry per arm in `processStripeEvent`'s dispatch switch. A new arm
MUST join the list AND this update MUST run (the sorted-set test pins the list).

Current required set:

```
checkout.session.completed
checkout.session.expired
invoice.paid
invoice.payment_failed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
charge.dispute.created
charge.dispute.closed
```

## Preconditions

- Operator `stripe` CLI authenticated to the live account (`stripe login` / `STRIPE_API_KEY`),
  or the Stripe Dashboard → Developers → Webhooks open on `we_1UH99C2MLe3ETP9Sk4UQBKXs`.
- No deploy dependency: the processing code for every arm already ships on prod (`dc3a8f6`+);
  this update is Stripe-side state only. Any later arms land through the same update.

## Step 1 — subscribe the endpoint to the full handled set

```bash
stripe webhook_endpoints update we_1UH99C2MLe3ETP9Sk4UQBKXs \
  --enabled-events checkout.session.completed \
  --enabled-events checkout.session.expired \
  --enabled-events invoice.paid \
  --enabled-events invoice.payment_failed \
  --enabled-events customer.subscription.created \
  --enabled-events customer.subscription.updated \
  --enabled-events customer.subscription.deleted \
  --enabled-events charge.dispute.created \
  --enabled-events charge.dispute.closed
```

(Dashboard equivalent: edit the endpoint, tick all nine event types, save.)

## Step 2 — verify

```bash
stripe webhook_endpoints retrieve we_1UH99C2MLe3ETP9Sk4UQBKXs \
  --format json | jq '.enabled_events'
```

The list must equal `STRIPE_WEBHOOK_EVENT_TYPES` exactly (supersets are legal — an event the
processor doesn't dispatch is acknowledged `ignored`; a MISSING type is the bug this runbook
exists for). `stripe trigger customer.subscription.updated` is a valid smoke leg against a
test-mode endpoint; never against prod.

## Step 3 — record

Append the dated evidence line to `docs/build/LEDGER.md` GATE-LAUNCH threshold-1 note and flip
the F-R6H11B-2 deferral tail (DEFERRALS.md) — live verification is owed until the first real
`customer.subscription.*` event lands post-update.

## The parked H11B event — `evt_1UVF7T…` (F-R6H11B-1 compensation)

The $10 `topup_10` purchase (`checkout cs_live_a1YA4…`, paid 2026-10-27 via Apple Pay) is parked in
`stripe_events` with `processed_at` NULL — the nanoid-`user_id` analytics throw rolled its grant tx
back on the pre-fix build. After the fixed build deploys, re-drive it through the ordinary queue —
**never** a hand-written compensation ledger row (the grant idempotency keys make the replay
exactly-once; a second delivery of the same session returns `ignored`):

```bash
# the operator verb needs RHEMA_OPERATOR_ID + SYSTEM_DATABASE_URL (the prod path runs over the IAP
# tunnel — the same binding every admin-cli verb uses):
node dist/admin-cli.js stripe-redrive --event evt_1UVF7T… --note "H11B topup_10 grant — F-R6H11B-1 fix"
```

Then verify the close-out set:

```sql
select id, type, processed_at from stripe_events where id = 'evt_1UVF7T…';          -- processed_at set
select state from checkout_sessions where stripe_session_id = 'cs_live_a1YA4…';    -- completed
select kind, credits from credit_ledger where idempotency_key like 'stripe:checkout:%'; -- one topup_granted 1000
select kind, channel, dedup_key from notification_deliveries                        -- the pending-checkout email
  where dedup_key like 'checkout:%' order by at desc limit 3;
```

A second `stripe-redrive` on the same event is a no-op (`processed_at` already set) — idempotent by
construction. If the re-drive lands `failed` again, the event row's `processed_at` stays NULL and the
job pageable — that is the signal to investigate, not to hand-write a ledger row.
