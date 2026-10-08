# SPA.9 — ide-chrome React layout: panes, palette, keymap, SSE feed (run ledger)

- **Status:** DONE (Stage A; deterministic-only — offline ticket, no live legs)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/106_SPA.9__ide-chrome-layout.md` (manifest row 106)
- **Branch:** `stevevitali/spa-9-ide-chrome-layout`, stacked on
  `stevevitali/spa-8-safety-gates` @ `4dfcb19` (`OPERATOR` merge policy, **not merged**).
- **Goal:** the React IDE chrome every IDE-framed surface mounts inside — the project layout
  (panes + activity/sidebar regions), the local-only command palette (`⌘K`, zero-POST), the
  scoped keymap with focus-zone discipline, and the SSE/feed binding — the `ide.ts` island's
  non-document logic ported to layout-owned React (REQ-ISL-9/10/14/15, REQ-NAV-8, REQ-UX-8/16,
  REQ-SEQ-12, REQ-BFF-24).
- **Spend:** $0. No deploys, no production writes, no live legs.

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): `D-SPA.6-1` assessed — still OPEN; nothing in this ticket
  unblocks it (leg (a) needs the operator's chain merge+deploy; leg (b) needs CI `images` digests
  + `rhema:spaSurfaces` stack config on a `pr-<n>` preview). No row closed; none opened — every
  SPA.9 AC is deterministic/engineered (in-process component tests).
- The ticket's "`?theme` papers stay deferred" note is a design-level deferral carried from the
  SPA spec (paper-theme picker remains out of scope); unchanged here.
- LEDGER CURRENT STATE read: `nextTicket: SPA.9`, `chainTip: stevevitali/spa-8-safety-gates`,
  `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- Design sources applied, not re-derived: `docs/design/24_spa-ux-design-system.md` (tokens,
  REQ-UX-16 chrome polish list), `docs/design/25_spa-navigation-ia.md` §chrome + keymap table,
  `docs/design/23_spa-editor-collab-binding.md` (chrome vs document-mount split),
  `apps/web/src/client/ide.ts` (the 1,152-line island ported), `docs/frontend-spa-spec.md` §5.

## 1 — What landed

### `packages/contracts/src/spa.ts` — `SPA_IDE_FRAMED_ROUTES` (the layout gate)

- Eleven `routeId`s mount inside the §5.1 IDE chrome — design/29's route-map "IDE-framed" column
  reconciled against the SSR `ideContext` call sites: `/p/$project`, `/import`, `/import/preview`,
  `/run`, `/review/$runId`, `/r/$runId`, `/revisions/$cid`, `/v/$v`, `/v/$n/diff/$m`,
  `/a/$artifactId`, `/export`. Key granularity stays in `SPA_IDE_FRAMED_SURFACES` (the flag
  consult); route granularity lives here (the layout gate).
- Unframed project routes (`/settings`, `/outline`, `/figures`, `/usage`, `/obligations/new`,
  `/visualize`, `/voice/reseed`, `/outline/promote`, `/figures/$figureId`) render outside `.ide`
  even when their surfaces flip.

### `apps/web/src/spa/ide/chrome-data.tsx` — the publish seam

- `IdeChromeData` — the prop bag the SSR `ideContext` assembled (project title/slug, palette
  data, feed descriptor, page-mount props, density/tab defaults), published **bottom-up** by
  surface leaves via `useIdeChromeData(data)` into a plain React context — deliberately not
  `Route.useRouteContext`, so leaf tests and future mounts stay decoupled from the router.
- `useIdeChromePublished` hands the layout `{data, published}`; the memoized provider wraps both
  the framed and unframed branches so a leaf publishing under an unframed route is a no-op.
- The seam never crosses server-rendered bodies: surfaces publish data, not DOM.

### `apps/web/src/spa/ide/controller.ts` — the island port (REQ-ISL-9/10/15, REQ-NAV-8, REQ-UX-7/8/16)

- One binding effect replays `ide.ts`'s listener set against the `<IdeShell>` DOM — the
  attribute-driven contract: pane state lives in `data-*` on `.ide`, never React props.
- Ported: pane visibility/order/width state + `paneDrag` handles, context/selection menus,
  view menu + theme menu (radio rows), command menu (`parseCommand`/`resolveCommand`),
  the palette (`paletteModel` + search hits — **zero-POST**: every activation is a router
  navigation or the run sheet's GET), cheat sheet, findings shortcuts, typography
  (font/reader-step), authorship overlay, restore-point/finding-action CustomEvents,
  `?focus=1` apply-then-strip, `#finding-` deep links.
- **Keymap (REQ-ISL-9, REQ-NAV-8):** `dispatchIdeKey(ev, zone)` verbatim; `zone` resolved from
  the event target — `.ide-page`/editor ⇒ `page`, inputs ⇒ `input`, margin ⇒ `margin`,
  findings/desk list ⇒ `findings`, else `none`. Findings chords are inert in `page`/`input`.
- **localStorage (REQ-SEQ-12):** keys + codecs carried verbatim — `paneStorageKey(user,project)`
  (`rhema:panes:v1:u:p`), `rhema:font:v1`, `rhema:reader-step:v1`, `rhema:authorship:v1:<p>`,
  `rhema:theme:v1`, `rhema:paper:v1:<slug>` — mixed-mode coexistence (SSR island ⇄ React chrome
  share state on the same keys).
- The one deliberate delta: `window.location.assign` → the router's history for in-tree
  navigation; server-owned targets still resolve through `SsrHandoff`/not-found → document nav.
- Overlay focus-return: palette/menu/cheat-sheet close returns focus to the opener (REQ-UX-16).

### `apps/web/src/spa/ide/feed.ts` — the SSE tail (REQ-ISL-14, REQ-BFF-12/24, REQ-UX-9/15)

- Same-origin `EventSource` resumes at `?after=<lastSeq>`; server-built `FeedLabelMaps` arrive
  via the `["feed-labels"]` Query (`GET /bff/feed-labels`) — the tail stays closed until maps
  resolve; malformed/unknown frames drop (fail-closed templates — REQ-BFF-24).
- `feedRowVisible`/`formatFeedRow` shared with the island; density tabs filter live; 400-row
  bound + `usage.tick`/`step.*` run-card patches verbatim.
- SPA delta: a live event schedules a trailing-debounced `["bff"]` Query invalidation;
  `usage.tick` is exempt (its reading lands in the card meter — per-tick refetch is the storm
  REQ-UX-15's one-SSE rule exists to prevent).
- `aria-live="polite"` panel — every appended row IS the announcement; exactly one active
  EventSource under StrictMode (first mount's source closes on the double-invoke).

### `apps/web/src/spa/ide/chrome.tsx` — `IdeProjectLayout` + `IdeChrome`

- `IdeProjectLayout` (mounted by `p.$project.tsx`): resolves `spaRouteFor(pathname)`, mounts
  `<IdeChrome>` iff the leaf is in `SPA_IDE_FRAMED_ROUTES` **and** `isSpaEnabled(boot, routeId)`
  — the boot map already AND-gated `ide-chrome`, so a stale/unflagged leaf stays on the SSR
  twin. Unflipped ⇒ the leaf's `SsrHandoff`; unframed ⇒ bare `<Outlet>`.
- `<IdeChrome>` renders the shared `<IdeShell>` (manifest vocabulary unchanged — REQ-TST-2
  parity), runs `useIdeChromeController` + `useIdeFeed`, and mounts the REQ-UX-16 skip link
  (`data-skip-link` → `#ide-page`) before the rail.
- `__root.tsx` gained `QueryClientProvider` (the same per-boot client the route context
  carries — REQ-BFF-10) so chrome/surface components can `useQuery`.

### Shared-file touchpoints (additive-only)

- `packages/ui/src/ide-shell.tsx`: the page region gains `id="ide-page" tabIndex={-1}` — the
  skip link's programmatic-focus target (never route-driven; SSR picks it up identically).
- `packages/tokens/src/ide-css.ts`: REQ-UX-16 chrome polish from design/24's sanctioned list —
  `.ide-skip` hidden→focus reveal, hover + `:focus-visible` affordances on menu radio/checkbox
  rows, desk tabs, status-bar buttons, palette rows, pane-head buttons. ONE stylesheet serves
  both renderers, so the SSR twin gains the same polish.
- `apps/web/src/copy.ts`: `IDE_CHROME_LABELS` (pages.tsx's inline `{...COPY.ide, viewMenu:
  {advanced}}` hoisted so the copy-contained SPA graph keeps a leaf-only `COPY.*` surface),
  `IDE_FEED_LABELS` (the `LiveFeedLabels` twin), `COPY.ide.skipToPage`, palette `nextStep`.
- `apps/web/src/dom-contract.ts`: +13 `ide-chrome` hooks the island always emitted but the
  manifest never named — `data-advanced`, `data-authorship`, `data-ide-open-feed`, `data-round`,
  `data-active`, `data-disabled`, `data-armed`, `data-suggestion-replacement`, `data-skip-link`
  (required), role `menuitemradio`, urlparams `q`/`after`/`triage` — 65/65 emitted+asserted.

## 2 — Verification

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **PASS — 135/135 tasks** |
| `pnpm test` (root vitest) | **PASS — 470 files, 5,000 pass, 4 skip, 0 fail** |
| `ide-chrome.dom.test.tsx` (focused) | **29/29** — SSR DOM parity, keymap focus zones, palette zero-POST, SSE resume/invalidation/live-region/StrictMode-single-source, localStorage round-trips, skip-link, overlay focus-return, axe |
| `pnpm --filter @rhema/web lint` | 0 errors (1 pre-existing `spa.dom.test.tsx` unused-disable warning, SPA.8-era) |
| `pnpm check:dom-contract` | **PASS — 491 entries / 18 surfaces; ide-chrome 65 emitted, 65 asserted** |
| `pnpm check:licenses` | **PASS — 822 packages** |
| `pnpm check:protocol-markers` | **PASS — sentinels armed, 169 files, 0 markers, 0 provenance leaks** |
| `pnpm check:no-cookies` | **PASS — 189+ files scanned, zero hits** |
| `pnpm check:spa-budget` | **PASS — all ceilings held** |
| `pnpm check:spa-env` | **PASS — 77 client src, 94 emitted artifacts, 50 banned names (15 derived)** |

## 3 — Findings / deviations

- **Size:** ~2,428 changed lines vs the ~600 guide — the deliverable IS the port: `controller.ts`
  (1,161) replays the 1,152-line `ide.ts` island's non-document logic, and the 692-line dom test
  is the parity/keymap/SSE/storage proof. Recorded per the SPA.5/6/7 test-first precedent.
- **Copy-containment shape (owned decision):** the scanner requires `COPY.*` references to
  resolve to leaf strings; `chrome.tsx` therefore consumes `IDE_CHROME_LABELS`/`IDE_FEED_LABELS`
  — the pages.tsx inline bags hoisted into `copy.ts` — rather than branch-level `COPY.ide.*`
  access. SSR `pages.tsx` keeps its inline form (the scanner covers `src/spa` only).
- **happy-dom storage conflict:** Node's experimental `localStorage` shadows happy-dom's; the
  test installs an in-memory `Storage` — harness fix, not a product shim.
- **paywall.test.ts ENOENT under `--filter`:** `walk("packages/ui/src")` is repo-root-relative;
  the file only runs green under root `pnpm test` (470/5,000 — it passed). Pre-existing
  invocation assumption, not a SPA.9 defect; left as-is.
- **Deferrals:** none opened, none closed. `D-SPA.6-1` unchanged (operator merge+deploy + CI
  images + stack config remain its only unblockers).

## 4 — AC ledger

- `[Chrome renders under the SPA shell with manifest-vocab parity to SSR chrome]` →
  **deterministic** — `assertSurfaceEmissions("ide-chrome")` + the parity block walk the same
  `<IdeShell>` component both renderers emit; 65/65 contract hooks asserted.
- `[Keymap focus-zone behavior identical to ide.ts semantics — ported test cases]` →
  **deterministic** — zone-resolution tests cover page/input/margin/findings/none; findings
  chords proven inert in page + input zones.
- `[Palette actions make zero POSTs]` → **deterministic** — fetch spy across open → filter →
  Enter-navigation asserts zero POSTs (all activations navigate or GET the run sheet).
- `[SSE feed → invalidation + announcement wired through the layout]` → **deterministic** —
  EventSource stub proves `?after=` resume, fail-closed unknown templates, live density,
  debounced `["bff"]` invalidation (+ `usage.tick` exemption), aria-live row announcements, and
  one active source under StrictMode.
- `[universal phase-gate AC]` → this ledger, BUILD_INDEX row 134, LEDGER advanced, append-only
  validators run, PR checks read once at closeout (§5).

## 5 — CI / PR

- PR base `stevevitali/spa-8-safety-gates`; head `stevevitali/spa-9-ide-chrome-layout`;
  unmerged (`OPERATOR`). `docs/build/pr/SPA.9.md` is the body; PR number + `gh pr checks
  --watch=false` (read once) recorded in the closeout addendum.
