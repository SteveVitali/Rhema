# PRB.08 — Beta billing: house credits, Stripe Payment Links, refunds, reconciliation

**Spec:** `docs/tickets/24_PRB.08__beta-billing.md` (REQ-BETA-14, REQ-BETA-15, REQ-BETA-12, REQ-BILL-13,
REQ-ARCH-35 amended, REQ-SPEC-24 item 7, §14.6 webhook discipline)
· **Base:** `stevevitali/prb-07-source-editing` · **Stacked PR — do not merge (mergePolicy=OPERATOR).**

## Summary

Real money at beta fidelity. Operator-granted house credits land as ordinary audited `grant` ledger rows in
the `promo` bucket; Stripe Payment Links are the beta's one real-money channel, gated behind the §14.6
webhook discipline (verify the signature → insert `stripe_events` on the unique event id → enqueue
`stripe.event` → 200; a replayed id is a no-op). A purchase is an idempotent `grant(topup, +12mo)`. The run
sheet reads the real spendable balance and shows the exhaustion-resolution panel with the Payment Link,
recording `credits.exhausted_prompt{action_taken}`; the final-month beta-plan offer is copy + a link only —
no subscription machinery. Refunds surface on run rows ("refunded 312 credits; partial results kept") via
the whitelisted `cost.refunded` event. The nightly `usage.reconcile` joins provider Usage & Cost reports on
`usage_records.provider_request_id`, adjusts ONLY in the user's favour, alerts on >2% drift, and
recalibrates the estimator. A chargeback suspends the account, claws back newest-money-first (the spent
remainder becomes `clawback_debt`), cancels queued/parked runs with hold release, and withholds deliveries
until the balance is non-negative.

## What changed

- **`@rhema/db`** — migration `0020`: `billing_accounts.suspended_at`/`clawback_debt`,
  `usage_records.provider_request_id` (+ join indexes), `stripe_events.processed_at`,
  `runs.delivery_withheld_at`/`pending_delivery`, `admin_actions`, `analytics_events` (RLS),
  `"user".analytics_opt_out`; Drizzle parity.
- **`@rhema/ledger`** — `admin.ts` (audited house grant/void/suspend/reinstate), `analytics.ts`
  (`recordAnalyticsEvent`: catalogue-validated, opt-out honored by absence), `stripe.ts` (HMAC verify,
  unique-id insert, `processStripeEvent`: top-up grant + telemetry / dispute-created chargeback /
  dispute-won restore+reinstate+re-drive), `chargeback.ts`, `reconcile.ts`, `entries.ts` (`admin` source +
  `stripe_ref`), `sql-ledger.ts` (suspended ⇒ no NEW holds; idempotent replays still resolve).
- **`@rhema/orchestrator`** — `AccountSuspendedError` (canonical here; ledger re-exports — dependency
  direction preserved), `account_suspended` results on `createRun`/`resolveGate`, the `deliverRun` withhold
  gate (row-locked stash into `pending_delivery`, stays `finalizing`), `failRun` emits `cost.refunded`.
- **`@rhema/contracts`** — the `cost.refunded` run event.
- **`apps/api`** — `billing-routes.ts` (`/stripe/webhook`, `/billing/balance`, `/billing/exhausted-prompt`),
  `admin-cli.ts` (`node dist/admin-cli.js house-grant|house-void|suspend|reinstate|wtp` under
  `RHEMA_OPERATOR_ID`+`DATABASE_URL`), `account_suspended`→403 mappings, `server.ts` wiring (webhook secret
  via Secret Manager name, `systemExec`, Payment Link, `emitDisposed`/`emitEstimated` now bound to the
  analytics sink).
- **`apps/worker`** — `billing-jobs.ts` (`stripe.event`, `run.deliver` re-drive, `usage.reconcile` cron
  `15 3 * * *` + the balance assertion), `provider-report.ts` (Anthropic Usage & Cost normalization),
  `main.ts`/`env.ts` wiring (`ANTHROPIC_ADMIN_KEY_SECRET`, `OPS_ALERT_WEBHOOK_URL`).
- **`apps/egress-proxy`** — captures the provider `request-id` header onto `usage_records`.
- **`apps/web` / `@rhema/ui` / `@rhema/run-sheet` / `@rhema/api-client` / `@rhema/findings-core`** — real
  balance on the sheet, the exhaustion panel + Payment-Link form POST (telemetry-then-302, link URL
  server-side — no open redirect), the suspended notice + disabled Run (and the mid-click 403 re-render),
  the plan-offer line, the run-card refund line.

## Design decisions

- **Everything billing is a ledger row** — grants, voids (`expire`), clawbacks, reconciliation refunds;
  `credit_balances` is a maintained projection, never mutated directly. Every op is idempotency-keyed.
- **User-favourable-only reconciliation** — a provider total lower than metered refunds the difference
  silently; higher is platform-eaten (never a charge). Drift >2% pages regardless.
- **Withhold, don't lose** — a suspended account's in-flight run may finish (COGS already incurred) but its
  delivery stashes on the run row and stays `finalizing`; dispute-won / debt-settled / operator reinstate
  re-drives `run.deliver`.
- **Beta honesty** — the beta-mode exhaustion panel's third sentence is "Or ask for more credits." (no
  "/ upgrade"); the plan offer is a link, not a checkout; a suspended account is never upsold.

## Out of scope (as specced)

Plans/subscriptions/Checkout/Portal/trial entitlement/usage dashboards/auto-reload (P1.16/PRB.12). Live
billing legs (real test-mode purchase, real provider report, alert webhook, CLI on the deployed DB) are
**D-PRB.08-1**.

## Test plan

- **AC1** `ledger/admin.test.ts` + `api/admin-cli.test.ts` — grant → spendable; the granted balance drives
  real hold→debit→release; idempotent replay; audit rows.
- **AC2** `ledger/stripe.test.ts` + `api/billing-routes.test.ts` — signature accept/reject (tampered body,
  wrong secret, stale timestamp), unique-id dedupe, `grant(topup)` + `stripe_ref`, replayed processing a
  no-op, 400-before-rows on a bad signature.
- **AC3** `web/billing-surfaces.test.ts` — panel + Payment Link, `action_taken` recorded for shown/open,
  302 only to the configured link, suspended notice, plan offer.
- **AC4** `ledger/reconcile.test.ts` — planted 3% drift → refund + alert; provider-higher never charges;
  <2% refunds without a page; re-run no-op.
- **AC5** `ledger/chargeback.test.ts` + `orchestrator/delivery.test.ts` + `worker/billing-jobs.test.ts` —
  suspend/claw/debt/cancel+release/withhold; withheld→stashed→re-driven on cleared account.
- Gates: `turbo build lint typecheck` **108/108**; `pnpm test` **1785 pass / 2 skip / 251 files**;
  `check:protocol-markers` OK; `check:licenses` OK (497 pkgs).
