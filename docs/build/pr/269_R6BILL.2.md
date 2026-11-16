# 269_R6BILL.2 — stripe-idempotency (RH-3)

**mergePolicy: OPERATOR — a run never merges itself.** Base `main` @ `27cf4b6d`.

## Why

RH-3 verified four money-truthfulness defects in the Stripe boundary and the auto-reload sweep
(the ONLY unattended charge path, REQ-BILL-17). Prod census this run (read-only, `BEGIN READ ONLY`,
IAP tunnel, $0): **zero enabled accounts, zero `auto_reload_events`** — the family is latent, fixed
before the first opt-in can arm it.

## Changes

- `packages/ledger/src/stripe-port.ts` — `Idempotency-Key` header on **every** POST (was never
  sent). Deterministic where a call-site key exists: `checkout-session:<row id>`, the sweep's
  `auto-reload:<acct>:<month>:<seq>`; per-request uuid otherwise (`portal-session:`, `sub-cancel:` —
  a deterministic cancel key would replay-stale a flag toggled twice in Stripe's 24h window).
  `chargeOffSession` forwards its call-site key verbatim + writes `metadata[kind=auto_reload,
  billing_account_id, workspace_id, pack_id]` for the reconcile arm.
- `packages/ledger/src/auto-reload.ts` — charge key is now `auto-reload:<acct>:<month>:<seq>`,
  `seq` = this month's recorded charge-outcome events + 1 (no clock — the minute component let a
  later-minute retry double-charge); the account select is DISTINCT (lateral home workspace — the
  old join charged N times for N workspaces).
- `packages/ledger/src/stripe.ts` — `payment_intent.succeeded` reconcile arm: converges a charged-
  but-ungranted off-session intent (grant under the sweep's shared `auto-reload:grant:<pi>` key —
  exactly-once — + monthly counter + `webhook_reconcile` audit row). Chosen over a DB resweep: the
  crash leaves no local trace to sweep for; the webhook is Stripe's durable retried channel.
- `docs/ops/stripe-webhook-endpoint.md` — `payment_intent.succeeded` is now the tenth required type
  (the Stripe-side subscribe is the operator's act → `D-R6BILL.2-1`; the arm is dormant until then).

## Regressions — fail-pre-fix

12 new tests, all proven RED on pre-fix code (4 header/absent-key, 4 sweep key/distinct/retry,
4 arm/contract-pin), green post-fix.

## Verify

ledger suite 273/273 · focused files 63/63 · worker billing + api billing-routes 38/38 ·
`turbo build` (ledger/worker/api closures) clean · typecheck+lint clean · `pnpm format` flags the
touched files pre-existing at unmodified HEAD (standing repo condition, disclosed — not
reformatted). Prod contact: census only, `BEGIN READ ONLY` every session, zero writes, $0.
