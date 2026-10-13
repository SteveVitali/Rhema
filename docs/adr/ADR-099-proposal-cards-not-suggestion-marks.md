# ADR-099: MVP editor collaboration is proposal cards, not in-document suggestion marks — retro-fitted record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-DATA-28, REQ-IDE-45
- **Spec:** §8.6 (amended)

## Context

The original REQ-DATA-28 row called for tracked-change/suggestion-mark semantics inside the Yjs
document. The amendment (review-13 F24) chose a lighter MVP shape: the editor renders proposal
cards (`packages/editor/src/proposal.ts`, `apps/collab/src/extension.ts`); true Yjs txn
suggestion marks were deferred to 1.x. The matrix carries REQ-DATA-28 MET-DIFFERENTLY; this ADR
retro-records the decision.

## Decision

MVP ships proposal cards as the collaborative-edit surface; suggestion marks (per-change tracked
edits inside the document stream) are a 1.x capability. Cards carry the same approval semantics
the clause requires — the change is the presentation/mechanism, not the gating.

## Consequences

- REQ-DATA-28's MVP evidence is the proposal-card path + its tests; the suggestion-mark depth is
  level-stamped 1.x, not owed now.
- The editable-head/dirty-sync ADRs (ADR-048, ADR-049) stand — this ADR covers only the
  suggestion-mode substitution.

## Alternatives considered

- Ship suggestion marks at MVP: larger surface, more collab-extension risk; deferred.
- Drop the clause entirely: the proposal-card path preserves the approval semantics; a drop
  would lose the collaboration story.

## Revisit trigger

Reopen when 1.x collaboration scope is planned, or users demonstrate a need for in-document
granularity the cards don't carry.
