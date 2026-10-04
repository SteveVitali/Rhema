# ADR-102: Phone-width web carries the gate/disposition/chat inputs — the app banner waits for the app — retro-fitted record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-MOBILE-3
- **Spec:** §10.3 (amended)

## Context

REQ-MOBILE-3 was written against the mobile-app shape. The SPEC.20-era amendment kept the MVP
phone path on phone-width web: gates, dispositions and chat inputs are all interactive at <768px
(the P1/R4 journey legs walk them green); the "install the app" banner is a 1.x concern. The
matrix is MET-DIFFERENTLY; this retro-fits the record.

## Decision

Phone users get the full action surface on the responsive web app — touch-target correctness is
enforced by the P1 journey (≥44px controls; the CAP.3 fix at `ide-css.ts` restored the phone
action-row rule that a CSS source-order bug had killed — D-CAP.2-3). The native-app banner is
deferred with the app itself.

## Consequences

- No phone user is read-only; the mobile clause is satisfied on the web surface it was amended
  to.
- Phone control sizing is journey-asserted, so regressions fail a gate, not a manual check.

## Alternatives considered

- Ship a banner for a nonexistent app: dead UI; rejected.
- Read-only phone web: violates the disposition/chat obligations; rejected.

## Revisit trigger

Reopen when the mobile app lands (the banner returns), or if phone-width usage shows input
patterns the web surface handles poorly.
