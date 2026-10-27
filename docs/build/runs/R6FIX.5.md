# R6FIX.5 — F-R6H11B-1 + F-R6H11B-2 money findings (run ledger)

- **Spec:** the per-ticket worker brief (F-R6H11B-1 critical + F-R6H11B-2),
  evidence `docs/build/runs/R6H11.md` + LEDGER 2026-10-27 boundary entry +
  `docs/build/reports/2026-10-27_H11B/`.
- **Base:** `origin/main` @ `6032607` (the H11B boundary commit; merge commit
  `9c90b00`+ is inside — the whole stack is landed).
- **Branch:** `stevevitali/r6fix-5-money-findings` · mergePolicy=OPERATOR — never merge.
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec +
  build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-10-27T18:36Z · **Closed:** —
- **Production mutations:** none — code+records only. The endpoint update +
  event re-drive ride the launch deploy (R6LCH.1); both are recorded here as
  explicit runbook steps.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in scope:

- **D-P1.16-1** — the live billing legs; subscribe leg discharged live by the
  H11B session (dated tail this run); topup leg blocked by F-R6H11B-1 until the
  fix deploys + the stored event re-drives.
- **D-BILL.3-1 / D-BILL.3-2** — real-money purchase + hosted UX legs; the H11B
  session discharged the subscribe half at live mode; topup + portal-sync legs
  blocked by the two findings (dated tails this run).
- No `OPEN` row this run can close for real (the re-proofs are
  deploy-dependent).

## Requirements

1. **F-R6H11B-1 (critical):** `stripe.event` processing of a
   `checkout.session.completed` topup fails on non-ULID `user_id`
   ("26-char Crockford-base32 ULID" zod error). Root-cause the validator;
   apply the honest fix (the user id is an opaque auth id — widen the schema
   to the real auth-id shape).
2. **Backfill/compensation:** the failed event `evt_1UVF7T…` (session
   `cs_live_a1YA4…`, topup_10 paid) must be re-drivable after the fix — record
   the chosen path (re-enqueue vs manual compensation row) + why.
3. **F-R6H11B-2:** the prod webhook endpoint
   `we_1UH99C2MLe3ETP9Sk4UQBKXs` subscribes only
   `checkout.session.completed` + `charge.dispute.*` — portal-side subscription
   changes never reach the DB. Root-cause the intended design, then fix so
   `enabled_events` ends up correct (IaC or recorded imperative update).
4. **Deterministic tests:** nanoid-user topup grants exactly once; replayed
   event no-ops; the new handler-arm coverage per the brief.
5. **Records:** run ledger + `pr/R6FIX.5.md` + PR + BUILD_INDEX row 232 +
   LEDGER (RESOLVED-IN-CODE, PHASE LOG) + GATE-LAUNCH threshold-1 dated note +
   DEFERRALS dated tails; ci-boundary json.
6. No prod mutations — "live re-proof owed" recorded honestly.

## Acceptance criteria

- [x] Topup grant lands for a nanoid (`[a-zA-Z0-9]{32}`) user id — exactly once
      under replay *(deterministic — `stripe.test.ts` nanoid-member pack arm +
      Payment-Link arm: first process grants, replay returns `ignored`, one
      `topup_granted` row, no duplicate telemetry)*
- [x] The stored `stripe_events` row re-drives to `topup_granted` via the
      §14.6 queue seam (recorded runbook path) *(engineered — `stripe-redrive`
      verb + `admin_actions` constraint migration 0060; the live
      `evt_1UVF7T…` re-drive is the recorded post-deploy step, owed)*
- [x] `enabled_events` contract covers every type `processStripeEvent`
      dispatches — a canonical list + the imperative update recorded
      *(engineered — `STRIPE_WEBHOOK_EVENT_TYPES` + dispatch-completeness
      tests + `docs/ops/stripe-webhook-endpoint.md`; the Stripe-side update
      itself is the owed operator step)*
- [x] `pnpm turbo build lint typecheck` + `pnpm test` touched green;
      check-build-memory 0 violations; append-only vs `9c90b00` OK *(agentic —
      turbo 135/135; full suite 517 files / 6,149 tests green after the
      Docker-daemon restart — see Evidence report; validators green)*

## Root cause

### F-R6H11B-1 — `analyticsEnvelopeSchema.user_id` is `idSchema` (ULID-only)

`packages/contracts/src/analytics.ts:13` validates every analytics envelope's
`user_id` against `idSchema` (26-char Crockford ULID, `ids.ts:38-40`). But
`"user".id` is an **opaque auth-minted id**: `admitSignup` mints ULIDs
(`deps.ids("usr")`, signup.ts:137) while Better Auth's own `user.create` paths
(magic-link verify, OAuth callback) mint its default `generateId(32)` =
`[a-zA-Z0-9]{32}` (`@better-auth/core/dist/utils/id.mjs`). The topup arm of
`processCheckoutCompleted` emits `topup.purchased` + `wtp.recorded` INSIDE the
grant `runTx` (stripe.ts:392-404); `parseAnalyticsEvent` throws the ZodError →
the whole tenant tx rolls back → no grant, `checkout_sessions` stays `open`,
`stripe_events.processed_at` stays NULL → the job fails retry_count=2. The
subscribe arm emits no analytics (it never hit the validator). Blast radius:
EVERY `recordAnalyticsEvent` call for a nanoid user throws — ~20 call sites
(repo-wide), incl. the `beta-dashboard` materializer, `wtp` admin verb, and
`billing-routes`' un-caught `credits.exhausted_prompt`.

**Fix:** `authIdSchema` (ids.ts) — accepts both live auth-id shapes (ULID or
the better-auth/nanoid-family id); `analyticsEnvelopeSchema.user_id` uses it.
The field genuinely carries a user id (the buyer) — widening is the honest
fix per the brief.

### F-R6H11B-2 — the endpoint is imperative; its `enabled_events` predates the P1.16 arms

The endpoint `we_1UH99C2MLe3ETP9Sk4UQBKXs` was created **imperatively** by
PRB.18 (`docs/build/pr/PRB.18.md` — Stripe API, not IaC; Pulumi owns only the
`stripe-webhook-secret` container). Its list was authored when the processor
handled only `checkout.session.completed` + `charge.dispute.*`; P1.16/BILL.3
added six more arms the endpoint never subscribed. The design IS
webhook-synced (stripe.ts header; no read-time Stripe sync — `/billing/subscription`
reads the DB row only; the period-tick consumes only what webhooks wrote).
Missing types: `checkout.session.expired`, `invoice.paid` (renewal grants),
`invoice.payment_failed` (past_due/grace — `renewal_failed_at` consumed by the
period tick), `customer.subscription.created|updated|deleted`.

**Fix:** `STRIPE_WEBHOOK_EVENT_TYPES` (canonical list exported from
@rhema/ledger) + `docs/ops/stripe-webhook-endpoint.md` runbook + the
imperative `stripe webhook_endpoints update` recorded as the launch runbook
step (Stripe-side — needs no deploy; handlers already ship on `dc3a8f6`).

### F-R6FIX.5-1 (found this run) — in-app cancel/change-plan never reach Stripe

`POST /billing/subscription/cancel` → `requestCancellation` writes
`cancel_at_period_end=true` LOCALLY only — `StripePort` has no
subscription-mutation method. Stripe renews at period end anyway
(`invoice.paid` → `applyRenewalPaid` — which does not even clear
`cancel_at_period_end`): **a user who cancelled in-app is still charged** —
REQ-SPEC-32 violation, the reverse direction of the same drift family.
`changePlan` has the same gap (upgrade applies the tier+grant now while
Stripe keeps billing the old price; downgrade schedules `scheduled_tier`
locally while Stripe re-bills the old price). The cancel half is propagatable
today (`POST /v1/subscriptions/:id` `cancel_at_period_end` needs no Price
object) — fixed here. The change-plan half needs a Stripe Price-registry
design (inline `price_data` subscriptions can't be price-switched) — recorded
OPEN.

## Plan

1. `authIdSchema` in contracts/ids.ts; `user_id` in the analytics envelope
   uses it. Tests: nanoid accepted, garbage rejected.
2. `STRIPE_WEBHOOK_EVENT_TYPES` + dispatch-completeness tests.
3. `StripePort.setSubscriptionCancelAtPeriodEnd` + Stub/Fetch impls +
   `requestCancellation` propagation (in-tx, precedented by `startCheckout`)
   + route failure mapping. Tests: propagates when bound+stripe id present;
   no call when unbound; Stripe failure rolls the flag back.
4. `stripe-redrive` admin-cli verb (the audited re-enqueue seam — the
   compensation path for `evt_1UVF7T…`).
5. `docs/ops/stripe-webhook-endpoint.md` runbook (canonical event list +
   update command).
6. Nanoid topup + replay tests (F-R6H11B-1).
7. Records: ledger/INDEX/DEFERRALS/GATE-LAUNCH note + PR.

## Test matrix

| AC | Test |
|----|------|
| nanoid topup grants once; replay no-ops | `stripe.test.ts` — nanoid-member topup pack arm + Payment-Link arm |
| envelope accepts both id shapes | `contracts` — `authIdSchema`/envelope legs |
| endpoint list = handled set | `stripe.test.ts` — per-type dispatch proof over `STRIPE_WEBHOOK_EVENT_TYPES` |
| cancel propagates to Stripe | `subscriptions.test.ts` + `stripe-port.test.ts` + `billing-routes.test.ts` |
| re-drive seam exists | `admin-cli.test.ts` — `stripe-redrive` sends `stripe.event` |

## Progress

- 2026-10-27T18:36Z — branch cut @ `6032607`; root causes confirmed on disk
  (analytics envelope ULID-only; endpoint imperative PRB.18-era; in-app
  cancel/change-plan local-only — filed F-R6FIX.5-1).
- 2026-10-27T18:5xZ — `authIdSchema` + envelope/actor wiring; contract tests.
- 2026-10-27T18:5xZ — `STRIPE_WEBHOOK_EVENT_TYPES` + dispatch-completeness
  test; nanoid topup + replay tests (pack arm + Payment-Link arm).
- 2026-10-27T18:5xZ — `StripePort.setSubscriptionCancelAtPeriodEnd`
  (Stub+Fetch), `requestCancellation` in-tx propagation, `syncSubscription`
  clears superseded `scheduled_tier`, route failure mapping.
- 2026-10-27T18:5xZ — `stripe-redrive` admin verb + migration 0060
  (`admin_actions` CHECK extension); admin-cli tests.
- 2026-10-27T18:5xZ — targeted suites green (contracts, ledger, api);
  turbo build/lint/typecheck 135/135.
- 2026-10-27T19:0xZ — full `pnpm test`: migration-census fix (0060 joins the
  expected list); `privsep.docker.test.ts` Docker-daemon EOF classified
  environmental (D-P0.06-2 class — the integration CI leg owns it).
- 2026-10-27T19:0xZ — records: LEDGER OPEN FINDINGS ×3 + CURRENT STATE;
  GATE-LAUNCH threshold-1 dated note; DEFERRALS tails on D-P1.16-1,
  D-BILL.3-1, D-BILL.3-2 + new row D-R6FIX.5-1; ops runbook committed.

## Gap table

| Spec item | Disposition |
|---|---|
| F-R6H11B-1 root-caused + honest fix | **MET** — `authIdSchema` on the user-bearing contract fields only; ULID `idSchema` keeps guarding every entity id |
| Nanoid topup grants exactly once under replay | **MET** — deterministic: first process grants + emits, replay returns `ignored` (completed session), one ledger row |
| Failed event re-drivable post-fix | **MET (engineered) / live leg owed** — `stripe-redrive` re-enqueues the parked `stripe_events` row through the normal `stripe.event` seam, audited in `admin_actions`, idempotent on already-processed rows; ledger idempotency keys make re-drive safe. Chosen over a manual compensation row: the event + session state are intact, and re-driving exercises the REAL path the fix must prove. The `evt_1UVF7T…` execution is the recorded post-deploy step |
| Endpoint subscribes every handled event type | **MET (engineered) / Stripe-side update owed** — `STRIPE_WEBHOOK_EVENT_TYPES` canonical + pinned by test; `docs/ops/stripe-webhook-endpoint.md` carries the imperative update (endpoint is not IaC-owned — PRB.18 created it via the Stripe API) |
| Subscription update/delete + renewal-failure sync | **MET (code arms already exist; now reachable)** — the handlers already ship on `dc3a8f6`; the fix makes the endpoint deliver them |
| No prod mutations; live re-proof honest | **MET** — zero prod writes this run; endpoint update + re-drive + live receipts recorded as owed runbook steps |
| In-app cancel truthful | **MET** (F-R6FIX.5-1 cancel half) — propagates `cancel_at_period_end` inside the tx; Stripe failure rolls back; reject/unavailable mapped honestly |
| In-app plan change truthful | **MET-DIFFERENTLY (deferred, D-R6FIX.5-1)** — needs a Stripe Price-registry design (inline `price_data` can't be price-switched); recorded OPEN rather than silently scoped |

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135 tasks green** (whole workspace).
- Targeted suites: `contracts` analytics/ids, `ledger` stripe (30) +
  subscriptions + stripe-port, `api` billing-routes + admin-cli (10) — all green.
- `scripts/check-additive-migrations.test.mjs` — 13/13 after 0060 joined the
  census.
- Full `pnpm test` — see Evidence report.

## Evidence report

- **`pnpm turbo build lint typecheck`**: 135/135 tasks green (whole workspace).
- **`pnpm test`** (whole suite): **517 test files passed / 1 skipped;
  6,149 tests passed / 4 skipped; 0 standing failures.** Two transient
  failures on the first pass: (a) `check-additive-migrations` census (the
  new `0060_stripe_event_redrive.sql` made the count 16 — expected list
  updated, leg green); (b) `apps/run-task/src/privsep.docker.test.ts` —
  `rpc error … error reading from server: EOF` mid-image-build. Cause:
  the **local Docker Desktop daemon died during the build** (its socket
  was gone after — `docker info` could not connect); restarted via
  `open -a Docker`, daemon `server=29.1.3`, and the identical leg then ran
  **green in 37 s** (all privsep checks pass). Environmental flake, not a
  code failure — this ticket touches nothing under `apps/run-task/`.
- **`check-build-memory.sh .`**: 0 violations (see close-out).
- **`check-append-only.mjs --base 9c90b00`**: protected regions only grew
  (see close-out).
- **Deterministic tests added:** contracts +2 (nanoid `user_id` accepted —
  both ULID and opaque shapes; garbage rejected — while workspace/entity
  ULID rules are unchanged); ledger stripe +~6 (canonical event-list =
  dispatch arms, no duplicates; nanoid pack topup grants once + replay
  `ignored`; Payment-Link nanoid member); subscriptions +N (cancel
  propagates when bound, no call when unbound, Stripe failure rolls the
  flag back, sync clears superseded `scheduled_tier`); api admin-cli +3
  (`stripe-redrive` parked→enqueued+audited, processed→no-op, unknown→
  exit-nonzero); billing-routes +N (Stripe reject→`stripe_rejected`,
  unavailable→`stripe_unavailable`, non-Stripe stays 500).
- **New migration:** `packages/db/migrations/0060_stripe_event_redrive.sql`
  — forward-only CHECK-constraint extension adding `stripe_event_redrive`
  to `admin_actions.action` (additive-lint clean).
- **Live verification debt (recorded, not claimed):** (1) `stripe
  webhook_endpoints update we_1UH99C2MLe3ETP9Sk4UQBKXs …` per
  `docs/ops/stripe-webhook-endpoint.md`; (2) `stripe-redrive evt_1UVF7T…`
  after deploy → `topup_granted` receipt; (3) first real
  `customer.subscription.updated` post-update syncs the portal-canceled row;
  (4) in-app cancel → Stripe re-proof on the deployed build.
