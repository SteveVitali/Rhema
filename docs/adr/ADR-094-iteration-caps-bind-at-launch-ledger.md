# ADR-094: Audit/gap-check iteration caps are enforced at the launch ledger

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-DATA-20
- **Spec:** §8.6

## Context

D-STB.5b-2: `ITERATION_CAPS = { audit: 3, gapCheck: 3, replan: 2 }` was declared in
`packages/mirror/src/attestation.ts` but only `replan` had a consumer (the orchestrator back-edge).
The audit/gap-check caps were inert — no run shape could produce the (cap+1)-th iteration the
BL-17a AC describes.

## Decision

The durable enforcement point is `recordSubagentLaunch` — every scoped iteration is a
`subagent_launches` row, so the ledger is the chokepoint. `SCOPED_LABEL_CAPS` maps
`fidelity-auditor → ITERATION_CAPS.audit`, `gap-analyst → ITERATION_CAPS.gapCheck`; on the
(cap+1)-th launch of a capped role within the same run the function throws `IterationCapError`
before inserting. Counting is per-run; uncapped roles are unaffected.

## Consequences

- The caps are consumed at the boundary where launches actually happen — an orchestrator that
  stops calling `recordSubagentLaunch` stops launching; no parallel bookkeeping can drift.
- `IterationCapError` propagates to the caller; the run's attestation records the refusal.
- Residual: the AC's `completed_partial` step-state shape remains a product decision
  (D-CAP.3-2) — the cap fires, but no step state records why the run ended.

## Alternatives considered

- Enforce inside the phase loop's reaction path (like `replan`): the loop only sees completed
  phases; launches happen earlier — the ledger sees every attempt.
- Amend the backlog AC to only `replan`: hides a declared-but-invariant constant; rejected.

## Revisit trigger

Reopen when D-CAP.3-2 lands (step-state semantics may move the observation point), or if
iteration shapes change such that one run launches mixed capped roles sharing a budget.
