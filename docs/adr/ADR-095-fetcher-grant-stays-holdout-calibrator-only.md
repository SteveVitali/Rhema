# ADR-095: The client fetcher grant stays holdout-calibrator-only — server-side fetch serves review

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-ARCH-21
- **Spec:** §12.5, §12.6

## Context

D-STB.5b-3: the D-PRB.02-3 verify line assumed a Full-board review's Editor fetch rides
`fetchViaFetcher` in the fetcher service. In fact the `fetcher` tool is granted only to
`holdout-calibrator` and only after its prediction file is written
(`packages/engine/src/scoped-subagent.ts:196-200`); a review's Editor fetch uses the model's
server-side `web_fetch`, which transits the egress proxy (URL policy enforced,
`kind='fetch'` `fetch_log` attribution). The BL-18a leg is unreachable by construction on a
review run.

## Decision

Keep the grant as-is. The narrow `holdout-calibrator`-post-prediction grant is the intended
§12.6 least-privilege surface — the calibrator's fetches are the ones that must not leak the
prediction into scope. Review-side fetches already satisfy REQ-ARCH-21's controls through the
server-side path (policy + attribution are the PROVEN half of B18A); widening the scoped-seat
tool grant adds injection surface without adding a control the server path lacks.

## Consequences

- BL-18a's "through `fetchViaFetcher`" phrasing is moot for reviews — the equivalent live leg is
  a `profile_voice` run reaching its holdout-calibrator (paid-gated → D-CAP.2-1's window).
- REQ-ARCH-21 stays PARTIAL on the unreachable half; the decision is consciously accepted here.

## Alternatives considered

- Grant `fetcher` to review/Editor roles: enlarges the injection surface for zero new control;
  rejected.
- Route review fetches through the fetcher service anyway: duplicates the egress-proxy controls
  on a second path; rejected.

## Revisit trigger

Reopen if the server-side `web_fetch` path loses egress-proxy coverage (provider change), or if
the holdout protocol needs more clients — revisit the grant surface as a whole.
