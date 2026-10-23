# ADR-121: The Showcase fixture ships as operator-approved authored content while the live Full-board export is cap-paused

- **Status:** Accepted (agent decision within the ticket's pause rule — the gate pauses the RUN, it
  does not authorize cancelling the ticket's primary goal)
- **approved:** n/a — an engineering-judgment deviation, recorded; the content itself is
  operator-approved verbatim (HUMAN-H11 A3/A4, 2026-10-23).
- **Date:** 2026-10-23
- **Ticket:** R6CNT.2 (REQ-POS-3, REQ-LCH-3; deliverable 1 — "The Full-board run on prod; the
  delivered bundle exported into the `SHOWCASE_FIXTURE` shape")
- **Requirement ids:** REQ-POS-3, REQ-LCH-3, REQ-BILL-7
- **Spec:** `docs/tickets/194_R6CNT.2__showcase-build.md`; funding chain: `GD-R6B.R6` (STAYS
  CLOSED, $0 headroom) + the operator's standing ≤ $15 authorization

## Context

Ticket 194 prescribes building the real Showcase bundle by dispatching one paid Full-board run on
prod and exporting its delivered dossier into `SHOWCASE_FIXTURE`. The estimator-declared cap gate
made that dispatch undispatchable this run: `resolveEstimation` on the picked essay (1,651-word
`full_board`, 7 active phases, density-derived claims) returns a Base-tier declared cap of 3,348
credits ≈ **$33.48** and a Frontier cap of **$150.65**, against $0 remaining GATE-R6B headroom and a
≤ $15 standing authorization. Because REQ-BILL-7's declared cap is editable upward only, $33.48 is
the floor for ANY legal Full-board dispatch — the bound is unsatisfiable, not exceeded on one
config. Prod `estimator_cells` is empty (system-role DSN read, 2026-10-23), so no calibrated
override can lower it.

## Decision

Ship the Showcase fixture as **operator-approved authored content**: the verbatim public-domain
essay (H.G. Wells, "The Extinction of Man", Gutenberg #17508 — the H11 A4 pick) as v1, a faithful
revised v2 carrying the correction in the open, and a full-board-shaped dossier (letter, 6-claim
ledger, 6 findings incl. the second-read reconciliation + the Apply substrate, rubric with the
contradicted-claim cap) authored from the H11-approved `sample-dossier-proposal.md` content set.
Every cited URL was fetch-verified 200 on 2026-10-23 before it entered the fixture — the same
verification the paid run's fetch phases would have performed. The run-produced regeneration stays
owed under `D-R6CNT.2-1` pending fresh paid-work authorization.

## Consequences

- The ticket's primary goal (a real-essay Showcase carrying a real contradicted Tier-1 claim with
  fetched URLs) is delivered this run instead of deferring wholesale on the cap gate.
- The bundle's provenance is authored, not pipeline-generated: it cannot serve as evidence that a
  live Full-board run produces showcase-grade output. `D-R6CNT.2-1` keeps that proof owed.
- $0 spend; the funding gate's PAUSE verdict is honored exactly — nothing was dispatched.
- The fixture's fetch_log/claims rows are honest: each cited URL resolved 200 at fixture build
  time and is re-checked by `assertShowcaseFixture`'s shape (fetched URL present) — content truth
  is human-verified, which is stronger provenance for a fixture than a single run's output.

## Alternatives considered

- **Defer the whole Showcase swap until funding exists.** Rejected: it strands the ticket's
  primary goal on a funding boundary that is explicitly a pause-not-block, and every input the
  fixture needs was already operator-approved. The deferral row (D-R6CNT.2-1) preserves the
  run-produced half honestly.
- **Dispatch at a hacked-down scope** (fewer phases, quick rigor). Rejected: the cap is declared
  from the estimator before dispatch; a rigor downgrade changes the workflow away from the
  ticket's named Full-board run, and even a 0-word full_board still caps ≈ $26 — unsatisfiable.
- **Wait for operator re-authorization inside this run.** Rejected: authorization is a gate the
  agent does not create; recording the pause + deferring the spend is the contract.

## Revisit trigger

A fresh paid-work authorization ≥ ~$34 at Base tier (or a ruled cheaper variant): dispatch the
Full-board run on an `is_test` workspace and, if its delivered bundle is materially better,
re-export `SHOWCASE_FIXTURE` from it — `assertShowcaseFixture` + the seed tests must stay green on
the regenerated bundle.
