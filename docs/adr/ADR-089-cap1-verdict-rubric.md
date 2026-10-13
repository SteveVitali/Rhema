# ADR-089: CAP.1 coverage verdict rubric — the five-verdict scale and its evidence bars

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.1
- **Requirement ids:** REQ-SPEC-29, REQ-SPEC-31, REQ-SPEC-32
- **Spec:** Appendix A; §13.3

## Context

CAP.1 is the one place the build is judged as a whole: 474 `REQ-*` requirements, one row each in
`docs/build/COVERAGE_MATRIX.csv`. The ticket fixes the column set and the five verdict labels but
leaves the *rule* that maps tree state to a verdict to the auditor. Recording that rule as an ADR
makes the matrix reproducible and lets CAP.2/CAP.3 consume it without re-deriving semantics.

The hard cases the rubric must resolve honestly:

- a requirement that is implemented and unit-tested but whose **user surface has never been
  walked** by a green JOURNEY.1 step (REQ-SPEC-29's own bar);
- requirements the spec itself **schedules to a later phase** (mobile app, working copy, run
  rounds, house styles…) — absent by design, so "MISSING" without context would misread them;
- requirements superseded by an **amendment or ADR** (GCP for AWS, committed `@rhema/protocols`,
  proposal cards for suggestion marks, interim trial terms) — satisfied differently than written;
- capabilities that exist but are **unreachable by construction** (no consumer, too-narrow grant)
  or **broken at the composed seam** though each side passed alone.

## Decision

1. **MET** — implemented in the composed tree *and* pinned by deterministic tests; for a
   user-surface requirement the containing surface must additionally have a `green` registry step
   in `packages/journeys/src/registry.ts` walking it. Unit tests alone never make a user-surface
   claim MET.
2. **MET-DIFFERENTLY** — the requirement's literal mechanism was superseded by a spec amendment
   or landed ADR, and the tree implements the amended form; the row names the ADR/amendment.
3. **PARTIAL** — implemented in part, *or* implemented-but-unverified at the requirement's own
   evidence bar (un-walked surface, owed live leg, in-scope OPEN/PARTIAL deferral row,
   unreachable-by-construction capability).
4. **MISSING** — nothing implements it. Spec-deferred rows are recorded MISSING with `level`
   1.x/Later and `routing: none (spec-deferred)` — the level column, not the verdict, carries
   "not owed yet".
5. **AT-RISK-INTEGRATION** — parts exist and pass, but the composed cross-ticket path is
   demonstrably broken on the live surface today (the T3 export→import seam class).

Supporting columns: `level` is the spec's phasing (MVP/BETA/1.x/Later); `class` ∈ feature /
contract / constraint / slo / gate / human / ops; `routing` names the resolving ticket,
`deferral:D-*` row, H-human leg, gate, or `none`.

## Consequences

- The matrix's PARTIAL mass (113 rows) is dominated by two structural causes — un-walked user
  surfaces (routed to CAP.2) and owed live legs (routed to existing `D-*` rows / CAP.3) — so the
  gap report can route, not just count.
- Every evidence/test path cited in the matrix is mechanically re-verified on disk by
  `scripts/check-coverage-matrix.test.mjs`, and `deferral:`/`journey:` refs must resolve — the
  matrix cannot cite rotting evidence silently.
- Live claims cite only deferral-closed legs or green registry steps, each at a recorded
  provenance; the rubric forbids inferring deployment from tests. Journey greens are read as
  "proven at a prior deployed SHA", never "the chain tip is proven" — composed re-verification at
  a merged SHA is CAP.2's, not CAP.1's.
- This ADR may be amended by a later capstone ticket; it is not a claim that the rubric is the
  only defensible one — only that it is the one this matrix used, recorded before reconciliation.

## Revisit trigger

Reopen when (a) CAP.2's composed re-verification lands — verdicts that were PARTIAL solely for the
journey-walk bar should be re-scored against real journey coverage and the rubric tightened or
relaxed accordingly; (b) a new verdict class is needed (e.g. "verified-at-prior-provenance" if the
deployed-vs-tip distinction needs a first-class label); or (c) the requirement inventory changes
shape (new families, a spec re-cut) such that the completeness test's regex or the level vocabulary
no longer covers the spec's phasing.
