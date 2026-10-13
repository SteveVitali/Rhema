# ADR-059: The build-jargon lint lives in `copy.test.ts` over `collectCopyStrings()` — sanctioned exceptions are enumerated, not broad

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-SPEC-2 (copy half), REQ-PROD-6, REQ-POS-4/5/13
- **Spec:** §4.3, Appendix D.2, §15.1–15.3

## Context
The production design review found internal build vocabulary in user-facing copy: "private beta" on an
open-signup product, "1.x workflow — not yet available" disabled reasons, "the fixture the Showcase
ships", "Phase 1" changelog notes, "lands here"/"later pass" promises. The table of every user-facing
chrome string already exists (`COPY` + `collectCopyStrings()`), and `lintCopy` already enforces
Appendix D.2 over it — but the banned list there is vocabulary-synonym linting (tiers, seats, plans),
not the roadmap/fixture jargon the review flagged. The ticket lists the terms: "fixture", "Phase 1",
"1.x", "later pass", "lands here", and "private beta" (under open). Two things needed deciding: where
the lint lives, and what counts as a sanctioned exception.

## Decision
The jargon lint lives in `apps/web/src/copy.test.ts` as a dedicated describe over
`collectCopyStrings()` — every user-facing chrome string is a leaf of `COPY`, so scanning the table
scans every surface that renders from it (pages, marketing, settings). The term list is the ticket's:
`fixture`, `1.x`, `later pass`, `lands here`, `phase <n>`, `beta`, `coming soon`. Sanctioned
exceptions are an explicit key set — `invite.heading` and `login.note` keep closed-program wording
because under `signupMode === "invite"` it is literally true; the open-mode alternates
(`headingOpen`, `accessNoteOpen`, `noteOpen`, `signInCtaOpen`) exist so mode-true rendering never
falls back to them. The non-COPY surfaces are pinned separately: `commands.test.ts` asserts every
`phase:"one_x"` `disabledReason` says "isn't available yet" and contains no "1.x";
`render.test.tsx`/`server.test.ts` cover rendered documents.

Two canonical-vocabulary allowances are recorded, not removed: the system seat's display name is
`Rhema` (no macron — `vocab.ts`'s seat table, distinct from the brand `Rhēma`), so email copy that
names the seat ("Rhema is waiting on your call") is canonical, not a brand defect; and
`Unverified` stays reserved for the delivery label per RES.2.

## Consequences
A new build term in `COPY` fails the unit suite before it ships; adding a sanctioned exception
requires editing the test's key set — the review point, not a loophole. Verbs and rendered pages are
covered by their own tests rather than a second copy table.

## Alternatives considered
- Extending `no-banned-strings` (the ESLint rule): rejected — the rule sees source text, not the
  collected leaf strings, and can't distinguish "the code field label" from "beta" used as a mode
  name in internals; the leaf-level lint is exact and sits next to the existing vocabulary test.
- A global regex over rendered HTML for every page: heavier and slower than the leaf lint, and the
  few non-COPY strings are already covered by their component tests.

## Revisit trigger
A user-facing surface that renders strings outside `COPY`/`INBOX_COPY` (a new component-local copy
source) — the lint must then grow a second collection, or the surface must move its strings into a
collected table.
