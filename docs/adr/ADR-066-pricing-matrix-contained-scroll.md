# ADR-066: The pricing matrix scrolls inside a labelled, keyboard-focusable region — the page never scrolls sideways

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-MOBILE-3 (amended), REQ-IDE-42
- **Spec:** §10.1, §15 (pricing page), WCAG 1.4.10

## Context
At 390 CSS px the comparison matrix put ~535 px of `<table>` in the viewport: the whole page
scrolled horizontally, clipping the header (PR-U6). The ticket owns the choice between restacking
the matrix per plan at phone width and containing the scroll inside the table's own region. WCAG
1.4.10 exempts data tables from the no-horizontal-scroll rule — the table may scroll, the page may
not.

## Decision
Contained scroll. The matrix keeps its semantic `<table>` (row↔column mapping intact for screen
readers) inside `<div class="table-scroll" role="region" aria-label tabindex="0">` with
`overflow-x: auto`; the table pins `min-width: 560px` so the region — never the page — absorbs the
extra width at both 390 and 320 px. `tabindex="0"` makes the region keyboard-scrollable (axe's
`scrollable-region-focusable`) and `aria-label` names it with the existing matrix heading — no
second copy.

## Consequences
The page's `scrollWidth ≤ viewport` at every tested width; keyboard users can focus and arrow-scroll
the matrix; the table's header row stays column-aligned under scroll. ACT.1's content ownership is
untouched — the change is a wrapper and two styles.

## Alternatives considered
- Restack per plan at phone width (card-per-plan): destroys the matrix's comparison semantics — the
  whole point of the table is row↔column alignment; rebuilding that accessibly costs a second
  markup model for the same data.
- CSS `table-layout` shrink / smaller type: unreadable below the matrix's natural width and still
  clips columns.

## Revisit trigger
A matrix that grows past ~6 columns, or a plan-comparison UX that replaces the table — then the
restack question reopens on its own merits.
