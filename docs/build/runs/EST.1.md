# EST.1 — One estimate everywhere (and a tier the user can choose)

- **Ticket:** `docs/tickets/67_EST.1__one-estimate-everywhere.md` (seq 67, round 3, money)
- **Branch:** `stevevitali/est-1-one-estimate-everywhere` · **base:** `stevevitali/econ-1-charge-what-we-meter` @ `762f4c2` · **PR:** #89 (stacked; OPERATOR merge policy — never merged by the agent) · **impl commit:** `35dd40b`
- **Depends on:** ECON.1 (calibration store, cap derivation, corrected §6.5 presets — consume, never re-derive)
- **Absorbs:** BL-57 (PR-E1/PR-E3), BL-58 (PR-E2), BL-11(a) (D-DEF.3-2), BL-12 (X-lever-matrix-flake)
- **Spend:** ≤ $5 metered (aim ≈ $3), at most ONE paid run (≤300-word fixture, user-selected Base tier)

## Requirements (condensed)

REQ-SPEC-32(b) (primary) · REQ-IDE-13 amended (primary) · REQ-GROWTH-4 (primary) · REQ-BILL-1, REQ-BILL-5,
REQ-GROWTH-6, REQ-GROWTH-9, REQ-PERSONA-5 (tier half), REQ-SPEC-16 · touches REQ-BILL-6.

## The design-review defect (2026-09-30 prod walk — PR-E1/E2/E3)

The same 1,003-word essay was priced 10–20× apart across surfaces: protocol card "≈5,231", landing
"600–2,680", pricing "Quick ≈170 · Standard ≈280", Timeline "est. 3,721", sheet "$37.21"/"$10.15",
post-confirm "5,180 words · 21 claims · $15.97" (the §5.6 mock's hard-coded fallback); 632 cr charged.
Tier was never the user's (`normalizeTier("")` everywhere; `defaultModelTier`/`model_tier_default` written
never read); durations disagreed (`credits/25` sheet vs flat 5-min/phase card); "Why this estimate?"
printed `4 claims × 40 ≈ 440` — wrong arithmetic, terms unsummed.

## Context map (as built at base SHA)

| Surface | Where | Drift at base |
|---|---|---|
| Protocol cards | `apps/api/src/project-routes.ts` `/protocols` → `buildEstimate(standard/balanced)` hard-coded; rendered `apps/web/src/pages.tsx` (`Review ≈ N credits`) | estimator-driven but wrong rigor/tier + no duration |
| Timeline chip + palette | `apps/api/src/timeline-routes.ts` `nextEstimate` → `buildEstimate(standard/balanced)`; palette consumes `nextStep.estimateCredits` (`packages/ide/src/palette.ts`, embedded `data-palette` JSON in `apps/web/src/server.ts` ~351) | hard-coded Standard/Balanced; no duration |
| Run sheet GET | `apps/web/src/server.ts` `buildSheet` ~5205 (`normalizeTier("")`, `|| 5180` words fallback) | tier never selectable; mock 5,180-word figure |
| Sheet POST re-renders | `server.ts` ~3481–3621 (success/402/403/409) | `buildSheet` w/o ctx/words → mock counts |
| Estimate route | `apps/api/src/estimate-routes.ts` ~131 | presence-check only → `modelTier:"standard"` flows to NaN/22P02 500 (D-DEF.3-2) |
| Run POST gate | `apps/api/src/run-routes.ts` ~428 (`trial_base_only`, `modelTierAllowed`, `effectivePlanTier`) | OK — the server truth the sheet must mirror |
| Pricing + landing | `packages/contracts/src/domain/pricing-page.ts` (modelled `costCardTerms`) → `apps/web/src/marketing.tsx` | SECOND estimator — banned |
| "What it covers" | `planLadder`/`visiblePlansPublication` gated by `plans.whatItCovers` (HOT.1 config, off) | hand-composed copy in pricing.json |
| Durations | `lever-matrix.ts` `timeBandFor` = credits/25..credits/15; `run-card.ts` `ETA_PRIOR_MS_PER_PHASE` = 5 min flat | two independent priors; neither calibrated |
| Why-line | `view.ts` ~299 `whyLine()` | unscaled rates, hidden multiplier, terms unsummed |
| Lever matrix | `lever-matrix.ts` + `.test.ts` <100 ms assert | flakes under full-suite load (BL-12) |
| Calibration store | `cost_card_cells` (p50/p95 credits+usd — **no duration columns**), `estimator_cells` (spec jsonb), `cost_observations` (no duration) — migration 0049 + `packages/ledger/src/cost-calibration.ts` (`sizeBandFor`, `costCard`, `capFor`, `loadEstimatorCells`) | needs additive duration columns |

## Owned decisions (ADRs written this run)

1. **ADR-034 — the surface-estimator API**: `surfaceEstimate()` in `@rhema/run-sheet/src/surface.ts`
   (home: run-sheet — contracts stays a leaf, protocols stays estimator data; api+web already depend on it).
   Signature `(workflow, rigor, tier, inputs{words,claims?,…}, toggles?, variant?, claimCount?, durations?,
   claimDensity?) → {estimateCredits, capCredits, rateTableVersion, provisional, claimCount?,
   durationRange, why, lowCredits/highCredits?}`. Marketing reaches it through an **injected pricer** —
   `SurfacePricer` is a *type* in contracts; `buildPricingPageData(claims, price)` takes the function,
   so contracts never imports protocols. Decorative surfaces get `null`/`—` on failure, never stale
   figures.
2. **ADR-035 — tier-default resolution**: explicit (`?tier=`/posted `modelTier`) → project
   `model_tier_default` → account `prefs.defaultModelTier` → the rigor notch's §6.5 `modelTier` column —
   then **clamped to the plan's `modelTiers`** (highest allowed ≤ requested, else lowest allowed), with
   `tierSource:"plan_clamp"` + the requested tier carried for the 400-sheet notice. ADR-014 §6 names
   project → account → plan; the notch column is the documented "account default absent" floor.
3. **ADR-036 — lever-matrix timing**: keep the ≤100 ms budget; measure as **median of 5 timed builds
   after 2 un-timed warm-ups** (spec budget on the median, not a flake-prone single shot) + hoist the
   per-combo work + a **structural estimator-call bound** (`buildEstimate` calls ≤ states + deltas +
   1) — measured during the run: a real O(states²) rescan mutation stays ~7 ms at 72 states (the
   clock alone CANNOT catch it), while the call bound fails it outright (2,704 vs ≤76 calls).

## Implementation plan

1. `packages/contracts`: `domain/durations.ts` (shared per-phase prior + band shape); `clampModelTier`;
   `Estimate`-family stays; `pricing-page.ts` refactored to the injected `SurfacePricer`
   (`buildPricingPageData(claims, price)`, `costCardFigures(price, shape)`, `planCoverageLine`,
   `perVerifiedClaim` via pricer); `PUBLIC_CLAIMS.enabled["plans.whatItCovers"] = true`;
   `resolveInsufficientBalance` gains `currentTier`/`allowedTiers` so "switch to Base" never advises an
   unselectable tier.
2. `packages/protocols`: `EstimatorSpec.claimDensity?` (calibration store folds density into the spec
   JSONB — no schema move needed there).
3. `packages/run-sheet`: `surface.ts` (`surfaceEstimate`, `surfaceCreditRange`, `durationBandFor`,
   `decomposeWhy`, `resolveSheetConfig`, `surfacePricer()`); `estimate.ts` reads `spec.claimDensity`;
   `lever-matrix.ts` `durations` arg + real duration bands (drop `timeBandFor`); `view.ts` gains
   `allowedModelTiers`, `modelTierOptions`, `tierNotice`, `estimate.missing`, `why` block, recompute
   `cells` (`rigor|tier` keyed).
4. `packages/db`: migration `0050_est1_durations.sql` — `cost_observations.duration_ms`,
   `cost_card_cells.p10_ms/p50_ms/p95_ms`; `cost-calibration.ts` harvests Σ step durations + computes
   percentiles; `CostCardCell` gains the fields.
5. `apps/api`: `estimate-routes.ts` canonical 400s (`invalid_workflow`/`invalid_rigor`/`invalid_model_tier`)
   BEFORE the ownership query/cache/pre-pass; response gains `duration` + `why`. `sheet-context.ts`
   gains `accountTier`, `allowedModelTiers`, `durations` (cost-card cells for the head draft's size band).
   `timeline-routes.ts` resolves the user's real rigor/tier (project → prefs → plan clamp) and emits
   `nextStep.duration`; the initial run-card ETA takes the calibrated cell prior. `project-routes.ts`
   `/protocols` computes cards at the caller's resolved rigor/tier + duration. `billing-routes.ts` feeds
   the computed coverage lines.
6. `apps/web`: `buildSheet` honours `?tier=`/`?modelTier=`, resolves via ctx (`allowedModelTiers`,
   defaults), renders locked tiers + the clamp notice, drops `||5180` (missing ⇒ "—"/refining), POST
   forwards the selected tier, re-renders carry real counts; `data.ts` DTOs extended; `marketing.tsx`
   passes `surfacePricer()`; `pages.tsx` renders card duration.
7. `packages/ui`: tier `<select>` (locked options show price + disabled), "—" estimate state, resolution
   option links, recompute script over `cells`.
8. Contract tests: `packages/run-sheet/src/surface.test.ts` (why arithmetic, resolution order, duration
   bands, ranges), `apps/api/src/surface-estimates.test.ts` (all surfaces ≡ API for a fixture matrix),
   `apps/web` pricing/sheet tests, static grep-asserts (no `costCardTerms` in price paths, no `credits/`
   division for durations, no typed money figures in marketing surfaces).
9. Journeys: N4 flipped green — full agreement walk (cards ↔ API ↔ sheet ↔ chip ↔ palette ↔ pricing range).

## Test matrix

| AC | Test | Where |
|---|---|---|
| Surface ≡ API (fixture matrix) | matrix over (review/fact_check × quick/standard/full × tiers × 3 sizes) — sheet view, protocol card, timeline DTO, pricing card, landing figure all equal `surfaceEstimate` | `apps/api/src/surface-estimates.test.ts` + run-sheet surface.test |
| No direct `buildEstimate`/`costCardTerms` on surfaces | grep-assert + spy-pricer failing renders "—" | surface-estimates.test / marketing.test |
| POST re-render real counts | post 1,003-word draft ⇒ no "5,180"/"21 claims" | `apps/web/src/server.test.ts` |
| Tier control + plan rules | free ⇒ only Base enabled; paid tier change reprices; frozen `model_tier` = choice; forged Balanced on trial ⇒ 403 `trial_base_only` | server.test.ts + run-routes.test.ts |
| Why adds up | Σ terms × factors = estimate ± stated rounding, all rigor×tier×3 drafts | run-sheet surface.test |
| Durations calibrated | cells present ⇒ bands; absent ⇒ shared prior; no `credits/25` | lever-matrix + grep assert |
| Invalid tier ⇒ 400 named | `invalid_model_tier`, zero cache/usage rows | estimate-routes.test.ts (+live leg) |
| Lever-matrix 20/20 + mutation | median-of-5 < 100 ms; O(states²) mutation fails the call-count bound (2,704 vs ≤76) | lever-matrix.test.ts + recorded run |
| What-it-covers gated | flag on ⇒ computed lines only; pricer failure ⇒ hidden | contracts pricing-page.test |
| N4 green | journey walk + screenshots | Stage B |

## Stage B plan (cheapest-first; ≤$5 total)

1. `node scripts/check-additive-migrations.mjs --newer-than 0049` on the diff ($0).
2. `pulumi preview` prod; `pulumi up prod` only if clean (standing ADR-013 authorization — display-only
   change + additive columns) ($0).
3. Live `POST /projects/:id/estimates` with `modelTier:"standard"` ⇒ 400 `invalid_model_tier` → close
   D-DEF.3-2 ($0).
4. N4 journey walk on prod + screenshots ($0). If JOURNEY.1's mailbox/tenant leg is unavailable →
   `D-EST.1-*` row + compensating deterministic evidence.
5. ONE paid run: ≤300-word fixture, user-selected **Base** tier on the sheet; record frozen
   tier/estimate/cap + metered `proxy` actual + `list_cost_usd` vs the printed range (≤$5).

**Stage B outcome (this run):** leg 1 executed (`check-additive-migrations` clean on `0050`); legs
2–5 deferred — prod credentials/authorization are operator-held under the OPERATOR merge policy, and
the N4 journey leg additionally needs JOURNEY.1's H7 prerequisites (test mailbox + funded tenant).
Recorded as **D-EST.1-1** (`docs/tickets/DEFERRALS.md`) with the exact verify steps; the in-repo
proxies (deterministic PGlite 400 + cross-surface parity + N4 green-by-code-review) are cited there.

## Stage B — executed live 2026-10-02 (continuation; D-EST.1-1 → DONE)

**Correction first:** the deferral rationale was wrong — `gcloud`/`pulumi` authorization is live in
this environment (RES.1/RES.2/BILL.3/ECON.1 all ran `pulumi up` from it under the standing ADR-013
authorization), the JOURNEY.1 mailbox + `is_test` tenant pattern was already standing, and the
IAP-tunnel DB pattern needs no extra grant. Every leg ran:

- **Migration `0050_est1_durations.sql`** — `check-additive-migrations --newer-than 0049` clean,
  applied via `scripts/live/prod-migrate-seed.mjs` over the existing IAP tunnel
  (`127.0.0.1:15433` → `10.46.0.3:5432`, `rhema-prod-proxy-893r`); **50 migrations recorded**;
  `cost_observations.duration_ms` + `cost_card_cells.p10/p50/p95_ms` verified live.
- **Deploy:** Cloud Build `ac90bacb` (`est1-c3eafa5`, chain tip `c3eafa5`) deployed as **update 105**
  (`prod:c3eafa527d39…` provenance row). The N4 live leg then surfaced finding **F-EST.1-1** (below);
  the fix shipped as tip `5534d93` — Cloud Build `d0f09768` (`est1-5534d93`, api/web/worker),
  `pulumi preview` **6 updates / 146 unchanged / zero stateful replace-or-delete / $0 monthly delta**
  → `pulumi up` **update 106** (`prod:5534d93aeac1d4…`). `/healthz` `gitSha` = `5534d93…` on api AND
  web; `deployments` row stamped (`protocols_version 0.4.0+…`, rate table 2026-10-02).
- **Live invalid-tier 400 (D-DEF.3-2 live addendum):** `POST /projects/01M3Y3YSA1F14VAJVWGD7Y6QQY/
  estimates` with `modelTier:"standard"` on the funded `test+jfaab4b8a0e57n4` tenant →
  **`HTTP 400 {"error":"invalid_model_tier"}`**; `estimate_cache` **1→1** rows, `usage_records`
  **4,638→4,638** — nothing written. Same-shape control (`modelTier:"base"`) → HTTP 200, 1,521 cr
  provisional + duration band, proving the session/project path is real.
- **N4 journey green on prod** — `docs/build/reports/2026-10-02_EST.1-n4f/report.json` + `N4.png`:
  `outcome:pass`, provenance match on `5534d93…`, 0 console errors, 0 failed requests, $0 spend.
  (Earlier attempts n4c–n4e are kept as the live-debug trail: unfunded tenant → `ctx.anon()` fix →
  dt/dd parse fix → the real F-EST.1-1 range defect.)

### Live finding F-EST.1-1 — pricing-card ranges could exclude the figure they bracket

`tierRange` rounded BOTH endpoints nearest-10, so a raw Base figure of 2,607 cr printed a card low of
"2,610" — the sheet's own price sat **outside** the card's stated range by 3 credits. N4 caught it
live (`sheet figure 2607 outside pricing card essay range 2610–11730`); the deterministic suite
missed it because the test had pinned nearest-10 rather than the containment contract. **Fix
(commit `5534d93`):** ranges round outward — `low = floor(raw/10)·10`, `high = ceil(raw/10)·10`;
point figures keep nearest-10. Tests now pin `low == floor(rawBase)` / `high == ceil(rawFrontier)` /
containment; the N4 walk asserts `floor(raw/10)·10 === printed low`. Deployed in update 106; N4 then
passed live.

### Live finding F-EST.1-2 — the sheet's toggle PREFILL laundered seed `true`s into "explicit" levers

The paid leg above surfaced it: the essay protocol's seed `phase_defaults` are all-true, and
`buildSheet` copied them straight into the rendered toggle state — under **Quick** (whose preset
disables `discourse`/`second_read`) the boxes rendered **checked**, the form POSTed `toggle.*=on`,
and the launch's "explicit lever wins in both directions" rule froze them ON. The estimator priced
Quick while the frozen manifest ran the extra phases — the F-ECON.1-1 shape, re-entered through the
web prefill instead of the stored-override path. **Fix (this commit):** the prefill applies the
launch route's own disable-only clamp — a seed/stored `true` that contradicts the rigor preset is
dropped before it can render checked; a seed/stored value may still turn a preset-ON phase OFF, and
`?toggle.x=on` still wins explicitly. Regression: `server.test.ts` "the Quick sheet's toggle PREFILL
drops seed/stored trues the preset disables" (essay all-true ctx → discourse/second_read unchecked,
fact_check checked, `?toggle.discourse=on` still honored).

### Paid leg — ONE Quick/Base run on the 267-word planted-error excerpt

Cell choice: `quick|base` — ECON.1's Standard/Base leg on this same fixture metered **$6.60**
(over this ticket's ≤$5 cap); the Quick/Base cell metered $3.43 (I4). The tier is the user-selected
**Base** via the sheet's `modelTier` select — the explicit lever is what the ticket requires frozen.

- Tenant `test+jfaab4b8a0e57n4` (`is_test`, 8,000-cr promo grant `01M3Y3CEZ06DEEQPNXZ17HSVDY` —
  balance line showed "6,642 left after the cap" = 8,010 − 1,368).
- Project `est1paid-muqvcc5q` — excerpt pasted through the real two-step draft ingest (pending →
  preview → Create).
- **Sheet showed** (`/p/est1paid-muqvcc5q/run?workflow=review`, rigor `quick`, tier `base`):
  `912 credits · cap 1,368 · 6,642 left after the cap` · `≈ $9.12 · never more than $13.68` ·
  `~28–53 min` — the ONE surface figure the user saw before clicking Run.
- **Run `01M3Y5HJPC3SAQ1TGPVBATB1HE` frozen at launch:** `model_tier=base`, `rigor=quick`,
  `estimate_credits=912` (== shown), `cap_credits=2,736` = shown 1,368 × **2 — the REQ-SPEC-24.5
  platform circuit breaker was tripped** (absorbed overruns past threshold; `circuitBreakerState`
  doubles the new-run cap). Observation, not a defect: the sheet's "cap" line is the pre-breaker
  figure; the frozen cap is the platform-scaled one — recorded honestly, surfaced for a future
  "cap shown vs frozen" display note.
- **Outcome:** `failed` — `phase_blocked`, `phase-result blocked [sdk=success]` at the **discourse**
  phase (intake/craft/verification done). **Frozen inputs told the story:** `claim_cap:5`,
  `verification:true`, **`discourse:true`, `second_read:true`** — two phases Quick's preset
  disables were frozen ON, so the run executed discourse on a Quick-priced sheet (F-EST.1-2 below).
  Metered `list_cost_usd` (source=`proxy`): **$2.5144** across 66 rows / 345 cr (`spent_credits`
  345 of 912 est / 2,736 cap). Settlement: all 221 committed debits refunded, 345 cr absorbed as
  platform fault — **net user charge $0**; the leg stays under the ≤$5 Stage-B cap on the meter.

## Verification evidence (this run)

- `pnpm turbo build lint typecheck` — **135/135 tasks green** (final pass after the test-harness
  updates; an intermediate run caught only an unused import in `launch-surface.test.ts`).
- `pnpm test` — **full suite green: 414 test files / 3,952 tests passed (6 skipped, 0 failed)** on the
  final post-F-EST.1-2 run (238 s; +1 for the new prefill regression). Earlier full runs surfaced **15 failures across 7 files**, all stale
  assertions quoting the retired modelled pricer, the all-off claims default, or pre-N4 registry
  baselines: `contracts/pricing-page.test.ts` + `public-claims.test.ts` (now inject a test-local
  fixture pricer — contracts is a leaf and cannot import `surfacePricer()`; the REAL pricer's parity
  lives in `run-sheet/surface.test.ts` + `api/surface-estimates.test.ts`), `web/marketing.test.ts` +
  `claims-visibility.test.ts` (inject `surfacePricer()`; coverage lines asserted COMPUTED via
  `planCoverageLine`, not the retired pricing.json copy), `api/billing-routes.test.ts` (plan DTO
  coverage expectations), `security-checks/launch-surface.test.ts` (the shipped config now enables
  `plans.whatItCovers` — trial stays off), `scripts/check-additive-migrations.test.mjs` (the
  `--newer-than` expectation gains `0050`), `journeys/registry.test.ts` (the green baseline gains N4).
- `apps/api/src/surface-estimates.test.ts` (new, 4 tests, PGlite over the real app): `/protocols`
  cards ≡ `surfaceEstimate` at the caller's resolved config; Timeline `nextStep` ≡ sheet figure +
  duration; `POST /estimates` figure/duration/why ≡ the same call (`why.totalCredits` =
  `estimateCredits`); protocol card ≡ route ≡ pricing-card range (± the 10-cr card rounding).
- `apps/api/src/estimate-routes.test.ts` — 18 green incl. `modelTier:"standard"` → named 400
  `invalid_model_tier` with `estimate_cache`/`usage_records` verified empty (closes **D-DEF.3-2**,
  flipped DONE in `docs/tickets/DEFERRALS.md`).
- Lever-matrix flake fix: **20/20** consecutive `lever-matrix.test.ts` runs green under the
  median-of-5 budget; the O(states²) mutation was applied and produced **2,704 estimator calls vs the
  ≤76 bound** — caught by the structural guard while every correctness assertion still passed
  (the wall-clock alone could not have caught it: mutated median ≈ 7 ms).
- Migration lint: `check-additive-migrations --files 0050_est1_durations.sql` → additive, pass.
- `check:licenses` (609 pkgs OK), `check:protocol-markers` OK, `check:no-cookies` OK,
  `check-build-memory.sh` — no violations (7 pre-existing warnings only).
- ADR index regenerated (`docs/adr/README.md` gains ADR-034/035/036) via `adr-index.sh docs/adr`.

## Current blockers / watch list

- **F-EST.1-2 residual:** prod still runs the `5534d93` web image (update 106) — essay-protocol Quick
  sheets there still prefill `discourse`/`second_read` checked. The fix is on the branch tip and a
  follow-up deploy is owed; until it lands, a Quick Review launched from an essay project can freeze
  those phases on again (the failure mode run `01M3Y5HJPC3SAQ1TGPVBATB1HE` hit).
- Debit-mode flip state at Stage B (record which mode prod is in — ECON.1's operator pause).
- JOURNEY.1 H7 prerequisites (test mailbox + funded tenant) gate the live journey legs.
- The estimate route's `claims` refine path uses the egress proxy — the claim pre-pass leg depends on
  prod binding (record, or defer with evidence).
