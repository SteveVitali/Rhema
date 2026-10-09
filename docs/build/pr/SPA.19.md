# SPA.19 — surface: figures (`/p/:slug/figures` + `/p/:slug/figures/:id` + `/p/:slug/visualize` → React SPA)

**Manifest row 125** · stacks on `stevevitali/spaf-9-prod-flip-outline` @ `f933ecc` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/125_SPA.19__surface-figures.md` per `docs/design/22`
(endpoint table — the `p.figures`/`p.figureCard`/`p.visualize` rows), `docs/design/29`
(route map — `figures` is a non-IDE-framed leaf; three GETs consult on the one flag),
`docs/design/27` (two-leg + rollback mechanics), and `docs/frontend-spa-spec.md`
§4/§8/§9. `STAGES.dev.spaSurfaces` gains `"figures"`; preview `[]` and prod
`["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline"]`
stay unchanged (the prod flip is SPAF.10's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — each leaf's loader
skips its BFF read and `SsrHandoff` document-navigates back to the same URL, where
the server re-runs session → `spaShellResponse` consult → SSR in its normative order
(REQ-BFF-20). SSR fallback + `figure-surfaces.test.ts` untouched and green
(REQ-SEQ-11/12); `?ssr=1`/`x-rhema-renderer` overrides ride the unchanged consult
machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8 · REQ-BFF-16 · REQ-UX-8 · REQ-VFY-9 · REQ-UX-3 · REQ-UX-4 ·
REQ-UX-5 · REQ-UX-10 · REQ-UX-13 · REQ-UX-14 · REQ-UX-15 · REQ-UX-16** · supporting:
REQ-BFF-1/2/3/11/17/20 · REQ-DAT-4/6/13 · REQ-SEQ-2/11/12 · REQ-TST-2 ·
REQ-VFY-2/4/6/7 · REQ-SAFE-10 · REQ-CHAT-25 (the sheet is the only figure-run
creator — the consent rule)

## What lands

### `GET /bff/p/:slug/figures` + `/figures/:figureId` + `/visualize` — the twins
(REQ-BFF-1/8/9/11, REQ-DAT-4/6/13)

- The pane twin answers `{figures:{slug,items}}` — the api's `FigureListItemDto`
  rows verbatim (the `[unverified data]` badge text is the api's, never retyped).
  A degraded `listFigures` lands `items:[]` — the SSR GET's own
  `.catch(() => null) ?? []` arm, never a fabricated row. A missed slug keeps the
  404 envelope.
- The card twin answers `{figure:{slug,card,headDraftId}}` — the full
  `FigureCardDto` (preview `files.svgLight`/`tableSource`, provenance + honesty
  metadata, versions, pending proposal, readiness) plus the head-draft id the
  insert proposal gates on. A missed/declined read answers `{figure:null}` at 200 —
  the document's own `figureCardElement` 404 arm (the leaf renders
  `COPY.visualize.notFound`, not the router's generic not-found); a missed slug
  404s.
- The sheet twin answers `{visualize:{slug,request,specKind,figureId?,
  priorVersion?,entryPoint,estimateCredits,capCredits}}` — the URL-echoed
  entry-point picks (`?request`/`?kind`/`?figure`/`?prior`/`?entry`) plus the
  server-computed estimate. `?figure=` keeps the `fig_`-prefix strip
  (`figureIdFromRef`) server-side; `figureEstimate`/`figureSourceRefs` are hoisted
  ahead of the BFF block so the document GET, the twin, and the POST share the ONE
  derivation — the leaf never re-derives the honesty seeds or the price.
- Binary figure assets (SVG/PNG/data downloads) stay document/asset navigations —
  no JSON twin proxies bytes (REQ-BFF-17-class); the persisted preview ships
  inline in the card DTO.
- Unauthed → JSON 401; unknown slug → `{error:"not_found"}` 404 — on every twin.

### The seven POSTs — `wantsJson` + `mutationOutcome`/`bffFail` (REQ-BFF-1/2/3)

- `POST /p/:slug/visualize` — `bodyFields` reads the JSON content-type or the form
  body (same field map: `request`/`specKind`/`figureId`/`priorVersion`/
  `entryPoint`/`insist`, with `insist===true` admitted alongside `"1"`/`"on"`).
  Blank request → `{error:"request_required", detail}` **422** (the document's
  re-render arm, never a redirect); success → `{ok,redirect:"/p/:slug/figures"}`
  (the identical destination the 302 carried); an upstream refusal rides
  `bffFail` at the preserved status.
- `POST /p/:slug/figures/:figureId` — caption/alt/sourceLine patch →
  `{ok,redirect:"…?saved=1"}`; the alt>250 refusal rides the `?notice=` redirect
  verbatim (flash state stays URL-owned, never a payload invention).
- `POST …/spec-edit` — the type-chip 0-cr mark edit → `{ok,redirect:card}`; an
  unsupported chip rides `?notice=<code>`.
- `POST …/versions/:n/restore` — → `{ok,redirect:card}` (the swallow-the-write
  seam verbatim).
- `POST …/propose` — `{afterBlockId}` → `{ok,redirect:card,data}` (the returned
  proposal rides the envelope's `data`); the readiness refusal rides
  `?notice=figure_not_ready`.
- `POST …/proposals/accept` — `{ok,redirect:"/p/:slug/v/<draftN>",data}` when the
  api supplies the inserted draft version — the 302's identical fork target — else
  back to the card.
- `POST …/proposals/reject` — `{ok,redirect:card}`.

No JSON caller ever receives a 3xx; no form caller loses an existing redirect; the
session split is 401-JSON / 302-`/login` on every route.

### The React surfaces + leaves

- `spa/surfaces/figures.tsx` — `FiguresSurface` / `FigureCardSurface` /
  `VisualizeSurface` port `FiguresPanePage` / `FigureCardPage` / `VisualizePage`
  verbatim: the `<PageTitle>` h1 + Shell, `data-figure-row`/`data-figures-empty`/
  `data-new-figure`, the persisted preview vs `data-figure-preview-pending` vs
  `data-declined-note` arms, `data-type-chips`/`data-chip` (0-cr mark edits),
  `data-figure-fields` (caption/alt/sourceLine — literal `name=` attributes the
  scanner sees), `data-provenance`/`data-prov-*`, `data-figure-spec`/
  `data-figure-data`/`data-figure-versions` disclosures, `data-version`/
  `data-restore`, the `data-insert` section — `data-pending-proposal` +
  `data-proposal-block` + `data-accept`/`data-reject`, `data-inserted-note`,
  `data-propose-form`/`data-propose`, `data-not-ready` — and the sheet's
  `data-visualize-form`/`data-iterate-note`/`data-insist`/`data-estimate` +
  `?request=` prefill, `data-saved-note`/`data-notice` flash rails.
- Mutations post the form's field map as JSON via `bffFetch` — `collectJsonFields`
  serializes live controls (uncontrolled inputs keep verbatim SSR markup;
  unchecked `insist` contributes nothing, `"1"` when ticked — the record
  `bodyFields` decodes). The envelope's `redirect` navigates in-router — a target
  on an unflipped leaf (accept's `/p/:slug/v/<n>`) lands `SsrHandoff` → the
  document nav, verbatim the form's 302; `["bff"]` settle-invalidate refetches the
  twin so updated rows land where the SSR 302's reload put them; `aria-busy` +
  disabled controls in flight, restored on settle (REQ-UX-16). A refused Visualize
  click (`request_required` 422 / upstream `bffFail`) repaints the sheet's
  `data-notice` arm inline — the document's own refusal-as-rerender, no
  navigation.
- `p.$project.figures.tsx` / `p.$project.figures_.$figureId.tsx` /
  `p.$project.visualize.tsx` — `validateSearch` carries `saved`/`notice` and
  `request`/`kind`/`figure`/`prior`/`entry`; loaders warm
  `projectFiguresQuery`/`projectFigureCardQuery`/`projectVisualizeQuery` ONLY on a
  `"spa"` boot verdict; twin 404 → `notFound()`; `{figure:null}` → the leaf's own
  not-found arm; SSR verdicts → `SsrHandoff` with zero BFF spend.

### DOM contract + stage facts + journeys

- `dom-contract.ts` — the figures bucket grows **8 → 49 hooks** (dual emitters
  `pages.tsx` + `spa/surfaces/figures.tsx`): the pane/card/sheet attrs above plus
  `data-new-figure`, `data-declined-note`, `data-prov-kind`/
  `data-prov-verification`, `data-version`, `data-accept`/`data-reject`,
  `data-inserted-note`, `data-propose`, `data-not-ready`, `data-iterate-note`,
  `data-insist`, `data-estimate`, `data-saved-note`, `data-notice`; field names
  `caption`/`alt`/`sourceLine`/`mark`/`afterBlockId`/`figureId`/`priorVersion`/
  `entryPoint`/`request`/`specKind`/`insist`; urlparams `request`/`kind`/`figure`/
  `prior`/`entry`. `data-reconstruct-visual` stays a `pages.tsx`-only entry (the
  finding's SSR action, not part of this surface's leaves).
- `STAGES.dev.spaSurfaces += "figures"`; `stages.test.ts` pin updated; prod +
  preview untouched (SPAF.10 owns the flip).
- Journeys — `P1.figures` (registry `expected:"red"`, owner `UX.2` per the
  planning-ledger P1 family rule): `/p/:p/figures` + `/p/:p/figures/fig_missing` +
  `/p/:p/visualize?request=…` at phone width under **either** renderer — rows or
  the designed empty arm, the card or the not-found arm, the consent form
  (request/specKind/insist/estimate + verbatim `?request=` prefill) or its
  not-found arm; overflow + axe clean. `SURFACE_GATES.figures = {P1.figures}` with
  honest `owed` notes (the Resend blocker + the figure-bearing desktop legs no
  free step can mint — the Visualize click is a paid run, REQ-VFY-10);
  `cli-flags.test.ts`/`surface-gates.test.ts` updated — the vacuous-gate refusal
  moves to `run-report` (figures' gate is now non-empty).

## Verification

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` — full suite green (**5,468 pass / 4 skip / 0 fail**, 482 files).
  Mid-run red, this ticket's own and fixed + re-verified:
  `copy-containment.test.ts` flagged the sheet's literal `vega_lite`/`mermaid`/
  `table` option labels + the provenance `<dt>` keys (`kind`/`verification`/
  `computedBy`/`ref`) as inline copy — wrapped in expressions/`COPY` leaves; the
  field-map helper was reworked to emit literal `name=` attributes the
  dom-contract scanner sees. `check:dom-contract` initially reported six rows
  (`data-figure-preview-pending`, `data-propose`, `caption`, `alt`, `sourceLine`,
  `mark`) — fixed by literal emissions + new dom-test assertions; now **49/49**
  on figures, **760/760** overall.
- Focused: `figures.dom.test.tsx` (**31** — all three leaves mounted through the
  production router; SSR-verbatim vocabulary + `expectManifestEmission` parity vs
  `FiguresPanePage`/`FigureCardPage`/`VisualizePage`; the field-edit, chip,
  restore, propose, accept (fork `/v/<n>`), reject JSON legs; `?saved=1`/`?notice=`
  flashes; pending-preview/declined/not-ready/inserted/`{figure:null}` arms;
  `request_required` repaint; `SsrHandoff` zero-BFF on the ssr verdict;
  404→`notFound`; REQ-UX-16 `aria-busy`; component axe on all three), `bff.test.ts`
  (+17 → **210** — both list/card/sheet twin compositions, `items:[]` degrade,
  `{figure:null}` arm, `fig_`-prefix strip, server-computed estimate, 401/404
  parity, all seven POSTs' JSON-vs-form splits, 422 `request_required`, stable
  `?notice=` codes, accept's `draftN` fork), `figure-surfaces.test.ts` (retained
  SSR, untouched, 23/23), `stages.test.ts` (23/23), `surface-gates.test.ts`
  (11/11), `cli-flags.test.ts` (11/11), `registry.test.ts` (7/7).
- `pnpm check:dom-contract` — **green, 760/760** · `check:licenses` ✓ ·
  `check:protocol-markers` ✓ · `check:no-cookies` ✓ · `check:spa-budget` ✓ (entry
  183.5/250 kB; figures chunk 3.8 kB gzip) · `check:spa-env` ✓.

## Honestly deferred (DEFERRALS.md)

- **D-SPA.19-1** — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += figures` + `--expect-renderer spa` on
  `SURFACE_GATES.figures` = `P1.figures`, C `paid:false`).
- **D-SPA.19-2** — preview rollback drill (flag off → SSR serves the same figures
  DOM contract).
- Blocker: `rhema-nonprod-resend-api-key` absent from Secret Manager
  `rhema-507501` — re-probed this run (`gcloud secrets versions access latest` →
  `NOT_FOUND`; value never printed). Without it `preview-stack.mjs resend-pull`
  cannot seed `rhema:resendApiKey` → no signed-in preview session mints → the
  session-gated figures legs cannot run. Same live blocker as `D-MAINT.6-1` and
  every prior SPA deferral; both rows carry the exact unblock recipe + verify
  steps. `D-OPS.1-1` / `D-SPA.6-1` / `D-MAINT.6-1` blocker-updated this run —
  all stay OPEN.
- `P1.figures`' gate-note owed items (recorded in `SURFACE_GATES.figures`): the
  step is `expected:red` pending that first preview leg, and the figure-bearing
  desktop legs (type chips, field edits, pending-proposal Accept/Reject arms) stay
  owed — no free step can mint a figure (the Visualize click is a paid run); the
  dom.test parity legs stand in meanwhile.

## Out of scope (held)

Prod flip (SPAF.10 — `prod += figures`, REQ-SEQ-10 nightly-green gated), SSR
deletions (REQ-TST-1 cleanup wave), binary asset proxying (REQ-BFF-17 — never),
API/schema changes — never (spec §13).
