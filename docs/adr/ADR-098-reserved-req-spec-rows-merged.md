# ADR-098: The reserved REQ-SPEC rows merge into their live targets — retro-fitted record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-SPEC-5, REQ-SPEC-23, REQ-SPEC-26, REQ-SPEC-28
- **Spec:** Appendix A

## Context

The coverage matrix's completeness check requires every spec `REQ-*` id to carry a row. Four
ids exist only as reserved numbers in Appendix A — they were consumed when later rounds restated
or merged the clauses they held: REQ-SPEC-5 → superseded by REQ-ARCH-5 (upstream-diff drift gate);
REQ-SPEC-23 → merged; REQ-SPEC-26 → merged into the seat-table row; REQ-SPEC-28 → merged into
REQ-SPEC-30 (tenant isolation in depth). The matrix recorded them MET-DIFFERENTLY with no ADR —
the ticket rubric requires one per MET-DIFFERENTLY.

## Decision

Record the merges explicitly: each reserved id's clause lives under its named target id; the
reserved rows in the matrix exist for inventory completeness only and carry `routing: none` —
nothing additional is owed for the reserved number itself.

## Consequences

- The completeness check stays exhaustive (474 ids) without double-counting merged clauses.
- Any future re-cut of the spec should renumber rather than resurrect a reserved id.

## Alternatives considered

- Drop the reserved rows: breaks the id-completeness test; rejected.
- Mark them MISSING: they are not missing — their clauses are covered elsewhere; rejected.

## Revisit trigger

Reopen if a spec re-cut reuses these numbers, or if Appendix A gains a formal "reserved/merged"
marker that supersedes the matrix annotation.
