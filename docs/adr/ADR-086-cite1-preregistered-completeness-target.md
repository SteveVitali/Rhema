# ADR-086: CITE.1 pre-registered Stage-B target — aggregate ≥0.95 after backfill, no run <0.80

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CITE.1
- **Requirement ids:** REQ-VIS-9
- **Spec:** §8.4; ADR-083/084/085

## Context

AC5 requires the completeness target to be pre-registered BEFORE any Stage B spend — the number is
committed here, ahead of the probe legs, so the verdict ("did the mechanism move the rate") cannot
be chosen after the fact. The measured baseline (the $0 read-only cross-tenant scan, run ledger AC1)
and the Stage-B result are both recorded in `docs/build/runs/CITE.1.md` against this registration.

## Decision

The Stage-B legs (≤ $10, cheapest-first — Leg 1 RES.1 probe ×3, Leg 2 golden-op-ed probe ×2, Leg 3
one Quick/Base Review end-to-end) succeed when:

1. **Aggregate post-backfill completeness ≥ 0.95** across the Stage-B runs (covered ÷ cited on the
   canonical cited⇒retrieved join — the persisted `citation_completeness` record, not a recomputed
   approximation).
2. **No individual run < 0.80** — the floor protects against a bimodal outcome the aggregate would
   hide (a run that strips half its citations is a failure even if its peers are perfect).
3. **Improvement over the measured baseline class counts** — the scan's `normalizationOnly` +
   `searchOnly` classes must be eliminated by construction (ADR-083 parity), and `trulyUnretrieved`
   must be measurably reduced by the mechanism (ADR-085). The quantified delta is recorded in the
   run ledger once the baseline lands.
4. **A target shortfall is not hidden** — it lands as `D-CITE.1-<n>` in DEFERRALS.md with the
   measured figures, per the ticket's explicit deferral path.

## Consequences

- The success criterion exists before the spend; Stage B measures against it rather than narrating
  one afterward.
- 0.95 aggregate / 0.80 floor is deliberately short of 1.0: Path B stays a valid residual for
  genuinely unretrievable URLs (a paywalled or dead source SHOULD still strip, not loop forever).
- The per-run floor exists because the mechanism is per-run — an average could pass while one run
  silently degrades.

## Alternatives considered

- **A single aggregate threshold only** — rejected: hides per-run regressions in a small sample.
- **1.00 as the target** — rejected: makes Path B's valid residual a failure by definition and
  pressures the mechanism to chase unretrievable sources.
- **Defer the target until the baseline lands** — rejected: that is precisely the post-hoc
  registration AC5 forbids; the baseline number informs the *delta*, not the *threshold*.

## Revisit trigger

Reopen if the baseline scan reveals a `trulyUnretrieved` rate so low the 0.95 bar is trivially met
without the mechanism (the mechanism's value would then rest on the parity fix alone — a legitimate
outcome the run ledger must state plainly).
