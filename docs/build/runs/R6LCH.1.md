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
- 2026-10-28T00:07Z–02:33Z — **Re-proof 2e PASS — golden cohort green on the
  launch SHA.** Estimate committed `cohort-estimate.json` ($46.94 list vs
  $100 cap); audited house-grant 5000 cr → jrn-a (ledger `01M5ZX97R6B9…`,
  audit `01M5ZX97WB0B4…`). Dispatch tag `r6lch1-launch` at `b04fc1b`:
  essay `01M5ZX9KXS42…` $9.43 / academic `01M5ZZ8ZA786…` $12.97 (the
  driver's 45-min per-leg watch fired at 01:22 while the run was on its
  final letter phase — same-tag re-dispatch deduped onto the live run per
  the rule, no duplicate spend) / op-ed `01M602KAYQTE…` $9.82 / memo
  `01M604DYVZSS…` $4.73 — **cohort $36.95 measured** (`golden-scores.json`).
  Gate `Promotion OK` — all 4 fixtures ≥ committed floors, `promotionBlocked`
  false (manifest `evals/fixtures/nightly-manifest.json`). The launch SHA's
  run path (incl. R6FIX.4's `claim_ledger_closed` done-gate) completes real
  runs on the new run-task digest `97e20b12` — live SDK-exec proof folds
  into 2c.
- 2026-10-28T02:34Z — **FLIP 2 VERIFIED — purchaseMode closed → open.**
  Commit `af3c2f6` (prod line + stages.test prod-pin) → `pulumi up` #166
  (1 api env update, stateless) → `PURCHASE_MODE=open` on the live api
  revision. Operator non-test session minted via the real magic-link flow
  (`verification`-row token read over the system DSN — his gmail is outside
  the DWD pin). `GET /billing/subscription` on his real workspace returns
  `purchase: "open"`; `POST /billing/checkout {kind:topup,packId:topup_10}`
  → real Stripe Checkout `sessionId 01M605SKTA3F…` + `checkout.stripe.com`
  URL `cs_live_a1OlskUOxPE…` — NOT `purchase_closed`. The open session is
  left to expire unpaid (the smoke's reach-only leg).
- 2026-10-28T02:5xZ — **FLIP 3 DEPLOYED — refundWindowMode test_tenants →
  open.** Commit `40aa9d6` (prod line + stages.test prod-pin; 38
  stages.test greens) → `pulumi up` #167 (1 api env update, stateless,
  ~39s) → live api env `REFUND_WINDOW_MODE=open` (`PURCHASE_MODE=open`,
  `DEBIT_MODE=committed` unchanged). First live leg: `POST
  /runs/01M5KH9Q3F2PGP8NTCMS92RAS7/refund` (a real zero-net completed run on
  the operator's non-test workspace `01M2V3PM11XSF05VJ9G01PM5ZB`) → HTTP
  409 `{"error":"nothing_to_refund"}` — admission open, truthful refusal;
  report DTO `refundWindow:{"state":"ineligible","credits":0}` (the
  affordance block renders).
- 2026-10-28T03:33Z — **FLIP 3 VERIFIED — auto_allowance on a real nonzero
  run.** Minimal real review launched on the operator workspace (project
  `01M605XSRGXKGXMK9K11SACPSJ`, real presign→upload→preview→run path): run
  `01M605XT4PD5FQZ6358JJ7HXDT` completed 03:30:32Z, `spent_credits=1797`
  (7 ledger debits 44+38+1114+247+101+53+200; hold 4396 released 2599).
  `POST /runs/01M605XT4PD5FQZ6358JJ7HXDT/refund` (fresh magic-link
  session) → HTTP 200 `{"status":"refunded","requestId":"01M6093MX64EBRGBZ8APRB7135","credits":1797}`.
  Durable row `user_refund_requests.id=01M6093MX64EBRGBZ8APRB7135`:
  `state=refunded`, **`decision=auto_allowance`**, `credits=1797`,
  `quarter=2026Q4`, `requested_at=decided_at=03:33:22.928Z`.
  `credit_ledger`: 7 `refund` rows `reason=user_window` Σ=1797 +
  `adjustment 1797 reason=absorbed` (refunded COGS absorbed — truthful
  money). Real users can now invoke the §14.4 window; the allowance
  envelope auto-decides within its quarter bound.
- 2026-10-28T03:4xZ — **FLIP 4 STAGED — trial.audience test_tenants →
  everyone.** Commit `b953c55` — `pricing.json` one-liner plus the test
  corpus re-pin: `pricing.test.ts`/`launch-surface.test.ts`/`public-claims/
  trial-claims` ship-posture pins → `everyone` (exclusion legs now inject
  `{audience:"test_tenants"}` so the fold machinery stays covered);
  `claims-visibility.test.ts` flips to published-claim assertions on
  anonymous surfaces; `billing-routes.test.ts` DTO now transmits the
  generated `includedNote` for an unflagged viewer; `run-routes.test.ts`
  — the pre-flip "operator pause" refusal becomes the shipped-everyone
  admission test + a staged-`test_tenants` leg keeps the armed refusal
  covered; the daily-ceiling test now proves 429 for real / 201 for
  flagged at HTTP (the everyone flip exposes the paused arm); the R6MNY.1
  `asEveryone` block becomes idempotent on the shipped posture; journey
  C1 rewritten — anonymous `/`+/`pricing` must now carry the config claim
  (absence is the leak). 111 api tests + 150 contracts/security tests +
  web claims tests all green. Full all-10 rebuild `9f35a18c` at `b953c55`
  (contracts change ⇒ runtime bundle rebuild, vendored-SDK gate armed).

- 2026-10-28T03:5x–04:0xZ — **FLIP 4 DEPLOYED + VERIFIED — the trial is
  public.** Full all-10 image build `9f35a18c-d86f-48ad-b728-ce04d7660fc7`
  (SUCCESS, 11m27s) at `b953c55e`; digests pinned into `Pulumi.prod.yaml`
  (`run-task` `d984805a`, `api` `1e140a4c`, `web` `52123b6e`, `worker`
  `4b9f4529`, `fetcher` `3aa2ea86`, `convert` `4beda1cf`, `export`
  `d3373227`, `collab` `36c55eeb`, `egress-proxy` `df98dd47`,
  `turbo-cache` `4105b565`). Pulumi preview: 10 updates + 1 replace —
  the only replacement the immutable proxy `InstanceTemplate` (stateless
  MIG roll; proxy VMs now `rhema-prod-proxy-6vxq` b / `-w55m` f); zero
  stateful replace/delete. `pulumi up` update **168** OK (2m11s);
  cost Δ ≤ $15/mo unchanged. `/healthz` web+api
  `gitSha=b953c55e3b9b877e3147332a405d05def4cbaf88`;
  `scripts/check-deploy-provenance.mjs` (full-SHA — short SHAs are
  refused) → **all-PASS**. Anonymous GET `/` + `/pricing` now carry the
  config-verbatim claim: "No card. Your first review is included." +
  "2,800 words, Standard rigor, Base — on us, plus a 150-credit pocket"
  + "one included Review" — the same strings `trial-claims.ts` generates
  (truthful-claims invariant; REQ-SPEC-32).
- 2026-10-28T04:0xZ — **POST-FLIP SMOKE — a fresh real (non-test) user
  walked the full funnel.** Signup `POST /signup` → 201 `{"ok":true,
  "created":true}` for `14stevevitali+r6lch1@gmail.com`; workspace
  `01M60AJ5083CBJS56EQPZAGGBE` `is_test=false`; billing
  `01M60AJ508FMWJ9KWAJFDWGK7Y` `trial_state=trial_pending` +
  entitlement `01M60AJ50EZKRXK2CYTDEE612D` `locked` (review / standard /
  base / word_cap 2800 / expires 2026-11-11 — the pricing.json shape).
  Real magic-link session minted via `GET /api/auth/magic-link/verify`
  (token read over the IAP-tunnel DSN). `POST /settings/privacy
  {"analyticsOptOut":true}` → persisted; GET re-read `{"analyticsOptOut":
  true}` — the launch-ruling opt-out assert holds for real users.
  `GET /billing/subscription` → `purchase:"open"` (flip 2 posture
  survived the rebuild) + `trial.state=trial_pending`. Real upload path:
  `POST /import/presign` → GCS v4 PUT → `POST /import/preview` →
  `POST /projects entry:"draft"` → project `01M60AQSJBMHEJGPXFW9X2A2NC`,
  draft `01M60AQSQ3GP0E4C56TK49VDM0`. **Trial claim:** `POST
  /projects/:id/runs` `{workflow:"review", rigor:"standard",
  modelTier:"base", entitlementId}` → 200 `{"runId":
  "01M60AR5GG6Y0NXAWW5QH4GE2J","state":"queued"}`; DB truth — run
  `running` `entitlement_id` pinned, `estimate_credits=1463`,
  `cap_credits=4390`, `spent_credits=0` (the included run is
  entitlement-billed); entitlement `consumed` +
  `consumed_by_run_id=01M60AR5GG6Y0NXAWW5QH4GE2J`; `trial_state →
  trial_used`; the **150-credit pocket granted** — `credit_ledger`
  `01M60AR5ESATR1WRTXXT3A9GPD` `kind=grant credits=150 bucket=
  trial_pocket source=system reason=trial_pocket`; **`trial_unlock_checks`
  audit row** `decision="allow" reason="ok" disposable_domain=false
  fingerprint_seen=0` — every abuse rail the rule demanded stayed armed
  and is audited. **Concurrency cap:** a second run POST while the trial
  run held the slot → `{"error":"concurrency_limit","limit":0,"active":
  1}` (the trial's one-concurrent gate fires live; the $50/day ceiling
  check rides the same armed run-guard path proven by the 429 leg in
  `billing-routes.test.ts`/`run-routes.test.ts` + the live
  `concurrency_limit` refusal). **Purchase still reaches Stripe:**
  `POST /billing/checkout {kind:"subscribe",plan:"writer",
  cycle:"monthly"}` → `sessionId=01M60ASG3BE28D704F1J80RKVQ`, real
  `cs_live_a1NvsdYj7U0RpuwbQvysXTIkLluPWOgD3bZN9KRYUsQN5WGxCmK2Z6Yz4O`
  checkout URL (top-up correctly refused `topups_require_plan` on the
  free tier — the pack SKU needs a paid plan, a truthful refusal not a
  defect). rhema.tools is **open to the public**: a brand-new unflagged
  user can sign up, claim the included Review, run it free, and reach a
  real Stripe Checkout — with every abuse rail armed.
- 2026-10-27T23:2xZ — Phase 0: ticket + `launch-flips.md` +
  `debit-mode-flip.md` + `stripe-webhook-endpoint.md` + DEFERRALS + LEDGER +
  GATE-LAUNCH (SIGNED) + R6DEP.3 deploy recipe read; branch
  `stevevitali/r6lch-1-launch` cut at `2a65264` (== `origin/main`;
  `apps/run-task/vendor/claude-agent-sdk{,-linux-x64}` present in this
  operator-populated checkout — the R6FIX.2 submit precondition).
  Pulumi `14stevevitali-gmail-com` prod stack (update 164); gcloud
  `rhema-507501`; proxy VMs `rhema-prod-proxy-ltmh` (b) / `-fwrf` (f).

## Gap table

| Requirement | Verdict | Evidence |
|---|---|---|
| REQ-GO-4 — deploy chain tip to prod before flips | **met** | update 165 @ `b04fc1b` + `0060` applied; provenance all-PASS |
| REQ-GO-4 — ruled flip order 2→3→4, each verified before next | **met** | updates 166 → 167 → 168, per-flip live verdicts logged above |
| REQ-GO-4 — flip 2 opens real Stripe Checkout (not `purchase_closed`) | **met** | `PURCHASE_MODE=open`; `cs_live_a1OlskUOxPE…` (flip-2 leg) + `cs_live_a1NvsdYj…` (post-flip-4 leg) |
| REQ-GO-4 — flip 3 opens the refund window for real tenants | **met** | `REFUND_WINDOW_MODE=open`; real run `01M605XT4PD5FQZ6358JJ7HXDT` refunded 1797 cr, `decision=auto_allowance` durable on `01M6093MX64EBRGBZ8APRB7135` |
| REQ-GO-4 — flip 4 opens trial to everyone with abuse rails | **met** | `trial.audience=everyone` live @ `b953c55e`; real unflagged account claimed run `01M60AR5GG6Y0NXAWW5QH4GE2J`; `trial_unlock_checks` `allow/ok` audit; `concurrency_limit` fired; 150-cr pocket granted |
| GD-THRESH13.R6 — flip 1 (`debitMode→metered`) stays PARKED w/ citation | **met** | `DEBIT_MODE=committed` untouched all run; parked row + `EFFECTIVE_DATE=2026-12-01` cited in this ledger + DEFERRALS |
| Launch-flips.md — failed verify ⇒ rollback + pause | **met** | no verify failed; zero rollbacks needed |
| Stripe-webhook-endpoint.md — 9 canonical events + parked redrive | **met** | `we_1UH99C2MLe3ETP9Sk4UQBKXs` enabled_events=9; `evt_1UVF7T…` redriven once → exactly one topup grant |
| Golden-rerun-rule — protocol-affecting deploy ⇒ cohort re-proof | **met** | `r6lch1-launch` cohort 4/4 green, Promotion OK, $36.95 measured < $46.94 committed < $100 cap |
| Money truthful (REQ-SPEC-32) | **met** | refund auto_allowance + `absorbed` adjustment; trial claims config-derived; hold/release deltas Σ-verified |
| F-R6LCH.1-1 — subscription convergence defect | **met** | `b04fc1b` fix + live `customer.subscription.updated` drove `cancel_at_period_end=true` |
| Post-flip smoke on non-test account (opt-out + trial + Stripe reach) | **met** | fresh `+r6lch1` account — full funnel log above |
| R6WATCH.1/ADR-112 clock start recorded | **met** | LEDGER GATE DECISIONS dated note (launch = 2026-10-28T04:0xZ smoke-verified) |
| Gap-table misses | — | **none** |

## Evidence log

`docs/build/reports/2026-10-27_R6LCH.1/`:

- `prod-preflight/` — pre-state healthz/env/webhook captures before any mutation
- `cohort-estimate.json` — golden cohort estimate $46.94 (≤$100 cap pre-flight)
- `golden-scores.json` — `r6lch1-launch` cohort scores, 4/4 green + Promotion OK, $36.95 measured
- `flip4-postflip-smoke.md` — the fresh-real-account funnel walk (this run's post-flip smoke)
- `LAUNCH-REPORT.md` — the per-flip verdict sheet (written at close)

## Evidence report

Launch = **live + verified** as of **2026-10-28T04:0xZ** (the post-flip smoke
timestamp). Deploy `b953c55e3b9b877e3147332a405d05def4cbaf88` serves
rhema.tools/api.rhema.tools with all three permitted flips open and
flip 1 correctly parked. Per-flip verdicts: **2 PASS** (real checkout
minted on open), **3 PASS** (real run refunded via auto_allowance), **4
PASS** (real unflagged user claimed the included Review; abuse rails
armed + audited). Live-found defect F-R6LCH.1-1 fixed and live-proved.
Money stayed truthful end-to-end — refund grants offset by an absorbed
adjustment, trial spend entitlement-billed at `spent_credits=0`.
