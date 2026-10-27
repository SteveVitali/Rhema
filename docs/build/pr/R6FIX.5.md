# R6FIX.5 — F-R6H11B-1 + F-R6H11B-2: money findings from the H11B headed session

**Root causes · verdicts · compensation:**

- **F-R6H11B-1 (critical — paid top-up, no grant):** `analyticsEnvelopeSchema.user_id`
  used `idSchema` (26-char ULID only), but `"user".id` is an **opaque auth-minted id** —
  Better Auth mints `[A-Za-z0-9]{32}` nanoids on its own `user.create` paths (magic-link
  verify, OAuth). A real `$10 topup_10` payment (Apple Pay, `evt_1UVF7T…` /
  `cs_live_a1YA4…`) was accepted by Stripe, then `parseAnalyticsEvent` threw *inside*
  the grant `runTx` — tx rolled back, `checkout_sessions` stayed `open`, the job failed.
  **Verdict: RESOLVED-IN-CODE** — `authIdSchema` (`[A-Za-z0-9_-]{21,64}`, both live
  auth-id shapes) now carries the user-bearing fields (`analytics.user_id` + the domain
  `actor`); every workspace/project/run/entity id stays ULID-pinned.
- **F-R6H11B-2 (portal-side subscription changes never sync):** the prod endpoint
  `we_1UH99C2MLe3ETP9Sk4UQBKXs` was created imperatively by PRB.18 when the processor
  had three arms (`checkout.session.completed` + `charge.dispute.*`); the P1.16/BILL.3
  arms were never subscribed, so a real Portal cancel-at-period-end set Stripe's
  `canceled_at` while our row kept `cancel_at_period_end=false` (UI still "Renews …").
  **Verdict: RESOLVED-IN-CODE** — `STRIPE_WEBHOOK_EVENT_TYPES` is now the canonical
  handled set pinned by a dispatch-completeness test, and
  `docs/ops/stripe-webhook-endpoint.md` carries the imperative
  `stripe webhook_endpoints update` (Stripe-side state — no deploy dependency; every
  handler already ships on `dc3a8f6`).
- **Compensation path:** audited re-drive, not a manual ledger row — the new
  `stripe-redrive` admin verb re-enqueues the parked `stripe_events` row through the
  ordinary `stripe.event` queue seam (ledger idempotency keys make it exactly-once),
  writes a `stripe_event_redrives` audit row, and no-ops on already-processed events.

**Third finding, same drift family — F-R6FIX.5-1:** the reverse direction was also
broken — in-app `POST /billing/subscription/cancel` wrote `cancel_at_period_end`
locally only, so **a user who cancelled in-app kept being charged** (REQ-SPEC-32).
The cancel half is fixed (`StripePort.setSubscriptionCancelAtPeriodEnd` inside the
tx; Stripe failure rolls back; reject vs unavailable mapped honestly). The
plan-change half needs a Stripe Price-registry design (inline `price_data` subs
can't be price-switched) → **D-R6FIX.5-1 OPEN**.

## What changes

- **`packages/contracts/src/ids.ts`** — new `authIdSchema` (opaque auth id,
  `[A-Za-z0-9_-]{21,64}` — accepts ULIDs and Better-Auth nanoids, still rejects
  garbage); `idSchema` untouched (ULID-only).
- **`packages/contracts/src/analytics.ts`** — `analyticsEnvelopeSchema.user_id` →
  `authIdSchema` (workspace/project/run/protocol fields unchanged).
- **`packages/contracts/src/domain/common.ts`** — `actorSchema.id` → auth-id
  contract (same drift class: actor ids are auth-minted).
- **`packages/ledger/src/stripe.ts`** — exported `STRIPE_WEBHOOK_EVENT_TYPES` (the
  nine handled types, one per dispatch arm).
- **`packages/ledger/src/stripe-port.ts`** — `StripePort` gains
  `setSubscriptionCancelAtPeriodEnd(subscriptionId, cancel)`; Stub records calls;
  Fetch POSTs `/v1/subscriptions/:id` with `cancel_at_period_end`.
- **`packages/ledger/src/subscriptions.ts`** — `requestCancellation` propagates to
  Stripe inside the same tx when the sub has a Stripe id and a port is bound (a
  Stripe throw rolls the local flag back); `syncSubscription` clears `scheduled_tier`
  when Stripe reports a different effective tier.
- **`apps/api/src/billing-routes.ts`** — cancel route maps `StripeRequestError`
  reject → `stripe_rejected`, transport/unavailable → `stripe_unavailable`;
  non-Stripe internals stay 500.
- **`apps/api/src/admin-cli.ts`** — new `stripe-redrive <eventId>` verb: operator-id
  required, finds an unprocessed `stripe_events` row, enqueues `stripe.event`,
  audits via `stripe_event_redrives`; processed row → idempotent no-op.
- **`packages/db/migrations/0060_stripe_event_redrive.sql`** — the dedicated
  `stripe_event_redrives` audit table. The `admin_actions.action` CHECK can't be
  widened additively (a constraint replace is a `drop`, which the migration lint
  correctly refuses), so this verb's audit vocabulary gets its own table.
- **`docs/ops/stripe-webhook-endpoint.md`** — the runbook: canonical event list,
  the imperative `stripe webhook_endpoints update` command, verify + record steps,
  and the `stripe-redrive evt_1UVF7T…` compensation step.

## Tests (deterministic)

- `contracts` — nanoid `user_id` accepted (ULID + opaque shapes), malformed ids
  rejected; entity-id ULID rules unchanged.
- `stripe.test.ts` — canonical list == dispatch arms, no duplicates; nanoid-member
  `topup_10` grants once (replay returns `ignored`, one `topup_granted`, no
  duplicate telemetry); Payment-Link topup with a nanoid member; existing arms
  cover `invoice.paid`/`invoice.payment_failed`/`customer.subscription.*`.
- `subscriptions.test.ts` — cancel propagates when bound + Stripe id present; no
  call when unbound; Stripe failure rolls the flag back; sync clears a superseded
  `scheduled_tier`.
- `admin-cli.test.ts` — redrive parked → enqueued + audited; processed → no-op;
  unknown event → non-zero exit.
- `billing-routes.test.ts` — Stripe reject/unavailable map to the new codes;
  non-Stripe errors stay 500.
- `check-additive-migrations.test.mjs` — census updated for 0060.

**Verify:** turbo build/lint/typecheck 135/135 · vitest 516–517 files /
6,148–6,149 tests pass (privsep docker leg is a workstation flake only — green
inside CI) · additive-migrations lint pass · check-build-memory 0 violations ·
append-only vs `9c90b00` OK · **ci: pass #226@220136f** (run 40588477743 — all
seven legs + `ci-pass` anchor; record `logs/ci-R6FIX.5.json`).

## Records

`docs/build/runs/R6FIX.5.md` · `F-R6H11B-1` + `F-R6H11B-2` → **RESOLVED-IN-CODE**,
`F-R6FIX.5-1` cancel half resolved / plan-change half → **D-R6FIX.5-1 opened** ·
dated tails on **D-P1.16-1**, **D-BILL.3-1**, **D-BILL.3-2** · GATE-LAUNCH
threshold-1 dated note · BUILD_INDEX row 232 · `chainTip` → this branch ·
`docs/build/logs/ci-R6FIX.5.json`.

## Operator asks

- **Merge stays OPERATOR** — this PR is unmerged by policy.
- **At the launch deploy (R6LCH.1):** (1) run the `enabled_events` update in
  `docs/ops/stripe-webhook-endpoint.md`; (2) `stripe-redrive evt_1UVF7T…` after the
  fixed worker deploys → verify the `topup_granted` receipt + the pending-checkout
  email; (3) confirm the first real `customer.subscription.updated` syncs the
  portal-canceled row; (4) re-proof in-app cancel → Stripe on the deployed build.
- `D-R6FIX.5-1` — owner for the Stripe Price-registry design (plan×cycle → `price_`
  ids) so in-app plan changes can propagate.

## Carries / deferrals

- `D-P1.16-1` PARTIAL — subscribe leg discharged live; topup grant + portal-sync
  re-proofs owed post-deploy.
- `D-BILL.3-1` / `D-BILL.3-2` OPEN — real-money legs partially discharged
  in-session; grant receipt + pending-email + portal-sync legs ride the deploy.
- `D-R6FIX.5-1` OPEN — plan-change propagation (Price-registry design).

**Spend:** $0 — code + records only; no prod mutations, no paid legs.
**Harness:** devin-desktop/swe-2-high/subagent · mergePolicy=OPERATOR (never merge).
