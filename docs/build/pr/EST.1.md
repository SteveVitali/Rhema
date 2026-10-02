# EST.1 — One estimate everywhere (and a tier the user can choose)

Every pre-run figure a user sees — the protocol cards, the Timeline chip, the run sheet (including
the post-confirm re-render), the palette, the pricing cost cards + "what it covers" lines, and the
landing teaser — now comes from ECON.1's calibrated estimator through ONE surface API
(`@rhema/run-sheet/src/surface.ts`). The sheet shows and changes the model tier within plan rules;
"Why this estimate?" is arithmetically true; `POST /projects/:id/estimates` 400s an invalid tier;
the lever-matrix perf flake is fixed; durations share one calibrated band vocabulary.

Ticket: `docs/tickets/67_EST.1__one-estimate-everywhere.md` (chain row 67, round 3).
Base: `stevevitali/econ-1-charge-what-we-meter` @ `762f4c2` (stacks on PR #87's tip).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-034** (the surface-estimator API + the injected `SurfacePricer`), **ADR-035**
(model-tier default resolution order + plan clamp), **ADR-036** (shared duration bands + the
lever-matrix timing method, BL-12).
Closes: **D-DEF.3-2** (invalid `modelTier` → named 400, no cache/usage writes — proven
deterministically over PGlite), BL-57, BL-58, BL-11(a), BL-12.

## The defect (2026-09-30 prod design review, PR-E1/E2/E3)

The same 1,003-word essay was priced 10–20× apart across surfaces: protocol card "≈5,231",
landing "600–2,680", pricing "Quick ≈170 · Standard ≈280", Timeline "est. 3,721", sheet
"$37.21"/"$10.15", post-confirm "5,180 words · 21 claims · $15.97" (the §5.6 mock's hard-coded
fallback); 632 cr actually charged. The tier was never the user's; durations disagreed
(`credits/25` vs flat 5-min/phase); "Why this estimate?" printed `4 claims × 40 ≈ 440` — wrong
arithmetic on unscaled rates.

## The contract

- **One estimator-facing API.** `surfaceEstimate()` composes `buildEstimate` internals (toggles →
  inputs → `estimateCredits` → cap), the shared duration band, the "Why?" decomposition, and the
  rigor/tier default resolution. Every pre-run surface — protocol cards (`/protocols`), the
  Timeline chip, the estimate route, the lever matrix, the run-card ETA prior, the palette's
  next-step hint, and the marketing pages — goes through it. Fail closed: an uncomputable figure
  renders `—`/null, never a remembered or hand-composed number.
- **Contracts stays a leaf.** `SurfacePricer` is a *type* in contracts;
  `buildPricingPageData(claims, price)` takes the implementation — production injects
  `surfacePricer()`, tests inject a fixture, and `null`/absent ⇒ the gated figure is hidden.
- **The user picks the tier.** The sheet renders a tier select (locked options disabled with the
  plan reason); resolution order is explicit → project `model_tier_default` → account
  `prefs.defaultModelTier` → the rigor's §6.5 notch — then clamped to the plan's permitted tiers,
  with the requested tier recorded for the notice. The api remains the plan-gate enforcer; the
  resolved tier freezes onto the run.
- **"Why this estimate?" adds up.** Terms sum to the subtotal; factors multiply the subtotal to the
  exact unrounded figure; the printed total IS `estimateCredits` — pinned at every rigor × tier ×
  fixture.
- **Durations share one vocabulary.** Migration `0050` (additive) adds
  `cost_observations.duration_ms` + `cost_card_cells.p10_ms/p50_ms/p95_ms`; harvest sums completed
  step execution times (gate waits excluded). Surfaces read the calibrated p10→p95 cell for the
  `${rigor}|${tier}` bucket, else the shared per-phase prior (`contracts/durations.ts`). The
  `credits/25…credits/15` derivations are gone — and grep-guarded.
- **"What it covers" is computed.** `plans.whatItCovers` ships enabled, but the coverage line is
  emitted only as `planCoverageLine(tier, pricer)` — the enabled claim with no pricer still hides
  the line; the retired pricing.json copy can never leak back.
- **`/billing/plans` serves the computed coverage** — the api injects `surfacePricer()` into
  `visiblePlansPublication`, so the DTO's gated lines are the estimator's figures.

## Verification evidence

- `pnpm turbo build lint typecheck` — all green.
- `pnpm test` — **414 test files / 3,951 tests green (0 failed)** on the final post-fix run; the
  initial failures were all stale assertions quoting the retired pricer/claims defaults + the pre-N4
  registry baseline (see `runs/EST.1.md`).
- Cross-surface parity over the wire: `apps/api/src/surface-estimates.test.ts` (4 tests, PGlite,
  real app) — protocol cards ≡ Timeline chip ≡ estimate route ≡ pricing card, plus duration parity.
- `packages/run-sheet/src/surface.test.ts` (21 tests) — surface ≡ `buildEstimate` at every fixture
  × rigor × tier; why-arithmetic exactness; resolution order + clamp; duration bands; static drift
  guards banning `buildEstimate(`/`costCardTerms`/credits-derived minutes on the surface files.
- Lever-matrix flake: 20/20 consecutive green runs; the O(states²) mutation is caught by the new
  estimator-call bound (2,704 vs ≤76) — the wall-clock alone could not have caught it.
- Migration `0050` additive-linted; `check:licenses`/`check:protocol-markers`/`check:no-cookies`
  green; `check-build-memory.sh` clean (7 pre-existing warnings).

## Stage B (operator-gated; not run in this build)

`pulumi preview`/`up` (migration 0050 is additive — `check-additive-migrations` clean), the live
invalid-tier 400 leg, the N4 journey walk + screenshots (needs JOURNEY.1's mailbox/tenant
prerequisites — HUMAN-H7), and at most ONE paid run ≤$5 on the ≤300-word fixture at user-selected
Base tier. Owed as **D-EST.1-1** (`docs/tickets/DEFERRALS.md`). Registry: N4's `expected` is
flipped to `green` in this PR per the owning-ticket rule — a live pass confirms; a live failure
surfaces as `fail`.
