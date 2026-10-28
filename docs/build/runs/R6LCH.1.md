# R6LCH.1 — launch flips + the launch deploy (run ledger)

- **Spec:** `docs/tickets/198_R6LCH.1__launch-flips.md` (manifest row 198; REQ-GO-4).
  Amended by `GD-THRESH13.R6` (LEDGER GATE DECISIONS, 2026-10-27): **flip 1
  (`debitMode → metered`) is PARKED** — the paid-account notice's
  `EFFECTIVE_DATE=2026-12-01` binds it (30-day rule); the
  `cap_calibration_reports` gap is ruled accepted. **This run executes flips
  2–4 only** (`purchaseMode → open`, `refundWindowMode → open`,
  trial `audience → everyone`), each live-verified before the next; a failed
  verify → roll that flip back and PAUSE.
- **Normative loads:** `docs/ops/launch-flips.md` (the ruled order +
  verify/rollback), `docs/ops/debit-mode-flip.md` (preconditions — flip 1
  parked), `docs/ops/stripe-webhook-endpoint.md` (the imperative
  `enabled_events` update + the parked `evt_1UVF7T…` redrive),
  `docs/ops/golden-rerun-rule.md`, `docs/build/readouts/GATE-LAUNCH.md`
  (SIGNED — operator verbatim "please 'go' and run 6. and continue to the
  end"), LEDGER `GD-DEPLOY.R6`/`GD-THRESH1.R6`/`GD-THRESH6.R6`/
  `GD-THRESH13.R6`/`GD-LAUNCH-MONEY.R6`/`GD-BL13.R6`/`GD-TRIAL-CEIL.R6`/
  `GD-GOLDEN-CAP.R6`, DEFERRALS rows in § Deferrals read.
- **Base:** `origin/main` @ `2a652643fdaf53535617036a3439007b3d481fb8` —
  contains all merges through #226 (R6FIX.3 meter fix + R6FIX.4 done-gate +
  R6FIX.5 money fixes + migration `0060_stripe_event_redrive.sql` +
  R6SWP.1 journeys-workflow repairs). Prod serves `dc3a8f6`.
- **Branch:** `stevevitali/r6lch-1-launch` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec +
  build-memory + self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-GO-4
- **Started:** 2026-10-27T23:2xZ · **Closed:** (at close)
- **Live stage:** prod. Deploys under `GD-DEPLOY.R6` (four conditions evidenced
  per deploy: zero stateful replace/delete; additive migrations only; cost Δ ≤
  $15/mo; provenance all-PASS after).
- **Deploy SHA (launch):** `b04fc1b` — branch tip = `2a65264` (`origin/main`)
  + the F-R6LCH.1-1 fix commit found during pre-state (below). Chain-tip
  deploys per convention; the flip commits move the served SHA at each
  later deploy — recorded per deploy.
- **Production mutations (this run's named scope):** `pulumi up --stack prod`
  of the main-tip images; migration `0060_stripe_event_redrive.sql` via
  `prod-migrate-seed.mjs` over the IAP tunnel; `stripe-redrive` on
  `evt_1UVF7T2MLe3ETP9SG5x24wSg` (the audited verb — enqueues the ordinary
  `stripe.event` job + writes the `stripe_event_redrives` audit row; actor
  `devin-cli:r6lch-1`); the imperative Stripe `webhook_endpoints` update on
  `we_1UH99C2MLe3ETP9Sk4UQBKXs` (`enabled_events` = the canonical
  `STRIPE_WEBHOOK_EVENT_TYPES` nine) + a Stripe-side no-op subscription touch
  to drive the re-proof `customer.subscription.updated`; the three stage-fact
  flips (`stages.ts` prod `purchaseMode`/`refundWindowMode`, `pricing.json`
  `trial.audience`) each with its own `pulumi up`; a minimal-cohort golden
  re-validation at the launch SHA (the deploy is protocol-affecting —
  R6FIX.4's manifests/done-gate — so `docs/ops/golden-rerun-rule.md` re-arms;
  ≤ $100 hard cap, is_test workspace, audited house-grant funding seam);
  post-flip smoke on the operator's **non-test** account
  `14stevevitali@gmail.com` (real magic-link session mint — the
  `verification` row read over the system DSN since his gmail is outside the
  DWD pin; `analytics_opt_out` asserted/set via `POST /settings/privacy`);
  `record-deployment` rows per image-roll deploy.
- **Pre-state (recorded before any mutation, 2026-10-27T23:2x–23:3xZ):**
  web+api `/healthz` `gitSha=dc3a8f6`; `_migrations` max `0059`; parked event
  `evt_1UVF7T2MLe3ETP9SG5x24wSg` `processed_at=NULL` (topup `cs_live_a1YA4…`
  state `open`); api env `PURCHASE_MODE=closed`, `REFUND_WINDOW_MODE=test_tenants`,
  `DEBIT_MODE=committed` (worker `committed`); endpoint
  `we_1UH99C2MLe3ETP9Sk4UQBKXs` enabled_events = 3 (completed + 2 disputes,
  missing 6); jrn-a sub `sub_1UVF6l2MLe3ETP9ShyUGStFu` Stripe `canceled_at`+
  `cancel_at` set, `cancel_at_period_end=false`, DB `cancel_at_period_end=false`
  status `active`; operator `14stevevitali@gmail.com` `analytics_opt_out=false`.
- **F-R6LCH.1-1 (live-found, fixed this run — commit `b04fc1b`):** Stripe's
  Portal cancel-schedule arm writes `cancel_at=<period_end>`+`canceled_at`
  with `cancel_at_period_end` still `false`. `processSubscriptionSync` mapped
  the flag alone, so a `cancel_at`-mode cancel would deliver through the
  fixed endpoint yet never converge our `cancel_at_period_end` — jrn-a's sub
  is exactly this shape. `pendingCancel = flag || cancel_at != null` now
  converges both shapes; un-cancel (both null) writes `false` back. Two new
  tests in `stripe.test.ts` pin both directions.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this run's blast
radius:

- **D-DEF.4-3** — refund-window go-live ruling → flip 3 executes; closes DONE
  on the live-verified `REFUND_WINDOW_MODE=open`.
- **D-ACT.1-3** — trial audience `everyone` flip → flip 4 executes; closes
  DONE on the live-verified flip.
- **D-P1.16-1 / D-BILL.3-1 / D-BILL.3-2** — the H11B money legs: the
  `stripe-redrive` + `checkout_sessions.state=completed` + `topup_granted`
  (D-BILL.3-1's topup leg) and the `enabled_events` update + subscription-sync
  convergence (D-BILL.3-2's sync half) complete inside this deploy per
  GD-THRESH1.R6 → dated tails.
- **D-OBS.1-3 / D-SPA.28-1** — literal `main`==prod + scheduled-nightly arm:
  after the launch deploy `main` tip == deployed SHA; the 06:05Z nightly
  (schedule restored by R6SWP.1) completes it — dated tails, honest.
- **D-R6CNT.2-1** — stays OPEN (the paid showcase regeneration rides).
- **D-SLO.1-6, D-EDIT.1-2, D-P1.19-2, D-SPA.16-1/20-1, D-MAINT.4-1** —
  carried PL per GD-THRESH1.R6 (no action this run).

## Requirements (spec → this run's deliverables)

1. Launch deploy `dc3a8f6 → <main tip>`: `pulumi preview --diff --stack prod`
   → per-resource classification (zero stateful replace/delete) → additive
   lint incl. `0060_stripe_event_redrive.sql` → `pulumi up` → provenance
   `gitSha` = main tip on web+api → `record-deployment` → smoke.
   Apply `0060` via `prod-migrate-seed.mjs` BEFORE the roll (additive; old
   code ignores it).
2. Fail-closed re-proofs on the new SHA (all must pass before flips):
   a. `stripe-redrive evt_1UVF7T2MLe3ETP9SG5x24wSg` → `processed_at` set +
      `topup_granted` `credit_ledger` row lands exactly once +
      `checkout_sessions.state=completed`.
   b. `webhook_endpoints` update on `we_1UH99C2MLe3ETP9Sk4UQBKXs` →
      `enabled_events` == `STRIPE_WEBHOOK_EVENT_TYPES` → then drive a real
      `customer.subscription.updated` (Stripe-side no-op touch on jrn-a's
      Writer sub — `canceled_at` already set Stripe-side) → verify
      `subscriptions.cancel_at_period_end` converges in the DB.
   c. run-task vendored-SDK assert on the deployed image (R6FIX.2 gate):
      the image-set build's fail-closed context + post-build uid-10002
      asserts run on the launch build; the golden cohort (below) proves
      live execution on the new digest.
   d. HSTS on both origins + invite/signup path spot checks.
   e. Golden re-validation: `dc3a8f6..2a65264` is **protocol-affecting**
      (R6FIX.4 touched `packages/protocols` manifests/skills/version +
      the phase done-gate) → `docs/ops/golden-rerun-rule.md` re-arms;
      run the minimal cohort (estimate committed first; > $100 → PAUSE
      instead) before the flips — the strongest fail-closed proof that the
      new `claim_ledger_closed` done-gate completes real runs.
3. Flips 2–4 in the ruled order, each a one-line commit + `pulumi up` +
   live verify before the next:
   - flip 2 `purchaseMode: "closed" → "open"` (prod only) — api env roll
     only; verify `PURCHASE_MODE=open` on the api revision + a non-test
     account's purchase path reaches Stripe (not `purchase_closed`).
   - flip 3 `refundWindowMode: "test_tenants" → "open"` — api env roll;
     verify env + the refund affordance/`POST /runs/:id/refund` no longer
     returns `refund_closed` for a real workspace.
   - flip 4 `pricing.json trial.audience → "everyone"` — contracts change ⇒
     image rebuild (all-10 at the flip SHA) + digest pins + `pulumi up` +
     provenance on the new SHA; verify the trial claim renders for an
     unflagged workspace + the $50/day kill switch + 1-concurrent cap facts
     hold (REQ-LCH-5d tests re-run + live `trial_spend_daily` posture).
4. Post-flip smoke on a fresh/operator **non-test, analytics-opt-out**
   account: trial claim visible, run sheet shows Included, purchase reaches
   Stripe (reach, not pay). Record the account for R6WATCH.1 exclusion.
5. Deferrals: D-DEF.4-3 + D-ACT.1-3 → DONE w/ evidence; BL-13/BL-30/BL-50
   dispositioned; dated tails on D-P1.16-1/D-BILL.3-1/-2 (money legs
   completed) + D-OBS.1-3/D-SPA.28-1 (literal arm pending nightly);
   D-R6CNT.2-1 stays OPEN.
6. Record the launch timestamp — starts R6WATCH.1's 14-day clock +
   ADR-112's 60-day pen-test clock; LEDGER CURRENT STATE
   (`nextTicket → 198a_HUMAN-H13`) + PHASE LOG + GATE-LAUNCH threshold-6
   dated note + GATE DECISIONS row if a ruling lands.
7. Records: this ledger + `docs/build/pr/R6LCH.1.md` + `gh pr create` +
   BUILD_INDEX row 233 + LEDGER; push;
   `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6LCH.1 --json
   docs/build/logs/ci-R6LCH.1.json`.

## Acceptance criteria

- [ ] Each flip (2–4) live-verified in order; no rollback needed, or the
      rollback is evidenced and paused *(live-executed)*
- [ ] Flip 1 recorded as carried with the GD-THRESH13.R6 citation
      *(deterministic)*
- [ ] Launch deploy green under GD-DEPLOY.R6's four conditions
      *(live-executed)*
- [ ] Re-proofs 2a–2e all pass before flips (fail-closed) *(live-executed)*
- [ ] Post-flip smoke green on a real (opt-out) account *(live-executed)*
- [ ] Launch timestamp + both clocks recorded in LEDGER *(deterministic)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

(Per Requirements above — the sequence is the contract. Live commands in the
Progress section.)

## Test matrix

The flips are stage-fact/config diffs — the "tests" are the live verifies +
the re-run REQ-LCH-5d HTTP suite (`run-routes.test.ts` everyone-gate block)
+ `stages.test.ts` / `compute.test.ts` (env wiring pins) + the launch-surface
lint (`@rhema/security-checks` launch-surface.test.ts) + the full green gate
(`pnpm turbo build lint typecheck`, `pnpm test`, six `check:*`,
`check-build-memory.sh`, `check-append-only.mjs --base <merge base>`).

## Progress

- 2026-10-27T23:35Z–2026-10-28T00:05Z — **Launch deploy `b04fc1b` DONE.**
  Cloud Build `25e60d7e` all-10 images at `b04fc1b` (~15m) → digests pinned
  (`serviceImages`/`runTaskImageDigest`/`proxyImage`) → `preview --diff`:
  10 stateless updates + 1 replace (the immutable egress-proxy instance
  template — standard MIG roll, zero stateful) → additive lint on 0060 PASS →
  `pulumi up` #165 (1m31s). Provenance all-PASS: web+api `/healthz`
  `gitSha=b04fc1bbd345…` (`check-deploy-provenance` green). Migration 0060
  applied via `prod-migrate-seed` (60 recorded). `deployments` row
  `prod:b04fc1b…` recorded with all-10 digests + `protocols_version
  0.4.0+9c2b880dbee74bd8` (the `record-deployment` runner's `console.error`
  crashed under Node 25 `util.inspect` on the pg error shape mid-write — the
  identical upsert was applied + verified over the system DSN; recorded
  honestly). Smoke: `/`, `/pricing`, `/signup`, `/login`, `/invite` 200s;
  HSTS `max-age=31536000; includeSubDomains` on both origins (re-proof 2d).
- 2026-10-28T00:04Z — **Re-proof 2a PASS.** `stripe-redrive
  evt_1UVF7T2MLe3ETP9SG5x24wSg` (actor `devin-cli:r6lch-1`, audit row in
  `stripe_event_redrives`) → worker processed the ordinary `stripe.event`
  job: `processed_at=00:04:21.682Z`, `checkout_sessions.state=completed`,
  exactly one `credit_ledger` grant `kind=grant credits=1000
  reason=topup:topup_10` (idempotency `stripe:checkout:cs_live_a1YA4…`),
  `pending_email_queued_at` stamped once (the user had viewed pending).
- 2026-10-28T00:05Z — **Re-proof 2b PASS.** `we_1UH99C2MLe3ETP9Sk4UQBKXs`
  `enabled_events` updated to the exact `STRIPE_WEBHOOK_EVENT_TYPES` nine
  (was 3). Metadata touch on `sub_1UVF6l2MLe3ETP9ShyUGStFu` drove a live
  `customer.subscription.updated` (`evt_1UVKN72MLe3ETP9S9yt4WwPS`, received
  00:05:42 → processed 00:05:43): DB `cancel_at_period_end` converged
  `false → true` — the F-R6LCH.1-1 fix working live (Stripe `cancel_at`
  non-null ⇒ scheduled-cancel truth); the "Renews vs cancelled" lie is gone.
  The endpoint update lands F-R6H11B-2's transport half; the convergence
  lands D-BILL.3-2's sync half.

- 2026-10-27T23:2xZ — Phase 0: ticket + `launch-flips.md` +
  `debit-mode-flip.md` + `stripe-webhook-endpoint.md` + DEFERRALS + LEDGER +
  GATE-LAUNCH (SIGNED) + R6DEP.3 deploy recipe read; branch
  `stevevitali/r6lch-1-launch` cut at `2a65264` (== `origin/main`;
  `apps/run-task/vendor/claude-agent-sdk{,-linux-x64}` present in this
  operator-populated checkout — the R6FIX.2 submit precondition).
  Pulumi `14stevevitali-gmail-com` prod stack (update 164); gcloud
  `rhema-507501`; proxy VMs `rhema-prod-proxy-ltmh` (b) / `-fwrf` (f).

## Gap table

(filled at close — every requirement row → met / met-engineered(D-id) /
partial / missed + evidence)

## Evidence log

`docs/build/reports/2026-10-27_R6LCH.1/`:

(filled per leg)

## Evidence report

(filled at close)
