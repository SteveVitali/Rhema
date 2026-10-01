# ADR-026: The *Unverified* forcing flag is test-tenant-only and budget-shaped

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.2
- **Requirement ids:** REQ-SPEC-31(3), REQ-SPEC-30, REQ-PROD-6
- **Spec:** §13.5 (Stage B), §12.8 (research bound), Appendix A.9

## Context

Stage B needs a deterministic zero-coverage Review on demand — the whole point of the ticket is a
path that only fires when research fetches nothing, which cannot be scheduled organically. The
forcing had to be provably unreachable for non-test tenants (the ticket's owned decision), and had
to produce a run that still flows through the real delivery path — the harness runs, preflight
passes, delivery classifies — rather than a database edit.

## Decision

`inputs.force_unverified === true` is honored **only when `workspaces.is_test` is true** (the 0046
flag, never client-settable). `handleRunStart` then authors the run's `webTools` bound as
`{search: true, fetch: true, searchBudget: 0, fetchBudget: 0, searchFloor: 0, fetchFloor: 0}` — the
tools are admitted but every metered call is already past its budget, so no fetch row can ever land
and the post-strip coverage reads zero. Forcing sits **downstream of RES.1's preflight**: the probe
request is still stamped `bypassBudget`, so the preflight contract is exercised exactly as a
production run would be — the flag starves the research phases, not the health check. For a
non-test tenant the input is inert (the bound is the ordinary claim-scaled one); the check reads
the workspace row inside the tenant transaction, so a forged `inputs` blob cannot reach it.

## Consequences

- Stage B exercises the real path end-to-end: real run, real preflight, real delivery, real
  classification, real settlement — the label is observed where prod emits it.
- The flag cannot leak: `workspaces.is_test` is set only by migration/test fixtures and is not
  writable through any run input; `run-jobs.test.ts` covers both polarities (test workspace →
  budgets zeroed; non-test → the flag is ignored and the ordinary bound stands).
- Research floor bookkeeping stays honest: floors zeroed alongside budgets, so the floor-enforcement
  leg does not fabricate a floor violation on a forced run.

## Alternatives considered

- **A `run.start`-time DB flag or a `runs.inputs` operator write** — rejected: mutable after
  admission, and an operator column needs a migration + audit path for what is a test fixture.
- **Skipping preflight when forcing** — rejected: the flag would mask a RES.1 regression on the same
  surface it exists to validate; forcing must be downstream of it.
- **A proxy-side `deny-all` rule keyed on the run** — rejected: a proxy config path reachable from
  run inputs is a larger surface than an is_test-gated budget bound, and a deny storms the
  `denied_attempt` counters the access report reads.

## Revisit trigger

Revisit if a second forcing flag lands (the is_test gate becomes a shared input-shaping hook) or if
research floors move out of the `webTools` bound (the forced shape must zero whatever starves
fetches, wherever it lives).
