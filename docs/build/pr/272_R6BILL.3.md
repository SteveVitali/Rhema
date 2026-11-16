# 272_R6BILL.3 — billing-correctness (handoff insert)

**Ticket:** `docs/tickets/272_R6BILL.3__billing-correctness.md` (carried here — the handoff-inserts commit is unmerged) · **Base:** `main` @ `d24dbed8` · **Spend:** $0, Stage A, zero prod/Stripe contact.

Seven verified findings from the 2026-11-15 handoff, each with a regression proven failing on the pre-fix code (14 reds → 99 green over the four touched test files).

## What changed

- **RH-11 (webhook stranding):** intake re-send — a replayed event whose parked row is still `processed_at is null` re-enqueues `stripe.event` (Stripe's retry is the repair); plus `sweepStrandedStripeEvents` — the watchdog on `processed_at is null` past a 10-min grace with no live `stripe.event` job — riding the hourly `billing.period-tick`. `stripe-redrive` stays the manual path.
- **RH-12:** the period tick honors `cancel_at_period_end` — a flagged row reaching `period_end` ends (`status='ended'`, flag preserved) instead of renewing, un-cancelling, and granting an unpaid month.
- **RH-13:** `purchase_closed` gates purchase minting only — an account with a `stripe_customer_id` keeps Portal self-service (card update / cancel).
- **RH-14:** `customer.subscription.deleted` with no resolvable account/workspace → `unresolved` (unprocessed, surfacing) instead of silently `processed`.
- **RH-15:** `invoice.paid` stores the billed service period from `lines.data[].period` (latest-ending line), never the invoice's own `period_*` collection window; stored-bounds-plus-cycle fallback; both cited fixtures re-shaped.
- **RH-16:** Checkout `customer_email` is the verified `"user".email` — the request body's `email` is no longer read (both arms).
- **RH-2 residual:** `syncSubscription` derives the tier from the item's actual price (`tierFromSubscriptionItem` inverts the shared `priceCents`; basil `price.*` + pre-basil `plan.*` shapes) with `metadata.plan` fallback — a Portal price switch to a ladder price maps back. `D-R6FIX.5-1` stays OPEN for the `price_` registry design.

## Merge notes

PR #346 (268 basil) is OPEN — this diff is kept minimal/append-biased in `stripe.ts` (sweep at EOF; only the `items` type + one `tier` line share hunks with it). The union-resolve is operator-side; both trees' semantics compose (268's `subscriptionPeriodBounds`/`subscriptionIdFromInvoice` + this tier/line reads use the same extended `items` shape).

## Checks

`turbo build` (25/25) · typecheck+lint clean (ledger/api/worker) · focused vitest: 4 files 99/99 post-fix (14/14 new reds pre-fix) · `apps/api` billing+matrix 33/33 · ledger+worker suites green. Records: run+PR ledgers, MANIFEST 272, DEFERRALS D-R6BILL.3-1 (OPEN) + D-R6FIX.5-1 dated tail, BUILD_INDEX 327, LEDGER `nextTicket → 273`.

Never merges itself — `mergePolicy: OPERATOR`.
