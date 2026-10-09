# SPA.19 — run ledger: surface `figures` (`/p/:slug/figures` + `/p/:slug/figures/:id` + `/p/:slug/visualize`)

- **Ticket:** `docs/tickets/125_SPA.19__surface-figures.md` (manifest row 125)
- **Branch:** `stevevitali/spa-19-surface-figures` — forked from
  `stevevitali/spaf-9-prod-flip-outline` @ `f933ecc` (the requested chain tip).
- **PR:** [#147](https://github.com/SteveVitali/Rhema/pull/147) —
  `pr/SPA.19.md` is the committed body.
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND:
  Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.
```

The secret was never printed (there is no version to print); `gcloud secrets list`
still shows only `rhema-prod-resend-api-key`. Without it `preview-stack.mjs
resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in preview session can
mint through the magic-link + mailbox leg — `P1.figures` is session-gated. The
preview two-leg and rollback drill are honestly deferred (`D-SPA.19-1`/`-2`), with
the deterministic in-repo proof standing in. This is the same live blocker as
`D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` / `D-SPA.13-1` / `D-SPA.14-1` /
`D-SPA.15-1` / `D-SPA.16-1` / `D-SPA.17-1` / `D-SPA.18-1`.

## 0b — Inherited chain debt

None this run — `check:dom-contract` opened clean on the base (`f933ecc`);
SPA.18's closeout read 719/719 with zero outstanding rows.

## 1 — What landed

### `GET /bff/p/:slug/figures` + `/figures/:figureId` + `/visualize` — the three
twins (`server.ts`, REQ-BFF-1/8/9/11, REQ-DAT-4/6/13)

- `{figures:{slug,items}}` — the api's `FigureListItemDto` rows verbatim (the
  `[unverified data]` badge text is the api's, never retyped); a degraded
  `listFigures` lands `items:[]` — the SSR GET's own `.catch(() => null) ?? []`
  arm, never a fabricated row. A missed slug keeps the 404 envelope.
- `{figure:{slug,card,headDraftId}}` — the full `FigureCardDto` (preview
  `files.svgLight`/`tableSource`, provenance + honesty metadata, versions, the
  pending proposal, readiness) plus the head-draft id the insert proposal gates
  on. A missed/declined read answers `{figure:null}` at 200 — the document's own
  `figureCardElement` 404 arm — while a missed slug keeps the 404 envelope.
- `{visualize:{slug,request,specKind,figureId?,priorVersion?,entryPoint,
  estimateCredits,capCredits}}` — the URL-echoed entry-point picks
  (`?request`/`?kind`/`?figure`/`?prior`/`?entry`) plus the server-computed
  estimate. `figureEstimate`/`figureSourceRefs` were hoisted ahead of the BFF
  block so the document GET, the twin, and the POST share the ONE derivation; the
  `fig_`-prefix strip (`figureIdFromRef`) stays server-side — the leaf never
  re-derives the honesty seeds or the price.
- Binary figure assets (SVG/PNG/data downloads) stay document/asset navigations —
  no JSON twin proxies bytes (REQ-BFF-17-class); the persisted preview ships
  inline in the card DTO.
- Unauthed → JSON 401; unknown slug → `{error:"not_found"}` 404 on every twin.

### The seven POSTs — `wantsJson` + `mutationOutcome`/`bffFail` (REQ-BFF-1/2/3)

- `POST /p/:slug/visualize` — `bodyFields` reads the JSON content-type or the form
  body (same field map `request`/`specKind`/`figureId`/`priorVersion`/
  `entryPoint`/`insist`; `insist===true` admitted alongside `"1"`/`"on"`). Blank
  request → `{error:"request_required", detail}` 422 (the document's re-render
  arm); success → `mutationOutcome({redirect:"/p/:slug/figures"})`; an upstream
  refusal rides `bffFail` at the preserved status (`figure_run_failed`) — never a
  redirect, never a sheet.
- `POST /p/:slug/figures/:figureId` — caption/alt/sourceLine patch →
  `{ok,redirect:"…?saved=1"}`; the alt>250 (422) refusal rides the `?notice=`
  redirect verbatim; other failures `bffFail` (`figure_patch_failed`).
- `POST …/spec-edit` — the type-chip 0-cr mark edit → `{ok,redirect:card}`;
  unsupported chip → `?notice=<code>` verbatim.
- `POST …/versions/:n/restore` — `{ok,redirect:card}`; the swallow-the-write seam
  is verbatim.
- `POST …/propose` — `{afterBlockId}` → `{ok,redirect:card,data:<proposal>}`;
  the 409 readiness refusal rides `?notice=figure_not_ready`.
- `POST …/proposals/accept` — `{ok,redirect:"/p/:slug/v/<draftN>",data}` when the
  api supplies the inserted draft version — the 302's identical fork target —
  else back to the card.
- `POST …/proposals/reject` — `{ok,redirect:card}`.

No JSON caller ever receives a 3xx; no form caller loses an existing redirect; the
session split is 401-JSON / 302-`/login` on every route.

### `spa/queries.ts` — `BffFiguresTwin` + `BffFigureCardTwin` + `BffVisualizeTwin`

Typed twins + `queryOptions` (`["bff","p",slug,"figures"]` /
`["bff","p",slug,"figures",figureId]` / `["bff","p",slug,"visualize",request,kind,
figure,prior,entry]`) with the shared `retryPolicy` — the visualize key carries
the URL-echoed picks so a nav to a different entry point re-reads.

### `spa/surfaces/figures.tsx` — `FiguresSurface` + `FigureCardSurface` + `VisualizeSurface`

- Ports `FiguresPanePage`/`FigureCardPage`/`VisualizePage` verbatim: the
  `<PageTitle>` h1 + `Shell`, `data-figure-row`/`data-figures-empty`/
  `data-new-figure`, the persisted preview (`svgLight` inline / `tableSource`
  `<pre>`) vs `data-figure-preview-pending` vs `data-declined-note` arms,
  `data-type-chips`/`data-chip`, `data-figure-fields` (literal `name="caption"`/
  `"alt"`/`"sourceLine"` — the dom-contract scanner keys on them),
  `data-provenance`/`data-prov-*`, the `data-figure-spec`/`data-figure-data`/
  `data-figure-versions` disclosures, `data-version`/`data-restore`, the
  `data-insert` section (`data-pending-proposal` + `data-proposal-block` +
  `data-accept`/`data-reject`, `data-inserted-note`, `data-propose-form`/
  `data-propose`, `data-not-ready`), the sheet's `data-visualize-form`/
  `data-iterate-note`/`data-insist`/`data-estimate` + the `?request=` prefill, and
  the `data-saved-note`/`data-notice` flash rails.
- Mutations post the form's field map as JSON via `bffFetch` —
  `collectJsonFields` serializes the live controls (uncontrolled inputs keep
  verbatim SSR markup; unchecked `insist` posts nothing, `"1"` when ticked — the
  record `bodyFields` decodes server-side). The envelope's `redirect` navigates
  in-router — accept's `/p/:slug/v/<n>` targets the unflipped editor leaf, so the
  nav lands `SsrHandoff` → the document redirect, verbatim the form's 302;
  `["bff"]` settle-invalidate refetches the twin; `aria-busy` + disabled controls
  in flight, restored on settle (REQ-UX-16). A refused Visualize click
  (`request_required` 422 / upstream `bffFail`) repaints the sheet's
  `data-notice` arm inline — the document's refusal-as-rerender, no navigation;
  a card mutation's transport failure degrades to the `?notice=<code>` flash
  vocabulary.
- `COPY`-only user-visible text: enum labels (`vega_lite`/`mermaid`/`table`) and
  provenance `<dt>` keys ride expressions; the `[unverified data]` badge text is
  the api's, never retyped; `?saved=1` maps through `COPY.outlinePage.savedNote`
  (the shared leaf).

### The leaves (`p.$project.figures.tsx` / `p.$project.figures_.$figureId.tsx` / `p.$project.visualize.tsx`)

`validateSearch` carries `saved`/`notice` (card) and `request`/`kind`/`figure`/
`prior`/`entry` (sheet); the loaders warm
`projectFiguresQuery`/`projectFigureCardQuery`/`projectVisualizeQuery` ONLY on a
`"spa"` boot verdict; twin 404 → `notFound()`; `{figure:null}` → the leaf's own
`COPY.visualize.notFound` arm; SSR verdicts → `SsrHandoff` with zero BFF spend.
`figures` is a non-IDE-framed surface — no chrome consult.

### DOM contract (REQ-VFY-2) + stage fact (REQ-SEQ-9)

`dom-contract.ts` figures section: **8 → 49 hooks**, dual emitters
(`pages.tsx` + `spa/surfaces/figures.tsx`) — every attr above plus
`data-new-figure`, `data-declined-note`, `data-prov-kind`/`data-prov-verification`,
`data-version`, `data-accept`/`data-reject`, `data-inserted-note`, `data-propose`,
`data-not-ready`, `data-iterate-note`, `data-insist`, `data-estimate`,
`data-saved-note`, `data-notice`; field names `caption`/`alt`/`sourceLine`/`mark`/
`afterBlockId`/`figureId`/`priorVersion`/`entryPoint`/`request`/`specKind`/`insist`;
urlparams `request`/`kind`/`figure`/`prior`/`entry`. `data-reconstruct-visual`
stays `pages.tsx`-only (the finding's SSR action — not one of this surface's
leaves). `STAGES.dev.spaSurfaces += "figures"`; preview `[]` and prod unchanged —
**the prod flip is SPAF.10's own row**.

### Journeys — `P1.figures` (expected:red)

`steps.ts` — `P1_FIGURES` walks `/p/:slug/figures` + `/figures/fig_missing` +
`/visualize?request=…` at phone width (`p1PhoneProject`): the pane renders rows or
the designed empty arm; the card renders its preview or the not-found arm (a free
fixture has no figure to seed); the sheet renders the consent form
(`data-estimate`/`data-insist`/`request`/`specKind` + the verbatim `?request=`
prefill) or its own not-found arm; overflow + axe clean either way —
renderer-agnostic by construction, so the same step serves leg A (ssr) and leg B
(spa). `registry.ts` — `expected:"red"`, `owner:"UX.2"` (the planning-ledger P1
family rule). `SURFACE_GATES.figures = {P1.figures}` + honest `owed` notes (the
Resend blocker + the figure-bearing desktop legs no free step can mint — the
Visualize click is a paid run, REQ-VFY-10). `cli-flags.test.ts`/
`surface-gates.test.ts` updated — the vacuous-gate refusal moves to `run-report`
(figures' gate is now non-empty).

## 2 — Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green** (126 cached).
- `pnpm test` (full suite) — **5,468 pass / 4 skip / 0 fail** (482 files).
  Mid-run red, this ticket's own and fixed + re-verified:
  `copy-containment.test.ts` flagged the sheet's literal `vega_lite`/`mermaid`/
  `table` option labels + provenance `<dt>` keys (`kind`/`verification`/
  `computedBy`/`ref`) as inline JSX copy, plus ternary-boundary false positives —
  fixed by expression/`COPY`-wrapping the labels and reworking the field-map
  helper so literal `name=` attributes remain scanner-visible.
- `figures.dom.test.tsx` — **31 tests**: all three leaves mounted through the
  production router; SSR-verbatim vocabulary + `expectManifestEmission` parity vs
  `FiguresPanePage`/`FigureCardPage`/`VisualizePage` on the retained fixtures; the
  field-edit `{ok,redirect:?saved=1}` leg, the refused-edit `?notice=` leg, the
  chip `{mark}` spec-edit + refetch leg, restore, propose + the pending arm,
  Accept's fork `/p/:slug/v/<n>` document nav (unflipped target), Reject;
  `?saved=1`/`?notice=` flash rails; pending-preview / declined / not-ready /
  inserted / `{figure:null}` arms; `request_required` repaint without navigation;
  `SsrHandoff` zero-BFF on the `ssr` verdict; 404→`notFound`; REQ-UX-16
  `aria-busy` + disabled controls; component axe on all three.
- `bff.test.ts` SPA.19 block — **+17 → 210**: all three twins' composition
  (verbatim `FigureListItemDto`/`FigureCardDto`, `items:[]` degrade,
  `{figure:null}` arm, `fig_`-prefix strip, server-computed
  `estimateCredits`/`capCredits`, the echoed entry-point picks), unknown-slug
  404s, unauthed 401s; all seven POSTs' JSON-vs-form splits (envelope vs 302, no
  JSON 3xx ever), 422 `request_required`, stable `?notice=` codes, the accept
  `draftN` fork, `insist:true` boolean admission.
- Retained SSR suite `figure-surfaces.test.ts` — untouched, green (23/23).
- `infra/config/stages.test.ts` 23/23 — dev pin updated, prod/preview unchanged.
- `packages/journeys` — `surface-gates.test.ts` 11/11, `cli-flags.test.ts` 11/11,
  `registry.test.ts` 7/7 (the vacuous refusal now on `run-report`).
- Script gates: `check:dom-contract` **760/760 green** (figures 49/49 — six
  initial violations fixed: `data-figure-preview-pending`/`data-propose`/
  `data-mark` assertions + literal `caption`/`alt`/`sourceLine`/`mark`
  emissions) · `check:licenses` ✓ · `check:protocol-markers` ✓ ·
  `check:no-cookies` ✓ · `check:spa-budget` ✓ (entry 183.5/250 kB; the figures
  chunk `figures-*.js` 3.8 kB gzip) · `check:spa-env` ✓.

## 3 — Deferrals

- `D-SPA.19-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += figures` + `--expect-renderer spa` on
  `SURFACE_GATES.figures` = `P1.figures`, C `paid:false`). **OPEN** — blocker
  recorded verbatim.
- `D-SPA.19-2` — preview rollback drill (flag off → SSR serves the same figures
  DOM contract). **OPEN** — same blocker.
- `SURFACE_GATES.figures`' `owed` notes carry two more honest rows: the
  `P1.figures` step stays `expected:red` until that preview leg proves it, and
  the figure-bearing desktop legs (type chips, field edits, the pending-proposal
  Accept/Reject arms) ride the note — no free step can mint a figure (the
  Visualize click is a paid run).
- Blocker updates appended to `D-OPS.1-1` / `D-SPA.6-1` / `D-MAINT.6-1` — all
  stay OPEN; none closed.
- Neither preview nor prod was touched: `STAGES.preview.spaSurfaces` stays `[]`,
  `STAGES.prod.spaSurfaces` unchanged. REQ-SEQ-11 deployable-dark holds — the PR
  is additive-only on the render side.

## 4 — AC status

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations green — typed JSON, preserved statuses | **engineered** — `p.figures`/`p.figureCard`/`p.visualize` twins + all seven POSTs' `wantsJson` branches, all under test |
| React surface emits the full dom-contract vocabulary — component tests + axe | **engineered** — 31 dom tests + `expectManifestEmission` parity + axe on all three leaves; 49/49 hooks emitted+asserted |
| Retained SSR tests stay green — fallback untouched | **engineered** — `figure-surfaces.test.ts` green (23/23), zero edits |
| Journey step + `SURFACE_GATES` + preview two-leg on `pr-<n>` | **journey engineered; preview leg DEFERRED** — `D-SPA.19-1` (secret blocker); `P1.figures` committed expected-red |
| Rollback drill evidence on the preview | **DEFERRED** — `D-SPA.19-2` (same blocker); the flag-off path is unit-pinned |
| Dev stage-fact line — prod untouched | **engineered** — `STAGES.dev.spaSurfaces += "figures"` |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage; the SPA's render asserts live in `figures.dom.test.tsx`; status/mutation legs live in `bff.test.ts` |
| Universal phase-gate AC | recorded — checks below; deferrals appended; ledgers advanced |

## 5 — Checks read + memory

- **PR** — `gh pr checks` read once at closeout: `typecheck / lint / unit`
  **pending** (recorded in BUILD_INDEX row 154; the inherited-red classification
  rule is GD-MAINT.4-1's — the privsep `integration` leg is waived on the chain
  and did not report on this run's read).
- `check-build-memory.sh` + `check-append-only.mjs --base f933ecc` — green at
  closeout.
- `BUILD_INDEX.md` row 154 · `LEDGER.md` advanced — `nextTicket: SPAF.10`
  (manifest row 126 — the prod `figures` flip, gated on the REQ-SEQ-10
  nightly-green bake), `lastCompleted: SPA.19`,
  `chainTip: stevevitali/spa-19-surface-figures`.

## 6 — Deviations / notes

- **No new ADRs** — every decision follows an existing one (REQ-BFF-1/2/3/11/20's
  envelope + twin rules, the `bodyFields` dual-grammar decode, REQ-SEQ-9/11's flag
  + deployable-dark invariants, REQ-BFF-17's no-bytes-over-JSON rule).
- **`figureEstimate`/`figureSourceRefs` hoisted, not duplicated** — the BFF
  visualize twin, the document GET, and the POST share the one derivation; the
  api still re-derives at run-create time (the sheet only pre-fills).
- **The visualize twin echoes `?figure=` raw-or-normalized?** — normalized: the
  server strips `fig_` via `figureIdFromRef` and the twin answers the bare id; the
  leaf replays it verbatim into `figureId`. The `?figure=` query key itself stays
  the raw ref so `fig_fig01` and `fig01` cache separately but read identically.
- **Size:** ~2.2k changed lines incl. ~770 of new dom tests + ~380 of new bff
  tests — over the ~600 guide for the same reason as SPA.14–18 (test files
  dominate; production diff is modest).
- **`P1.figures` is the surface's sole gate step by design** — renderer-agnostic
  phone-width asserts work under both renderers today; the figure-bearing arms
  stay honestly owed (paid-run prerequisite) rather than a vacuous desktop step.
