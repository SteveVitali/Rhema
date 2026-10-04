# ADR-104: GATE G2 deferred — Phase-B UI built before the wave-1 LIFT eval — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-15 (decision; recorded into the ADR set + folded into the spec by REC.2, 2026-10-04)
- **Ticket:** `16c_GATE-G2` (the decision; LEDGER § GATE DECISIONS 2026-09-15); REC.2 (the fold-back)
- **Requirement ids:** REQ-EVAL-15, REQ-EVAL-16, REQ-EVAL-19, REQ-BETA-20; §16.4; §17 benchmark row
- **Spec:** rhema-design-spec §17 (benchmark-row amendment banner), §16.4 (marketing block), §18.4

> Retro-fitted by REC.2 (spec reconciliation) from the operator's 2026-09-15 GATE DECISIONS row. The
> decision was taken and acted on during the build; this ADR is its committed record.

## Context

The ratified sequence (§17) is validation-first: Phase 0 → benchmark wave 1 + the LIFT gate (G2) →
Review beta → full IDE → public launch, with "the lift gate read before any UI spend beyond Phase 0."
On 2026-09-15 G1 PASSED (Phase 0 exited with accepted exceptions) and the chain reached G2 — but
wave 1 is blocked on HUMAN-H2, a human procurement pipeline: ≥24 commissioned corpus drafts, two
annotating editors + a senior adjudicator, the A6 human-editor arm, the A1 steelman owner, and
provider no-training terms verified in writing (≈$100k across two quarters, Q-23). Holding all UI
work until that pipeline finishes would strand a working, G1-passed engine for months with no
engineering work available to run in parallel.

## Decision

**G2 + H2 are deferred; Phase-B (beta then full-IDE) implementation proceeds without the eval.**
The standing bars are unchanged and explicit in the gate row:

- G2 stays a **HARD gate before public launch** — the launch cannot proceed until the LIFT
  criterion is met and dispositioned.
- **No §16.4 efficacy/marketing claim ships on any surface until LIFT is met** (REQ-EVAL-19) —
  the claims bar is enforced by copy lint and surface review meanwhile.
- **REQ-EVAL-16's pre-committed consequences apply retroactively** to any UI built meanwhile if a
  later wave fails — UI spend past the deferral is at risk, and the risk is accepted by the
  operator, not hidden.

## Consequences

- **Positive:** ~40 PRs of beta + full-IDE + round-3 work proceeded in parallel with the human
  pipeline instead of serializing behind it; the platform reached prod, real users, and a measured
  cost structure far earlier than the ratified order allowed — which is exactly the evidence the
  2026-09-23 early G3 read (ADR-105) and the 2026-09-30 round-3 amendments ran on.
- **Negative / accepted:** every UI surface built past this point is spend at risk under
  REQ-EVAL-16 if wave 1 later fails; and the demand-side evidence the build collects meanwhile is
  from unscreened self-serve users, not the partner cohort the beta was designed around.

## Alternatives considered

- **Hold the chain at G2 until H2 completes:** rejected — serializes months of human procurement
  ahead of months of engineering the operator is paying for either way.
- **Run a cheaper proxy eval to "satisfy" the gate:** rejected — the LIFT criterion is
  pre-registered (REQ-EVAL-15); a proxy read is not the gate, and calling it one would falsify the
  gate mechanism itself.
- **Proceed to UI but treat G2 as cancelled:** rejected — the gate is a pause, not a block; LIFT
  still gates marketing claims and public launch.

## Revisit trigger

Revisit when (a) the H2 corpus exists and wave 1 can be scored — G2 then reads for real; (b) any
§16.4 marketing/efficacy claim is proposed for any surface — it hard-blocks on LIFT; (c) a wave
fails the criterion — REQ-EVAL-16's consequences (marketing off, premium re-justified, R&D freeze +
operator disposition on a second miss) apply retroactively to UI built meanwhile; or (d) public
launch is proposed — it hard-blocks on a met, dispositioned LIFT.
