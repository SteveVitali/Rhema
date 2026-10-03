# ADR-068: axe-core is the WCAG 2.2 AA checker — injected by the journeys harness, MPL-2.0 exception checked in

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.2
- **Requirement ids:** REQ-IDE-42, REQ-ARCH-40
- **Spec:** §5.9 (accessibility)

## Context
The ticket requires a WCAG 2.2 AA pass — by an automated checker, not manual review alone — on every
touched surface in the P1 journey's phone and desktop legs. axe-core is the de-facto deterministic
checker; it is MPL-2.0, which is not on `licenses.allowlist.json`, so it needs either a checked-in
exception with rationale or a permissively licensed alternative.

## Decision
`axe-core` is a dependency of `@rhema/journeys` only. P1 injects the prebuilt UMD source
(`axeCore.source`) via `page.addScriptTag` and runs `axe.run` restricted to the WCAG AA tag set
(`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`); every violation fails the step with rule
ids and targets — no severity floor, no silently disabled rules. The licence disposition is a
`licenses.exceptions.json` entry: MPL-2.0 is weak copyleft; the package is used unmodified, as dev
tooling executed inside Playwright's page context — never shipped in a client bundle, server image,
or published artifact.

## Consequences
Every nightly journey run re-verifies AA on the touched surfaces (the check is deterministic and
version-pinned, not a one-off audit); a11y regressions become journey failures. The exception file
grows one reviewed entry; `pnpm check:licenses` stays green. Findings a checker cannot see (reading
order, meaning of names) are recorded in the run ledger per the ticket.

## Alternatives considered
- A permissive alternative (e.g. a home-grown audit): a real checker is the point; a bespoke audit
  re-implements axe's rule corpus poorly.
- Lighthouse/`@axe-core/playwright`: the Playwright wrapper adds a transitive surface for a
  one-line `addScriptTag` integration; the bare package is the minimal dependency.
- WAVE/Tenon-hosted services: non-deterministic and network-dependent — unusable as a gate.

## Revisit trigger
Axe's licence changes, a violation class it cannot express becomes required (then a second tool or
targeted assertions join it), or the harness needs results in CI without a browser context.
