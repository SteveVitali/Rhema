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

---

**Dated note — 2026-11-04, R7DEM.3 (snapshot layout, per-essay index, harness seam).** The
owned decisions this ticket records under this ADR:

- **Layout.** `snapshots/<essay>/index.json` (an `EssayIndex` — `resolve` table +
  `kind → key → file` chunk map), `versions.json`, `files.json`, `drafts/<draftId>.json`,
  `diffs/<n>-<m>.json`, `what-changed/<from>-<to>.json`, `artifacts/<corpus-path>.json`, plus
  root `projects.json`. Every chunk is a `{format:1, kind, essay, key, dto}` envelope of
  canonical JSON; keys use the corpus essay key — the projector never mints `demo~` slugs
  (220's registry maps `slug` at serve time).
- **Ids.** `draftId` = the corpus version key (`v1`…) or `published` (n = versions+1, the
  `working` head). `artifactId` = the corpus-relative path — stable, registry-free (prod's
  artifact read already stands the artifact id in as `draftId`). Diff keys `n:m`; what-changed
  keys `<from>-<to>`; `responseId`/`reviewId` set only when the after-version is the response's
  product (a writer-directed or imported after-version breaks the link).
- **Derived fields (declared, never invented).** origin: imported / writerDirected→
  `human_revision` / prior `<v>-response`→`response_to_review` / drafting dossier→
  `drafted_from_outline` / else `human_upload`. reviewed = `<v>-review/` exists; answered =
  response exists; `claimsPendingVerification` = !reviewed; createdAt = export-manifest
  `exportDate` (Published: its recorded `fetched`); the ⚑ chip derives blocking/major findings
  split by response-disposition (prod's closed-state set); `meters`/`words` via the shared
  `statusMeters`; `blockIdMap` via `buildBlockIdMap`; `provenance` null (the corpus records
  none); `dischargeLines: []` (no obligation rows exist).
- **Markers.** REQ-CONV-14 import-rule map + S-10 roles ride `dto.demo.importRule`/`roles`
  (from `labels.json`); REQ-CORPUS-4 excluded refs ride `demo.notPublishedRefs`; the
  fragments note rides `demo.fragmentsNote` on `FilesDto`. Additive DTO carries:
  `DemoMarkersDto` + `demo` on EditorDoc/VersionRail/VersionDiff/WhatChanged/Files,
  `drafts[].label`, `EditorDocDto.versionLabel`, and `artifactKind`/`artifactPath` (which
  formalize fields the api already returns).
- **Harness seam.** `src/project/harness.ts`: `registerSnapshotKind` + `validateSnapshot`;
  compile-time `satisfies` at each projection site; `indexViolations`/`resolveViolations`/
  `snapshotEnvelopes` are the drift legs 218a reuses without forking.
- **Envelope.** `ENVELOPE_BYTES` per kind declares the AC3 bound — a chunk carries its one
  artifact plus that envelope.
