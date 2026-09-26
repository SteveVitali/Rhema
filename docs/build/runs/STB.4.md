# STB.4 — Real-money + external legs (run ledger, append-only per leg)

- **Ticket:** `docs/tickets/58_STB.4__real-money-and-external-legs.md` — the ops ticket for the legs
  that cost real money or external coordination.
- **Branch:** `stevevitali/stb-4-real-money-external`, stacked on the DEF.3 tip `351177c`
  (`stevevitali/def-3-live-noise-and-polish`, PR #79 — the deployed prod tree). **Nothing merged.**
- **Spend:** **$0.** Leg A (live Stripe) is held for the operator's mode decision — untouched.
  Legs B (pen-test facilitation) and C (admin-key usage reconciliation) are the $0 legs run here.
- **Session:** live prod evidence over `gcloud`, the IAP tunnel (`127.0.0.1:15433` → Cloud SQL
  `10.46.0.3`, bastion `rhema-prod-proxy-qdvf`), Cloud Logging, and read-only DB queries
  (`integration/.scratch/` — untracked). Secrets never printed (values checked by
  length/prefix/placeholder-pattern only).

## Leg A — live Stripe billing round-trip (HELD — operator gate)

Not run. The ticket's own AC2 ("the ticket stops at each gate rather than proceeding on inferred
consent") + the run instruction hold this leg for the operator's live-vs-test-mode decision.
D-P1.16-1 stays as-is; no Stripe surface was touched.

## Leg B — pen-test facilitation (D-P1.22-3) — vendor package READY, $0

Procurement is the operator's action. This leg's work ends at "everything a vendor needs exists in
the repo". Delivered two docs (name-free — no invented vendors, prices, or dates):

| artifact | path | contents |
|---|---|---|
| Vendor package index | `docs/security/pen-test-vendor-package.md` | The single index: package contents table (scope doc + architecture summary + env/test-accounts + ROE + findings format + repo-access terms); a condensed architecture summary (deployed topology + the six trust boundaries); test-account provisioning mechanics (two paid tenants `PT-PAID-A/B` + one trial `PT-TRIAL`, seeded by audited `house-grant` promo credits; account ids + budget kept OUT of git); the expanded rules-of-engagement checklist (scope discipline / data handling / comms / safe-harbor); and what the engagement returns. |
| Findings triage runbook | `docs/security/pen-test-findings-triage.md` | The tickets-from-findings path: the `PT-NN` finding-record template; the severity rubric verbatim from the scope doc (critical = launch-blocking, ≤24h secure-channel report); the intake workflow (receive → `docs/build/readouts/` → dedupe vs the deterministic suite → confirm → fix ticket / `D-PT-NN` DEFERRALS row / backlog → launch-gate list → verify+close); standing rules (no silent drops, no secrets, compensating controls named). |

**Gap-fill vs `pen-test-scope.md`:** the scope doc already carried the surface map, controls list,
residual-risk statement, engagement shape, and a one-paragraph triage protocol. What it lacked for a
vendor to start: an architecture summary (delivered §1 of the package), concrete test-account/env
mechanics (§2), an expanded ROE checklist (§3), and the per-finding record + intake workflow
(the triage doc). `D-P1.22-3` amended accordingly: **vendor-package ready; procurement + engagement
remain the operator's.**

## Leg C — admin-key usage reconciliation (D-PRB.08-1b) — wired to the REAL contract; window reconciled one-sided; provider pull BLOCKED on the key value

### C.1 The seam + the live discovery

The worker binding existed (`main.ts`: `ANTHROPIC_ADMIN_KEY_SECRET` env → Secret Manager →
`AnthropicAdminReportSource` → nightly `usage.reconcile`, placeholder-guarded). But the source's
fetch was written against a **guessed report shape** — `group_by[]=request_id` with per-request
`cost_usd` rows. Verified against the published Usage & Cost API reference (STB.4):

- `GET /v1/organizations/cost_report` — **daily buckets only**; `amount` is a decimal string in
  **lowest currency units (cents)**; `group_by[] ⊆ {description, workspace_id}`; **no api-key filter**
  (org-wide).
- `GET /v1/organizations/usage_report/messages` — token counts only (`uncached_input_tokens`,
  `cache_creation.{ephemeral_1h,ephemeral_5m}_input_tokens`, `cache_read_input_tokens`,
  `output_tokens`, `server_tool_use.web_search_requests`); `group_by ⊆ {account_id, api_key_id,
  context_window, inference_geo, model, service_account_id, service_tier, speed, workspace_id}` —
  **`request_id` is not a group_by** (the deployed code would 400 on the real API).
- **No request-level granularity exists at all** → the `provider_request_id` join (100% populated on
  prod proxy rows — verified below) can never join Anthropic-side. Reconciliation for Anthropic is
  **window-level** by construction.

### C.2 Code landed (STB.4)

| file | change |
|---|---|
| `apps/worker/src/provider-report.ts` | Rewritten to the real contract: paginated `cost_report` (cents→USD) + `usage_report/messages` (`bucket_width=1d`, `group_by[]=model`) for the report day; emits `rows:[]` + a `window` payload `{start,end,usd,tokensByModel}`; defensive normalizers `normalizeCostReport`/`normalizeUsageBuckets`; non-USD rows throw loudly; the dead `group_by[]=request_id` is gone. |
| `packages/ledger/src/reconcile.ts` | `ProviderUsageReport.window?` added; `reconcileProviderWindow` — compares provider window totals (USD + per-model tokens) vs Σ `usage_records(source='proxy')` over the window bounds; `usage_drift` alert >2% with per-model detail; **no ledger writes** (an aggregate carries no run attribution — refund smearing would be an unexplained write; divergence pages for an operator-driven adjustment instead). |
| `apps/worker/src/billing-jobs.ts` | `handleUsageReconcile` runs the window arm when the report carries `window`, the request-id arm when it carries `rows`; `UsageReconcileResult.window` added. |
| `apps/worker/src/main.ts` | nightly log line now reports the window compare (`report $X vs proxy $Y drift N%`). |

Tests: `provider-report.test.ts` (new — real-envelope fixtures, cents→USD, per-model token sums,
pagination, 401 loud-fail), `reconcile.test.ts` `reconcileProviderWindow` block (in-tolerance /
planted 3% drift alert / report-only & meter-only models / empty window; asserts **zero**
`provider_report` rows + zero refunds), `billing-jobs.test.ts` window-arm case. Gates: §G below.

### C.3 Live state (2026-09-26 evidence)

- **`rhema-prod-anthropic-admin-key` v1 = still a placeholder** (`sk-ant-admin_placeholder_…` shape —
  47 bytes, self-marked; never printed). It is the ONLY admin-key-named secret in the project.
- **No usable admin/org-scoped key exists:** all three real keys (`anthropic-api-key`,
  `rhema-dev-anthropic-api-key`, `rhema-prod-anthropic-api-key`) are `sk-ant-api03-…` inference keys;
  live probes → `401 {"type":"authentication_error","message":"The Admin API requires an Admin API
  key or an organization-scoped API key."}` on both admin endpoints ($0).
- **The deployed worker behaves exactly as designed:** nightly `usage.reconcile` logs
  `report=skipped` (placeholder guard) + runs the balances assertion every night — Cloud Logging
  2026-09-18→26. Standing note: the assertion currently reports **1 balance divergence** nightly
  (pre-existing; the DEF.2 repair's D-DEF.2-1 class, alert path verified working in PRB.17).
- **Meter-of-record join readiness: 100%.** Every prod `usage_records{source='proxy'}` row carries a
  `provider_request_id` (verified per-day counts below).

### C.4 The reconciliation window — OUR side (read-only, prod rows)

Window: **2026-09-26 UTC** (the STB.3/DEF run day — the heaviest recent window). Metered sums:

| side | value |
|---|---|
| proxy `usage_records` | **1001 rows · Σ list_cost_usd = $24.228135 · Σ credits = 3363** |
| by model | `claude-sonnet-5`: 987 rows · in 6,472 / cache-write 2,406,570 / cache-read 35,196,086 / out 1,082,803 / searches 2 · $23.916656 — `claude-haiku-4-5-20251001`: 14 rows · in 41,591 / cw 120,901 / cr 66,963 / out 4,413 / searches 9 · $0.311479 |
| `provider_request_id` coverage | 1001/1001 (100%) |
| `credit_ledger` same day | debits `run` ×31 = 1,605cr · holds 8,684 · releases 7,079 · `hold source=reconcile` 180 · grants 2,010 · adjustment 16 |

**Provider side: UNAVAILABLE** — the admin-key value is still a placeholder, so the Anthropic-reported
cost for the window could not be pulled. Divergence: **not computable this leg.**

### C.5 What the operator unblocks (exact steps, no code left)

1. Seed the real Anthropic **Admin API key** (`sk-ant-admin-…` or an org-scoped key):
   `gcloud secrets versions add rhema-prod-anthropic-admin-key --data-file=-` (project `rhema-507501`).
2. The worker reads the secret at boot — a Cloud Run revision restart (or the next deploy) picks it
   up; the placeholder guard then binds `AnthropicAdminReportSource`.
3. Next nightly `usage.reconcile` (03:15 UTC) runs the window arm for the prior day; the log line
   carries `window=report $X vs proxy $Y drift N%`; >2% pages the ops webhook.
4. One-off verification of THIS window: re-run the arm for 2026-09-26 (source `day` override) and
   compare against the C.4 metered numbers. Honest caveat recorded in code: `cost_report` is
   **org-wide** — non-Rhema consumption (Console/other keys) inflates the provider side; the
   per-model token compare is the cleaner parity check.

### C.6 Worker image deployed to prod (2026-09-26, the Stage-B pattern)

- `git diff 351177c..86441d6` — worker + `@rhema/ledger` only; api also consumes the ledger package but
  the change is additive (optional `window` field + a new export) → **worker image only**.
- Cloud Build `e291b5c3-21cb-4b3e-8251-b2adaa6822ee` — SUCCESS (tag `stb4`; scratch
  `cloudbuild-stb4.yaml`, E2_HIGHCPU_8). Worker digest
  `sha256:a60b450483ec3decadb0ed3071faa4faef6fd3f7c2a21ce0b863288c3495850b`.
- Pinned into `Pulumi.prod.yaml` `rhema:serviceImages.worker` (dated comment; other images unchanged).
- `pulumi preview` (prod): **6 update / 134 unchanged — 0 creates, 0 destroys, 0 replaces** (worker
  `~template` swap + the known cosmetic `-scaling` readback drift on the other five — identical to the
  STB.2 preview shape; the stop condition never fired).
- `pulumi up` — **update 91 converged (59s)**; `gcloud run services describe` confirms
  `rhema-prod-worker-cbdaf0f` serves `…worker@sha256:a60b450483ec…`.
- Provenance: `scripts/live/record-deployment.mjs` → **`prod:86441d6c38c1901d1ae7d5586638358bed0f2ad2`**,
  `protocols_version=0.4.0+ec61156725a895ab`, all nine digests on the row.
- Post-deploy boot (Cloud Logging 18:47:30Z): clean startup — health server → keys loaded →
  **"ANTHROPIC admin key is a placeholder — Usage & Cost report pull unconfigured"** (the guard intact
  on the new image; prod behavior unchanged until the operator seeds v2) → pg-boss → consumers+crons
  registered. Zero crashes.

## G. Gates

- `pnpm turbo build lint typecheck` — **132/132 green**.
- `pnpm test` — **3600 pass / 380 files** (two full-suite runs); the single failure both times is
  `run-sheet` `lever-matrix`'s timing-sensitive `<100ms` assertion (133ms / 159ms under suite load —
  **flaky, unrelated to this diff; green in isolation at 16ms and 23ms**; run-sheet untouched).
- `pnpm check:licenses` — 607 packages OK · `pnpm check:protocol-markers` — 45 files OK ·
  `check-upstream-diff.mjs` — 22 files reconcile · `check-build-memory.sh` — **0 violations**.

## Still owed (explicit)

- **Leg A** — operator's mode decision (live vs test Stripe), then the (a)–(i) legs in D-P1.16-1.
  **2026-09-26 amendment:** the operator directed test mode — executed per the Leg A section above
  (synthetic edge; $0). What remains is the live-mode (real `api.stripe.com`) re-verification in
  D-P1.16-1, which stays PARTIAL.
- **Leg B remainder** — operator procurement of the engagement itself; findings file into
  `pen-test-findings-triage.md`.
- **Leg C remainder** — operator seeds `rhema-prod-anthropic-admin-key` v2 → window reconcile runs
  itself nightly; the 2026-09-26 one-off compare is one command away (C.5.4).

## Leg A — executed 2026-09-26 in TEST MODE (operator-directed; $0 spend; synthetic Stripe edge)

The operator directed Leg A in test mode ("TEST MODE ONLY … $0 … never touch prod live secrets").
No usable `sk_test_` credential existed anywhere in the environment (prod secret is live `sk_live_51UA…`
— never touched; the `dev` Secret-Manager Stripe payload was 0 bytes; local `.env` also held the live
key; Stripe CLI absent). The honest vehicle built for the leg:

- `integration/.scratch/stripe-edge.mts` (gitignored scratch) — a local Stripe-compatible HTTP edge on
  `127.0.0.1:8400` implementing the exact REST surface `FetchStripePort` calls (`POST /v1/checkout/
  sessions`, `/v1/billing_portal/sessions`, `/v1/payment_intents`) plus hosted Checkout/Portal pages and
  an admin surface (`/checkout/<cs>/complete` pays, `/portal/<bps>/action` cancels, `/__admin/emit`,
  `/hold`, `/release`, `/pm`, `/__state`). Webhooks are REAL `Stripe-Signature` HMAC-SHA256 deliveries
  into the api's `POST /stripe/webhook` — the deployed intake (verify → `stripe_events` → pg-boss →
  worker `stripe.event`) ran unmodified.
- New env seam `STRIPE_API_BASE_URL` (api `env.ts`/`server.ts`, worker `env.ts`/`main.ts`) feeds the
  pre-existing `FetchStripePort(key, baseUrl)` ctor. **Default `https://api.stripe.com` is unchanged —
  prod behavior identical; the var is never set on prod.**
- Local stack: Postgres `rhema-stb4-pg:15432` (migrated), Redis `:16379`, api `:18080`, web `:18081`,
  worker (all billing queues/crons registered), Secret-Manager dev secrets `rhema-dev-stb4-*` for
  run-token / webhook-secret / email-action.
- Every minted id carries `_stb4edge` — **synthetic, NOT real Stripe test-mode objects.** The live-mode
  remainder (real `cs_/sub_/in_` from api.stripe.com, Stripe's own event-ordering/retry/Radar/3DS/Tax
  semantics, hosted-page UX) stays in D-P1.16-1 → row stays **PARTIAL, test-mode only**.

Accounts (all through the real `/signup` route): **A** `stb4-leg-a@edge.test` (user `01M3FJ3F47F2QKR59V5JPEFQ8H`,
ws `01M3FJ3F4HN0G1MHT0562P3G9K`, ba `01M3FJ3F4HVX8HYYHA6PZFDN2F`) · **B** `stb4-leg-b@edge.test`
(ba `01M3FJCBAT8S9QH85PP0RNJ8SM`, ws `01M3FJCBATFCT5ZM420N1Z5C34`) · **C** `stb4-leg-c@edge.test`
(ba `01M3FJEWBKTZ5NXAF6ZGKYYHWY`, ws `01M3FJEWBKC9YK23ZP8W6NDJ6Q`).

### (a) Writer-month Checkout — DONE

- `POST /billing/checkout {kind:subscribe,writer,monthly}` → chk row `01M3FJ48NGW9HWH2R0JQBMVNRG`
  → `cs_stb4edge_0001o88z` → paid at the hosted page → **303 → `/billing/return?session_id=<chk>`**
  (see BUG-2: pre-fix this URL was `/billing/checkout-return?session=` — a 404 on the deployed web for
  every real checkout).
- Webhooks (all HMAC-verified, `stripe_events` + `processed_at`): `customer.created`
  `cus_stb4edge_0002oaai` → `customer.subscription.created` `sub_stb4edge_0004oabr` (the Checkout-race
  arm — `subscription_synced`) → `invoice.paid` `in_stb4edge_0008oac2` (`renewal_paid`) →
  `payment_intent.succeeded` `pi_stb4edge_0005oabr` → `checkout.session.completed`
  (`subscription_activated`).
- DB: `subscriptions` `01M3FJ4E95VF1CSAQT5NW6AJ9W` writer/monthly/active with both Stripe ids;
  `checkout_sessions` → completed; `trial_entitlements` → **converted** + `promo_ledger_id` (the §14.3
  in-window upgrade: `grant(promo,800,trial_upgrade_conversion)`); `billing_accounts.trial_state` → free.
- `/billing/return` renders `data-checkout-state="completed"` + "Payment confirmed — your credits are
  in."; `/billing/subscription` → tier writer, `hasStripeCustomer:true`, period bounds present.
- **BUG-1 found here** (below): the first run of this leg granted **4000** included, not 2000. Fixed,
  then re-verified on account B (`cs_stb4edge_000iu00y` → `sub_stb4edge_000lu1tn`, chk
  `01M3FJCFMSM8TCDFB2YZBGHWH3`, pi `pi_stb4edge_000mu1tn`): exactly **one** `grant(included,2000)` keyed
  on the canonical Stripe period `2026-09-26T19:17:03.000Z`.

### (f) checkout-return delayed-webhook path — DONE

- `/__admin/hold on` → `POST /billing/checkout {kind:topup,packId:topup_10,returnTo:/app/settings/billing}`
  → chk `01M3FJ528F6AH9RB09AABDPN8X` → `cs_stb4edge_000bosgz` → paid with webhooks held.
- While held: `GET /billing/checkout-sessions/<chk>` → `{"state":"open","kind":"topup","returnTo":"/app/settings/billing"}`;
  web page renders `data-checkout-state="open"` + `http-equiv="refresh" content="5"` auto-poll + the
  pending copy *"Confirming your payment with Stripe — this page refreshes. If it takes more than a
  moment, we'll email you when it lands."* (the horizon email fallback is this copy arm; no separate
  pending-mail job exists — recorded as observed).
- `/__admin/release` → 4 queued events delivered → `checkout.session.completed` → `topup_granted`;
  session `completed`.

### (b) $10 top-up — DONE (same session as (f))

- `credit_ledger`: `grant(topup,1000,source=stripe,reason=topup:topup_10,expires +12mo,
  stripe_ref=pi_stb4edge_000coub6)` — **the PACK's 1000 credits** (never `amount_total`).
- `analytics_events`: `topup.purchased` + `wtp.recorded{amount:10,source:"purchase"}`.
- `credit_balances.topup = 1000`.

### (d) Customer Portal — DONE

- `POST /billing/portal` → `bps_stb4edge_000su8mw` (`cus_stb4edge_000ju1sq`) — the real route exercised
  `FetchStripePort.createPortalSession` end-to-end. Edge-hosted page exposes the cancel actions below;
  real Stripe hosted-portal UX is live-mode remainder.

### (c) cancel → period end → `subscription.deleted` → Free — DONE

- `POST /billing/subscription/cancel` → `{"applied":true}` → `cancel_at_period_end=true` on
  `sub_stb4edge_000lu1tn`.
- Portal action `cancel_end` → `customer.subscription.updated` → `subscription_synced` (flag kept).
- Portal action `cancel_now` (the period-end analog) → `customer.subscription.deleted` →
  `subscription_ended` → `subscriptions.status='ended'`.
- Enqueued `billing.period-tick` (real boss job) → `dailyGrants:1` → `grant(daily,10,daily_allowance)`
  — the Free-tier daily allowance arm.

### (e) failed invoice → grace → lapse → Free — DONE

- `/__admin/emit invoice.payment_failed` (`in_stb4edge_fail01`, `evt_stb4edge_000vx2zy`) on
  `sub_stb4edge_0004oabr` → `renewal_failed` → `status='past_due'`, `renewal_failed_at` stamped, notify
  job *"Your Writer payment didn't go through — we'll keep retrying for 14 days…"* completed.
- `renewal_failed_at` backdated −8d → `billing.period-tick` → `downgrade_warned_at` set
  (`warningsSent:1`) + warning notify *"…in 7 days the plan drops to Free…"* (mail transport
  unconfigured locally → notify row retries; the flag + job are the evidence).
- Backdated −15d → tick → `status='ended'` (`pastDueLapsed:1`) + lapse notify *"…you're on Free now
  (10 credits/day for chat)"*; `/billing/subscription` → `tier:"free"`, `subscription:null`;
  `grant(daily,10)`.
- Time advance via SQL backdate — the synthetic edge has no test-clock object; a real Stripe test clock
  is live-mode remainder.

### (g) auto-reload — DONE (all three audited outcomes)

- `PUT /billing/auto-reload` validation: `{enabled,threshold:6000,pack:topup_10}` **without** a cap →
  `422 invalid_auto_reload "auto-reload requires a positive monthly cap"` (explicit opt-in enforced).
- Armed `{threshold:6000, pack:topup_10, cap:$10}` → enqueued `billing.auto-reload` →
  `{attempted:1,charged:1}` → `auto_reload_events` `below_threshold/charged` +
  `stripe_ref=pi_stb4edge_000wxvkn` (the edge's off-session `/v1/payment_intents`) +
  `grant(topup,1000,reason=auto_reload)` + counter `auto_reload_month=2026-09, spend_cents=1000`.
- Second sweep `attempted:0` — balance self-satisfied above threshold.
- Threshold→10000 with $10 cap already spent → `monthly_cap/skipped` audit row (cap enforcement).
- Edge payment-method flagged declined + cap→$30 → `payment_failed/failed` + notify
  *"update your card in billing to keep it on"*.

### (h) trial unlock — DONE (gate + audit + activation)

- Account C launched the entitlement run via `POST /projects/:id/runs` (review/standard/base, 1,200
  words, `entitlementId=01M3FJEWBQ6Z900JXE67N4NBT7`, `fingerprint`) → `trial_unlock_checks`
  `allow/ok` (`email_domain=edge.test`, `fingerprint_seen=0`, `asn_risk` unset locally) →
  entitlement `locked→unused`, `grant(trial_pocket,150)`, `billing_accounts.trial_state=trial_active`,
  `fingerprint_hash` bound.
- Run `01M3FJGGR02RHDVN3XSKFJT5JS` → `queued` → worker picked it to `provisioning` (the GKE launch is
  local-infra remainder, unrelated to the gate).
- The §14.3 conversion arm also fired live twice (A and B upgrades → `grant(promo,800)`).

### (i) parked-run repricing — PARTIAL (structurally unreachable today)

- Only `RATE_TABLE_V1` exists (`CURRENT_RATE_TABLE_VERSION=1`, `contracts/domain/rates.ts`) — no newer
  table has shipped, so no legitimate parked run can carry an older version; a fabricated
  `rate_table_version≠1` makes `rateTableFor` throw `UnknownRateTableError` (meter fails closed, by
  design).
- Exercised what is reachable end-to-end: parked the real run (`waiting_gate`+`paused_at`) →
  `POST /runs/:id/resume {note}` → `repriceParkedRun` invoked inside the resume tx → `changed:false`
  → normal resume: `guidance.captured` + `run.resumed` + `steer.queued` events, `current_attempt` 2,
  worker re-provisioned it.
- The positive-delta → `confirm_cost` gate branch remains unit-covered (`reprice.test.ts`, steering
  tests) and live-verifiable only once a v2 rate table ships — recorded honestly.

### Bugs found exercising the real path — all fixed + regression-tested

- **BUG-1 — double `included` grant on every subscription activation.** `customer.subscription.created`
  grants `sub:<id>:included:<tier>:<stripe period-start>` while `checkout.session.completed` granted
  `…:<clock.now()>` — two instants, two idempotency keys, **2× included credits** (observed: 4000
  instead of 2000). Fix: `grantIncludedCredits` now dedupes per (subscription, tier, period) with a
  period-window check over `credit_ledger` (`subscriptions.ts`), and the `.completed` arm reuses the
  stored Stripe period when the row already exists (`stripe.ts`) so the stored bounds stay
  Stripe-canonical. Regression tests both orderings in `stripe.test.ts`.
- **BUG-2 — checkout return URL 404'd every real checkout.** `startCheckout` minted
  `…/billing/checkout-return?session=<id>` but the deployed web mounts `/billing/return?session_id=`.
  Fixed the generated success/cancel URLs; the web page also now handles `?cancelled=1` (previously a
  cancel return would auto-refresh-forever against a permanently-`open` row) with new
  `returnCancelled` copy.
- **BUG-3 — `rateTableVersion` was client-trusted.** Missing → raw NOT NULL `23502` 500 on
  `runs.rate_table_version`; a crafted stale version would pin older pricing at creation. Now
  server-pinned `CURRENT_RATE_TABLE_VERSION` in `run-routes.ts` (same rule the route already applies to
  estimate/cap). Regression test in `run-routes.test.ts`.

### Live-mode remainder (why D-P1.16-1 stays PARTIAL — test-mode only)

- Real `sk_test_`/`sk_live` round-trips through `api.stripe.com` (these ids are `_stb4edge` synthetics),
  Stripe-hosted Checkout/Portal UX, 3DS/Radar, Tax, Stripe event-ordering/redelivery guarantees, test
  clocks, and a real v2 rate table for leg (i). The DB/queue/webhook/worker/web path exercised here is
  the deployed code; the Stripe side was a faithful stub.
- Spend this leg: **$0**.

### Leg A gates (this run)

- `pnpm vitest` — `stripe.test.ts` 18/18, `subscriptions.test.ts` 11/11, `run-routes.test.ts` 53/53
  (incl. the 3 new regression tests); `pnpm turbo build` green for `@rhema/api`/`@rhema/web`/
  `@rhema/worker` and the ledger graph.

### 2026-09-26 (later same day) — re-verification pass on the still-running stack

- **(g) auto-reload re-swept through the real pg-boss consumer:** `insert into pgboss.job
  (name:'billing.auto-reload')` → job `030d32b5-…` `completed` (5 completed sweep jobs total) → a 4th
  `auto_reload_events` row `payment_failed/failed` for account A (the edge's decline flag was still
  armed — the audit + notify path again, no silent retry). Edge `/__state` corroborates the earlier
  success: `pi_stb4edge_000wxvkn` `off_session:true, status:succeeded, amount:1000` on
  `cus_stb4edge_0002oaai`; account counter `auto_reload_month=2026-09, spend_cents=1000`.
- **(e) failed-invoice persisted state re-queried:** `subscriptions` carries
  `renewal_failed_at=2026-09-11` → `downgrade_warned_at=2026-09-26T19:19:33Z` → `status=ended`;
  `stripe_events` has `invoice.payment_failed` `evt_stb4edge_000vx2zy` processed; the Free
  `grant(daily,10,daily_allowance)` row follows the lapse.
- **(i) the fail-closed boundary exercised over HTTP for real:** run `01M3FJGGR02RHDVN3XSKFJT5JS`
  stamped `waiting_gate`+`paused_at`+`rate_table_version=0` → `POST /runs/:id/resume` → **HTTP 500
  `UnknownRateTableError: unknown rate_table_version 0 — refusing to meter silently (REQ-SPEC-11)`**
  thrown inside `repriceParkedRun`; the resume tx rolled back (row still `waiting_gate`+parked).
  Re-stamped v1 → resume → `{"ok":true,"state":"queued"}` → `run.state_changed`, `run.resumed`,
  `steer.queued` events; worker re-provisioned it (`current_attempt` 3). Confirms the reprice seam
  runs inside every resume tx and that an unpriceable parked run can never resume silently — the
  `changed:true`→`confirm_cost` branch still needs a real `RATE_TABLES` v2.
- **Full suite third run: `pnpm test` — 3604/3604 pass, 0 failures** (the `lever-matrix`
  timing flake recorded above did not recur). `pnpm turbo lint typecheck` re-verified green after the
  `rateTableVersion` cleanup.
