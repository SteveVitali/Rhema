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

### Dated note — 218a_R7DEM.3b (2026-11-04): the run/record side + owned DTO variants

218a extends the same seams — additive only, no existing field narrowed or changed:

- **Replayed runs (S-9; REQ-DWEB-15).** One replayed run per reviewed round (`<draftId>-review`).
  The phase set is inferred from the delivered files only (piece brief→intake, claim
  ledger→verification, discourse report→discourse, argument notes→argument, craft notes→craft,
  second read→second_read, letter→letter) and rides `phaseSource:"inferred_from_delivered_files"`.
  Approvals/gates carry only verbatim `_rules/facts.json` `approvals` facts, else
  `"not_recorded"`. Spec §8.2 is structural: the `ReplayedRunCardView`/`ReplayedRunReportView`
  variants in `findings-core/replayed.ts` omit every numeric the record does not hold and name
  them in `notRecorded` — a zero is unrepresentable, and the kind validators reject a forged one.
- **DTO variants (additive to `@rhema/api-client`).** `DemoDossierDto`, `DemoTimelineDto`
  (`ReplayedTimelineRunDto`/`DemoTimelineRoundDto`), `DemoRunReportDto`,
  `FigureImageCardDto`/`FigureImageVersionDto` (`specKind:"image"`, provenance `"imported"`, the
  REQ-DWEB-17 `/bff/demo/asset/:essay/:file` route shape, corpus-relative `:file`),
  `DemoCardFactsDto`/`DemoArcStepDto`, plus `DemoMarkersDto.notRecorded`/`assetRefs`. The dossier
  leaves `rigor`/`reviewedDraftId`/`accessReport` absent when unrecorded (its `demo.notRecorded`
  names each) and is checked against `DossierViewData` by a colocated `apps/web` test.
- **`demoCardFacts` is the sole card-count owner (P4-6).** `statusMeters` on Published markdown
  (status-bar parity); findings/claims via 213's `deliveredRecordCounts` — called, never
  re-implemented; `composeDeliveredSummary` supplies "What it delivered". The demo-card buckets
  (this ticket's one owned selection): `major`+`one_thing` letter slots → majors (the one thing
  counted once); `roadmap`/`considered_rejected` → minors; unfiled falls back to severity
  (blocking/major → major, else minor); strengths/claims ride the shared rule verbatim.
- **Round produced link.** A replayed round's `producedN` is the next version iff its origin is
  `response_to_review` and the round is answered — a writer-directed next version produced none.
- **Registration.** `registerRunKinds()` plugs `dossier`/`run-report`/`timeline`/`card-facts`/
  `figure-image` into 218's `registerSnapshotKind` seam with per-kind structural validators that
  assert the omitted-numerics rule; `KindDtoMap`/`ENVELOPE_BYTES`/`EssayIndex.chunks` extend
  additively.

### Dated note — 220_R7DEM.4 (2026-11-04): the serving architecture + the REQ-ED-12 banner

Fills the **Decision** shell for the server half (220a records the S-1 outcome). Decisions this
ticket owns:

- **Registry and namespace (`@rhema/contracts/src/demo.ts`).** `DEMO_SLUG_PREFIX = "demo~"`, the
  `DEMO_ESSAYS` registry (corpus key ↔ slug ↔ title; the committed synthetic fixture rides it
  flagged `fixture: true`), `isDemoSlug`/`isDemoSlugPrefix`, and `DEMO_ROUTE_IDS` — the shared
  allowlist the server's guard and 220a's SPA both consult: the nine document routeIds
  (`/p/$project`, `/v/$v`, `/v/$n/diff/$m`, `/a/$artifactId`, `/revisions/$cid`,
  `/review/$runId`, `/r/$runId`, `/figures`, `/figures/$figureId`) plus the one JSON endpoint
  that rides the `/p/` namespace (`/p/$project/palette-search`, answered `{results:[]}`). The
  `~` is outside the api slug grammar forever, so the namespace can never collide with a tenant
  slug — a property test pins `slugify`'s output and `isDemoSlug`/`spaRouteFor` agreement.
- **Guard placement and arms.** One `app.use("*")` inside `createWebApp`, registered after the
  middleware block and before `/session` and every `/p`/`/bff` handler. It claims `/demo`,
  `/demo/<essay>/…`, `/p/demo~*`, and `/bff/p/demo~*`. Non-GET/HEAD ⇒ 405
  `{error:"demo_read_only"}` (JSON, or the terminal SSR notice for a form poster). An
  unregistered `demo~` slug or a GET outside `DEMO_ROUTE_IDS` ⇒ terminal 404 (JSON on `/bff`,
  the not-found document otherwise), never the shell. Zero DataSource calls of either kind in
  every arm — the §7 suite proves it with a throwing, recording outer source.
- **Nested JSON app (S-2).** A second `createWebApp({demo: true, collabWsUrl: undefined,
  session: request-scoped DEMO_SESSION})` serves twins only; the outer app forwards the request
  with `cookie`/`authorization` stripped and deletes `set-cookie` on the way back, so twin
  bodies are byte-identical across cookie states. It never emits HTML — documents stay on the
  outer app, so the CSP nonce stays single per `<script>` (REQ-DWEB-8). The `demo` flag drives
  the twin stamps (`readOnly:true`, `ReadOnlyProject{reason:"demo"}` on the 211 carrier) and
  `ideContext`'s out-of-demo drops (settings rows, the New-obligation goto row, runNextHref,
  theme/paperTheme write URLs; `paletteSearchUrl` stays because the demo answers it).
- **`demoDataSource` (REQ-DWEB-3).** `apps/web/src/demo-data.ts` reads 218/218a's snapshot
  envelopes lazily per chunk, resolving `demo~` slugs back to corpus keys at serve time. It
  implements the provisional 25-method set of R3 §1 (the DWEB-3 amendment: 221's regenerated
  composition walk finalizes it); every other key is a throwing `DemoUnsupported` proxy — a
  rejected promise, so degrade-catches behave as an absent seam. Its module graph carries no
  `fetch`, no `process.env`, no runtime `@rhema/api-client`/`@rhema/db`/`@rhema/live-clients`/
  `@rhema/demo-corpus` import — the eslint boundary plus a module-graph scan test enforce it;
  snapshot misses are `DemoError{status:404}` and the nested-app seam adapts them to `ApiError`
  so the shared compositions' `instanceof ApiError` arms work verbatim. The one slug-less seam
  (`getRunReport`) resolves through a per-request essay hint the nested session resolver stamps.
- **Boot + documents (REQ-DWEB-6/9).** `/demo` is a public SSR document with the N10 head
  contract and `data-demo-root` (221a fills it). `/demo/<essay>/…` and `/p/demo~<essay>/…` GETs
  serve the outer app's `spaShellDocument` with `demo:{essay, slug, signedIn, build}` on the
  boot — `signedIn` is cookie PRESENCE only (cosmetic; it authorizes nothing), `build` is the
  deploy SHA the client appends as `?b=<sha>` to demo twins (S-13). No `principal`, `theme:{}`,
  and every in-scope routeId `"spa"` on every device class — **the dated REQ-ED-12/ADR-108
  amendment for the demo leg (2026-11-04): demo Pages render SPA read-only on every device
  class — a phone UA never gets an SsrHandoff into a non-existent document.**
- **Caching (S-13; REQ-DWEB-10).** Twins answer `cache-control: public, max-age=300,
  s-maxage=86400` plus a strong `ETag` of snapshot hash + deploy SHA — the explicit header wins
  over the authed `no-store` floor; the demo shell sends `no-cache` (a per-request nonce must
  never freeze at the edge). `/bff/demo/feed-labels` serves the shared maps publicly at the same
  cache posture — the demo needs the SPA's feed-labels read without the session gate.
- **Asset route (REQ-DWEB-17).** `GET /bff/demo/asset/:essay/:file` serves only entries whose
  `kind:"image"` the essay's own `corpus/<essay>/index.json` admits (the PROVENANCE-allowlisted
  set), a small extension→content-type allowlist, `immutable` caching, and traversal rejection —
  never markdown, `_rules`, or unlisted media.
- **Image + corpus discipline (REQ-DOPS-2).** `@rhema/demo-corpus` is a production dependency of
  `@rhema/web` so `pnpm deploy` ships `corpus/` + `snapshots/`; the Dockerfile asserts their
  presence (`test -s`), failing the image build when they drop. The runtime root resolves from
  the installed package; tests pin it to `fixtures/synthetic` (S-12 — no real-corpus byte rides
  a test). The `demo` DOM-contract bucket is declared (`data-demo-root`,
  `data-demo-readonly-notice`), emitted, and asserted; `check:no-cookies`' scan never sees the
  guard's header literals because they live in `demo.ts`, outside its TARGETS (RV-35).

**Consequences recorded:** the provisional method set is explicit — if 221's walk adds or drops a
seam, `demo-data.ts` and its Pick change together; a wrong answer is impossible where
`DemoUnsupported` throws. Public anonymous JSON answers identical bytes under a session cookie
because the strip happens before the nested app runs. The Stage-B surface (deployed `/demo`
plus twin/asset behavior, and 220a's URL spike) is deferred to 224 as `D-R7DEM.4-1`.

### Addendum — 2026-11-04 (R7DEM.4b): the S-1 URL spike lands the TanStack `rewrite` arm

**Decision:** the SPA carries the `/demo/<essay>/…` ↔ `/p/demo~<essay>/…` mapping through
TanStack Router's `rewrite` option on `createRouter` (input + output, registered-essay gated
via `demoInternalPath`/`demoPublicPath` in `@rhema/contracts`). The 302 fallback is NOT
needed: both of R3 P7's open questions resolved positively and are pinned by
`apps/web/src/spa/demo.dom.test.tsx` — (1) `router.navigate({href})` applies the output
rewrite to a raw `/p/demo~…` href, so the ~120 hand-built `/p/${slug}` anchors emit
`/demo/<essay>/…` in the address bar unmodified; (2) `router.getMatchedRoutes(pathname)` is
rewrite-agnostic — raw public-form hrefs don't match, so `nav-intercept` feeds the
input-rewritten path for its in-tree test while `navigate` still receives the original href.
`/demo` itself is excluded (the SSR hub, no client route); an unregistered `/demo/<essay>`
falls through the input rewrite to the server's terminal 404.

**Boot discipline:** the `_authenticated` gate skips the session read when `boot.demo` AND
the path predicate hold (an in-SPA hop to `/app` still gates); `sessionQuery` is disabled in
the demo chrome and `feed-labels` warms from public `/bff/demo/feed-labels`; the demo
QueryClient is `staleTime: Infinity` + no refetch-on-focus (immutable snapshots); demo twin
reads carry `?b=<build>` (S-13); `onSessionExpired` is a no-op inside a demo boot. Crossing
the demo namespace in either direction is a document navigation BY PREDICATE in
`nav-intercept` — the demo never shares the workspace QueryClient and every `data-demo-exit`
carries `data-spa-native` (S-14 / REQ-DWEB-11/16).

**Legs:** `R11.demo` and `P1.demo` have real bodies; at this head they report
`ready-to-flip` on the local server (`docs/build/reports/2026-11-04_r7dem-4b-legs/`) and
stay `expected:"red"` — the nightly must not redden while prod serves pre-R7a code. The
deployed verification rides D-R7DEM.4b-1 to 224.

### Addendum — 2026-11-04 (R7DEM.5): the walk finalizes the DataSource set; corpus-path URL shapes

**Decision (DWEB-3's amended contract, exercised):** `demoDataSource`'s implemented `Pick` is
EXACTLY the set the recording-proxy walk successfully invokes. The trace seam
(`RHEMA_DEMO_DS_TRACE` → `demoDataSourceTrace` dep) counts an invocation only when the method
sits in the Pick (`prop in t`) — a call hitting the throwing `DemoUnsupported` seam is a
surface degrading, not a served read. At this head `checkSession` and `postAcquisitionEvent`
were implemented-but-never-invoked and left the Pick; the five optional seams the nested app
probes (`getApprovalSettings`, `getChat`, `getInboxBadge`, `listRestorePoints`,
`markInboxRunRead`) stay unimplemented and degrade exactly like a live missing seam.

**Decision (URL shape):** `FileRowDto.artifactId` carries the corpus-relative path; `/a/` is
a single-segment route, so the demo flattens `/`→`--` on emit and decodes in
`getArtifactPage`. A binary asset (a `kind:"figure"` row's `.png`) has no artifact page — the
additive `FileRowDto.figureId` + the FilesPane `hrefs.figure` arm link the figure card
(`/p/<slug>/figures/<id>`) instead.

**Decision (third-party discipline, REQ-DWEB-7):** a read-only public demo page issues no
third-party request. `rewriteDemoDocLinks` sweeps every `image` node `src` / link `href` in a
demo doc: excluded corpus paths lose their link mark ("not published" non-link); `assetRefs`
paths resolve to `/bff/demo/asset/...`; any remaining `https?://` image src rewrites to a
corpus copy by basename or becomes a " (not published)" text node. The real corpus' published
essays carry Substack-hosted URLs — the recording proxy caught 25 such fetches on the first
green walk.

### Addendum — 2026-11-04 (R7DEM.6b): the carve-out as built — one sanctioned write

**Decision (the channel, REQ-TOUR-9):** the anonymous demo funnel (`demo.hub_viewed`,
`demo.tour_started`, `demo.tour_completed_or_cta`) writes to a new append-only `demo_events`
table through a `SECURITY DEFINER` insert function `public.rhema_demo_event_insert(text,
text, integer, text)` owned by a new `NOLOGIN` insert-only role `rhema_demo_writer`
(`GRANT INSERT ON demo_events` only). `rhema_app` holds `EXECUTE` on the function and NO
table privilege (rls-catalog `USER_ROLE_GRANTS` pins `demo_events: "-"`). The web relay is
`POST /a/demo` → api `POST /analytics/demo` on the user-serving `deps.db` — the ONLY non-GET
the demo surface may emit (REQ-DACC-3's amended zero). The lint rule it satisfies
(check-additive-migrations, ADR-018 §8): `CREATE ROLE … NOLOGIN` is additive, every
GRANT/REVOKE in 0061 carries `ON <object>` (a privilege grant, never a role-membership
change), and `ALTER FUNCTION … OWNER TO` is not ALTER ROLE/USER — the PG16
`createrole_self_grant` covers the owner assignment since the role is created in the same
file (D-R7DEM.6b-1 carries the Cloud SQL proof to 224).

**Decision (abuse bound + anonymity):** payload ≤ 256 B validated against the three-name
enum with bounded fields (`essay ≤80`, `step 1–99`, `src ≤40`); a per-instance token bucket
(60/min shared, never persisted, never keyed on identity); 204 always; no `Set-Cookie`;
the web forward is built on the headerless api client so `cookie`/`authorization` can never
reach the api. The table carries no IP, IP-hash, user, cookie or UA column — anonymous by
construction, matching the "no tracking cookies" privacy promise.

**Decision (the anonymous-event catalogue representation):** the three `demo.*` names enter
`ANALYTICS_EVENTS` with payload-only schemas and are classified `emitted` in
`emission-audit.ts` (source `apps/web/src/spa/demo-beacon.ts`). They are registered for
catalogue completeness + the audit sweep ONLY — they never ride `recordAnalyticsEvent` /
`analytics_events` (the user/workspace envelope cannot apply to an anonymous funnel);
their rows live in `demo_events` with the bounded {event, essay, step, src} shape.
`src=jrn` tags journey traffic (D-leg navigations carry `?src=jrn`).

**Decision (REQ-DOPS-5 — suppression, not just non-emission):** every reused-surface
`CLIENT_ANALYTICS_EVENTS` path is demo-suppressed at the single `isDemo()` seam
(beacon hooks) or at the `demoDataSource` seam (`postAnalyticsEvent` → `{recorded:false}`
no-op; `postAcquisitionEvent` → `DemoUnsupported`). `demo-analytics.test.ts` +
`demo-analytics.dom.test.tsx` iterate the catalogue and fail on any unsuppressed emitter.
