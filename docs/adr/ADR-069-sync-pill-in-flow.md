# ADR-069: The sync pill renders in flow at the paper's head — `position: fixed` removed

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-IDE-43 (placement amended; EDIT.1's ADR-049 semantics kept)
- **Spec:** §5.10, §10.1

## Context
EDIT.1 (ADR-049) made the Page's `[data-sync-pill]` the ONE autosave indicator — synced / syncing /
offline·queued / read-only, a polite live region, no Save button — but left it `position: fixed;
bottom: 28px; right: 24px`. At phone width it floats over body text (PR-U7); at desktop a fixed
float can collide with the Desk's composer and the status bar. This ticket owns the pill's
placement, not its semantics.

## Decision
The pill renders in normal flow at the paper's head — a right-aligned inline-flex chip in a block
row directly above the banners and the document preview, inside `data-page-root`. All ADR-049
semantics are untouched: same element, same `role="status"`/`aria-live="polite"`, same
`data-label-*` vocabulary the island reads (it finds the pill by attribute — placement-agnostic),
still the only sync indicator. In-flow placement makes overlap structurally impossible; the P1
journey measures it anyway (elementFromPoint + text-rect intersection) so any future positioning
mode is held honest.

## Consequences
No occlusion of body text at any width; the pill is visible before the first scroll rather than
at the viewport edge. The chip now reads as part of the paper's chrome (bordered, `999px` radius)
instead of a floating HUD element — a deliberate visual change. Scrolled-out-of-view is accepted:
the state is not a persistent alert, and the status bar intentionally carries no second indicator.

## Alternatives considered
- Keep fixed, move to the phonebar/status bar: the phonebar is navigation, not status; the status
  bar is `display:none` at phone width — the indicator would vanish exactly where the defect lives.
- `position: sticky`: still an overlay contract — it can cover the content it sticks near during
  scroll; in-flow is simpler and unconditionally clear.
- Keep fixed bottom-right with safe-area insets: the overlap class persists at 320 px and over the
  composer; the review's defect is the float itself.

## Revisit trigger
The Page gains a persistent status channel that must stay on-screen (then the phonebar/status bar
absorbs it as a first-class region), or ADR-049's single-indicator decision is revisited.
