# Run — 272_R6BILL.3 billing-correctness (handoff insert)

- **Date:** 2026-11-16 · **Branch:** `stevevitali/r6bill-3-correctness` · **Base:** `main` @ `d24dbed8`
- **Harness:** devin-desktop/swe-2-high/subagent · **Spend:** $0 (no live contact — Stage A only)
- **Ticket:** `docs/tickets/272_R6BILL.3__billing-correctness.md` (carried this PR; the handoff-inserts commit is unmerged on `stevevitali/rh-inserts`)

## Scope re-verified at base

Every named line re-read at `d24dbed8`: RH-11 `billing-routes.ts` insert→send stranding; RH-12 `subscriptions.ts:479` boundary arm clearing `cancel_at_period_end` + granting; RH-13 `billing-routes.ts` portal gate without a customer carve-out; RH-14 `stripe.ts` deleted-arm returning `subscription_ended` on unresolvable account; RH-15 `stripe.ts:583-584` invoice `period_*` → `applyRenewalPaid`; RH-16 `billing-routes.ts` `body.email` → `customer_email`; RH-2 residual `stripe.ts` `planFrom(sub.metadata?.plan)`.

**PR #346 (268_R6BILL.1) status: OPEN, unmerged** — `stripe.ts` at base carries no basil helpers (`subscriptionIdFromInvoice`, `subscriptionPeriodBounds`, `expectLivemode`, `Stripe-Version` pin). The diff was kept minimal and append-biased for the operator's union-resolve: the sweep is appended at EOF; the `items` interface extension and the `tier` line are the only shared-hunk surfaces (small, obvious unions).

## Per-arm disposition

| Arm | Fix | Regression (red → green) |
|---|---|---|
| RH-11 | Two halves, honestly chosen per the ticket's "pick honestly": (a) intake re-send — a replayed event id whose parked row is still `processed_at is null` now re-enqueues `stripe.event` (Stripe's own retry repairs the send failure); (b) `sweepStrandedStripeEvents` watchdog (grace 10 min, live-`pgboss.job` guard, `stripe:<id>` singleton, send-failure never fails the sweep) riding the hourly `billing.period-tick` — covers the retry that never comes (dead/`failed` job, dropped send). `admin stripe-redrive` stays the manual same path. | `billing-routes.test.ts` resend red (0 jobs → 1); `stripe.test.ts` sweep ×2 red (not a function); `billing-jobs.test.ts` tick wiring red (field absent) |
| RH-12 | Tick selects `cancel_at_period_end`; a flagged row reaching `period_end` ends `status='ended'` in place — no period roll, no grant, flag stays `true` as the recorded truth (Stripe's `.deleted` converges via `endSubscription`, idempotent). `cancelsCompleted` added to `PeriodTickResult`. Mid-period flagged rows keep their paid grant (the `else if active` arm — the customer paid through period end). | `subscriptions.test.ts` ×2 red (`cancelsCompleted` undefined + renewed-when-cancelled) |
| RH-13 | Portal `allowed = open ‖ test ‖ stripe_customer_id != null` — the closed switch gates purchase minting only; a paying customer keeps card-update/cancel self-service. No-customer accounts still get `purchase_closed` (nothing to manage). | `billing-routes.test.ts` carve-out red (403 → 200 + createPortalSession call); matrix pin title retained (no-customer arm still inside the renamed-coverage test) |
| RH-14 | Unresolvable account/workspace → `unresolved` (stays unprocessed; the sweep + redrive stay live) — same posture as the invoice/sync arms. A resolvable account with no sub row is terminal → `subscription_ended` (processed, honest verdict). | `stripe.test.ts` red (`subscription_ended` → `unresolved`, `processed_at` null) |
| RH-15 | `processInvoicePaid` reads the billed SERVICE period from `lines.data[].period` (latest-ending line — the subscription item's `current_period_*` window), never the invoice's own `period_*` collection window. No line period → stored bounds rolled one `billing_cycle` forward; no stored row → `ignored` (nothing to renew). Both cited fixtures re-shaped to `lines[].period`. | `stripe.test.ts` ×3 red (divergent invoice window stored; no-lines used `clock.now()`; fixture reshaped) |
| RH-16 | Both checkout arms read `"user".email` for `principal.userId` inside the tx and pass it as `customerEmail`; `body.email` parsing removed — the verified account address is the only one Stripe sees. | `billing-routes.test.ts` red (`forged@attacker.test` → seeded user email, subscribe + topup arms) |
| RH-2 residual | `tierFromSubscriptionItem` inverts `priceCents` over the paid ladder (`price.unit_amount`+`price.recurring.interval` basil, `plan.amount`+`plan.interval` pre-basil) — price-derived tier wins, `metadata.plan` is the fallback (it is stale by construction after a Portal switch). Unmappable amounts preserve the pre-fix posture. D-R6FIX.5-1 stays OPEN (dated tail — the registry owns `price_id` mapping). | `stripe.test.ts` ×3 red (portal upgrade writer→studio ignored; pre-basil shape; unmappable→metadata fallback) |

## Judgement calls

- **RH-11 both halves, not either/or** — the resend-on-replay is 3 lines and makes Stripe's retry the repair; the hourly sweep covers lost jobs/no-retry. Grace 10 min (Stripe delivery window is seconds; the tick's hourly cadence bounds worst-case repair ~70 min — acceptable for a defect that has never fired in prod: zero `processed_at is null` rows at write time per the verify pass).
- **`unresolved` over a new outcome kind** for RH-14 — consistent with sibling arms; the hourly re-drive noise on a permanently-unresolvable event IS the surfaced signal (loud `stripe event unresolved` failures), never a silent drop.
- **Latest-ending line period** handles proration/multi-line invoices; our Checkout mints single-item subs so `lines.data[0]` is the renewal line in practice.
- **Tier map scoped to `writer|studio|studio_max`** — the ladder Checkout/Portal can sell; `team` (waitlist, per-seat) can't arrive through these arms and mapping bespoke amounts to it would mislabel.
- **`subscriptions.test.ts`/`stripe.test.ts` fixture shape** — fixtures now carry `lines[].period` (the honest Stripe shape) and the RH-15 regression uses divergent invoice-window vs line period to pin the source.

## Verify

- **14 regressions proven FAIL on pre-fix code** (stashed src, rebuilt ledger dist, same four files): stripe.test.ts ×7, subscriptions.test.ts ×2, billing-routes.test.ts ×3, billing-jobs.test.ts ×2 → **all 99 pass post-fix**.
- `pnpm turbo build --filter=@rhema/api... --filter=@rhema/worker...` 25/25; `typecheck` + `lint` clean on all three touched packages.
- Full suites: `packages/ledger` + `apps/worker` vitest green (all files); `apps/api/src/billing-routes.test.ts` 31/31 + `billing-failure-matrix.test.ts` 2/2 (title pin preserved).
- Collateral fixed this run: the failure-matrix title pin needed the renamed test's original title kept (portal `purchase_closed` arm still covered — the no-customer case).

## Records

`runs/272_R6BILL.3.md` (this) · `pr/272_R6BILL.3.md` · ticket file carried · MANIFEST row 272 · DEFERRALS `D-R6BILL.3-1` (deployed verify, OPEN) + dated tail on `D-R6FIX.5-1` (stays OPEN — Price-registry design owed) · BUILD_INDEX 327 · LEDGER `done` + `ci boundary` + `nextTicket → 273` · `chainTip → stevevitali/r6bill-3-correctness`.
