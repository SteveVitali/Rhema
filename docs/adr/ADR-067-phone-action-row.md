# ADR-067: The phone action row keeps `<a>` elements styled as ≥44-px button controls — no overflow menu

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-MOBILE-3 (amended), REQ-SPEC-20, REQ-IDE-42 (WCAG 2.5.8)
- **Spec:** §10.1

## Context
At phone width the project page's action row was wrapped, underlined text links — mostly <32-px
targets (PR-U7). §10.1 keeps the phone capability split (no run start, import, export, or new
project), so at phone width the row's only survivor is the reader navigation (`data-edit-source`).
The ticket owns the pattern: button row vs overflow menu.

## Decision
A button row — the surviving navigations stay `<a>` (they are navigations, not actions, so the
anchor stays the correct element) styled by `.ide-actions a` as bordered controls: ≥44×44 px at
<768 px with `var(--s3)` gap for mis-tap spacing, ≥24×24 px at every other width. The same phone
floor lands on the remaining §10.1 inputs a reader can still take — `[data-gate-actions] button`,
`[data-decision-option]`, the compact `.chat-composer` send — and `.ide-phonebar a` becomes a real
≥44-px target. Every `.ide button` gets the WCAG 2.5.8 24-px floor.

## Consequences
Phone taps land on bordered, padded controls instead of raw underlined text; the phonebar's two
links stop being 13-px text. Elements stay semantically honest: navigations are links, submissions
are buttons. The deterministic seam is the generated CSS plus the SSR markup (`class="ide-actions"`),
and P1 measures rendered geometry on prod.

## Alternatives considered
- Overflow (⋯) menu: the phone row holds one surviving navigation after the §10.1 split — a menu
  hides a single link behind a tap for no benefit.
- Convert the links to `<button>`: they navigate; mis-typing semantics to satisfy a visual
  convention would break middle-click/screen-reader expectations.

## Revisit trigger
§10.1 gains more phone-legal actions (3+ surviving items), or a design system replaces the ad-hoc
bordered-control style — then a real menu/button component supersedes this.
