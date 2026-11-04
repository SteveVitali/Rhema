# ADR-126: The public demo serves static snapshots through `demoDataSource` — no session, no tenant, one sanctioned write

- **Status:** Proposed
- **Date:** 2026-11-03
- **Ticket:** R7OPEN.1 (shell); filled and accepted by **220 R7DEM.4**. The S-1 URL-spike outcome
  (rewrite or 302 fallback) is recorded here by **220a R7DEM.4b**; the REQ-TOUR-9 metrics
  carve-out section is **223 R7DEM.6b**'s.
- **Requirement ids:** REQ-DWEB-1…17, REQ-TOUR-9, REQ-DACC-3, REQ-CORPUS-14
- **Spec:** `docs/round-7-draft-spec.md` §3.2 (ADR-126 bullets), §4.3, §4.4 REQ-TOUR-9, S-1/S-3/S-13/S-14

## Context

The round-7 demo puts four real essays' editorial records in front of anonymous visitors
(GD-DEMO-*.R7 rulings, spec §3.1). The spec decides the architecture by reference: **static
snapshots, served by `demoDataSource`; a reserved `demo~<essay>` slug namespace behind public
`/demo/<essay>` URLs; no session and no tenant; no DB or API reads on any demo path; one
sanctioned write — the anonymous metrics carve-out (REQ-TOUR-9), the only demo non-GET, through
its own insert-only role.** The demo is a separate concept from the Showcase
(GD-DEMO-SHOWCASE.R7). This ADR also amends **REQ-ED-12/ADR-108** so demo Pages render SPA
read-only on every device class. Related: ADR-062/ADR-108 (showcase route / forced SSR),
ADR-121 (authored-bundle honesty).

## Decision

_(Shell — written by R7OPEN.1 from spec §3.2. The owning tickets fill the decision text: 220
R7DEM.4 the serving architecture and guard semantics; 220a R7DEM.4b the S-1 URL-spike outcome —
`/demo/<essay>` URL rewrite vs the `/p/demo~<essay>` 302 fallback; 223 R7DEM.6b the REQ-TOUR-9
carve-out section — table, channel, insert-only role, abuse bound, suppression.)_

## Consequences

_(Filled by the owners: the never-cookies invariant, S-13 caching/CDN invalidation, the
`demo` DOM-contract bucket, S-14 document-navigation entries/exits, cohort hygiene (REQ-DOPS-5).)_

## Alternatives considered

_(Filled by the owners: nested `createWebApp` vs separate service; rewrite vs redirect (S-1);
insert-only role vs application-role insert (REQ-TOUR-9).)_

## Revisit trigger

A demo path needs a second write, a signed-in variant, or a live (non-snapshot) read; the S-1
spike fails and the fallback ships permanently; or the metrics carve-out outgrows its enum.
