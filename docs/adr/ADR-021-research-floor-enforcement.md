# ADR-021: The research floor — a reserved verification share enforced at the proxy

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.1
- **Requirement ids:** REQ-SPEC-31(2), REQ-SPEC-11, REQ-VIS-9
- **Spec:** §7.1/§12.4 (the run's web-research bound; phase-class policy)

## Context

The 2026-09-30 Quick/Base Review (PR-Q1) exposed two starvation modes. First, an earlier phase
(or a subagent inside one) could consume the run's entire `searchBudget`/`fetchBudget` before the
verification phases ran — the per-request admission check saw the same generous remainder for every
concurrent request, so N parallel research requests could each be granted the full remaining budget
before any response was committed. Second, nothing distinguished a judge-class browse from the
verification pass the budget exists to serve: phases share one run-level envelope, so the first
consumer wins.

## Decision

Two mechanisms, both enforced at the egress proxy — the single point every model request crosses,
and the meter of record (Manifest #7):

1. **The floor.** `WebToolPolicy` carries `searchFloor`/`fetchFloor`, authored server-side in
   `authorWebToolPolicy`/`authorAssistantWebToolPolicy` (`MIN_RESEARCH_FLOOR` by rigor; the
   `research_burst` assistant bound floors half its source count). At admission, a request that is
   NOT floor-eligible sees `budget − floor − used` as its usable allowance; floor-eligible traffic
   (`phaseClass` `research` or `preflight`) draws the full remainder. When the floor would exceed
   the budget the policy clamps it (`floor ≤ budget`) rather than starving the run entirely.
2. **Reservations.** `ResearchUsageTracker` grants an in-flight reservation of `max_uses` per kind
   at admission, so N concurrent requests divide the remainder instead of each seeing all of it.
   The grant releases when the response meters (success), on a forward/stream failure, or on a
   terminal exception — and expires after `RESEARCH_GRANT_TTL_MS` (10 min) so a wedged request can
   never starve the floor permanently.

Phase identity is trusted ONLY from the harness: the run-task credential injector stamps
`x-rhema-phase-class` from the server-authored phase manifest on every forwarded request, and
drops any agent-supplied copy (`DROP_REQUEST_HEADERS`); the proxy keeps the header in
`NEVER_FORWARD` so it never reaches the provider. A missing or unrecognised class is not
floor-eligible — fail-safe toward preserving verification capacity.

## Consequences

- A Quick/Base review always keeps ≥`MIN_RESEARCH_FLOOR` searches/fetches for its research phases,
  regardless of what earlier phases or subagents consumed.
- The floor is capacity, not a spend side-channel: floor-eligible traffic still meters normally and
  still counts against `capCredits`.
- Preflight probes ride a `preflight` class that bypasses the remaining-budget bound (a
  budget-exhausted resume must still re-prove its pairs); each probe declares `max_uses: 1`, so the
  bypass can never burn more than one bounded call per pair.
- Reservations add bookkeeping at the proxy; expiry bounds the blast radius of a wedged stream.

## Alternatives considered

- **Server-side scheduling** (hold phases until enough budget remains) — rejected: the proxy already
  owns admission, metering, and tool injection; a second enforcer would double the failure modes and
  could not see in-flight reservations.
- **Separate budgets per phase** — rejected: phases legitimately share the run envelope; only the
  verification share needs protection, and only at request-admission granularity.
- **No floor, rely on ordering** — rejected: ordering does not bound parallel subagent consumption,
  which was the incident's second starvation mode.

## Revisit trigger

Revisit if verification legitimately needs more than the floor (raise `MIN_RESEARCH_FLOOR` or make
it rigor-scaled), or if a workflow needs more than two eligibility classes (generalise `phaseClass`
policy into the phase manifest).
