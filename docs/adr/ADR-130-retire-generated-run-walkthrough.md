# ADR-130: Retire the generated run walkthrough — the run card is composed from the delivered record

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **213 R7COPY.0**.
- **Requirement ids:** REQ-IDE-19 (amended), REQ-COPY-4, REQ-SPEC-32/REQ-ECON-* (COGS posture,
  unchanged), DS §5.5 D20 / §5.6 (amended)
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-130 bullets), §4.13 REQ-COPY-4;
  `GD-UX-WALKTHROUGH.R7`; `packages/orchestrator/AGENTS.md` (read before changing the harness)

## Context

The operator ruled **"Retire it"** (GD-UX-WALKTHROUGH.R7): the generated run summary is
factually wrong and leaks internals (R5 C3 — the Showcase run card contradicted the same
screen's ledger). Spec §3.2: this ADR amends **REQ-IDE-19** and DS §5.5 D20 / §5.6; the
`run.walkthrough` model call (`packages/orchestrator/src/walkthrough.ts`,
`apps/worker/src/walkthrough-generator.ts`) is removed; the run card is composed
deterministically from the delivered record (REQ-COPY-4). COGS falls by one model call per
run, and no money mode changes.

## Decision

_(Shell — written by R7OPEN.1 from spec §3.2. 213 R7COPY.0 fills the decision: the
record-composed card's exact fields, the removal boundary for the walkthrough call path, and
how stored historical walkthrough text stops rendering.)_

## Consequences

_(Filled by the owner: one fewer model call per run (COGS drop, no money-mode change), the
replayed-run card reuses the same composition (REQ-DWEB-15), historical cards' rendering.)_

## Alternatives considered

_(Filled by the owner: keep the call behind a flag; regenerate walkthroughs with a stricter
prompt; compose from the record (chosen).)_

## Revisit trigger

A reviewer-facing need for generated prose returns (a new, verified-accuracy pipeline would be
a new ADR), or REQ-IDE-19 is amended again.
