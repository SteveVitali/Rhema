# Run — 268_R6BILL.1 (stripe-version-basil)

- **Date:** 2026-11-16 · **Ticket:** `docs/tickets/268_R6BILL.1__stripe-version-basil.md` (handoff insert, RH-9+RH-7, EXPEDITED — renewals ~2026-11-27)
- **Branch:** `stevevitali/r6bill-1-basil` · **Base:** `main` @ `784a2e54` · **Harness:** devin-desktop/swe-2-high/subagent
- **Class:** code + records, Stage A + expedited deploy-prep · **Spend:** $0 — the only prod contact was the ticket-sanctioned read-only check (already executed by the read-only pass; not re-run)

## Decisive read (verbatim — gate to the code arm)

`stripe webhook_endpoints retrieve we_1UH99C2MLe3ETP9Sk4UQBKXs --live` → **`api_version: None`**
(endpoint created 2026-09-18 via REST in PRB.18 with no `api_version`) ⇒ the **account default**
governs webhook payloads and every unpinned API call. The live sub `sub_1UVF6l2MLe3ETP9ShyUGStFu`
read at that default returns `current_period_start`/`current_period_end` **only at item level**
(`subscription.items.data[].current_period_*`) — **the account default IS post-basil.** Deployed code
read `invoice.subscription` + top-level `sub.current_period_*` ⇒ under basil `invoice.paid` /
`invoice.payment_failed` → `ignored` yet `processed_at`-stamped, and the period sync silently did
nothing. First exposure: the first live renewal of the 2026-10-27 Writer subscription, ~2026-11-27
(the endpoint gained `invoice.*` events 2026-10-28 — zero broken deliveries exist today).

## What landed

- **`packages/ledger/src/stripe.ts`**
  - `subscriptionIdFromInvoice` — basil `invoice.parent.subscription_details.subscription` (read only
    when `parent.type === "subscription_details"`), pre-basil `invoice.subscription` fallback.
  - `subscriptionPeriodBounds` — `items.data[0].current_period_*` first, top-level fallback
    (single-item subs — our Checkout mints exactly one line item).
  - `subscriptionInterval` — `items.data[0].price.recurring.interval` preferred, `plan.interval`
    fallback (the deprecated-but-present compat field). `items[].plan.interval` "already item-level"
    hypothesis verified → `price` is the basil+ canonical read.
  - `created` ordering guard (RH-7): the five subscription-state types (`invoice.paid`,
    `invoice.payment_failed`, `customer.subscription.{created,updated,deleted}`) — an already-processed
    event on the same subscription anchor with a newer `created` makes this event `skipped`
    (`processed_at` stamped — terminal verdict, never stranded). `checkout.session.completed`
    deliberately unguarded: its arm is an action gated by our `checkout_sessions` state machine and
    its `created` routinely trails the `customer.subscription.created` beside it — guarding it would
    strand open sessions + pending mail. Missing `created` → unguarded (every real event carries it;
    recorded). Equal `created` → not stale (idempotent arms; recorded).
  - `expectLivemode` check (RH-7): `payload.livemode` ≠ the configured expectation (or missing —
    fail-closed) ⇒ `skipped`, zero state writes, `processed_at` stamped. New outcome kind
    `skipped{reason}`.
- **`packages/ledger/src/stripe-port.ts`** — `STRIPE_API_VERSION = "2025-03-31.basil"` sent as the
  `Stripe-Version` header on EVERY request (checkout, portal, subscription update, off-session
  charge). **Choice recorded:** basil is the first release carrying the field paths the handlers are
  written for; clover/dahlia/endive add un-audited breaking changes (Clover's flexible-billing
  default on Checkout-minted subscriptions, Endive's `billing_cycle_anchor` object). The pin governs
  OUR calls only — webhook payloads follow the endpoint `api_version`/account default → dual-shape
  reads stand until the operator pins the endpoint Stripe-side.
- **`apps/worker/src/{billing-jobs.ts,main.ts}`** — `expectLivemode` threaded into
  `processStripeEvent`; derived from the bound key's prefix (`sk_live_`/`rk_live_` ⇒ true,
  `sk_test_`/`rk_test_` ⇒ false, else unset ⇒ no check). Self-configuring per stage — prod's live key
  enforces live events, a preview's test key accepts test events; zero infra diff, prefix-only read
  (the secret value never logs).
- **Tests** — `stripe.test.ts` +11 (5 basil-shape, 3 ordering, 3 livemode), `stripe-port.test.ts` +2
  (pin value + every-request header), `billing-jobs.test.ts` +1 (`expectLivemode` threading).

## Regressions — fail-pre-fix proof

Pre-fix code (HEAD) + new tests: **10 fail** — 4 basil-shape (`invoice.paid`/`payment_failed` →
`ignored`, basil sub.updated no period write, basil sub.created wrong period/cycle), 2 ordering
(older event overwrote newer state), 2 livemode (no check), 2 version-pin (no `Stripe-Version`
header). The fallback/unguarded pins pass pre-fix as designed (top-level `invoice.subscription`, no
`created`, unset `expectLivemode`). Post-fix: all green.

## Checks run

- `pnpm turbo build --filter=@rhema/ledger... --filter=@rhema/worker...` 20/20 · `--filter=@rhema/api...` 23/23
- `pnpm --filter @rhema/ledger --filter @rhema/worker typecheck` / `lint` — clean
- `vitest packages/ledger/src` — 33 files, **273/273** · `apps/api/src/billing-routes.test.ts` 28/28 · `apps/worker/src/billing-jobs.test.ts` 11/11
- NOT run (not claimed): Docker images leg, server-Postgres leg, journeys/browser legs, live legs.

## Boundaries recorded (scope honestly)

- **RH-11** (event committed before `queue.send` → stranded on retry): **not fixed** — the fix is a
  `processed_at is null` sweep/re-drive arm owned by 272_R6BILL.3; different mechanism from this
  ticket's guards. The new `skipped` verdict still stamps `processed_at`, so it never adds to the
  stranded set.
- **RH-15** (invoice `period_*` ≠ subscription period): **not fixed** — 272's arm. `invoice.period_*`
  survives basil (F5's removed list doesn't name it); this ticket only reads the subscription pointer.
- **RH-2 residual** (`syncSubscription` tier from `metadata.plan` only): verified at tip — 272's
  Price-registry arm owns it; dated tail on D-R6FIX.5-1.
- **livemode check placement:** worker-side `processStripeEvent` covers webhook intake AND the
  `admin-cli stripe-redrive` path (same processor). Intake-side early rejection considered + rejected:
  the stored row is the audit trail.

## Deferrals

- **Opened `D-R6BILL.1-1`** — deployed re-proof (provenance + first live `invoice.paid` ~11-27 +
  Workbench request log showing the pin + the operator's endpoint `api_version` act).
- `D-R6FIX.5-1` — dated tail appended (RH-2 arm → 272; stays OPEN). None closed.

## Deploy arm

Expedited operator-gated — `docs/build/reports/268_R6BILL.1/deploy-plan.md` (eight conditions +
the ~2026-11-27 deadline + honest fallback: a pre-deploy basil event parks re-driveable, never
corrupts). **NOT executed.** api + worker images are the payload carriers; zero migrations/env/infra
diff.
