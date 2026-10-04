# ADR-097: Deep-link layout restore is per-user client state — the SSR leg carries the anchor + context, not the layout

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-IDE-1
- **Spec:** §4.2

## Context

D-CAP.1-1: REQ-IDE-1's second clause — "every deep link restores the surrounding layout/context"
— had no verifying leg; the D-CAP.2 assessments found the carrier (T15) is `paid:true` and
spend-gated. CAP.3 needed to decide WHERE the layout context lives to know what a deterministic
test can prove.

## Decision

Layout state (pane/region visibility, rail state) is per-user×project client state persisted via
`paneStorageKey` in `apps/web/src/client/ide.ts` + `packages/ide/src/{state,layout}.ts` — it is
deliberately NOT URL state (a link sharer's layout shouldn't be forced on the recipient).
Consequently the deterministic half of the clause is: a deep link (`?focus=1`, `#finding-<id>`)
lands on the IDE host carrying the model context + the anchor in SSR markup; the client then
restores its own stored layout on top. `server.test.ts` asserts exactly that seam. The residual
live walk (a browser asserting restored layout around the anchor) rides D-CAP.2-2's suite.

## Consequences

- REQ-IDE-1's clause is decomposable: context+anchor in SSR (proven) × client layout restore
  (implemented, live-walked owed) — PARTIAL with the leg named, not a vague "unverified".
- Deep links never need to serialize layout — the share story stays clean.

## Alternatives considered

- Encode layout in the deep-link URL: forces the sharer's layout on recipients and bloats URLs;
  rejected.
- Persist layout server-side per user: overkill for a client preference; localStorage is the
  documented seam.

## Revisit trigger

Reopen if sharing semantics change (deep links meant to carry the sharer's exact view) or the
client gains multiple named layouts.
