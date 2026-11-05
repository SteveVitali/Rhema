# R7SHELL.1c — Global ⌘K palette + tenant-scoped `GET /search` + two-tenant probe

Contract: `docs/tickets/228_R7SHELL.1c__global-palette-search.md` (manifest row 228)
Stack: forks `stevevitali/r7shell-1c-palette` off `stevevitali/r7shell-1b-headers` @ `57426a77` (PR #265, unmerged — OPERATOR)
Requirements stamped: **REQ-SHELL-7** (this PR's head), **REQ-RELOAD-3, REQ-SPEC-30, REQ-ISL-10, REQ-KIT-5, REQ-BFF-11** (re-asserted)

## What landed

- **`GET /search?q=&project=`** (apps/api): tenant-scoped workspace read returning grouped hits —
  projects/drafts/letters from `project_search_docs` via the extracted shared
  `queryProjectSearchDocs` (self-heal + select + `drafts.n` join) plus Voices by
  `display_name ilike` (LIKE-escaped). `d.workspace_id = $1` inside the request-scoped
  `withTenant` client — never the system pool; deleted+archived excluded; `?project=<id>` narrows
  every group (a scope admits only the project's linked Voice). `/projects/search` unchanged.
- **`GET /bff/search?q=&project=<slug>`** (apps/web): session-forwarded twin; hits map to SPA
  deep links — drafts → `/p/:slug/v/:n`, letters → `/p/:slug/revisions/:cid`, voices →
  `/v/:persona`, projects → `/p/:slug` — **never `/edit/:id`** (REQ-RELOAD-3; 231's T5 discharged).
  `?project=` resolves slug→id through `bffProjectRow`; unknown/foreign slug → honest empty groups.
- **One global palette** (`spa/palette.tsx`, cmdk + PaletteList + EmptyState, lazy chunk on first
  ⌘K — `check-spa-entry-graph` now denies `cmdk` + `spa/palette` in entry chunks): workspace
  commands (New project/Inbox/Voices/Usage/Settings/theme via the shell's own `rhema:app-theme`
  seam — the palette issues **zero non-GET** requests), the IDE palette's local commands verbatim
  through the `.ide[data-palette]` `PaletteData` embed + `paletteModel`, project scope inside
  `/p/:slug/*` with a "Search all projects" widen row, debounced `GET /bff/search`, snippets as
  escaped text, Esc/⌘K/backdrop close with REQ-UX-7 focus return. The sidebar Search item renders
  on every signed-in page; the IDE controller + island palette paths retire (SSR docs: ⌘K inert,
  zero requests). `/p/:project/palette-search` is retired — demo namespaces now 404 it without a
  read.
- **Two-tenant probe** (integration): `MARKER_T_SEARCHDOC` seeded into `project_search_docs`;
  each tenant searches the other's doc token AND Voice name; a foreign `?project=` scope leg;
  own-token sanity (fail-closed ≠ empty). `GET /search` is probed, not exempted.
- **Demo boot — palette off** (ADR-132 records the "hidden" choice for 248): `DemoAppShell` mounts
  no host/Search item; the DOM test presses ⌘K under `boot.demo` and proves zero search requests.

## Evidence (Stage A, engineered — $0; no preview under GD-PREVIEW.R7)

- `pnpm exec vitest run apps/api/src/search.test.ts` — 10/10: grouped hits + voices, `?project=`
  scoping, empty-q, 401, **mutation leg** (stripped workspace predicate → foreign rows leak).
- `pnpm exec vitest run integration/src/two-tenant-probe.test.ts` — 1/1: census + query-bearing
  legs, zero findings.
- `pnpm exec vitest run apps/web/src/bff.test.ts` — 225/225: twin mapping, no `/edit/`, slug scope,
  401.
- `pnpm exec vitest run apps/web/src/spa/palette.dom.test.tsx` — 10/10: ⌘K every page, project
  scope + widen, one debounced GET, `<b>`-as-text, EmptyState, SPA-nav hit, demo inert.
- `pnpm exec vitest run apps/web/src` — full web suite green; `integration/src` probe green;
  `packages/security-checks/src/rls-catalog.test.ts` 6/6.
- `pnpm check:dom-contract` — OK (journeys ⊆ manifest ⊆ emitted+asserted).
- `pnpm check:spa-budget` — OK; **entry delta +11.0 kB gz** vs `spa-budget-baseline.json`
  (≤ 15 kB, REQ-KIT-5); `palette-*.js` is a 7.7 kB **async** chunk, cmdk absent from the entry
  graph (`scripts/check-spa-entry-graph.mjs` + new planted-map test).
- `pnpm turbo build lint typecheck` on the touched closure — green; `pnpm test` — green.

## Decisions (ADR-132)

Grouped DTO; one palette absorbing the IDE palette (embed → AppShell); command sources =
workspace list + `data-palette` embed (theme rides the shell's seam — palette issues no write);
`/p/:project/palette-search` retired (231's T5 discharged); demo = palette hidden/off.

## Deferrals

- `D-R7SHELL.1c-1` (OPEN, owner 250_R7DEP.2): Stage-B deployed palette walk — ⌘K finds a draft in
  a second project from `/app`, SPA nav (marker survives, entry count 1), in-project scoped open,
  screenshots, and the probe's LIVE mode vs the preview with two test sessions (or skip reason).

## Carries / notes for later tickets

- 231: T5 (the `/edit/` palette deep link) is discharged here — the route it rode is gone.
- 248: demo palette disposition = **hidden** (no palette in a demo boot — ADR-132 §5).
- 250: owns `D-R7SHELL.1c-1` (above) and the LIVE probe leg for `/search` + `/bff/search`.

Merge policy: OPERATOR.
