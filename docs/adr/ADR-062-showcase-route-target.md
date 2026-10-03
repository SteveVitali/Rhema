# ADR-062: `/showcase` — signed-out visitors get the static sample dossier; signed-in viewers resolve to their own Showcase

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-GROWTH-11, REQ-SPEC-30 (manifest invariant 13)
- **Spec:** §15.3–15.4

## Context
The landing names the Showcase but `/showcase` 404ed. The route needed a target for both audiences:
a signed-out stranger (who has no Showcase project) and a signed-in user (whose workspace seeds one).
Invariant 13 — the route may only ever show the viewer's own Showcase — makes the signed-in leg a
session-bound resolution, and a signed-out leg can never call the session-authenticated `GET
/showcase` API.

## Decision
`/showcase` is a public route in the manifest. Signed-out requests render `ShowcasePage` — the
static, read-only `SAMPLE_DOSSIER` through the same `DossierView` the landing embeds — with public
metadata (`Showcase · Rhēma`). Signed-in requests ask the data source for the workspace's Showcase
entry (`getShowcaseEntry`) and 302 onto the real dossier when a review run exists, onto the project
page when it doesn't yet, or fall back to the same static sample page (with app-flavored chrome) for
accounts with no Showcase. No signed-out path depends on the authenticated API, so the page is fast,
cacheable, and can never leak another tenant's project.

## Consequences
`REQ-GROWTH-11` (the Showcase is reachable) holds from the landing's own links; the route's two legs
are separated at the server, not by client state. A signed-in user without a Showcase still gets a
real page rather than a 404.

## Alternatives considered
- Rendering the signed-in Showcase inline on `/showcase`: rejected — the dossier's canonical URL is
  `/p/<slug>/review/<run>`; redirecting keeps deep links, the read-only guard, and `?gate=` handling
  on the artifact page.
- A signed-out call into `GET /showcase` with a seeded "public" project: rejected — an unauthenticated
  read of a tenant resource, and the sample dossier already exists for exactly this surface.

## Revisit trigger
H5 (Showcase content sign-off) or a per-account Showcase revocation — the `getShowcaseEntry` seam
already returns "none" and the fallback is the static sample.
