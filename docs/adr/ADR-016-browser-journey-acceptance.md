# ADR-016: Browser-journey acceptance — a user surface is verified by walking it

- **Status:** Accepted
- **Date:** 2026-09-30
- **Ticket:** JOURNEY.1 (owner); every later round-3 Stage B consumes it
- **Requirement ids:** REQ-SPEC-29 (new), REQ-ARCH-39
- **Spec:** §13.5 (amended 2026-09-30), §13.2; Appendix A.9

> **Amended 2026-09-30 (operator):** the weekly paid journey is capped at **$5** (round-3 D6 revised: hard ≤ $200, target ≤ $100).

## Context

Rounds 1–2 verified user surfaces through unit and integration tests plus "headless batteries": HTTP 200s and DOM
markers asserted with a session token lifted from the prod database. The 2026-09-30 browser review showed what
that misses. None of the following had a test that could fail:
- a built client bundle (`page.js`) was never routed
- dossiers 500 on a data shape the tests' fixtures lack
- a chat Send button sits under the status bar
- the project list looks empty
- the trial claim is not honoured
- the purchase redirect is blocked by the site's own CSP

## Decision

- **The suite.** A committed Playwright journey suite (`packages/journeys`, owned by JOURNEY.1) walks the product
  as users do: the new-visitor, returning-user and phone-width journeys named in REQ-SPEC-29.
- **Assertions.** They are on visible text and on actionable controls: visible, enabled and unobscured at click
  time. HTTP status alone is never enough, and screenshots are committed as evidence.
- **When it runs.**
  - It is the acceptance evidence of every Stage B that touches a user surface.
  - It runs nightly against prod with $0 legs only (no paid run).
  - It runs weekly with one paid journey, capped at $10 (D6).
- **CI checks.** CI fails when a built client bundle has no served route. A ticket's close records that the
  deployed provenance equals its chain-tip SHA.
- **Test identities.** The journey's test users are ordinary accounts flagged as test users. How a journey
  obtains their sessions is JOURNEY.1's owned decision, recorded in its own ADR, under these constraints:
  - never lift a real user's session
  - no credential in the repo or the ledger
  - the magic-link email leg is asserted at least once per run
  - the mechanism cannot mint a session for a non-test user

## Consequences

- Later tickets' Stage B cost more wall-clock time, but a green Stage B now means a user can do the thing.
- The journey fixtures (a planted-error essay, the Showcase seed) become the canonical prod-shaped data that
  contract tests reuse (REQ-SPEC-32(b), HOT.1's dossier fix).
- A paid journey costs real inference, so it is weekly and capped.

## Alternatives considered

- **More unit/integration tests per defect.** Necessary but not sufficient; each defect class above lived *between* units.
- **Manual operator click-throughs.** Unreliable cadence, and they were deferred repeatedly in rounds 1–2 (D-P0.01-3, D-P1.19-2).
- **Headless HTTP batteries.** They already existed and passed while the product was broken.

## Revisit trigger

- The suite's flake rate exceeds 5% of runs over a trailing week.
- A user-visible defect reaches prod on a surface a journey covers.
- The weekly paid journey's cost exceeds $10 for two consecutive weeks.
