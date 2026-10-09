# SPA.17 — surface: export + ide-chrome (`/p/:slug/export` → React SPA — the FIRST IDE-framed flip)

**Manifest row 121** · stacks on `stevevitali/spaf-7-prod-flip-billing` @ `1e980b8` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/121_SPA.17__surface-export-ide-chrome.md` per
`docs/design/22` (endpoint table — the `p.export` row + §5 "Downloads:
navigations, never fetches"), `docs/design/29` (route-map `export + ide-chrome` —
first chrome-carrying flip; §coexistence scoped asserts), `docs/design/27`
(two-leg + rollback mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"export"` — `"ide-chrome"` was already dev-flipped
with SPA.14, so the AND-pair completes on dev. Preview `[]` and prod
`["usage","inbox","settings","voices","onboarding","project-home","billing"]` stay
unchanged (the prod flip is SPAF.8's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — the leaf's loader
skips its BFF read and `SsrHandoff` document-navigates back to the same URL, where
the server re-runs session → `spaShellResponse` consult → SSR in its normative
order (REQ-BFF-20). The boot verdict for `/p/$project/export` is the
server-ANDed `export` ∧ `ide-chrome` consult — `deps.spa` ANDs `ide-chrome` onto
every `SPA_IDE_FRAMED_SURFACES` key (`"export"` is one), so the boot map already
carries the composite; the client never reconstructs it. SSR fallback +
`export.test.ts` untouched and green (REQ-SEQ-11/12); `?ssr=1`/
`x-rhema-renderer` overrides ride the unchanged consult machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8 · REQ-BFF-16/17 · REQ-SEQ-6 · REQ-UX-8 · REQ-VFY-9 ·
REQ-UX-3 · REQ-UX-4 · REQ-UX-5 · REQ-UX-10 · REQ-UX-13 · REQ-UX-14 · REQ-UX-15 ·
REQ-UX-16** · supporting: REQ-BFF-1/2/3/11/20 · REQ-DAT-4/6 · REQ-SEQ-2/11/12 ·
REQ-TST-2 · REQ-VFY-2/4/6/7 · REQ-SAFE-10

## What lands

### `GET /bff/p/:slug/export` — the export twin (REQ-BFF-1/8/9/11, REQ-DAT-4/6)

`{export:{slug, projectId, dialog, project:{title,pill,slug}, paperTheme,
appTheme?, ide}}` — the §13.4 dialog verbatim over `getExportDialog` under the
SSR's catch→not-found seam (a refused read answers 404, never a fabricated
dialog), slug→id off the request-scoped memo, project facts, and the `ide` bag
(`ideContext` verbatim) the leaf republishes onto the React chrome — the first
IDE-framed flip (REQ-SEQ-12). `?error`/`?added`/`?focus` stay URL state;
`compact` is boot-owned.

### Mutations — the honest split (REQ-BFF-1/2/3/17)

- `POST /p/:slug/export` — **the binary stays a document navigation.** A
  `wantsJson` caller gets `{error:"binary_download"}` 400 *before* the upstream
  export runs — bytes never traverse a JSON envelope; the form post streams the
  `content-disposition` answer verbatim. 401-vs-302 session split and
  not-found parity both legs.
- `POST /p/:slug/export/addition` — the surface's one JSON mutation: `{sentence}`
  off the JSON envelope or the form body (`bodyFields`); a blank sentence stays
  a no-op write; `mutationOutcome` answers `{ok:true,
  redirect:"/p/:slug/export?added=1"}` and forms keep the identical 302.

### The React surface + the first chrome-carrying leaf

- `spa/surfaces/export.tsx` — `ExportSurface` ports `ExportPage` verbatim
  (§13.4: format radios, `.md`-only profile, citation styles, `attachAiUse`,
  provenance toggle, disclosure note, exclusivity reminder, the never-blocking
  obligation line/items, the AI-use statement block, the standalone `.md`/`.docx`
  download links, phone-width suppression). The export form keeps
  `method="post"` — native document nav, no fetch. The addition form's delegated
  `onSubmit` posts JSON: `redirect` → in-router `?added=1` nav, `["bff"]`
  settle-invalidate refetches so the appended `data-addition` row lands where
  the SSR reload put it; `aria-busy` + disabled controls in flight (REQ-UX-16).
- `spa/ide/chrome-data.tsx` — `useShellChrome` hoisted out of onboarding's
  `useImportChrome`: one mapper publishes a twin's shell (`project`/`paperTheme`/
  `appTheme`/`ide` incl. the parsed `PaletteData` + the shared `FilesPane`) onto
  `IdeChromeData`. `onboarding.tsx` delegates verbatim.
- `p.$project.export.tsx` leaf — `validateSearch{focus,error,added}`; loader warms
  `projectExportQuery` ONLY on the `"spa"` verdict; 404 → `notFound()`; SSR
  verdict → `SsrHandoff` (zero BFF spend). `IdeProjectLayout` mounts `<IdeChrome>`
  iff the leaf is in `SPA_IDE_FRAMED_ROUTES` ∧ its verdict is `"spa"` — the
  export leaf is the first content the React chrome frames; unframed routes stay
  outside `.ide`.

### DOM contract + stage facts + journeys

- `dom-contract.ts` — export section dual-emitter'd (`pages.tsx +
  spa/surfaces/export.tsx`) and completed: `data-export-error`,
  `data-md-profile`, `data-provenance-toggle`, `data-disclosure-note`,
  `data-exclusivity-reminder`, `data-obligation-line`, `data-ai-use`,
  `data-generated`, `data-addition`, the field names (`format`, `profile`,
  `cslStyle`, `attachAiUse`, `attachProvenance`, `sentence`), urlparams
  (`error`, `added`).
- `STAGES.dev.spaSurfaces += "export"`; `stages.test.ts` pin updated; prod +
  preview untouched.
- Journeys — **the scoped renderer assert** (design/29 §coexistence):
  `gatedRouteIds`/`rendererScope` scope `--expect-renderer` to the gated
  surfaces' route ids — a `--surface export` leg pins `spa` on
  `/p/:slug/export` documents without demanding SPA on the still-SSR docs its
  steps traverse (R5's editor-doc hop). R5 re-spec'd to attribute-only hooks
  (`[data-export-form]`, `[data-export-form] button[type="submit"]`). The
  `/p/:p/import*` legs stay `onboarding` ∧ `ide-chrome` AND-gated —
  unchanged.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — full suite green; one mid-run red (copy-containment literals on
  the new surface — `.md`/`.docx` → `COPY.export.standaloneMdLabel`/
  `standaloneDocxLabel`; the `>bffFetch<` arrow-generic false positive → the
  block-body `mutationFn` idiom) fixed + re-verified.
- Focused: `export.dom.test.tsx` (11 — mount/parity/axe/chrome-legs/busy/
  SsrHandoff-no-BFF), `bff.test.ts` (+11 → 171), `settle.test.ts` (+5 → 16),
  `runner.test.ts` (+3 → 12), `export.test.ts` (retained SSR, untouched, 6/6),
  `stages.test.ts` (23/23), `surface-gates.test.ts` (11/11).
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` ·
  `check:spa-budget` · `check:spa-env` — all clean.
- Full-suite totals recorded in `runs/SPA.17.md` at closeout.

## Honestly deferred (DEFERRALS.md)

- **D-SPA.17-1** — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += export` + `--expect-renderer spa` on
  `SURFACE_GATES.export` = R5/T4/T8, C `paid:false`).
- **D-SPA.17-2** — preview rollback drill (flag off → SSR serves the same export
  DOM contract).
- Blocker: `rhema-nonprod-resend-api-key` absent from Secret Manager
  `rhema-507501` — probed `gcloud secrets versions access latest` → `NOT_FOUND`
  (value never printed). Without it `preview-stack.mjs resend-pull` cannot seed
  `rhema:resendApiKey` → no signed-in preview session mints → the session-gated
  export legs cannot run. Same live blocker as `D-MAINT.6-1` and every prior
  SPA deferral; both rows carry the exact unblock recipe + verify steps.

## Out of scope (held)

Prod flip (SPAF.8 — `export` + `ide-chrome` together, REQ-SEQ-6's paired flip),
SSR deletions (REQ-TST-1 cleanup wave), API/schema changes — never (spec §13).
