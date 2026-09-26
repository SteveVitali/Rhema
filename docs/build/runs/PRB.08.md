# PRB.08 — Beta billing: house credits, Stripe Payment Links, refunds, reconciliation

- **Spec:** `docs/tickets/24_PRB.08__beta-billing.md`
- **Base:** `stevevitali/prb-07-source-editing` @ `bace99b`
- **Branch:** `stevevitali/prb-08-beta-billing`
- **Config:** implement-spec full preset (deterministic only; Stripe work is fixtures/test-mode — no live Stripe calls per the ticket's own contract)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Relevant rows:

- **`D-P0.11-3` (Stripe grants + reconciliation + house-credit CLI) — CLOSED.** This ticket was its named
  unblocker; all three legs landed deterministically (`stripe.ts`, `reconcile.ts`, `chargeback.ts`,
  `admin-cli.ts` + their PGlite suites).
- `D-PRB.05-1` leg (b) — the `emitDisposed` telemetry seam needed an analytics sink that did not exist.
  `analytics_events` (0020) + `recordAnalyticsEvent` now exist; the seam carries the envelope ids and
  `server.ts` binds it (fire-and-forget). Row stays OPEN for the live leg (a); proxy note updated.
- `D-PRB.03-1` — the `emitEstimated` leg likewise bound to `recordAnalyticsEvent` in `server.ts`; the
  pre-pass + cache legs still need the live api/proxy. Row stays OPEN; proxy note updated.
- **Opened:** `D-PRB.08-1` (live billing legs on `dev`: real test-mode Payment Link purchase, the real
  Usage & Cost report pull via the admin key, the alert webhook, the CLI against the deployed DB).

## Requirements

1. Operator-only admin CLI: grant/void house credits as ordinary `grant` ledger rows in a `promo`-class
   bucket with expiry; every action audited (`admin_actions`).
2. Stripe Payment Links as the beta's one real-money channel; §14.6 webhook discipline (verify →
   `stripe_events` unique id → enqueue → 200; replay = no-op); `grant(topup, +12mo)`; the exhaustion
   panel with `credits.exhausted_prompt{action_taken}`; the final-month beta-plan offer (copy + link
   only — no subscription machinery, that is P1.16).
3. Refund surfacing on run rows ("refunded N credits; partial results kept") — `cost.refunded`.
4. Nightly `usage.reconcile` matching provider Usage & Cost reports by request id; user-favourable-only
   adjustments; >2% drift alert; estimator recalibration (REQ-BILL-13; REQ-ARCH-35).
5. Chargeback path (REQ-SPEC-24.7): suspend + clawback (newest-money-first, spent remainder →
   `clawback_debt`), cancel queued/parked runs with hold release, withhold delivery until non-negative,
   dispute-won/reinstate re-drives the stashed deliveries.
6. WTP events: `wtp.recorded{source, amount}` from purchases and the CLI's interview entry.

Out of scope (must NOT implement): plans/subscriptions/Checkout/Portal/trial entitlement/usage
dashboards (P1.16), auto-reload.

## Plan / what landed

- **`@rhema/db`** — migration `0020_beta_billing.sql`: `billing_accounts.suspended_at`/`clawback_debt`,
  `usage_records.provider_request_id` (+ partial indexes incl. the `provider_report` unique), `stripe_events.processed_at`,
  `runs.delivery_withheld_at`/`pending_delivery`, `admin_actions` (system-level, not RLS), `analytics_events`
  (RLS tenant-keyed), `"user".analytics_opt_out`. Drizzle parity in `schema/billing.ts`, `tenancy.ts`,
  `runs.ts`, `auth.ts`.
- **`@rhema/ledger`** — `entries.ts` gains `source:"admin"` + `stripeRef`; `admin.ts` (`grantHouseCredits`,
  `voidHouseCredits` as an expire-style row clamped to available promo, `suspendAccount`, `reinstateAccount`
  refusing while `clawback_debt>0`, all audited); `analytics.ts` (`recordAnalyticsEvent` — catalogue-validated,
  opt-out-honoring); `stripe.ts` (HMAC-SHA256 `t,v1` verify over the raw body, tolerance 300 s; `insertStripeEvent`
  unique-id dedupe; `processStripeEvent` — checkout→`grant(topup)`+`topup.purchased`+`wtp.recorded{purchase}`,
  `charge.dispute.created`→chargeback, `charge.dispute.closed` won→restore+reinstate+re-drive); `chargeback.ts`
  (suspend + newest-first clawback + `clawback_debt` + queued/parked cancel-with-release + in-flight withhold);
  `reconcile.ts` (provider-request-id join, idempotent `provider_report` rows, user-favourable-only refunds,
  `cost.refunded`, >2% fleet-drift alert, estimator `recalibrate` calls); `sql-ledger.ts` hold refuses NEW
  holds on a suspended account (idempotency replay still resolves).
- **`@rhema/orchestrator`** — `AccountSuspendedError` lives here (dependency direction: ledger→orchestrator,
  ledger re-exports); `createRun`/`resolveGate` surface `account_suspended`; `deliverRun` withhold gate —
  stashes `DeliverRunArgs` into `pending_delivery` under the row lock, stays `finalizing`, returns
  `{code:"withheld"}`; `failRun` emits the whitelisted `cost.refunded`.
- **`@rhema/contracts`** — `cost.refunded` run event (user-visible, summary density, `{credits, reason}`).
- **`apps/api`** — `billing-routes.ts` (`POST /stripe/webhook` §14.6 order — bad signature 400s before any
  row; replay 200s without insert/enqueue; `GET /billing/balance`; `POST /billing/exhausted-prompt`);
  `admin-cli.ts` (operator-only, `RHEMA_OPERATOR_ID` + `DATABASE_URL` + pg-boss for the reinstate re-drive);
  403 mapping for `account_suspended` on run create / gate decide / editor revise; `server.ts` binds the
  webhook secret from Secret Manager (`STRIPE_WEBHOOK_SECRET_NAME`), `systemExec`, the Payment Link URL —
  and now binds `emitDisposed`/`emitEstimated` to `recordAnalyticsEvent`.
- **`apps/worker`** — `billing-jobs.ts` (`stripe.event` consumer — unresolved throws for pg-boss retry;
  `run.deliver` withheld-delivery re-drive; `usage.reconcile` nightly: report pull + reconcile + the
  REQ-SPEC-24.1 balance assertion); `provider-report.ts` (`AnthropicAdminReportSource`, defensive
  normalization); `main.ts` registers the consumers + the `15 3 * * *` cron; admin key via
  `ANTHROPIC_ADMIN_KEY_SECRET` (Secret Manager), alerts via `OPS_ALERT_WEBHOOK_URL`, estimator fold via
  `@rhema/protocols` `recordInstrumentedFold`.
- **`apps/egress-proxy`** — the proxy meters `provider_request_id` (Anthropic `request-id` header) onto
  `usage_records` — the reconcile join key.
- **`apps/web` + `@rhema/ui` + `@rhema/run-sheet`** — the run sheet reads the REAL spendable balance
  (`/billing/balance`); the exhaustion panel renders the §14.6 sentences (beta mode: "Or ask for more
  credits." — no "/ upgrade") + the Payment-Link button (a form POST to `/p/:slug/exhausted` that records
  the telemetry then 302s — the link URL comes from the api's balance read, never a form field, so no open
  redirect); suspended accounts get the notice + disabled Run (and a suspended POST re-renders the sheet,
  403); the final-month plan offer is copy + a link; the run card renders "refunded N credits; partial
  results kept" from the `cost.refunded` Σ.
- **`@rhema/api-client`** — `BillingBalanceDto` + `getBillingBalance` + `recordExhaustedPrompt`.
- **`@rhema/findings-core`** — `cost.refunded` whitelisted; `deriveRunCardInput` sums refund credits.

## Test matrix

| AC / requirement | Test |
|---|---|
| AC1 house grant → spendable; runs hold/debit through the real path | `ledger/admin.test.ts` (grant row shape + audit + idempotent replay + the granted balance driving hold→debit→release); `admin-cli.test.ts` |
| AC2 webhook → idempotent `grant(topup)`; replay no-op | `ledger/stripe.test.ts` (signature accept/reject, unique-id dedupe, grant +12mo + stripe_ref, replayed processing no-op, unresolved stays unprocessed); `api/billing-routes.test.ts` (route order: 400 before rows; replay 200 no enqueue) |
| AC3 exhaustion panel + Payment Link + telemetry | `web/billing-surfaces.test.ts` (panel + link + `action_taken` shown/open_payment_link recorded; 302 to the configured link only; suspended notice; plan offer render/absent) |
| AC4 planted 3% drift → user-favourable adjustment + alert | `ledger/reconcile.test.ts` (refund + alert at 3%; provider-higher never charges but still alerts; <2% refunds without page; re-run no-op; unmatched row counted) |
| AC5 chargeback → suspend + cancel/release + withheld delivery | `ledger/chargeback.test.ts` (suspend/claw/debt/cancel/release/withhold; dispute-won restore+re-drive; replay no-ops); `orchestrator/delivery.test.ts` (withhold gate stashes; cleared account delivers); `worker/billing-jobs.test.ts` (re-drive) |
| Suspended → 403 on create/consent | `orchestrator/run-creation.test.ts`, `api/billing-routes.test.ts` (primed-suspended ledger through `createApp`) |
| `provider_request_id` capture | `egress-proxy/metering.test.ts` |
| refund line render | `findings-core/run-card.test.ts` (Σ aggregation), `ui/run-card.test.tsx` |
| telemetry opt-out + catalogue validation | `ledger/admin.test.ts` recordAnalyticsEvent describes |
| WTP (interview + purchase) | `admin-cli.test.ts` `wtp` verb; `stripe.test.ts` purchase leg |

## Gap table

| # | Requirement / AC / invariant | Status | Evidence |
|---|---|---|---|
| R1 | Admin CLI grants/voids as ordinary ledger rows, promo bucket, expiry, audited | met | `admin.ts` + `admin-cli.ts`; `admin_actions` in the same tx; tests |
| R2 | Payment Links only; §14.6 verify→insert→enqueue→200; replay no-op | met | `billing-routes.ts` + `stripe.ts`; route + unit tests |
| R3 | `grant(topup)` +12mo, `stripe_ref` | met | `stripe.ts`; test asserts expiry + ref |
| R4 | Exhaustion UI + `credits.exhausted_prompt{action_taken}` | met | sheet panel + `/p/:slug/exhausted` + `/billing/exhausted-prompt`; tests |
| R5 | Final-month plan offer = copy + link only | met | `planOffer` label + `planOfferUrl`; no subscription code paths added |
| R6 | Refund surfacing on run rows | met | `cost.refunded` event + card Σ + "refunded N credits; partial results kept" |
| R7 | Nightly reconcile by request id; user-favourable only; >2% alert; estimator fold | met | `reconcile.ts` + `provider-report.ts` + worker cron; planted-3% test |
| R8 | Chargeback: suspend/clawback/cancel+release/withhold; deliver when non-negative | met | `chargeback.ts` + delivery withhold + `run.deliver` re-drive (dispute-won AND CLI reinstate) |
| R9 | `wtp.recorded{source,amount}` interview + purchase | met | CLI `wtp` verb; `processStripeEvent` purchase leg |
| INV | No direct balance mutation; ledger rows only | met | void is an `expire` row; clawback writes ledger rows + debt column |
| INV | Idempotent everywhere | met | idempotency keys / unique event id / `processed_at` / `reportKey` dedupe; replay tests throughout |
| INV | Suspended ⇒ no new holds; in-flight finishes, delivery withheld | met | hold refusal after idempotency check; withhold gate under row lock |
| INV | Secrets in Secret Manager; no live Stripe; no protocol IP in payloads | met | `STRIPE_WEBHOOK_SECRET_NAME`/`ANTHROPIC_ADMIN_KEY_SECRET` are secret NAMES; webhook + provider paths are fixture-tested; protocol-markers gate green |
| OOS | No subscriptions/Checkout/Portal/trial/auto-reload/usage dashboards | met (absent) | none added |

### Gaps found during review (all closed)

- **`reinstate` left withheld runs stashed with no re-drive.** `reinstateAccount` cleared the markers but only
  the dispute-won path enqueued `run.deliver`. Now `reinstateAccount` returns the `(runId, workspaceId)`
  pairs and the CLI enqueues `run.deliver` per run over pg-boss (or prints the ids when unbound).
- **Hold suspension check preceded the idempotency check** — a replayed (already-succeeded) hold on a
  suspended account would spuriously fail. Idempotency now resolves first; only genuinely-new holds refuse.
- **The web run POST 500'd on a suspension that landed between render and click** — 403 now re-renders the
  sheet (which shows the suspended notice from the fresh balance read).
- **`emitDisposed`/`emitEstimated` were still unbound** despite the analytics sink landing in this ticket —
  both are now bound in `server.ts` (the seams' deferral rows noted as progressed).
- **Lint/typecheck fixes:** unused imports in `stripe.test.ts`/`stripe.ts`/`billing-routes.test.ts`/
  `billing-surfaces.test.ts`; invalid-ULID test ids (Crockford base32 excludes `U`); worker/web fixture
  shapes.

## Evidence log

- `pnpm turbo build lint typecheck` → **108/108** tasks green.
- `pnpm test` (full suite) → **1785 passed / 2 skipped / 251 files**, zero failures (the 2 skips are the
  `DATABASE_URL`-gated server-Postgres leg and one pre-existing skip).
- `pnpm check:protocol-markers` → OK (39 public-facing files). `pnpm check:licenses` → OK (497 packages).
- Targeted: ledger 70 tests across 13 files; api 120; web 92; worker billing-jobs 5; egress metering green.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → see below (run at close-out).
- Live verification: NOT RUN — deterministic only; the live billing legs are **D-PRB.08-1**.

## Evidence report

**What landed.** Real money at beta fidelity: the operator CLI writes audited `grant(promo, admin,
house_credit)` rows with expiry (voids are `expire` rows clamped to available promo — never a balance
UPDATE). Stripe Payment Links are the one real-money channel: the webhook verifies the Stripe-Signature
HMAC over the raw body, inserts `stripe_events` on the unique event id, enqueues `stripe.event`, and 200s —
a replayed id inserts/enqueues nothing; the worker's consumer turns `checkout.session.completed` into an
idempotent `grant(topup, +12mo)` with `stripe_ref` = the payment intent, plus `topup.purchased` and
`wtp.recorded{source:"purchase"}` telemetry. The run sheet reads the real spendable balance; at exhaustion
the §14.6 panel shows the Payment Link (POST → `credits.exhausted_prompt{action_taken}` → 302), and the
final-month plan offer is copy + a link only.

Refunds surface on run rows via the whitelisted `cost.refunded` event. The nightly `usage.reconcile` joins
the provider Usage & Cost report on `usage_records.provider_request_id` (captured by the egress proxy from
the `request-id` response header), writes `provider_report` rows idempotently, refunds only when the
provider reports less (never debits the user), alerts on >2% fleet drift, and folds measured-vs-modeled
facts into the estimator. A `charge.dispute.created` suspends the account, claws back newest-money-first,
records the already-spent remainder as `clawback_debt`, cancels queued/parked runs with hold release, and
withholds in-flight deliveries (stashed `pending_delivery`) until the balance is non-negative — the
dispute-won path and the operator reinstate both re-drive `run.deliver`.

**Not shipped (correctly):** subscriptions/Checkout/Portal/trial entitlement/auto-reload (P1.16); usage
dashboards (PRB.12); any live Stripe call. Live legs deferred as **D-PRB.08-1**.
