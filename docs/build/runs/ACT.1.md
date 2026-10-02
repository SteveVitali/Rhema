# ACT.1 — run ledger (the trial entitlement, honoured + every trial/pricing claim rendered from it)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/70_ACT.1__trial-entitlement.md` (chain row 70; spec §§14.3 + 2026-09-30 banner,
  14.2, 5.6 item 9, 14.4, 15.1, 15.2, Appendix A.9; REQ-SPEC-8 amended primary, REQ-GROWTH-10/15/13,
  REQ-SPEC-32(b) claims half, REQ-BILL-4 entitlement half, REQ-GROWTH-7 display; absorbs BL-50 + BL-62).
- Base: `stevevitali/sec-2-signup-admission-throttle` @ `61f64c2` (append-only check base).
- Branch: `stevevitali/act-1-trial-entitlement`. Stacked PR, mergePolicy=OPERATOR, never merge.
- Depends on: SEC.2, EST.1, ECON.1, RES.2, HOT.1 (all landed on this chain tip).
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Started:** 2026-10-02
- Gate answers (ticket's own pre-authorizations): trial go-live for real users stays
  operator-paused — Stage B enables **test tenants only** and records the everyone-flip diff;
  deploy is pre-authorized when `pulumi preview` shows no stateful replace/delete and migrations
  are additive; Stage B legs run cheapest-first and stop at **≤$12** metered total (target ≈$6) —
  dropped legs become `D-ACT.1-<n>` rows, never overspent; a phone-OTP/ASN vendor credential is
  operator-paused → `D-ACT.1-n` + compensating control; if the derived cap lands <1,500 words the
  operator sets the ceiling (pause, don't clamp silently).
- Spend: Stage A $0. Stage B plan: deploy (api + web + worker images) → N5 (one Standard/Base
  trial Review on the ≤300-word paid fixture, ~$5–7) → C1 ($0 claims walk) → one trial Review near
  the derived cap with a deliberately claim-light fixture (est ≈$12.9 list, expected metered
  ~$5–7). Stop early and record drops as `D-ACT.1-n`.

## Deferrals read (start-of-run)
- `D-P0.11-2` — DONE (P1.16 landed the full trial mechanics: `provisionTrial`, `gateTrialUnlock`,
  entitlement hold, `convertTrialOnUpgrade`, `killTrial`, `sweepExpiredTrials`).
- `D-P1.16-1` (OPEN) — its leg (h) "trial unlock gate exercised live" is substantively discharged by
  this ticket's Stage B (N5 drives the real unlock on a test tenant) → annotate with evidence.
- `D-RES.2-*`, `D-RES.1-*`, `D-SEC.1-2` — open rows owned by other tickets; ACT.1 consumes RES.2's
  `settleUnverifiedDelivery` (restore half already landed) — no row-closure owed beyond leg (h)
  of D-P1.16-1.
- New rows this ticket may add: ASN/IP risk arm binding (offline source — likely deferred),
  audience=everyone flip (operator), real-user fingerprint-vendor hardening (none planned).

## Context map (re-confirmed at build time)
- Trial engine: `packages/ledger/src/trial.ts` — `provisionTrial` (locked row, `word_cap` frozen at
  provisioning), `gateTrialUnlock` (audit row always; locked→unused+pocket on allow),
  `recordTrialSpend` (charged the run's **cap** at hold — ACT.1 re-bases to the estimate +
  `$50/day` of metered list COGS), `killTrial` (live `trial_killed_at` read under the hold lock),
  `sweepExpiredTrials`, `trialEntitlementFor` (any state, incl. `locked`).
- Hold path: `packages/ledger/src/sql-ledger.ts` — `hold(entitlementId)` claims
  `unused→consumed` under a conditional update (concurrency guard), zero credit-ledger writes;
  `writeDebit`/`release` no-op the credit ledger for entitlement runs; `absorbMeteredGap` books the
  metered burn as `adjustment(absorbed)` with `hold_bucket='trial_pocket'` (the trial COGS class).
- Circuit breaker: `packages/ledger/src/circuit-breaker.ts` sums `reason='absorbed'` adjustments —
  must exclude entitlement-marked burns or a trial-heavy day trips the platform cap-drift breaker
  (the $50/day switch already bounds the subsidy).
- Daily tally: `trial_spend_daily(day, credits)` (migration 0036, `rhema_app` siu). ACT.1 adds
  `reconciled_credits` + `paused_at` (migration 0051) — projections land at hold (user tx);
  reconciliation is a **system-pool sweep** on `billing.period-tick` (REQ-SPEC-30: the aggregate
  over runs never serves a user request; the gate reads only the compact counter row).
- Unlock decision: `packages/contracts/src/domain/trial.ts` — `decideTrialUnlock` (pure):
  fingerprint_seen→deny, disposable→deny, ceiling→paused, asn≥threshold→challenge.
- Abuse evidence: `apps/api/src/run-routes.ts` — disposable list + salted `fingerprintHash`
  (sha256 `rhema:trial:`), `asnRiskScorer` dep (unbound in prod → `D-ACT.1-1`), the plan/trial gate
  (~408–507): `trial_base_only`, `trial_shape`, `trial_word_cap` (row `word_cap` — ACT.1 reads the
  CONFIG cap at claim), `phone_challenge_required` (403), `trial_ceiling` (429), concurrency=1 in
  trial (`effectiveConcurrency`). Missing: audience gate, test-tenant fingerprint exclusion,
  config-cap read.
- Sheet context: `apps/api/src/sheet-context.ts` ~97–104 — entitlement select `state='unused'`
  only ⇒ the `locked` signup row never reaches the sheet (PR-J1 cause #1). ACT.1: locked+unused,
  not killed, in-window, audience-covered workspace; emits the CONFIG wordCap.
- Web sheet: `apps/web/src/server.ts` — `buildSheet` maps `ctx.entitlement` → `included` +
  `entitlementLine` + auto-scopes an over-cap draft to `words:{upto:wordCap}`; POST ~3540 never
  forwards `entitlementId`/`fingerprint` (PR-J1 cause #2); GET mints no device cookie.
- DTOs: `packages/api-client/src/index.ts` — `CreateRunDto` lacks `entitlementId`/`fingerprint`;
  `RunSheetContextDto.entitlement` exists (id/kind/wordCap/rigor/modelTier).
- Included render: `packages/ui/src/run-sheet.tsx` ~366 — `data-included` box + entitlement line;
  hidden inputs live ~224–246 (no `entitlementId`).
- View: `packages/run-sheet/src/view.ts` ~460–472 — Included + hand-typed entitlement lines
  (ACT.1 routes them through the shared claim model).
- Billing page: `apps/web/src/pages.tsx` ~5799 — `trial_active`/`denied`/`used` states render;
  **`trial_pending` renders nothing** → the "Free — chat only" defect. `/billing/plans`
  (`apps/api/src/billing-routes.ts` ~292) calls `visiblePlansPublication(undefined,…)` with no
  audience — ACT.1 resolves `claimsForAudience(cfg, isTestWorkspace)`.
- Claims config: `packages/contracts/src/domain/public-claims.ts` — `trial.firstReviewIncluded`
  OFF; `PUBLIC_CLAIM_COPY` carries the ON-copy. ACT.1 flips the id ON and adds the typed
  `trial.audience` (`off|test_tenants|everyone`) so the claim renders only for covered audiences.
- Pricing derivation: `packages/contracts/src/domain/pricing-page.ts` — `planLadder`,
  `visiblePlansPublication`, `pricingMatrix` ("Run word cap" is `—` everywhere — Free gets the
  trial cap under the trial claim), `pricingFaq`, `buildPricingPageData`, `SurfacePricer` port
  (impl `surfacePricer()` in @rhema/run-sheet).
- Pricing config: `packages/contracts/src/domain/pricing.json` — `trial.dailySpendCeilingCredits`
  250,000 ($2,500/day at price — wrong unit vs ADR-014's $50/day list COGS), `wordCap` 6,000
  (ADR-014's interim cap must be derived), `includedNote`/`eligibilityLine` hand-written.
  `pricing.ts` asserts `wordCap===6000`.
- Journeys: `packages/journeys/src/steps.ts` — N5 (freshUser → scratch project → sheet shows
  Included → launch; ACT.1 extends it to wait for delivery), C1 (rewrite per audience: anon sees
  no trial claim, test audience sees config-equal claims); registry `expected:red` → flip green.
- Worker sweeps: `apps/worker/src/billing-jobs.ts` — `handleBillingPeriodTick` runs
  `sweepExpiredTrials` on `deps.systemExec` — the reconciling `sweepTrialSpend` rides here.
- Session: `GET /session` returns the principal; ACT.1 adds `isTest` (workspace read) so the web
  can serve the test-audience claims preview (`?audience=test`, is_test sessions only).
- RES.2 hook: `packages/ledger/src/unverified-settle.ts` — `settleUnverifiedDelivery` restores a
  consumed entitlement to `unused` exactly once (`consumed_by_run_id` guard + `trial_restorations`
  unique row) — already bound; ACT.1 adds the regression test.
- Cookie idiom: `__Host-` names on prod, `rhema-dev.*` on http dev (`apps/web/src/main.ts`).

## Phase 1 — implementation plan

1. **Entitlement config (deliverable 1).** `pricing.json` trial block: `wordCap` ← derived value,
   `capCeilingUsd: 15`, `dailyCeilingUsd: 50` (proxy-metered list COGS → derived
   `dailySpendCeilingCredits = ceil(50 × 1.4 × 100) = 7,000` in load-time validation),
   `audience: "test_tenants"`, `interim: true`, `includedNoteFmt`/`postTrialNoteFmt` with `{cap}`/
   `{pocket}`/`{chatCredits}` placeholders (no literal figures). `TrialSpec` gains the new fields;
   `deriveTrialWordCap(costPoints, ceilingUsd)` is a pure fn over `{words, p90Usd}` points
   (named `below_floor` result under 1,500 — never a silent clamp); a run-sheet test re-derives the
   cap from `surfacePricer()` and asserts equality with the published config (the JSON number is
   provably derived, never hand-typed).
2. **Claim render model (deliverable 6).** New `packages/contracts/src/domain/trial-claims.ts`:
   `TrialAudience`, `trialAudienceAllows(audience,isTest)`, `claimsForAudience(cfg,isTest)` (folds
   `trial.audience` into `trial.firstReviewIncluded`), `trialIncludedNote()`,
   `trialPostTrialNote()`, `sheetEntitlementLine(wordCap, coveredAll)`, `deriveTrialWordCap`.
   Consumers: marketing hero/FAQ/pricing rule (via per-request `claims`), `/billing/plans`
   (audience-resolved claims), billing page trial block, run-sheet entitlement line.
3. **Sheet sees the locked entitlement (deliverable 2).** `sheet-context.ts` selects
   `state in ('locked','unused')` + `trial_killed_at is null` + `trial_state in
   ('trial_pending','trial_active')` + `trialAudienceAllows(TRIAL.audience, is_test)`; emits the
   CONFIG `wordCap`. `view.entitlementId` + hidden form field; over-cap drafts keep the auto-scope
   "first N words" + gain an upgrade affordance line.
4. **Run click enters the gate (deliverable 2/3).** GET /p/:project/run mints `__Host-rhema.fp`
   (dev: `rhema-dev.fp`) when absent; POST forwards `entitlementId` (form field) + `fingerprint`
   (cookie) through `CreateRunDto` → `run-routes` `body` → the existing `gateTrialUnlock` path →
   `createRun(…, entitlementId)` → ledger hold. Api hashes the fingerprint (existing
   `fingerprintHash`); web never hashes.
5. **Unlock checks (deliverable 3).** `gateTrialUnlock` fingerprintSeen counts only accounts with
   ≥1 NON-test workspace (JOURNEY.1 exclusion — ADR decision). `run-routes`: `trialAudienceAllows`
   gate before the unlock (`entitlement_unavailable` for an uncovered audience), `trial_word_cap`
   reads `TRIAL.entitlement.wordCap` (config — never the row), `phone_challenge_required`/`paused`/
   `denied` map to honest sheet notices (no dead end). ASN arm: bound if a licence-compatible
   offline source exists in-repo, else `D-ACT.1-1` + compensating control.
6. **Kill switch + limits (deliverable 4).** Migration `0051_trial_spend_reconcile.sql`:
   `trial_spend_daily` + `reconciled_credits` + `paused_at`. `recordTrialSpend` charges the
   PROJECTION (the run's estimate — `HoldArgs.projectedCredits` ← `createRun`'s
   `estimateCredits`), throws on `paused_at` or `greatest(credits, reconciled) > ceiling`, still
   excluding `is_test` workspaces. New `sweepTrialSpend(systemExec, now)` on the billing period
   tick recomputes the day total `Σ greatest(spent_credits, estimate_credits)` over today's
   non-test entitlement runs → `reconciled_credits` + `paused_at`. Breaker excludes
   entitlement-run absorbed rows. Base-only / 1-concurrent already enforced (verified by test).
7. **Unverified restore (deliverable 5).** `settleUnverifiedDelivery` already restores once +
   audit row — add the missing deterministic test (consume → unverified → restored; replay →
   no-op).
8. **Billing + surfaces (deliverable 2/6).** `pages.tsx`: `trial_pending` block (badge +
   includedNote under the claim gate, else the factual window line); `/billing/plans` resolves
   `claimsForAudience(PUBLIC_CLAIMS, isTestWorkspace)`; `GET /session` gains `isTest`; web `/` +
   `/pricing` serve the test-audience preview to is_test sessions at `?audience=test`.
9. **Pricing defects (deliverable 7).** `pricingMatrix(claims)`: Free "Run word cap" cell = the
   trial cap while `trial.firstReviewIncluded` renders; rows with no value anywhere are omitted.
   `marketing.tsx`: paid CTAs `Choose {plan}` (new `COPY.pricing.choosePlanFmt`), Free keeps
   "Start free", Team keeps waitlist CTA + renders `$40/seat/mo`.
10. **Copy.** `copy.ts` gains `runSheet` notices for `trial_denied`/`trial_ceiling`/
    `phone_challenge`/`trial_word_cap`/`trial_shape`/`entitlement_unavailable`,
    `billing.trialPendingFmt`, `pricing.choosePlanFmt` — every trial figure flows from the model,
    never a literal.
11. **Journeys.** N5: extend to wait for delivery (dossier-poll like N6) + assert `Included` line
    carries the configured cap; C1: rewrite — anon surfaces carry NO trial claim; the test
    audience (`?audience=test` on `/`+`/pricing`, billing page, sheet) renders the config figures.
    Registry: both flip `expected:"green"`.
12. **Docs.** ADR-042 (entitlement config: derived cap, config-over-row, projected+reconciled
    daily tally, fingerprint/test-tenant rule) + ADR-043 (audience flag + claim render model).
    LEDGER/BUILD_INDEX/PR body + this ledger's evidence section.

### Test matrix (each row fails if the behaviour is removed)
- `contracts/trial-claims.test.ts`: `deriveTrialWordCap` fixture cards (largest-fitting cap;
  `below_floor` named result; step/granularity; measured-vs-derived points); `trialAudienceAllows`
  3×2; `claimsForAudience` folds correctly; formatters emit the config figures.
- `contracts/pricing-page.test.ts` (existing, extend): matrix Free "Run word cap" = config cap
  under the claim, `—`/row omitted otherwise; plan CTAs name plans (in marketing.test); Team
  `$40/seat/mo` + waitlist; visiblePlansPublication `includedNote` = generated note.
- `contracts/pricing.test.ts`: no digit characters in `includedNoteFmt`/`postTrialNoteFmt`/
  `eligibilityLine` (the no-hand-typed-figure static check, incl. copy.ts trial keys scan).
- `ledger/trial.test.ts` (extend): locked signup row is claimable via gate; fingerprintSeen
  excludes test-workspace accounts; paused_at + reconciled tally pauses new unlocks;
  `recordTrialSpend` charges the projection not the cap; `sweepTrialSpend` recomputes on the
  system pool (explicit predicate, test-tenant exclusion); kill switch voids under 60 s (hold
  refuses post-kill); entitlement run debits 0 credits + absorb books trial class; Unverified
  restore exactly-once.
- `run-sheet/trial-cap.test.ts`: `deriveTrialWordCap(curveFrom(surfacePricer), $15)` ==
  `PRICING.trial.entitlement.wordCap` (the published number is the derivation's output).
- `run-sheet/view.test.ts`: Included view carries `entitlementId` + config-cap line; over-cap
  renders "first N words" + upgrade affordance; locked tiers show prices.
- `api/run-routes` tests: entitlement POST forwards `entitlementId`+`fingerprint`; locked→unused
  →consumed chain; second account same fingerprint denied; `trial_shape`/`trial_word_cap`/
  `trial_base_only`/`trial_ceiling`/`entitlement_unavailable` named refusals; audience `off` /
  non-test under `test_tenants` refuses; `phone_challenge_required` 403.
- `api/sheet-context.test.ts`: locked entitlement visible under `trial_pending` + test audience;
  hidden for uncovered audiences / killed / denied.
- `web/server.test.ts`: GET mints the fingerprint cookie; POST forwards `entitlementId` +
  `fingerprint`; `?audience=test` preview renders for is_test sessions only; billing page shows
  `trial_pending` Included state; marketing CTAs name plans; pricing defects regression.
- Journeys: N5/C1 rewritten as above — green on the deployed stage.

## Execution log

### 2026-10-02 — Stage A (code + deterministic tests; $0)

**Landed (branch `stevevitali/act-1-trial-entitlement`, base `61f64c2`):**

- **Config is the single spec (ADR-042).** `pricing.json` trial block now carries
  `entitlement{kind:review,wordCap:2800,rigor:standard,modelTier:base}`, `capCeilingUsd:15`,
  `dailyCeilingUsd:50`, `audience:"test_tenants"`, `interim:true`, `projects:3`,
  `concurrency:1`, `pocketCredits:150`, `upgradePromoCredits:800`, `draftPreviewCredits:60`, and
  the note TEMPLATES (`includedNoteFmt`/`postTrialNoteFmt`/`eligibilityLine`) with `{cap}`/
  `{pocket}`/`{chatCredits}` placeholders — `validate()` refuses a literal digit in any template
  at load. `dailySpendCeilingCredits` derives as `ceil(50 × 1.4 × 100) = 7,000` proxy credits.
  The 2,800-word cap is `deriveTrialWordCap`'s output on the ECON.1-shaped fixture curve
  ($14.95 p90 ≤ $15); `below_floor` under 1,500 is a named operator pause.
- **Claim render model (ADR-043).** NEW `packages/contracts/src/domain/trial-claims.ts`:
  `trialAudienceAllows`, `claimsForAudience` (folds `trial.audience` into
  `trial.firstReviewIncluded`), `trialIncludedNote`, `trialPostTrialNote`,
  `sheetEntitlementLine`, `deriveTrialWordCap`, `TRIAL_CAP_FLOOR_WORDS`. `public-claims.ts`
  enables both claim ids; the audience fold is what holds the trial claim back (flag ON +
  audience-folded OFF for uncovered viewers — `launch-surface.test.ts` pins it).
- **Pricing page (PR-U6).** `pricing-page.ts` derives every figure through the injected
  `SurfacePricer`; all-dash rows are dropped (the Free "Run word cap" cell shows the configured
  trial cap while the claim renders); paid CTAs name plans; Team renders `$40/seat/mo` + the
  waitlist. `visiblePlansPublication` honours the claim fold for `includedNote`.
- **Sheet sees the locked entitlement.** `sheet-context.ts` selects `state in ('locked','unused')`
  + not-killed + in-window + `trialAudienceAllows` against the workspace's `is_test`; emits the
  CONFIG `wordCap` + the row `id`. `view.ts` exposes `entitlementId` + renders the Included line
  via `sheetEntitlementLine` ("up to N words" under cap / "the first N words" over — REQ-BILL-4:
  no dollars, no cap arithmetic, no consent prompt). `ui/run-sheet.tsx` posts the hidden
  `entitlementId`.
- **Run click enters the gate.** Web mints `rhema_fp` (HttpOnly, SameSite=Lax, Secure-on-https,
  1y) on the run-sheet GET when an entitlement renders; POST forwards `entitlementId` +
  `fingerprint` through `CreateRunDto` → `run-routes` (`fingerprintHash` = salted sha256 —
  `rhema:trial:`) → `gateTrialUnlock` → `createRun(…, entitlementId)` → `SqlHoldLedger.hold`.
- **First-spend checks (deliverable 3).** `run-routes` plan-gate: audience refusal
  (`422 entitlement_unavailable`, BEFORE the unlock — no audit row for an uncovered POST);
  `trial_base_only` (in-trial non-Base); `trial_shape` (non-Review/non-Standard/non-Base);
  `trial_word_cap` vs the CONFIG cap; `phone_challenge_required` 403; `trial_ceiling` 429;
  `trial_denied` 403. `gateTrialUnlock` fingerprint_seen counts only bindings owned by NON-test
  workspaces (JOURNEY.1 exclusion — the harness never starves the trial); a second ordinary
  account on the same fingerprint still denies. ASN arm stays unbound → `D-ACT.1-1`
  (compensating controls live).
- **$50/day kill switch (deliverable 4).** Migration `0051_trial_spend_reconcile.sql` adds
  `reconciled_credits` + `paused_at` to `trial_spend_daily`. `recordTrialSpend` charges the
  PROJECTION (`HoldArgs.projectedCredits` ← `estimateCredits`), refuses on `paused_at` or
  `max(credits, reconciled) > 7,000`, exempts `is_test` workspaces. NEW `sweepTrialSpend`
  (system-pool, on `billing.period-tick` in `handleBillingPeriodTick`) recomputes
  `Σ greatest(spent_credits, estimate_credits)` over today's non-test entitlement runs →
  `reconciled_credits` + sticky `paused_at` (REQ-SPEC-30: the aggregate never serves a user
  request). `circuit-breaker.ts` excludes entitlement-run absorbed rows (the $50/day switch owns
  the trial subsidy; the breaker measures cap-drift).
- **RES.2 restore (deliverable 5).** `settleUnverifiedDelivery` restores consumed → `unused`
  exactly once (`trial_restorations` unique row) — covered by
  `unverified-settle.test.ts` ("a consumed trial entitlement restores exactly once").
- **Billing + surfaces.** `/billing/plans` resolves `claimsForAudience(…, isTestWorkspace)` —
  `includedNote` transmits null to uncovered viewers. `GET /session` reports `isTest`.
  `pages.tsx` renders `trial_pending` (Included badge + generated note + eligibility line for
  covered viewers; factual window line otherwise) — the "Free — chat only" defect is gone: a
  covered trial account reads its entitlement. Web `/` + `/pricing` serve `?audience=test`
  preview to is_test sessions only. Copy gains `runSheet` notices for every named refusal
  (`trialDenied`/`trialCeiling`/`trialPhoneChallenge`/`trialWordCapFmt`/`trialShape`/
  `entitlementUnavailable` — placeholders, never literals).
- **Journeys.** N5 rewritten: fresh test user → scratch project (≤300-word fixture) → sheet shows
  Included carrying the configured cap → the Run form carries hidden `entitlementId` → launch →
  dossier-poll to delivery (no cap death). C1 rewritten: anonymous `/` + `/pricing` carry NO
  trial claim; the signed-in test tenant's `?audience=test` renders the config figures (cap +
  pocket + generated note) on both surfaces. `registry.ts` keeps both `expected:"red"` — the flip
  is Stage B's evidence, not the code's. `@rhema/journeys` gains the `@rhema/contracts` dep so the
  legs read the shipped config, never a literal.

**Verify (all green):**
- `turbo build lint typecheck` — **135/135** tasks across the full graph.
- Root `pnpm test` — **4,060 passed / 0 failed** (419 files; 6 skips are pre-existing
  env-gated live legs).
- `pnpm vitest` scoped: contracts (incl. NEW `trial-claims.test.ts` 12), ledger `trial.test.ts`
  **24** (was 19 — +sweep reconciliation, +paused-day, +max(projected,reconciled), +test-tenant
  ceiling exemption), api `run-routes.test.ts` **57** (audience-pause refusal + ceiling-exempt
  test tenant), `billing-routes.test.ts`, `signup.test.ts`, `claims-visibility.test.ts` 5,
  `security-checks` (launch-surface 29 + secrets-manifests 11 — INTERNAL_AUTH_AUDIENCE allowlisted,
  a pre-existing base failure fixed here), `check-additive-migrations` +0051, journeys 29,
  run-sheet/ui/worker/api-client/orchestrator — **green**.
- `pnpm check:licenses` 609 packages clean · `check:protocol-markers` clean.
- RES.2 restore path: `unverified-settle.test.ts` — exactly-once + audit row + `trial_active`.

**Fixes en route (recorded):**
- `sweepTrialSpend` upsert: PGlite "inconsistent types deduced for parameter $2" → explicit
  `::date`/`::int` casts.
- Api trial tests: fixtures flag `is_test` (audience `test_tenants`); `runBody`'s 5,180-word
  default would trip `trial_word_cap` under the interim 2,800 cap → `wordCount:2000` in
  `seedTrial`; the API-level `trial_ceiling` leg is unreachable under `test_tenants` (test
  tenants are ceiling-exempt BY DESIGN) → the test asserts the exemption + a new audience-refusal
  leg covers the operator pause. Ledger level keeps the `paused → refuse` coverage.
- `claims-visibility.test.ts` + `billing-routes.test.ts` now drive claims through
  `claimsForAudience` (the api's real redaction path) — expected-6000 assertions now read the
  config.

**Deferrals:** D-ACT.1-1 (ASN scorer binding — operator credential), D-ACT.1-2 (Stage B legs),
D-ACT.1-3 (everyone-flip — diff below). D-P1.16-1 leg (h) annotated.

**PR:** #92 (`stevevitali/act-1-trial-entitlement` → `stevevitali/sec-2-signup-admission-throttle`;
body = `docs/build/pr/ACT.1.md`). **Do not merge** — merge policy OPERATOR; the operator merges
the stack bottom-up later.

## The everyone-flip (D-ACT.1-3 — operator's diff, recorded for GATE DECISIONS)

```diff
--- a/packages/contracts/src/domain/pricing.json
+++ b/packages/contracts/src/domain/pricing.json
-    "audience": "test_tenants",
+    "audience": "everyone",
```

(Also owed at flip time: re-run `deriveTrialWordCap` against the then-current cost cards —
`pnpm vitest run packages/contracts` fails the config if the published cap no longer equals the
derivation under `capCeilingUsd`. No code deploy; no migration; the flip IS the config value.)

## Stage B (owed — D-ACT.1-2)

Deploy: apply `0051_trial_spend_reconcile.sql` (additive — verified by
`check-additive-migrations`), build/push api+web+worker, `pulumi preview` (pre-authorized iff no
stateful replace/delete) → `pulumi up`. Then, on JOURNEY.1 flagged tenants only:
N5 (≤300-word fixture, ~$5–7) → C1 ($0) → one near-cap trial Review on a claim-light fixture
(est ≈$12.9 list, expected ~$5–7 metered). Stop at ≤$12 cumulative; dropped legs become
`D-ACT.1-n` rows.
