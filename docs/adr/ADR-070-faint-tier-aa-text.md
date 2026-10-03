# ADR-070: `--shell-fg-faint` is a text tier — retuned to AA (≥4.5:1) on every ground

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-IDE-42
- **Spec:** §5.9 (palette; spec-verbatim value amended)

## Context
The spec's palette carried `--shell-fg-faint` as a de-emphasis tier — and the design tests held it
to the ≥3:1 *non-text mark* bar. But the tier is in fact used for real text everywhere: footers,
meta lines, spend captions, gate-card notes (40+ sites at 11–13 px). axe's WCAG-AA pass on the
touched surfaces flagged it (`footer > span` on /pricing — #5f6873 on #0f1114 is ~3.3:1 vs the
4.5:1 AA text bar). Fixing forty call sites would fork the tier's meaning; the token is the single
point of truth, so the token moves.

## Decision
Retune the faint tier to clear AA for normal text on every ground it sits on, preserving the
faint < muted < fg hierarchy: dark `#5f6873 → #868d97` (5.65 bg / 5.22 surface / 4.78 raised),
light `#7a828f → #646b74` (5.03 / 5.30 / 4.81), paper-scope dark `#7d7870 → #9a948a` (5.98 on the
sheet, 5.41 on its lift), paper-scope light `#8a8274 → #6d6659` (5.59 / 5.08). The contrast test
moves the faint tier out of the ≥3:1 marks list into a ≥4.5:1 text assertion across all grounds and
both pinned-paper scopes — the spec-verbatim anchor is amended, per this ticket's deviation license.

## Consequences
Every faint-text site becomes AA-legal at once; the palette keeps a visibly quieter third tier.
"The spec palette is verbatim" stops being strictly true — contrast tests now define the floor and
the spec's hue/tiering intent is what survives. Text that is genuinely decorative-only can still sit
below AA, but no shipped text does.

## Alternatives considered
- Change call sites to `--shell-fg-muted`: 40+ edits, blurs the tier hierarchy, and every future
  faint-text use reintroduces the violation — the token was wrong, not the callers.
- Disposition the axe findings as acceptable: they are real text at real sizes — WCAG has no "we
  meant it subtle" exemption.

## Revisit trigger
A redesigned type ramp that makes the faint tier genuinely decorative (non-text) — then the test
can move back to the marks bar and the palette can darken again.
