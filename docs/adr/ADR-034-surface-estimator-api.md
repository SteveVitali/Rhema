# ADR-034: The surface-estimator API — one call shape, one figure, every pre-run surface

- **Status:** Accepted
- **Date:** 2026-10-04
- **Ticket:** EST.1
- **Requirement ids:** REQ-SPEC-32(b), REQ-IDE-13 (amended), REQ-GROWTH-4, REQ-BILL-1, REQ-BILL-5, REQ-SPEC-16
- **Spec:** §5.6 (items 1–6), §14.1, §15.1–§15.2; PR-E1 (the 10–20× estimate drift)
- **Related:** ADR-032 (durable calibration store), ADR-035 (tier resolution), ADR-036 (durations + lever-matrix timing)

## Context

On 2026-09-30 the same 1,003-word essay was priced at figures 10–20× apart across six surfaces:
the protocol card, the landing page, the pricing page, the Timeline chip, the run sheet, and the
post-confirm re-render. Each surface carried its own derivation — a hard-coded `5180` mock count in
the web layer, `typicalReviewCredits` at a fixed Standard/Balanced on `/protocols`, Standard/Balanced
hard-coded on the Timeline, a *second* parametric estimator (`costCardTerms` in `pricing.json`) for
marketing, and a credits÷25 duration derivation on the sheet that disagreed with the run card's flat
prior.

The fix requires one estimator-facing API every surface calls, while honouring package boundaries:
`@rhema/contracts` is a protocols-free leaf and cannot reach `estimatorSpec`; marketing pages must
still compute through the same engine.

## Decision

**`@rhema/run-sheet` owns `surfaceEstimate(args)` — the single estimator-facing API** —
`{workflow, rigor, modelTier, inputs, toggles?, variant?, claimCount?, durations?}` → `{estimateCredits,
capCredits, rateTableVersion, provisional, claimCount?, duration, why}`. It wraps `resolveEstimation`
(the `buildEstimate` internals — toggle resolution, the override-first calibrated `estimatorSpec`,
cap sizing) and composes the shared duration band (`durationBandFor`: a calibrated `cost_card_cells`
cell when one covers the bucket, else the shared per-phase prior from `contracts/durations.ts`) plus
the arithmetically-true `EstimateWhy` decomposition (Σ terms × Π factors → ceil → printed total).

- **Marketing/landing figures** reach it through inversion of control: contracts'
  `buildPricingPageData(claims, price)` takes an injected `SurfacePricer`; the implementation is
  `surfacePricer()` in `@rhema/run-sheet`, injected by `apps/web`. `costCardTerms` stops being a
  price source — a shape the pricer cannot price renders `null` → the page renders "—".
- **Surfaces re-pointed:** `GET /protocols` (resolved tier), the Timeline next-step chip (resolved
  rigor+tier, real head words, calibrated duration → the palette hint inherits it), the run sheet
  GET and every re-render (no `5180` fallback; unmeasured inputs render "—"), the run card's initial
  ETA prior (now literally the shared `durations.ts` constants), and the estimate route's
  `duration`/`why` fields.
- **Fail closed:** a surface that cannot compute a figure renders "—"/null — never a remembered or
  hand-composed number.
- **Drift contract tests** (`packages/run-sheet/src/surface.test.ts`) assert parity across the
  fixture matrix and statically fail if a listed surface calls `buildEstimate(`/`costCardTerms`
  directly or re-derives duration from credits.

## Consequences

- Any figure change requires touching the estimator once; surfaces cannot drift apart silently —
  the static guard test fails CI the moment a surface bypasses the API.
- The why-block is checkable by construction: each term's credits IS quantity × rate, and
  `Math.ceil(Σ terms × Π factors)` equals the printed total — the "4 claims × 40 ≈ 440" shape is
  structurally impossible.
- `pricing-page.ts` keeps its contracts-pure shape (cards/matrix/FAQ layout) but no longer embeds a
  formula; `whatItCovers` lines exist only where the pricer computes them.

## Alternatives considered

- **A dedicated `@rhema/estimator` package.** Rejected: `buildEstimate` already lives in run-sheet
  (it composes protocols + profiles); a new package would only re-export it, and the run sheet is
  the canonical consumer of the sheet-shaped result. Keeping the API where the sheet logic lives
  avoids a second layer for the same math.
- **Contracts hosting the API.** Impossible without breaking the leaf rule (protocols-free); the
  `SurfacePricer` seam in contracts + the implementation in run-sheet preserves it.
- **Keeping `pricing.json`'s `costCardTerms` as the marketing formula.** This WAS the second
  estimator (PR-E1) — retained only for non-figure terms (voice corpus words, review holdout words);
  every rendered figure flows through the pricer now.

## Revisit trigger

A new pre-run surface that cannot call `surfaceEstimate`/`surfacePricer` (e.g. a native client with
no server hop) — then the API itself becomes a versioned wire contract instead of an in-process call.
