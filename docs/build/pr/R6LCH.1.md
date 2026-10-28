# R6LCH.1 — the launch deploy + the launch flips (flips 2–4; flip 1 parked per GD-THRESH13.R6)

**Requirements:** REQ-GO-4 · manifest row 198 · mergePolicy=OPERATOR (worker never merges)

**Summary.** The production public-launch ticket under the SIGNED GATE-LAUNCH: deploy the
chain tip to prod, run the fail-closed money re-proofs, then execute the three ruled
stage-fact flips in order — `purchaseMode → open`, `refundWindowMode → open`,
trial `audience → everyone` — each live-verified before the next. **Flip 1
(`debitMode → metered`) is PARKED**: `GD-THRESH13.R6` binds it to the paid-account
notice's `EFFECTIVE_DATE=2026-12-01` (the ≥30-day rule); the cap-calibration gap is
ruled accepted. A fourth, live-found defect is fixed and deployed inside this run:
**F-R6LCH.1-1** — Stripe's Portal cancel-schedule arm writes `cancel_at=<period_end>`
with `cancel_at_period_end` still `false`; `processSubscriptionSync` mirrored the flag
alone so a portal cancel would deliver but never converge our DB (jrn-a's sub was
exactly this shape — "Renews" while Stripe had stopped renewing). `pendingCancel =
flag || cancel_at != null` now converges both cancel shapes, verified live
(`cancel_at_period_end` flipped true at `2026-10-28T00:05:43Z`).

**Deploy authority (GD-DEPLOY.R6 — all four conditions evidenced):**
1. `pulumi preview --diff`: 10 stateless updates + 1 replace = the immutable
   egress-proxy `InstanceTemplate` (standard stateless MIG roll) — **zero stateful
   replace/delete**.
2. Additive-migration lint on `0060_stripe_event_redrive.sql` — PASS (single
   CREATE TABLE + index; no grant/role change; applied in-band by
   `prod-migrate-seed` — 60 migrations recorded).
3. Cost delta $0 (same resource shapes) ≤ $15.
4. Provenance all-PASS after `up` #165: web+api `/healthz`
   `gitSha=b04fc1bbd345b18d9bd4ca9b72829466ee01eee5` (`check-deploy-provenance`
   green); `deployments` row `prod:b04fc1b…` recorded (protocols_version
   `0.4.0+9c2b880dbee74bd8`, all-10 digests).

**Live re-proofs (fail-closed, all before the flips):**
- **2a stripe-redrive — PASS.** `evt_1UVF7T2MLe3ETP9SG5x24wSg` (the parked
  nanoid-topup) re-drove through the ordinary `stripe.event` queue (audited —
  `stripe_event_redrives` actor `devin-cli:r6lch-1`): `processed_at` set,
  `checkout_sessions.state=completed`, exactly one `credit_ledger` grant
  `kind=grant credits=1000 reason=topup:topup_10` (idempotency
  `stripe:checkout:cs_live_a1YA4…`), `pending_email_queued_at` stamped once.
- **2b webhook endpoint + subscription convergence — PASS.** Endpoint
  `we_1UH99C2MLe3ETP9Sk4UQBKXs` `enabled_events` = the exact nine
  `STRIPE_WEBHOOK_EVENT_TYPES` (was 3). A live `customer.subscription.updated`
  (`evt_1UVKN72MLe3ETP9S9yt4WwPS`) delivered + processed; jrn-a's sub converged
  `cancel_at_period_end=false→true` (the F-R6LCH.1-1 fix working live).
- **2c run-task SDK — PASS.** The image-set build's fail-closed context assert +
  post-build uid-10002 exec assert ran on the launch build (`97e20b12`);
  `.exec-assert-ok` shipped; live execution proven by the golden cohort below.
- **2d HSTS + invite — PASS.** `max-age=31536000; includeSubDomains` on both
  origins; `/invite` + `/signup` 200.
- **2e golden re-validation (protocol-affecting deploy)** — see Evidence.

**Flips (each a one-line stage-fact diff + `pulumi up` + live verify) — all three
VERIFIED, in the ruled order:**
- **Flip 2 — `purchaseMode: closed → open`** (`af3c2f6`, update 166 — env-only API
  roll). `PURCHASE_MODE=open` on the live revision; real Stripe Checkout minted on
  the operator's non-test account (`cs_live_a1OlskUOxPE…`). **PASS.**
- **Flip 3 — `refundWindowMode: test_tenants → open`** (`40aa9d6`, update 167 —
  env-only API roll). `REFUND_WINDOW_MODE=open` on the live revision; a zero-net
  real run refused truthfully (409 `nothing_to_refund`), then the real review
  `01M605XT4PD5FQZ6358JJ7HXDT` (1,797 cr net) refunded → `{"status":"refunded"}`,
  durable `user_refund_requests 01M6093MX64EBRGBZ8APRB7135`
  `decision=auto_allowance` + 7 `refund`/`user_window` ledger rows + the
  `absorbed` adjustment. **PASS.**
- **Flip 4 — `trial.audience: test_tenants → everyone`** (`b953c55e` — the one-line
  `pricing.json` diff + the test-corpus re-pin; full all-10 rebuild `9f35a18c`,
  digests re-pinned, update 168). Provenance all-PASS at
  `b953c55e3b9b877e3147332a405d05def4cbaf88`; anonymous `/` + `/pricing` carry the
  config-verbatim claim ("No card. Your first review is included." / "2,800 words,
  Standard rigor, Base — on us, plus a 150-credit pocket"). Post-flip smoke on a
  **fresh real unflagged account** `14stevevitali+r6lch1@gmail.com` (created live —
  workspace `01M60AJ5083CBJS56EQPZAGGBE` `is_test=false`): signup 201 → magic-link
  session → `POST /settings/privacy` opt-out persisted → real
  presign→GCS→preview→project (`01M60AQSJBMHEJGPXFW9X2A2NC`) → **claim** run
  `01M60AR5GG6Y0NXAWW5QH4GE2J` `running`, `spent_credits=0` (entitlement-billed),
  entitlement `consumed`, `trial_state=trial_used`, 150-credit `trial_pocket`
  grant `01M60AR5ESATR1WRTXXT3A9GPD`, `trial_unlock_checks` `allow/ok` audited →
  second run refused `concurrency_limit` (one-concurrent cap live; $50/day kill
  switch unchanged) → `POST /billing/checkout` subscribe minted real
  `cs_live_a1NvsdYj7U0RpuwbQvysXTIkLluPWOgD3bZN9KRYUsQN5WGxCmK2Z6Yz4O` (top-up
  correctly `topups_require_plan` on the free tier). **PASS.**

**Deferrals:** D-DEF.4-3 + D-ACT.1-3 → DONE on the live-verified flips;
BL-13/BL-30/BL-50 dispositioned; dated tails on D-P1.16-1 / D-BILL.3-1 / D-BILL.3-2
(money legs completed through the re-proofs) + D-OBS.1-3 / D-SPA.28-1 (literal
`main`==prod armed; scheduled-nightly leg outstanding at close); D-R6CNT.2-1
stays OPEN.

**Smoke accounts** for R6WATCH.1 exclusion (both non-test, analytics-opt-out via
`POST /settings/privacy`): `14stevevitali@gmail.com` (operator — flips 2/3 legs,
the H11B subscribe) and `14stevevitali+r6lch1@gmail.com` (fresh launch-day account
— the flip-4 funnel walk; exclude its trial claim + `concurrency_limit` refusal
from the cohort read as instrumented launch evidence, not organic demand).

**Evidence root:** `docs/build/reports/2026-10-27_R6LCH.1/`

**Operator asks:** none — merge when ready (`198a_HUMAN-H13` is the merge ticket);
`R6WATCH.1` starts its 14-day clock at the recorded launch timestamp.
