# ADR-065: `/app/new` renders in the workspace `Shell`, not the IDE frame — and rendered `.ide` markup is document ground truth

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-IDE-8, REQ-SPEC-20
- **Spec:** §5.1, §5.3, §10.1

## Context
The review's PR-U5 screenshot showed `/app/new` as a stacked, unstyled IDE shell. Root cause:
`NewProjectPage` wrapped itself in `IdeFrame` while `renderNewProject` never set `PageData.ide`, so
`renderDocument` emitted neither the IDE stylesheet nor the `ide.js` island. The ticket owns the
decision whether `/app/new` — a workspace-level sheet under §5.3 with no project yet — belongs in
the IDE frame at all.

## Decision
`/app/new` renders in the workspace `Shell` (the flat chrome every other non-IDE sheet uses:
header, centred column, footer), on both phone and desktop — phone keeps the §10.1 blocked note,
never the form. The IDE frame is project chrome: its seven regions (rail, Files, Margin, Timeline,
Desk, status bar, phone bar) are all per-project surfaces, and mounting them for a sheet with no
project was what produced the broken render in the first place.

As the guard, `renderDocument` now treats rendered markup carrying `data-ide="1"` as an IDE document
whether or not the handler remembered `PageData.ide`: a frame without its stylesheet can never ship
again. The `ide-surfaces` route-enumeration test renders every route manifest element and fails if
a document emits `.ide` without `IDE_CSS`/`ide.js` — so the belt-and-braces rescue is asserted, and
a route that forgets `ide` renders styled-but-inert instead of broken.

## Consequences
`/app/new` gets real chrome (header, one `<h1>`, the three entry cards) at both widths for free;
the unstyled-shell defect class is closed by the enumeration test, not by convention. The phone leg
keeps the §10.1 capability boundary untouched. A route that renders `IdeFrame` markup but forgets
`PageData.ide` gets the stylesheet + island yet still misses per-route `ide` payloads — acceptable:
it renders styled, and the invariant test keeps the audit honest.

## Alternatives considered
- Keep `IdeFrame` and set `PageData.ide` on the route: renders a project chrome around a
  project-less sheet — the rail/Files/Margin would show placeholders for a project that does not
  exist; rejected on information architecture, not just styling.
- Fix only the handler, no markup-truth rescue: leaves the defect class open for the next route
  that forgets; the invariant belongs in the renderer.

## Revisit trigger
§5.3's new-project flow becomes a per-project surface (e.g. creating inside a workspace context that
already carries a project), or the workspace `Shell` and `IdeShell` are unified into one chrome —
then this split reopens.
