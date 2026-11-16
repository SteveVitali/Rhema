# 268_R6BILL.1 — stripe-version-basil (RH-9+RH-7, EXPEDITED)

**mergePolicy: OPERATOR — a run never merges itself.** Base `main` @ `784a2e54`.

## Why expedited

The decisive read (recorded verbatim in `runs/268_R6BILL.1.md`): the live webhook endpoint
`we_1UH99C2MLe3ETP9Sk4UQBKXs` reports `api_version: None` ⇒ the **account default governs**, and the
account default is already **post-basil** — the live sub returns `current_period_*` only at
`items.data[]`. Deployed code reads `invoice.subscription` + top-level `sub.current_period_*`: under
basil `invoice.paid`/`invoice.payment_failed` → `ignored`-but-`processed_at`, period sync silent.
First exposure: **~2026-11-27**, the first live renewal of the 2026-10-27 Writer subscription
(`invoice.*` events only enabled 2026-10-28 — zero broken deliveries exist).

## Changes

- `packages/ledger/src/stripe.ts` — basil field reads with pre-basil fallback:
  `subscriptionIdFromInvoice` (`parent.subscription_details.subscription`, `parent.type`-checked),
  `subscriptionPeriodBounds` (`items.data[0].current_period_*` → top-level), `subscriptionInterval`
  (`price.recurring.interval` → `plan.interval`); **`created` ordering guard** on the five
  subscription-state types (an older redelivery can't overwrite newer state → `skipped`,
  `processed_at` stamped); **`expectLivemode` check** (mismatch/missing → `skipped`, fail-closed).
- `packages/ledger/src/stripe-port.ts` — `STRIPE_API_VERSION = "2025-03-31.basil"` → `Stripe-Version`
  header on every request. Basil = the version the reads are written for; clover+ adds un-audited
  breaks (choice recorded in code + run record). Webhook payloads follow the endpoint's version, not
  the pin — dual-shape reads stand.
- `apps/worker/src/{billing-jobs.ts,main.ts}` — `expectLivemode` threaded; derived from the bound
  key's `sk_live_`/`rk_live_`/`sk_test_`/`rk_test_` prefix (self-configuring per stage; zero infra diff).
- Tests: +14 focused (fixture per payload shape — pre-basil AND basil).

## Verify

- Regressions **proven failing on pre-fix code**: 10 (4 basil-shape, 2 ordering, 2 livemode, 2 pin).
- `turbo build` ledger/worker/api closures · typecheck · lint — clean.
- `vitest packages/ledger/src` **273/273** · api billing 28/28 · worker billing-jobs 11/11.
- Not run/claimed: Docker, server-Postgres, journeys, live legs.

## Boundaries (recorded, not fixed here)

RH-11 stranding + RH-15 invoice-vs-sub period + RH-2 `metadata.plan` tier arm → **272_R6BILL.3**
(dated tail on D-R6FIX.5-1). `skipped` stamps `processed_at` — adds nothing to the stranded set.

## Deploy arm — PREPARED, not run

`docs/build/reports/268_R6BILL.1/deploy-plan.md` — eight conditions + ~11-27 deadline + fallback
note. api + worker images carry the payload; zero migrations/env/infra diff.

## Records

`runs/268_R6BILL.1.md` · `reports/268_R6BILL.1/deploy-plan.md` · `D-R6BILL.1-1` opened ·
BUILD_INDEX 326 · LEDGER `nextTicket` → 269 · manifest row 268 · ticket file landed. $0; the only
prod contact was the ticket-sanctioned read-only check (already executed).
