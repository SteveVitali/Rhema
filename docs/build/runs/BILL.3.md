# BILL.3 — The credit purchase path

- **Ticket:** `docs/tickets/65_BILL.3__credit-purchase-path.md`
- **Primary requirement:** REQ-BILL-16 (the §14.6 failure-state table is the contract)
- **Journey step:** N9 — the complete purchase path (which is why it's after Phase E)
- **Branch:** `stevevitali/bill-3-credit-purchase-path`
- **Base:** `d0456283699e4ff0376e503f53742900a87acfe4` (`stevevitali/res-2-unverified-delivery-and-refund`)
- **Merge policy:** OPERATOR — stacked on PR #86; not merged by the build.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude, interactive subagent session.
- **Date started:** 2026-10-01

## Why this ticket is next

Docs+build table says so; Phase E (RES.1, RES.2) is complete and BILL.3 owns N9 on the sequencing
graph. Deps landed: STB.4 (test-mode Stripe edge, checkout-return), P1.16 (billing), P1.22 (CSP
audit), PRB.08 (beta billing), PRB.19/F32 (Payment Link account reference), JOURNEY.1 (flagged test
tenants + test mailbox), SEC.1 (database roles), HOT.1 (claims config). Absorbs BL-51 and BL-09
(`X-pending-checkout-email-gap`).

## Phase 0 — claims, anchors, deferrals (2026-10-01)

- Branch `stevevitali/bill-3-credit-purchase-path` cut from the RES.2 merge-able tip `d045628`
  (stacked on PR #86 → #85 → origin/main).
- DEFERRALS re-read first. Resolved-adjacent rows touched by this ticket:
  - `D-STB.4-6` prod POST /billing/checkout rejection → **DIAGNOSED** (below) — fix is leg 4.
  - `D-PRB.19-2` release-approval waiver for non-zero grant amount — purchase-closed switch makes
    the surface smaller; the waiver question itself is PRB.19's, recorded in the closeout.
  - `D-PRB.19-4` "same assert on /billing/portal" — superseded by this ticket's portal leg.
  - `D-PRB.19-5` Payment Link policy gate in Pulumi — production already pins the link;
    BL-51's policy direction (fail-closed purchase switch) absorbs the open question.
  - `D-BETA.4-3` CSP PostHog lines — verified dead in code; the CSP shape this ticket edits is a
    different section (`form-action`), the tombstone stays informational.
  - `D-PRB.08-6` the pending-checkout email promise is a page lie — directly fixed by leg 5.
- `docs/build/pr/STB.4.md` and the RES.2/PRB.08 run ledgers re-read for carry-forward and §14.6
  idempotency posture. Anchor memory roots: `docs/` (memory root stamp verified).

## Phase 1 — plan + diagnosis

### Production diagnosis (read-only Cloud Logging, 2026-10-01)

Prod api `POST /billing/checkout` at `2026-10-01T07:03:09Z` logged:

```
Error: stripe /v1/checkout/sessions failed: `customer_update` can only be used with `customer`
or `customer_account`.
```

Root cause: `packages/ledger/src/stripe-port.ts` sends `customer_update[address]=auto` on **every**
session. For accounts with no Stripe customer row yet, the request carries only `customer_email` —
Stripe refuses. The failure is then collapsed by the api's generic handler (500 `internal_error`)
and by the web's `catch → ?notice=checkout` — three of the four "no checkout URL" layers explained:
invalid request → swallowed error → generic copy. The CSP layer is the fourth: `form-action 'self'`
blocks even a same-origin POST whose 302 targets Stripe (form-redirect steps are checked against
`form-action`), so run-sheet Add credits can never reach `buy.stripe.com`.

`automatic_tax[enabled]=true` is also sent unconditionally — separate from the 400, but it presumes
a Tax registration that is not operator-activated (BL-33/Tax stays paused); STB.4's test-mode note
already calls this out as the likely *next* blocker.

### Seam map

- `FetchStripePort` (`packages/ledger/src/stripe-port.ts`) — the only request shape.
- `startCheckout`/`completeCheckoutSession`/`readCheckoutSession` (`packages/ledger/src/checkout.ts`)
  — row-first-then-Stripe ordering (diagnosable id exists before the call); `read` is read-only,
  no return-view marker exists yet.
- `processStripeEvent` (`packages/ledger/src/stripe.ts`) — `checkout.session.completed` arms
  (subscribe / auto_reload / topup / payment-link); grant only on `open → completed` transition;
  `stripe_events` dedupes replays. No `checkout.session.expired` handling; topup arm doesn't
  persist `session.customer`.
- API (`apps/api/src/billing-routes.ts`) — `stripe_unconfigured`, `stripe_credentials_unconfigured`
  exist already; `topups_require_plan` gate exists; errors thrown from the port surface as a
  generic 500. `GET /billing/checkout-sessions/:id` is the return-page poll seam.
- Web (`apps/web/src/server.ts`) — `cspFor` (form-action `'self'` only); subscribe/topup/portal POST
  routes catch → `?notice=checkout`; `billingPageHandler` maps one notice to one sentence;
  `paymentLinkWithReference` composes the buy.stripe.com URL.
- Copy (`apps/web/src/copy.ts`) — `stripeDownNote`, pending-page copy (the email promise).
- Notifications — `notify` queue + `mail.send` + `trial_payment` template render + tri-channel
  writer already exist; the ticket's pending-checkout email rides the same seam with a
  `checkout:<sessionId>` deterministic tag (exactly-once = state-transition + delivery claim).
- `workspaces.is_test` (0046) — the JOURNEY.1 allowlist predicate; `isTestWorkspace` helper exists
  in `packages/ledger/src/test-workspaces.ts`.

### Failure-state matrix map (§14.6 → test plan)

| State | Coverage after this ticket |
| --- | --- |
| checkout down/config | api test: `stripe_unconfigured` (absent port) + `stripe_rejected`/`stripe_unavailable` (classified) |
| provider request failure | `StripeRequestError` classification test + api mapping |
| invalid plan/pack | existing `billing-routes.test.ts` unknown_plan/pack rows (asserted by the matrix) |
| free + top-up | existing `topups_require_plan` row + web renders no top-up forms on Free |
| purchase closed | api test both polarities (closed default, is_test bypass) + web paused rendering |
| hosted redirect | STB.4 live leg (test-mode Checkout session) + contract test of request shape |
| cancel → return | STB.4 N6 cancel leg + api GET session state |
| open/pending lag | **new**: return-viewed marker + completed-after-view → exactly one email; completed-before-view → none |
| completed | webhook→grant existing (`checkout.test.ts`, `stripe.test.ts`) |
| expired | **new**: `checkout.session.expired` marks row expired; poll renders honest copy |
| portal no customer | api `no_stripe_customer` → web `noCustomer` copy |
| webhook replay | existing dedup + **new**: replay does not re-send pending email |
| run failed/refused → refund | `failRun` refund + `internal-api.test.ts` |
| provider outage mid-run | reaper tests (2 re-enqueues → resume_partial) |
| estimate down | **new** run-routes test if absent |
| chargeback | chargeback.test.ts |
| renewal failure | subscriptions.test.ts past_due/grace rows |
| parked > 30d | parked.test.ts |
| reconciliation drift | reconcile.test.ts |
| rate-table change parked | reprice.test.ts |

A single matrix file will enumerate the §14.6 rows → `{file, test name}` and assert each named
test still exists (a removed state = a red build).

## Phase 2 — implementation

Resumed mid-run (prior worker's uncommitted WIP reconciled 2026-10-02): the WIP was coherent and
nearly complete — one stale assertion (`signup.test.ts` AC2 expected `paymentLinkUrl` while the
fresh app correctly ran `purchase=closed`) fixed by opening the switch in that test app; two
self-review findings closed (auto-reload opt-OUT must never be gated — a safety-off is not a
purchase; the auto-reload POST now maps `purchase_closed` to the paused copy instead of the generic
"didn't save"); `isStripeHostedRedirect` got its own contracts pin. Everything else stood as
written.

1. **CSP** (ADR-027): `packages/contracts/src/stripe.ts` exports `STRIPE_HOSTED_ORIGINS`
   (checkout./billing./buy.stripe.com) + `isStripeHostedRedirect`; `cspFor` emits
   `form-action 'self' <the three origins>`; every billing POST validates the api-returned URL
   against the same constant before emitting a 302.
2. **"No checkout URL"** (ADR-030): `FetchStripePort` throws classified `StripeRequestError`
   (status + Stripe type/code + `rejected` = 4xx); `customer_update[address]` only rides with
   `customer`; `customer_creation=always` on payment mode; `automatic_tax` opt-in via
   `STRIPE_AUTOMATIC_TAX` (default off — Tax stays operator-paused). The api maps
   `rejected → 502 stripe_rejected`, `5xx/transport → 503 stripe_unavailable`, non-Stripe throws
   stay 500; the web maps each stable code to its own copy (`billingNoticeFor`) and logs the class.
3. **Purchase switch** (ADR-028): `purchase.mode` stage fact → `PURCHASE_MODE` on the api;
   `parsePurchaseMode` fails closed; `is_test` is the only allowlist, read in-tx per request. Closed
   ⇒ `403 purchase_closed` on checkout/portal/auto-reload-opt-in, `paymentLinkUrl` withheld from the
   balance DTO, web renders the paused note and mounts no purchase forms (a missing `purchase`
   field fails closed too).
4. **Pending-checkout email** (ADR-029): migration `0048_checkout_return_viewed.sql`
   (`return_viewed_at`, `pending_email_queued_at`); the tenant-scoped return poll stamps the marker
   before reading; `completeCheckoutSession` returns the transitioned row only on `open→completed`;
   `notifyPendingCheckout` sends one `trial_payment` mail tagged `checkout:<sessionId>` with
   `openPath=returnTo` (in-app paths only); `checkout.session.expired` now marks the row expired so
   the return page renders the honest state instead of polling forever (poll bounded at §14.6's 30 s
   via `createdAt`).
5. **REQ-BILL-16 matrix**: `apps/api/src/billing-failure-matrix.test.ts` maps all 13 states to live
   tests; the coverage assertion fails on a removed row/file/test-name.
6. **N9** (`packages/journeys/src/steps.ts`): four legs — billing Choose Writer (fresh flagged Free
   tenant → subscribe Checkout), billing Buy 1,000 (funded flagged tenant → top-up Checkout), portal
   (honest no-customer state at $0 — Stripe mints the Customer only at session confirmation; the
   hosted leg is deferred with HUMAN-H7), run-sheet Add credits (Payment Link via the budget-forced
   exhaustion panel). Each hosted landing asserts URL host, expected amount/label, and zero CSP
   console violations.

## Phase 3 — self-review

Two passes over the reconciled diff: (a) mechanical — `turbo typecheck` + `lint` green (90/45
tasks), affected suites green; (b) design re-read of every changed file — findings closed: the
auto-reload gate now keys on `enabled===true` only (opt-out is reachable while closed), the web
auto-reload POST keeps `purchase_closed` instead of collapsing to `notice=autoreload`, the return
poll's mark-before-read ordering is deliberate (the webhook's `returning` clause must see the
observed-open marker), the portal 403 precedes the config check so closed beats `stripe_unconfigured`.

## Phase 4 — gap analysis vs spec

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| CSP form-action = 'self' + exactly the Stripe hosts, one constant, no wildcard (AC) | engineered | engineered | met | `cspFor` (apps/web/src/server.ts), `STRIPE_HOSTED_ORIGINS` (contracts), `billing-surfaces.test.ts` CSP pin + `contracts/stripe.test.ts` |
| Stripe request contract — no rejected param combos; regression test fails pre-fix (AC) | engineered | engineered | met | `stripe-port.ts` customer-conditional `customer_update`; `stripe-port.test.ts` byte-for-byte pins |
| Failure copy — per-class copy; Free never sees Checkout top-up (AC) | engineered | engineered | met | `billingNoticeFor` + copy.ts keys; `billing-pages.test.ts` per-class table; Free → `topupRequiresPlanNote` |
| Purchase switch closed — no Stripe call + paused copy (AC) | engineered | engineered | met | `billing-routes.ts` purchase gate; `billing-routes.test.ts` "defaults closed" (0 Stripe calls) |
| Switch allowlisted test tenant — 302 on all four entry points (AC) | engineered | engineered | met | `billing-routes.test.ts` is_test allowlist (checkout/portal/auto-reload); `billing-surfaces.test.ts` link 302 |
| Pending email — completion after open view ⇒ exactly one; before view/replay ⇒ none (AC) | engineered | engineered | met | `checkout.ts` 0048 cols + `stripe.ts notifyPendingCheckout`; `stripe.test.ts` 6 legs + `notifications.test.ts` dedup |
| REQ-BILL-16 matrix complete + fails when a state is removed (AC) | engineered | engineered | met | `apps/api/src/billing-failure-matrix.test.ts` (13 states + mutation leg) |
| Stage B deploy — preview clean, additive lint, ≤$15 (AC) | staging | — | pending | Stage B section |
| N9 green — screenshots, amounts, no CSP violation (AC) | live-executed | — | pending | Stage B section |
| Real users unaffected — closed state; no grant rows (AC) | live-executed | — | pending | Stage B section |
| H7 remainder deferrals + re-open GATE DECISIONS row (AC) | engineered | — | pending | DEFERRALS.md + LEDGER.md |

Out-of-scope honored: no STB.4 re-deploy work (HOT.1's), no real-money purchase / live UX /
Tax-activation (HUMAN-H7), no cost changes (ECON.1), no pricing-page layout (UX.2), no signup
changes (SEC.2).

## Phase 5 — verification

- `pnpm turbo build typecheck` — 90 tasks green; `pnpm turbo lint` — 45 tasks green.
- `pnpm test` (root vitest, whole repo) — 409 files / 3,880 tests pass; 2 failures fixed in-run:
  `check-additive-migrations.test.mjs` expected-list now names 0048 (the file enum it pins grew by
  design); `lever-matrix.test.ts` 100 ms perf bound flaked once at 117 ms, re-run 15 ms — pre-existing
  flake, also flagged as EST.1's row-67 item.
- `node scripts/check-additive-migrations.mjs --files …/0048_*.sql` — pass (and re-checked by
  `prod-migrate-seed`'s newer-than-prod gate before applying).
- Affected new/changed suites: `billing-routes.test.ts`, `billing-failure-matrix.test.ts` (13-state
  REQ-BILL-16 map + mutation leg), `env.test.ts`, `run-routes.test.ts`, `signup.test.ts` (purchase=open
  fixture), `billing-pages.test.ts`, `billing-surfaces.test.ts`, `contracts/stripe.test.ts`,
  `stripe-port.test.ts` (byte-for-byte request pins), `checkout.test.ts`, `stripe.test.ts`,
  `notifications.test.ts` (checkout:<id> dedup), `internal-api.test.ts`, `auto-reload` suites,
  `stages.test.ts`/`compute.test.ts` (PURCHASE_MODE wiring).

## Stage B — prod journey evidence — **EXECUTED LIVE 2026-10-02** (prod, `28019fc` images)

**Deploy leg ($0 metered).** Migration `0048_checkout_return_viewed.sql` applied to prod Cloud SQL
2026-10-02T03:12:51Z (`_migrations` row) via the IAP tunnel (`127.0.0.1:15433` → `10.46.0.3`, bastion `rhema-prod-proxy-893r`)
with `scripts/live/prod-migrate-seed.mjs` — its newer-than-max additive lint re-verified 0048 in-band
(48 migrations recorded). api+web+worker images built on chain tip `28019fc` (Cloud Build
`39e6fee5-48c0-40fe-aa64-8f3f6940dfe4`, 4m28s, E2_HIGHCPU_8 — subset config
`integration/.scratch/cloudbuild-bill3.yaml`), digests pinned in `Pulumi.prod.yaml` (`f5d5412`); the
six untouched services keep their res2 pins. `pulumi preview --diff`: **6 updates, 146 unchanged, zero
create/replace/delete** (api/web/worker image+env rolls; fetcher/collab/export carry only a
GCP-side `scaling` normalization) → `pulumi up` prod = **update 102** (59s), monthly delta $0.
Provenance: `/healthz` `build.gitSha=28019fcf96f0566c393069ab46084a014d94a600` on **api + web**
(`scripts/check-deploy-provenance.mjs` PASS); `deployments` row `prod:28019fc…` recorded.

**Purchase-switch polarity.** Deployed env on `rhema-prod-api-e745ce0` reads `PURCHASE_MODE=closed`
(gcloud describe); every stage in `stages.ts` ships `purchaseMode:"closed"`; the is_test tenant below
reached Stripe on all four entry points — the switch discriminates, and a non-test workspace fails
closed (403 `purchase_closed`, zero Stripe calls — `billing-routes.test.ts`; the real-browser
non-test walk is D-BILL.3-2, it needs a non-test mailbox by design).

**N9 — PASS** (`docs/build/reports/2026-10-02_BILL.3-n9-d/`, nonce `1ac1bc5fe3e7`, 17.1 s,
provenance match, spend $0 ≤ $5):

- **Choose Writer** (fresh flagged Free tenant `test+j<n9>@rhema.tools`) → `checkout.stripe.com`
  live-mode Checkout `cs_live_a1akBqx7…`, page shows **Writer / $20**.
- **Buy 1,000 credits** (jrn-a `test+jrn-a@rhema.tools`) → `checkout.stripe.com` top-up session,
  page shows **1,000 credits / $10**.
- **Portal** — honest state asserted: Stripe only mints a `Customer` at Checkout confirmation, so at
  $0 jrn-a carries no `stripe_customer_id` → no `data-portal-form` mounted, the no-card note renders.
  The hosted `billing.stripe.com` leg is **D-BILL.3-2** (reachable only after a real purchase).
- **Run-sheet Add credits** (scratch project on jrn-a, `budget=2147483647` cap-override forces the
  insufficient-balance panel without spending) → `data-payment-link` origin-checked then clicked →
  `buy.stripe.com` Payment Link with a $-amount.
- **CSP:** `consoleErrors` carries zero CSP/`form-action`/`Refused` entries across all four hand-offs
  (the only console error is a 429 on Stripe's own hcaptcha logo asset — third-party page noise, not a
  policy violation).
- **No payment submitted** — every hosted page was left at the form.

**Truthful-afterward DB state** (prod, read-only, ~03:40Z): the five `checkout_sessions` rows Stage B
created (4 `subscribe` across the iterating runs + 1 `topup`) are all `state='open'` —
`return_viewed_at`/`pending_email_queued_at` NULL — and will expire via Stripe's 24 h expiry +
`checkout.session.expired`; `credit_ledger` shows **zero `grant` rows** in the window;
`notification_deliveries` shows **zero** rows (nothing completed → nothing mailed — the pending-email
condition's negative leg, live).

**Fixture note (honest):** jrn-a holds a fixture `subscriptions` row `sub_jrna_bill3_fixture`
(tier `writer`, `status='past_due'`, `renewal_failed_at=NULL`, period −1 d → +29 d, no Stripe ids) —
the same class as JOURNEY.1's audited house grant: §14.2 mounts Checkout top-ups only for paid tiers,
and `past_due`+NULL-failure-marker is the shape that leaves the hourly `billing.period-tick` inert (no
included grant, no warning, no lapse). The past-due banner it renders is the fixture's visible seam.

## Closeout

- **Deferrals opened:** D-BILL.3-1 (H7: real purchase + live re-verify), D-BILL.3-2 (hosted Portal +
  pending-email live send + non-test closed-state walk — all need a completed checkout or a non-test
  mailbox). **Closed:** none owed by this run (BL-09 absorbed, BL-51's code half landed).
- **Gate decision:** GD-BILL.3-1 asks the operator whether to re-open purchase
  (`infra/config/stages.ts` prod `purchaseMode:"closed"`→`"open"` + redeploy — one line, no code).
- **Spend: $0** (deploy + N9 + scans; no metered run, no Stripe charge).
- **Ledgers:** `LEDGER.md` CURRENT STATE advanced (`lastCompleted: BILL.3`, `nextTicket: ECON.1`,
  `chainTip: stevevitali/bill-3-credit-purchase-path`), BUILD_INDEX row 93, this file, `pr/BILL.3.md`.
- **ADRs:** 027 (CSP shape), 028 (switch location/default), 029 (pending-email trigger), 030 (Stripe
  request contract) — `docs/adr/README.md` regenerated by `build-memory adr-index`.
