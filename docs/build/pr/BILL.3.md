# BILL.3 — The credit purchase path

Every purchase entry point now reaches a Stripe-hosted page — run-sheet **Add credits** (unblocked
from CSP `form-action 'self'`), billing **Buy** / **Choose Writer** (the "no checkout URL" collapse is
diagnosed and fixed at the request contract), and the portal — plus the pending-checkout email that
no job sent, and the full REQ-BILL-16 failure-state matrix. Re-opening purchase to real users stays
operator-held behind a closed-by-default switch (`PURCHASE_MODE`, ADR-028).

Ticket: `docs/tickets/65_BILL.3__credit-purchase-path.md` (chain row 65, round 3).
Base: `stevevitali/res-2-unverified-delivery-and-refund` @ `d045628` (stacks on PR #86).
Merge policy: **OPERATOR — do not merge.**
REQ: **REQ-BILL-16** (primary), REQ-BETA-15, REQ-GROWTH-13 (run-sheet half), REQ-BILL-14,
REQ-BETA-12 (`exhausted_prompt` telemetry preserved).
ADRs: **ADR-027** (Stripe-host `form-action` allowlist), **ADR-028** (purchase-mode switch:
stage config, default closed, `is_test` allowlist), **ADR-029** (pending-checkout email trigger:
return-view marker + webhook completion), **ADR-030** (Stripe Checkout request contract).

## What was broken on prod

- **Run sheet → Add credits:** the POST 302'd to `buy.stripe.com`, but CSP `form-action 'self'`
  (P1.22, `23fabce`) blocked the browser from following it. The click did nothing.
- **Billing → Buy / Choose Writer:** `createCheckoutSession` sent `customer_update[address]=auto`
  **without** `customer` on every never-purchased account → Stripe 400 `invalid_request_error`,
  collapsed into a generic 500 → "Billing is temporarily unavailable".
- **Pending checkout:** `/billing/return` promised "we'll email you when it lands"; no job ever did.

## The contract

- **CSP** — `form-action 'self'` + exactly `checkout.stripe.com`, `billing.stripe.com`,
  `buy.stripe.com`, from the one `STRIPE_HOSTED_ORIGINS` constant (`@rhema/contracts`). The same
  constant validates every server-side 302 target — a non-Stripe api URL is refused, never followed.
  No wildcards.
- **Stripe request contract** — `customer_update[address]` only rides with `customer`; guests get
  `customer_email` + `customer_creation=always` (payment mode); `automatic_tax` stays off unless
  `STRIPE_AUTOMATIC_TAX=true` (Tax activation is operator-paused). Byte-for-byte pinned.
- **Classified failures** — `StripeRequestError` carries `rejected` (4xx) vs transient (5xx/network);
  the api maps to `stripe_rejected` (502) / `stripe_unavailable` (503) / `stripe_unconfigured` (503);
  the web renders per-class copy. The generic "temporarily unavailable" is reserved for real outages.
- **Purchase switch** — `purchase.mode` stage fact → `PURCHASE_MODE`; unset/unknown fails closed.
  Closed ⇒ no Stripe call, `403 purchase_closed`, `paymentLinkUrl` withheld, forms unmounted, paused
  copy. `workspaces.is_test` (read in-tx, server-set only) allowlists the JOURNEY tenants for N9.
  Auto-reload **opt-out stays reachable while closed** — a safety-off is not a purchase.
- **Pending-checkout email** — migration `0048` (`return_viewed_at`, `pending_email_queued_at`); the
  tenant-scoped return poll stamps the marker on observing `open`; only an `open→completed` webhook
  transition on a viewed row enqueues one `trial_payment` mail deduped by `checkout:<sessionId>`,
  deep-linking to an in-app `returnTo`. Completion before any view, and replays, send nothing.
  `checkout.session.expired` now marks the row expired so the return page stops polling.
- **REQ-BILL-16 matrix** — `apps/api/src/billing-failure-matrix.test.ts` maps all 13 §14.6+new
  states to live tests; removing a row fails the coverage assertion.

## AC ↔ evidence

| AC | Evidence |
|---|---|
| CSP = `'self'` + exactly the Stripe hosts, one constant, no wildcard | `cspFor` + `STRIPE_HOSTED_ORIGINS`; `billing-surfaces.test.ts` pins; `contracts/stripe.test.ts` |
| Request contract never sends a rejected combo; regression fails pre-fix | `stripe-port.ts` customer-conditional params; `stripe-port.test.ts` reproduces the prod 400 shape |
| Per-class failure copy; Free never sees a Checkout top-up | `billingNoticeFor`; `billing-pages.test.ts` per-class table; `data-topup-gated` for Free |
| Switch closed ⇒ no Stripe call + paused copy | `billing-routes.test.ts` "defaults closed" (0 port calls); paused surfaces in both apps |
| Allowlisted test tenant gets the 302 on all four entry points | `billing-routes.test.ts` is_test allowlist; N9 (below) proves it live |
| Pending email exactly-once on completion-after-view; none otherwise | `stripe.test.ts` 6 legs + `notifications.test.ts` `checkout:<id>` dedup |
| REQ-BILL-16 matrix complete, fails on removal | `billing-failure-matrix.test.ts` incl. the mutation leg |
| Stage B deploy: preview clean, additive lint, ≤$15 | executed: preview 6-updates/0-replace/0-delete, lint pass in-band, delta $0 → `pulumi up` update 102 |
| **N9 green**, screenshots, no CSP violation, expected amounts, no payment | **PASS live 2026-10-02** — `docs/build/reports/2026-10-02_BILL.3-n9-d/` (`N9.png` = the Stripe landing); amounts $20 Writer / $10·1,000 cr asserted on-page |
| Real users unaffected: closed state; sessions open/expire; zero grants | `PURCHASE_MODE=closed` live on `rhema-prod-api` (gcloud); 5 Stage-B sessions all `state='open'` (expire via `checkout.session.expired`); **0 grant rows + 0 notifications** in the window; non-test browser walk → D-BILL.3-2 |
| H7 remainder as `D-BILL.3-n` + re-open gate row | D-BILL.3-1 (real purchase + live re-verify), D-BILL.3-2 (portal/email live legs); GD-BILL.3-1 asks the operator to re-open |

## Stage B evidence (prod, 2026-10-02, $0)

Migration `0048` applied (48 recorded) → images `bill3` on chain tip `28019fc` (Cloud Build
`39e6fee5`) → `pulumi up` update 102 → provenance `28019fc` on api+web `/healthz` + `deployments`
row → N9 PASS (Choose Writer → `checkout.stripe.com` `cs_live_…` "Writer $20"; Buy → top-up Checkout
"1,000 credits / $10"; Add credits → `buy.stripe.com` Payment Link; portal honest no-customer state).
jrn-a carries a documented fixture `subscriptions` row (`past_due` Writer, no Stripe ids — leaves the
hourly tick inert) because §14.2 mounts Checkout top-ups only on paid tiers.

## Deferrals

**Opened:** D-BILL.3-1 (HUMAN-H7: real-money purchase + live-mode re-verify), D-BILL.3-2 (hosted
Portal walk + pending-email live send + non-test closed-state UI — need a completed checkout or a
non-test mailbox). **Closed:** none owed by this run; BL-09 (pending-checkout email) and BL-51's code
half are absorbed.

## Verification

`turbo build lint typecheck` green (90/45 tasks) · `pnpm test` 3,880 pass / 409 files (the
additive-migrations pin updated for 0048; one pre-existing lever-matrix perf flake) ·
`check-additive-migrations.mjs` pass on 0048 · append-only + build-memory checks at close.
