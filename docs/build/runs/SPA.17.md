# SPA.17 — run ledger: surface `export` + `ide-chrome` (`/p/:slug/export` — the FIRST IDE-framed flip)

- **Ticket:** `docs/tickets/121_SPA.17__surface-export-ide-chrome.md` (manifest row 121)
- **Branch:** `stevevitali/spa-17-surface-export-ide-chrome` — forked from
  `stevevitali/spaf-7-prod-flip-billing` @ `1e980b8` (the requested chain tip).
- **PR:** [#143](https://github.com/SteveVitali/Rhema/pull/143) —
  `pr/SPA.17.md` is the committed body.
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND:
  Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.        (account 14stevevitali@gmail.com)
```

The secret was never printed (there is no version to print). Without it
`preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in
preview session can mint through the magic-link + mailbox leg — every R5/T4 leg
is session-gated. The preview two-leg and rollback drill are honestly deferred
(`D-SPA.17-1`/`-2`), with the deterministic in-repo proof standing in. This is the
same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` / `D-SPA.13-1` /
`D-SPA.14-1` / `D-SPA.15-1` / `D-SPA.16-1`.

## 1 — What landed

### `GET /bff/p/:slug/export` — the export twin (`server.ts`, REQ-BFF-1/8/9/11, REQ-DAT-4/6)

`{export:{slug, projectId, dialog, project:{title,pill,slug}, paperTheme, appTheme?, ide}}` —
the document's own composition verbatim: slug→id off the request-scoped memo
(`bffProjectRow`), `getExportDialog` under the SSR's catch→not-found seam (a refused
read answers `{error:"not_found"}` 404 — never a fabricated dialog), project facts,
and the `ide` bag (`ideContext` verbatim) the leaf republishes onto the React chrome —
the first IDE-framed flip (REQ-SEQ-12). `?error`/`?added`/`?focus` stay URL state;
`compact` is boot-owned (`deviceClass`).

### The export POST + the addition POST (`wantsJson` + `mutationOutcome`, REQ-BFF-1/2/3/17)

- `POST /p/:slug/export` — the binary stays a DOCUMENT NAVIGATION: a `wantsJson`
  caller gets the honest refusal `{error:"binary_download"}` **400 before the
  upstream export runs** (bytes never traverse a JSON envelope — design/22 §5's
  "Downloads: navigations, never fetches"); the form post streams the
  `content-disposition` answer verbatim. Unauthed JSON → 401, form → `/login` 302;
  unknown slug → `not_found` JSON / the SSR 404 document.
- `POST /p/:slug/export/addition` — the surface's ONE JSON mutation: `bodyFields`
  reads `{sentence}` off the JSON envelope or the form body; a blank sentence stays
  a no-op write (verbatim); `mutationOutcome` answers `{ok:true, redirect:"/p/:slug/
  export?added=1"}` for JSON callers and the identical 302 for forms.

### `spa/ide/chrome-data.tsx` — the shared shell mapper (REQ-SEQ-12)

`useShellChrome(shell)` hoisted out of onboarding's `useImportChrome` — one mapper
publishes a twin's `{project, paperTheme, appTheme?, ide}` bag onto `IdeChromeData`
for both `import` and `export` twins (`IdeTwinShell` names the shared shape).
`onboarding.tsx` delegates verbatim — zero behaviour change there.

### `spa/queries.ts` — `BffExportTwin` + `projectExportQuery(slug)`

Typed twin + `queryOptions(["bff","p",slug,"export"])` with the shared `retryPolicy`.
`?focus` rides the route's `validateSearch` (URL state, never payload).

### `spa/surfaces/export.tsx` — the React twin

`ExportSurface` ports `pages.tsx` `ExportPage` verbatim — same `<PageTitle>` h1,
lede, `data-export-error` `?error=1` flash, `data-obligation-line`/`data-obligation-items`
/`data-obligation-id`/`data-returned` §11.7 never-blocking obligations, the format
radios fieldset, `data-md-profile` + `data-csl-style` selects, `attachAiUse` +
`data-provenance-toggle` + `data-disclosure-note` + `data-exclusivity-reminder`,
`data-export-form`, `data-ai-use`/`data-generated`/`data-addition` statement block,
the standalone `.md`/`.docx` download links, and the phone-width `PhoneBlockedNote`
suppression — all `COPY.export` leaves (two new: `standaloneMdLabel`/`standaloneDocxLabel`
for the copy-containment sweep). Differences by construction: no `IdeFrame` wrapper
(the layout's `IdeChrome` owns the shell), `useShellChrome(data)` publishes the twin's
`ide` bag, and the addition form's delegated `onSubmit` posts `{sentence}` through
`bffFetch` — the envelope's `redirect` navigates in-router to `?added=1` and the
`["bff"]` settle-invalidate refetches so the appended row lands where the SSR 302's
reload put it. REQ-UX-16: `aria-busy` + disabled controls while in flight.
**The export form itself keeps `method="post"` — a native document POST; no fetch
touches it (REQ-BFF-17).**

### The leaf (`spa/routes/_authenticated/p.$project.export.tsx`)

`validateSearch` carries `focus`/`error`/`added`; the loader warms
`projectExportQuery(slug)` ONLY on a `"spa"` boot verdict (the server-ANDed
`export` ∧ `ide-chrome` consult — `deps.spa` ANDs `ide-chrome` onto every
`SPA_IDE_FRAMED_SURFACES` key, `"export"` included); the twin's 404 maps to
`notFound()`; SSR verdicts render `SsrHandoff` with zero BFF spend. `IdeProjectLayout`
mounts `<IdeChrome>` iff routeId ∈ `SPA_IDE_FRAMED_ROUTES` (`/p/$project/export` is)
∧ the boot verdict is `"spa"` — the first content leaf the React chrome ever frames.

### DOM contract (REQ-VFY-2) + stage fact (REQ-SEQ-9)

`dom-contract.ts` export section: dual emitters (`pages.tsx + spa/surfaces/export.tsx`)
on `data-export-form`, `data-csl-style`, plus the missing hooks recorded —
`data-export-error`, `data-md-profile`, `data-provenance-toggle`, `data-disclosure-note`,
`data-exclusivity-reminder`, `data-obligation-line`, `data-ai-use`, `data-generated`,
`data-addition`; field names `format`/`profile`/`cslStyle`/`attachAiUse`/`attachProvenance`/
`sentence`; urlparams `error`/`added`. `STAGES.dev.spaSurfaces += "export"`
(`"ide-chrome"` already dev-flipped with SPA.14 — the AND-pair is complete there);
preview `[]` and prod `[…,"billing"]` untouched — **the prod flip is SPAF.8's own row**.

### Journeys — the scoped renderer assert (design/29 §coexistence)

- `settle.ts` — `gatedRouteIds(surfaces)` maps `--surface` keys to their
  `SPA_DOCUMENT_ROUTES` route ids; `SettleScope.rendererScope` scopes the
  `data-renderer` assert to documents inside the gated path set (a gated leg's
  traversal docs keep their own flag's verdict — R5 walks the still-SSR editor doc).
- `runner.ts` — `RunnerDeps.rendererScope`; the response-stream renderer check
  consults `spaRouteFor(pathname)` before asserting (the response carries no
  `data-route` yet — the SPA shell stamps it client-side); `StepCtx.rendererScope`
  flows to the settle helpers.
- `cli.ts` — `--surface` forwards `rendererScope` alongside the step subset.
- `steps.ts` R5 — re-spec'd to attribute-only hooks: `[data-export-form]` and
  `[data-export-form] button[type="submit"]` (F7's `[attr]` grammar — no
  tag+value pins the React port can't hold).
- `SURFACE_GATES.export = {R5, T4, T8}` (T8 expected-red — owed-reporting) and
  `SURFACE_GATES["ide-chrome"] = {P1.project}` already stood; verified total,
  non-vacuous, paid-free.

## 2 — Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm test` (full suite) — green; the one mid-run red was this ticket's own and
  is fixed + re-verified:
  1. `copy-containment` on `surfaces/export.tsx` — literal `.md`/`.docx` link text
     → `COPY.export.standaloneMdLabel`/`standaloneDocxLabel` leaves; the
     `>bffFetch<` generic-after-arrow false positive → the block-body `mutationFn`
     + `return` idiom the other surfaces already use.
- `export.dom.test.tsx` — **11 tests**: mounted through the production router;
  SSR-verbatim vocabulary (`expectManifestEmission` parity vs the `pages.tsx`
  hooks); format radios + md-profile + csl selects; obligation line + returned
  marker; AI-use statement + `data-addition` rows; the addition form's delegated
  JSON submit (`aria-busy`/disabled in flight, `{ok,redirect}` → `?added=1`
  in-router nav); **the export POST stays a native `method="post"` form — no
  fetch wrapper**; standalone statement links stay plain anchors; phone-compact
  suppression; `SsrHandoff` on the `"ssr"` verdict with zero BFF spend; the
  IDE-chrome framed leg (`.ide` present + chrome publish) vs the unflipped
  bare-Outlet leg; component axe (chrome-level `aria-required-children` disabled —
  the happy-dom hidden-pane artifact, same disposition as `ide-chrome.dom.test.tsx`).
- `bff.test.ts` SPA.17 block — **+11** (171 total): twin composition
  (`slug`/`projectId`/`dialog` verbatim + project facts + `paperTheme` + the `ide`
  bag's chrome fields), unknown-slug 404, refused-dialog 404 (the catch→not-found
  seam), unauthed 401 never-a-redirect; `POST /export` JSON → `binary_download`
  400 with the upstream export never invoked, form POST streams bytes verbatim,
  401-vs-302 session split; `POST /export/addition` JSON `{ok,redirect}` +
  trimmed-sentence write + form-302 parity + blank-sentence no-op + 401/404 splits.
- `settle.test.ts` **+5** (16 total): `gatedRouteIds` table (unset/empty ⇒
  every-document; `export` ⇒ `{/p/$project/export}`; `ide-chrome` ⇒ the two import
  ids; the union) + scoped `awaitMounted` (ungated-route doc keeps its own
  renderer; gated-route wrong-renderer still fails; gated-route pinned-renderer
  resolves).
- `runner.test.ts` **+3** (12 total): a doc outside the gated set never trips the
  leg; a gated doc's wrong renderer fails it; the gated doc's `spa` passes —
  `ctx.rendererScope` asserted in-step.
- Retained SSR suite `export.test.ts` — untouched, green (6/6).
- `infra/config/stages.test.ts` 23/23 — dev pin updated, prod/preview unchanged.
- Script gates: `check:licenses` ✓ · `check:protocol-markers` ✓ · `check:no-cookies`
  ✓ · `check:spa-budget` ✓ · `check:spa-env` ✓ (96 client sources / 126 artifacts).

## 3 — Deferrals

- `D-SPA.17-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += export` + `--expect-renderer spa` on `R5`/`T4`/`T8`,
  C `paid:false`). **OPEN** — blocker recorded verbatim.
- `D-SPA.17-2` — preview rollback drill (flag off → SSR serves the same export DOM
  contract). **OPEN** — same blocker.
- Neither preview nor prod was touched: `STAGES.preview.spaSurfaces` stays `[]`,
  `STAGES.prod.spaSurfaces` unchanged. REQ-SEQ-11 deployable-dark holds — the PR
  is additive-only on the render side.

## 4 — AC status

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations green — typed JSON, preserved statuses | **engineered** — the `p.export` twin + the addition JSON branch + the binary POST's honest `binary_download` refusal, all under test |
| React surface emits the full dom-contract vocabulary — component tests + axe | **engineered** — 11 dom tests + `expectManifestEmission` parity + axe subset |
| Retained SSR tests stay green — fallback untouched | **engineered** — `export.test.ts` green, zero edits |
| Journey re-spec + `SURFACE_GATES` + preview two-leg on `pr-<n>` | **journey re-spec engineered; preview leg DEFERRED** — `D-SPA.17-1` (secret blocker); R5 attr-only + the scoped assert landed |
| Rollback drill evidence on the preview | **DEFERRED** — `D-SPA.17-2` (same blocker); the flag-off path is unit-pinned |
| Dev stage-fact line (`export` **and** `ide-chrome`) — prod untouched | **engineered** — `ide-chrome` was already dev-flipped (SPA.14); this ticket adds `export`, completing the AND-pair on dev |
| REQ-VFY-9 disposition | **MET** — SSR HTML-string asserts stay as retained fallback coverage (the F8 class map keeps them while the document path lives); the SPA's render asserts move to `export.dom.test.tsx` component legs; status/mutation legs live in `bff.test.ts` |
| Universal phase-gate AC | recorded — checks below; deferrals appended; ledgers advanced |

## 5 — Checks read + memory

- **PR #143** — `gh pr checks 143` read at closeout: `typecheck / lint / unit`
  **pending** at record time (the single workflow job had not yet reported —
  recorded, not waited-on; any later reported state is the operator's read at
  merge review; the inherited-red classification rule is GD-MAINT.4-1's).
- `check-build-memory.sh` + `check-append-only.mjs --base 1e980b8` — green at
  closeout.
- `BUILD_INDEX.md` row 150 · `LEDGER.md` advanced — `nextTicket: SPAF.8`
  (manifest row 122 — the prod `export` + `ide-chrome` flip, gated on the
  REQ-SEQ-10 nightly-green bake), `lastCompleted: SPA.17`,
  `chainTip: stevevitali/spa-17-surface-export-ide-chrome`.

## 6 — Deviations / notes

- **No contracts change for the AND-gate:** `SPA_DOCUMENT_ROUTES`'s export row
  stays `surfaces: ["export"]` — the key-level AND lives in `deps.spa` itself
  (`SPA_IDE_FRAMED_SURFACES` carries `"export"`, so `consult("export")` already
  requires `ide-chrome`). The finer-grained `["onboarding","ide-chrome"]` rows are
  for routes under a NON-framed key (`onboarding` frames only the two import legs).
  The boot map's `every(consult)` therefore emits `"spa"` for
  `/p/$project/export` iff both flags hold — the client never reconstructs the
  combination (design/29 §coexistence).
- **Size:** ~1.3k changed lines incl. ~440 of new dom tests + ~215 of new bff
  tests + ~130 of new journey tests — over the ~600 guide for the same reason as
  SPA.14/15/16 (test files dominate; production diff is modest).
- **The axe `aria-required-children` disable** is scoped to the chrome-level
  behaviour (happy-dom renders the shell's hidden panes visibly) — identical
  disposition to `ide-chrome.dom.test.tsx`; the surface subtree is swept clean.
- **No new ADRs** — every decision follows an existing one (REQ-BFF-17's
  navigations-never-fetches, REQ-SEQ-6's paired flip, the SPA.15 `flagParam`
  idiom, SPA.14's chrome-publish seam).
- **Formatting incident (recoveries, for honesty):** a mid-run `prettier --write`
  over touched files reformatted pre-existing ~120-col sources to the
  config's 100-col, inflating the first commit to ~5.5k diff lines. The commit
  was rebuilt surgically — the implementation edits re-applied onto the base's
  own style; the landed diff is 1,664+/99- across 18 files with zero
  unrelated reflow. Focused tests + the full `pnpm test` re-ran green on the
  rebuilt tree.
