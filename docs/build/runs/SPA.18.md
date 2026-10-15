# SPA.18 — run ledger: surface `outline` (`/p/:slug/outline` + `/p/:slug/outline/promote`)

- **Ticket:** `docs/tickets/123_SPA.18__surface-outline.md` (manifest row 123)
- **Branch:** `stevevitali/spa-18-surface-outline` — forked from
  `stevevitali/spaf-8-prod-flip-export-ide-chrome` @ `6968fcb` (the requested chain tip).
- **PR:** [#145](https://github.com/SteveVitali/Rhema/pull/145) —
  `pr/SPA.18.md` is the committed body.
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

The secret was never printed (there is no version to print). Without it
`preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in
preview session can mint through the magic-link + mailbox leg — `P1.outline` is
session-gated. The preview two-leg and rollback drill are honestly deferred
(`D-SPA.18-1`/`-2`), with the deterministic in-repo proof standing in. This is the
same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` / `D-SPA.13-1` /
`D-SPA.14-1` / `D-SPA.15-1` / `D-SPA.16-1` / `D-SPA.17-1`.

## 0b — Inherited chain debt closed first

`check:dom-contract` failed on the base (`6968fcb`) with four unasserted billing
hooks — `data-plan-ladder`, `data-topups`, `data-auto-reload`, `packId` — SPA.16's
recorded debt (SPAF.8's ledger names SPA.18 as the owner). Assertions added in
`apps/web/src/spa/billing.dom.test.tsx`; the check reads 719/719 with outline's
33/33 — zero outstanding rows.

## 1 — What landed

### `GET /bff/p/:slug/outline` — the editor twin (`server.ts`, REQ-BFF-1/11, REQ-DAT-4/6/13)

`{outline:{slug, editable, saveAction, deleteAction, draftEstimateCredits?,
outline: GateOutlineView, cited}}` — the document's own composition verbatim:
`outlineViewFor` + `outlineDraftEstimate` are the SSR GET's inline mapper +
EST.1 estimator **factored out and shared** (one mapper both renderers — the
same `GateOutlineView` rows, the same estimate, the same `cited` fact off
`dto.citedBy`). `bffProjectRow` resolves slug→id once per request; `?slug` (the
artifact pick) is a server-echoed read input; `editable` is the api's raw fact —
the document's `&& !isPhoneRequest` AND lands on the leaf's boot-owned
`deviceClass`. A swallowed/null outline read answers `{outline:null}` at 200 —
the document's own not-found arm — while a missed slug keeps the 404 envelope.

### `GET /bff/p/:slug/outline/promote` — the consent-sheet twin

`{outlinePromotion:{slug, projectTitle, promotion, scope, threadId?, turnId?,
started?}}` — the api's verbatim promotion facts (`getOutlinePromotion` under
the SSR's catch→not-found seam — a refused/missed read answers
`{outlinePromotion:null}` at 200, the document's own 404 arm) plus the
`scope`/`threadId`/`turnId` the document reads off the URL (the form's hidden
fields replay them — server-echoed, never client-invented; `thread`/`turn`
aliases accepted like the document). A missed slug keeps the 404 envelope.

### The four POSTs — `wantsJson` + `mutationOutcome`/`bffFail` (REQ-BFF-1/2/3)

- `POST /p/:slug/outline` — `bodyFields` reads the JSON content-type or the form
  body; a JSON caller may post the SAME flat `ed.*` map OR a structured `{edit}`
  body — `decodeGateEditFields` decodes identically either way (the gate card's
  grammar — REQ-GATE-5/6). Empty edits stay a no-op →
  `mutationOutcome({redirect:"/p/:slug/outline"})`; a patch success answers the
  result verbatim in the `{ok:true, data}` envelope; a failed patch →
  `{error:"save_failed"}` 422 for JSON callers / the unchanged redirect for
  forms. Unauthed JSON → 401 (this POST already answered JSON 401 before this
  ticket — `client/outline.ts` posts `Accept: application/json`).
- `POST /p/:slug/outline/promote` — scope/threadId/turnId/slug off `bodyFields`;
  success → `mutationOutcome({redirect:"/p/:slug", data:out})` — the identical
  destination the 302 carried; an unbound seam → `{error:"upstream_unavailable"}`
  502 JSON vs the 502 not-found document; ApiError refusals ride `bffFail` at
  the preserved status (`thread_not_found` 404 / `run_in_progress` 409 /
  ≥500 → 502) while forms keep the sheet re-render with `data-notice`.
- `POST /p/:slug/outline/delete` — success → `{ok,redirect:"/p/:slug"}`; the
  cited-outline refusal rides `bffFail` → 409 `{error:"outline_cited"}` verbatim
  for JSON callers while the form keeps `/outline?notice=cited`.
- `POST /p/:slug/outline/gaps/:gapId/answer` — `{text}` off `bodyFields`; blank
  stays a no-op; success → `{ok,redirect:"/p/:slug/outline?saved=1"}`; the
  swallow-the-write seam is verbatim.

No JSON caller ever receives a 3xx; no form caller loses an existing redirect;
the session split is 401-JSON / 302-`/login` on every route.

### `spa/queries.ts` — `BffOutlineTwin` + `BffOutlinePromoteTwin` + factories

Typed twins + `queryOptions` (`["bff","p",slug,"outline",…]` /
`["bff","p",slug,"outline","promote",scope,threadId,turnId,slug]`) with the
shared `retryPolicy` — the promote query key carries the URL-echoed picks so a
nav to a different scope re-reads.

### `spa/surfaces/outline.tsx` — `OutlineSurface` + `OutlinePromoteSurface`

- `OutlineSurface` ports `OutlinePage` verbatim: the metadata rail
  (thesis/venue/target length/protocol/voice), `OutlineSections` from
  `@rhema/ui` (the shared renderer — spine/sections/claims/provenance/
  alternatives/gaps/unverified badges emit identically under both renderers),
  `data-outline-editor` + `data-autosave` form, `data-draft-estimate`,
  `data-saved-note`/`data-notice`/`data-cited-note` flashes (`?saved=1` +
  `?notice=cited` map through `COPY`), the cited-delete protection arm,
  gap-answer forms, the delete form, §10.1 phone/read-only suppression.
- `OutlinePromoteSurface` ports `OutlinePromotePage` verbatim: the fact rails
  (`data-promotion-sources`/`data-promotion-urls`/`data-promotion-estimate`),
  `data-existing`, `data-started`, the consent form's hidden
  scope/threadId/turnId/slug replays, the `outlinePromotion:null` not-found arm,
  the refused-POST `data-notice` arm.
- Mutations post JSON via `bffFetch`: the editor serializes its live `ed.*`
  field map off the delegated `onSubmit` (the same grammar the island's
  `FormData` post carried); the envelope's `redirect` navigates in-router and
  the `["bff"]` settle-invalidate refetches so updated rows land where the SSR
  302's reload put them; `aria-busy` + disabled controls in flight (REQ-UX-16);
  a same-origin redirect into an unflipped leaf document-navigates (the promote
  success lands `/p/:slug` — project leaf — via `navigateDocument` when its
  verdict isn't `spa`).

### The leaves (`spa/routes/_authenticated/p.$project.outline{,_.promote}.tsx`)

`validateSearch` carries `saved`/`notice`/`slug` (editor) and
`scope`/`threadId`/`turnId`/`slug` (promote); the loaders warm
`projectOutlineQuery`/`projectOutlinePromoteQuery` ONLY on a `"spa"` boot
verdict; twin 404 → `notFound()`; SSR verdicts render `SsrHandoff` with zero
BFF spend. `outline` is a non-IDE-framed leaf — no chrome consult.

### DOM contract (REQ-VFY-2) + stage fact (REQ-SEQ-9)

`dom-contract.ts` outline section: **33 hooks**, dual emitters
(`pages.tsx` + `spa/surfaces/outline.tsx`) — `data-outline-editor`,
`data-autosave`, `data-autosave-status`, `data-draft-estimate`,
`data-saved-note`, `data-notice`, `data-cited-note`, `data-promotion-sources`,
`data-promotion-urls`, `data-promotion-estimate`, `data-existing`,
`data-started`, `data-outline-delete`, the pre-existing
section/sections/claim/gap/move-card/what-changed hooks, the `ed.*` field
prefix, field names `slug`/`threadId`/`turnId`/`scope`/`text`, urlparams
`saved`/`notice`/`slug`/`scope`/`threadId`/`turnId`.
`STAGES.dev.spaSurfaces += "outline"`; preview `[]` and prod unchanged —
**the prod flip is SPAF.9's own row**.

### Journeys — `P1.outline` (expected:red)

`steps.ts` — `P1_OUTLINE` walks `/p/:slug/outline` + `/outline/promote?scope=
thread` at phone width (`p1PhoneProject`): an existing outline must render
read-only — no `ed.*` fields, no `[data-outline-delete]`, no editor Save
submit, no `[data-add-claim]` (§10.1 verbatim) — else the not-found arm; the
promote sheet must render `data-promotion-estimate` + sources/urls rails or its
own not-found arm; overflow + axe clean either way — renderer-agnostic by
construction, so the same step serves leg A (ssr) and leg B (spa).
`registry.ts` — `expected:"red"`, `owner:"UX.2"` (the planning-ledger P1 family
rule: every `P1.*` leg carries the ledger's owner). `SURFACE_GATES.outline =
{P1.outline}` + honest `owed` notes (the Resend blocker + the desktop/editor
arms no free step can mint — promotion is a paid run, REQ-VFY-10).
`cli-flags.test.ts`/`surface-gates.test.ts` updated — the vacuous-gate refusal
moves to `figures` (outline's gate is now non-empty).

## 2 — Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` (full suite) — **5,417 pass / 4 skip / 0 fail** (482 files).
  Mid-run reds, all this ticket's own and fixed + re-verified:
  1. `outline.dom.test.tsx` fixture stub treated `bffFetch`'s explicit
     `method:"GET"` as a miss → `unstubbed_path` 500s — reordered the stub so
     POST branches check `init.method === "POST"` and twins serve the GET arm.
  2. `?notice=cited` rendered the raw code — mapped through
     `COPY.outlinePage.citedNote`; hidden inputs moved to `defaultValue`
     (controlled-input warning); the delete-409 leg's refetch now carries
     `cited:true` via the second-read fixture (`outlineAfter`).
  3. `registry.test.ts` — `P1.outline` owner `SPA.18` → `UX.2` (the P1 family
     carries the ledger's owner); the all-ids list gains `P1.outline`.
- `outline.dom.test.tsx` — **23 tests**: both leaves mounted through the
  production router; SSR-verbatim vocabulary + `expectManifestEmission` parity
  vs `OutlinePage`/`OutlinePromotePage`; the `ed.*` save JSON leg; promote
  consent post + in-router `{ok,redirect}` ride; refused-promote `data-notice`
  arm; `data-started` arm; `{outlinePromotion:null}` arm; cited-409 delete →
  `?notice=cited` on the refetched twin; gap-answer leg; `?saved=1`;
  phone/read-only suppression; `SsrHandoff` zero-BFF on the `ssr` verdict;
  404→`notFound`; REQ-UX-16 `aria-busy`; component axe.
- `bff.test.ts` SPA.18 block — **+22 → 193**: both twins' composition
  (verbatim `GateOutlineView`/`OutlinePromotionDto`, cited fact, estimate,
  server-echoed picks, `?slug` pick), unknown-slug 404s, `{outline:null}` /
  `{outlinePromotion:null}` degrade arms, unauthed 401s; all four POSTs'
  JSON-vs-form splits (envelope vs 302, no JSON 3xx ever), stable
  `outline_cited` 409, `save_failed` 422, blank-text/empty-edits no-ops,
  promote refusal statuses.
- Retained SSR suite `outline-surfaces.test.ts` — untouched, green (13/13).
- `infra/config/stages.test.ts` 23/23 — dev pin updated, prod/preview unchanged.
- `packages/journeys` — 122/122 (registry schema, surface-gates totality +
  paid-free + the refusal now on `figures`, cli-flags gate resolution).
- Script gates: `check:dom-contract` **719/719 green** (billing debt repaired;
  outline 33/33) · `check:licenses` ✓ · `check:protocol-markers` ✓ ·
  `check:no-cookies` ✓ · `check:spa-budget` ✓ · `check:spa-env` ✓.

## 3 — Deferrals

- `D-SPA.18-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += outline` + `--expect-renderer spa` on
  `SURFACE_GATES.outline` = `P1.outline`, C `paid:false`). **OPEN** — blocker
  recorded verbatim.
- `D-SPA.18-2` — preview rollback drill (flag off → SSR serves the same outline
  DOM contract). **OPEN** — same blocker.
- `SURFACE_GATES.outline`'s `owed` notes carry two more honest rows: the
  `P1.outline` step stays `expected:red` until that preview leg proves it, and
  the desktop-width + outline-bearing arms (editable `ed.*` form, autosave
  status, cited-409 flash) ride the note — no free step can mint an outline.
- Neither preview nor prod was touched: `STAGES.preview.spaSurfaces` stays `[]`,
  `STAGES.prod.spaSurfaces` unchanged. REQ-SEQ-11 deployable-dark holds — the PR
  is additive-only on the render side.

## 4 — AC status

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations green — typed JSON, preserved statuses | **engineered** — `p.outline` + `p.outlinePromote` twins + all four POSTs' `wantsJson` branches, all under test |
| React surface emits the full dom-contract vocabulary — component tests + axe | **engineered** — 23 dom tests + `expectManifestEmission` parity + axe subset; 33/33 hooks emitted+asserted |
| Retained SSR tests stay green — fallback untouched | **engineered** — `outline-surfaces.test.ts` green, zero edits |
| Journey step + `SURFACE_GATES` + preview two-leg on `pr-<n>` | **journey engineered; preview leg DEFERRED** — `D-SPA.18-1` (secret blocker); `P1.outline` committed expected-red |
| Rollback drill evidence on the preview | **DEFERRED** — `D-SPA.18-2` (same blocker); the flag-off path is unit-pinned |
| Dev stage-fact line — prod untouched | **engineered** — `STAGES.dev.spaSurfaces += "outline"` |
| Chain-debt repair (SPA.16's four billing hooks) | **closed** — `billing.dom.test.tsx` asserts; `check:dom-contract` 719/719 |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage; the SPA's render asserts live in `outline.dom.test.tsx`; status/mutation legs live in `bff.test.ts` |
| Universal phase-gate AC | recorded — checks below; deferrals appended; ledgers advanced |

## 5 — Checks read + memory

- **PR** — `gh pr checks` read at closeout (recorded in BUILD_INDEX row 152; the
  inherited-red classification rule is GD-MAINT.4-1's).
- `check-build-memory.sh` + `check-append-only.mjs --base 6968fcb` — green at
  closeout.
- `BUILD_INDEX.md` row 152 · `LEDGER.md` advanced — `nextTicket: SPAF.9`
  (manifest row 124 — the prod `outline` flip, gated on the REQ-SEQ-10
  nightly-green bake), `lastCompleted: SPA.18`,
  `chainTip: stevevitali/spa-18-surface-outline`.

## 6 — Deviations / notes

- **No new ADRs** — every decision follows an existing one (REQ-BFF-1/2/3/11/20's
  envelope + twin rules, REQ-GATE-5/6's `ed.*` grammar shared with the gate
  card, REQ-SEQ-9/11's flag + deployable-dark invariants).
- **The save POST accepts BOTH body grammars** — the flat `ed.*` field map (what
  the SSR form + the island's `FormData` post) and a structured `{edit}` object
  (what a JSON caller naturally sends). The decode is identical; the flat
  grammar remains canonical for parity.
- **Size:** ~1.4k changed lines incl. ~590 of new dom tests + ~460 of new bff
  tests — over the ~600 guide for the same reason as SPA.14–17 (test files
  dominate; production diff is modest).
- **`P1.outline` is the surface's sole gate step by design** — renderer-agnostic
  phone-width asserts work under both renderers today; the desktop/editor arms
  stay honestly owed (paid-run prerequisite) rather than a vacuous desktop step.
