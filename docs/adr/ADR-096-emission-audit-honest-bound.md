# ADR-096: The emission audit's honest bound — uncatalogued emissions fail structurally; silent surfaces stay a live leg

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-BETA-5
- **Spec:** §17.3

## Context

D-CAP.1-2: REQ-BETA-5's "every surface emits" clause was unverifiable — the emission audit
compared a hand-written `BETA_EMITTED_EVENTS` set against `ANALYTICS_EVENT_NAMES`, so a NEW
instrumented event missing from the audit's own list would silently pass (the CAP.2 legs verified
the catalogue side: all 37 prod event names classified; the residual was the uninstrumented
surface half).

## Decision

Two complementary closures, honestly bounded: (a) a **reverse sweep** test in
`emission-audit.test.ts` scans every emission idiom in the source tree — the web
`emit(session, "x.y")` sink, api `recordAnalyticsEvent({event:"x.y"})` mints, client beacon
`event:"x.y"` payloads — and asserts each emitted literal is catalogued in
`ANALYTICS_EVENT_NAMES` AND classified in `BETA_EMISSION_AUDIT` (an emitter naming an
uncatalogued event would write a row the audit never classifies — the intake 403s it, a
silent drop; the stream cannot see what never landed). The "audit blind to its own gaps"
class is closed by walking the source, not the stream; (b) the zero-uninstrumented-SURFACE
half (a leg exercising every surface asserting nothing stays silent) is recorded as a live
obligation — a surface that emits nothing leaves no trace, and only a driven surface set can
find it (D-CAP.1-2, PARTIAL).

## Consequences

- The audit can no longer pass while an emitted event is uncatalogued — the defect class CAP.2
  found is structurally removed.
- The remaining claim is narrower and explicitly owed: REQ-BETA-5's "every surface" needs the
  exercised-surface leg, not more audit machinery.

## Alternatives considered

- Instrument a client-side "surface rendered" beacon per surface: heavy; the live leg is cheaper
  and was already the AC's shape.
- Mark REQ-BETA-5 MET on the catalogue sweep: overclaims — silent surfaces are the clause's
  whole point.

## Revisit trigger

Reopen when the post-deploy suite (D-CAP.2-2) can run a full exercised-surface leg, or when a new
surface class lands without an event contract.
