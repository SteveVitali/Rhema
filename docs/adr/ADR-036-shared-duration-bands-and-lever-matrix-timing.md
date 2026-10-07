# ADR-036: Shared duration bands + the lever-matrix timing method (BL-12)

- **Status:** Accepted
- **Date:** 2026-10-04
- **Ticket:** EST.1
- **Requirement ids:** REQ-SPEC-32(b); BL-57 (PR-E3 half), BL-12 (X-lever-matrix-flake)
- **Spec:** §5.6 (item 2's ≤100 ms recompute budget); PR-E3 (duration disagreement)
- **Related:** ADR-032 (the calibration store), ADR-034 (the one API)

## Context

PR-E3: the same run showed "149–248 min" on the sheet (credits÷25…÷15 — a bigger *price* read as a
longer *run*) versus "~28–53 min" on the run card (flat 5-min/phase × [0.8, 1.5]). Two independent
duration guesses, both uncalibrated.

Separately, BL-12: `lever-matrix.test.ts` asserted a **single-shot** <100 ms build; under full-suite
CPU contention the measurement — not the code — flaked. The budget could not be deleted or loosened
(spec-bound), so the measurement method was the thing to fix. Also, the EST.1 matrix gained a third
dimension (rigor × tier × toggles): a naïve per-cell toggle pass would have multiplied the cost by
the rigor×tier cross-product.

## Decision

**Durations are one vocabulary.** `contracts/durations.ts` owns `DurationBand` +
`durationPriorForPhases(phases)` — `phases × 5 min × [0.8, 1.5]`, the constants that were already the
run card's prior. Above it, `durationBandFor` (run-sheet `surface.ts`) returns the **calibrated cell**
when `cost_card_cells` covers the (workflow, rigor, tier, size-band) bucket — p10 → p95 whole
minutes, gate waits excluded (migration 0050 adds `cost_observations.duration_ms` = Σ step
durations and `cost_card_cells.p10_ms/p50_ms/p95_ms`) — else the shared prior. The sheet, the
protocol card, the Timeline chip, the lever matrix and the run card's *initial* ETA all consume this
single chain; the run card's parametric in-run ETA keeps measuring committed steps but its prior is
now literally the shared constants.

**The lever-matrix perf budget is asserted on the median of five timed builds after two un-timed
warm-ups** (`lever-matrix.test.ts`). Warm-ups exclude JIT/module cold start — which is not the
budgeted quantity (the client does a map read, not a build); the median kills the contention outlier
that made the single-shot flake. The budget still bites: the matrix build stays linear in DISTINCT
lever states (the toggle cross-product is computed once and re-keyed per rigor×tier cell), and a
mutation making it O(states²) pushes the median past 100 ms and fails the test — recorded in the
run ledger.

## Consequences

- A bigger estimate no longer reads as a longer run; duration and price are independent axes.
- "Durations disagree" (PR-E3) is closed structurally — one prior, one calibrated source.
- The perf assertion now measures the quantity the spec means (a warm recompute) and survives the
  shared-CPU suite; it cannot be gamed by a lucky single shot and still fails a real regression
  (verified by mutation).

## Alternatives considered

- **An isolated perf project outside the parallel suite.** More moving parts (a second vitest
  config) for the same effect; the median-of-5 after warm-ups achieves the robustness in-place.
- **Raising the 100 ms budget.** Forbidden — the ticket pins the spec budget; only the measurement
  method may change.
- **Per-surface duration priors.** This was the bug.

## Revisit trigger

Real per-phase duration percentiles from the calibration store reaching the in-run ETA leg (RPT.1's
live meter), or a rigor/tier count large enough that the state cross-product needs lazy computation —
the ≤100 ms median test is the tripwire.
