# Run ledger — R7SHELL.1c (row 228)

Harness: devin-desktop/swe-2-high/subagent
Skills: e981ec5
Started: 2026-11-05T15:06:03Z
Closed: (open)
Spec: docs/tickets/228_R7SHELL.1c__global-palette-search.md
Base: `stevevitali/r7shell-1b-headers` @ `57426a77` (PR #265 head `e98667e4`, unmerged — OPERATOR)
Branch: `stevevitali/r7shell-1c-palette`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A only per GD-PREVIEW.R7, $0)
Budget: ~650 changed lines excl. generated/fixtures; entry delta ≤ 15 kB gz (REQ-KIT-5)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-05). No `OPEN` row is unblocked by
  this ticket or its landed prerequisites (R7 open rows all owe a deployed surface to 224/250).
- Owes: append `D-R7SHELL.1c-1` (Stage-B palette walk at 250_R7DEP.2) — owner 250.

## Requirements (spec §Goal/In-scope)

1. `GET /search?q=&project=` in apps/api — `withTenant` scoped db + explicit workspace predicate;
   grouped hits (projects/drafts/letters from `project_search_docs` via a shared function +
   Voices by name); deleted+archived excluded; bounded; DTO in `@rhema/contracts`.
2. Two-tenant probe: query-bearing case (A searches B's marker token, reverse, body scanned);
   `/search` probed not exempted; rls-catalog green (no new tables).
3. BFF twin `GET /bff/search`: session-forwarded, GET only; deep links drafts→`/p/:slug/v/:n`,
   letters→`/p/:slug/revisions/:cid`, voices→`/v/:persona` — never `/edit/` (REQ-RELOAD-3).
4. One palette: cmdk, AppShell-mounted, lazy chunk on first ⌘K; ⌘K on every signed-in page;
   project-scoped inside a project + "Search all projects" row; command sources = IDE local
   commands (no POSTs) + workspace commands; IDE palette markup + controller path retire,
   `data-palette-*` kept/migrated; snippets escaped; EmptyState; cmdk keyboard nav.
5. Sidebar Search wired to palette + chord from keymap.
6. Demo boot: palette disabled/hidden; ⌘K inert; no Search sidebar item; no palette chunk;
   no `GET /bff/search` or `/p/:project/palette-search` request. Record choice for 248.

## Acceptance criteria (working checklist — layers on close)

- [ ] `/search` returns only the principal's workspace rows; probe query-bearing case passes
      AND fails when workspace predicate removed (mutation). *(engineered)*
- [ ] Probe census lists `GET /search` probed; rls-catalog green. *(engineered)*
- [ ] No palette deep link contains `/edit/` (test over twin mapping). *(engineered)*
- [ ] ⌘K opens palette on `/app`, `/app/inbox`, `/voices`, `/usage`, `/app/settings/*`, `/p/:slug/*`;
      project-scoped inside a project + "Search all projects" widens. *(engineered)*
- [ ] Palette issues zero non-GET requests; planted `<b>` in snippet renders as text. *(engineered)*
- [ ] Palette chunk not in entry graph (guard extended to cmdk); entry delta ≤ 15 kB gz, reported. *(engineered)*
- [ ] DOM-contract updates in the same change; `check:dom-contract` green. *(engineered)*
- [ ] Demo-boot DOM test: ⌘K pressed, sidebar inspected with `boot.demo`; no search request;
      palette disabled/hidden; test fails if a demo boot issues a search request. *(engineered)*
- [ ] Stage B staging-verified at 250 (D-R7SHELL.1c-1 row: ⌘K finds a draft in a second project
      from /app, SPA nav (marker survives, nav count 1), in-project scoped open, screenshots,
      probe LIVE mode vs preview or explicit skip). *(met-engineered → staging-verified @250)*
- [ ] Universal gate AC (verify green; tests fail if behaviour removed; REQ ids in PR;
      DEFERRALS for non-automatic legs; ADRs for owned decisions; BUILD_INDEX + LEDGER;
      operating clauses). *(agentic)*

## Plan

- contracts: `WorkspaceSearch*` DTO (kind, label, slug, refId, draftN, personaId, snippet; grouped results).
- api `search.ts`: extract shared `queryProjectSearchDocs` (self-heal + select incl. `draft_n`
  via left join); `/projects/search` unchanged; new `GET /search` (grouped + personas ilike +
  `?project=` scope incl. voice→linked-persona). tests incl. mutation leg (recording SqlClient
  strips `d.workspace_id = $1` → B's row leaks → proves discrimination).
- api-client `workspaceSearch`; web `DataSource.workspaceSearch?` seam (optional — absent ⇒
  empty groups); `/bff/search` maps hits→paths (draft→`/v/:n`, letter→`/revisions/:cid`,
  voice→`/v/:id`, project→`/p/:slug`); `?project=<slug>` resolves via bffProjectRow.
- Retire `/p/:project/palette-search` (231's T5 `/edit/` deep link discharged — record).
  Retire `paletteSearchUrl` from ide bag/chrome-data/queries/BffIdeBag/pages + demo guard's
  palette-search endpoint arm.
- `spa/palette.tsx` (lazy): cmdk Command+Input+PaletteList; sources = embedded `data-palette`
  JSON (moved to `.ide` root) local commands via `buildPalette`/`paletteModel` + workspace
  commands + `/bff/search` hits; Esc/⌘K/backdrop close; `rhema:palette-open` CustomEvent
  ({initial?, toggle}) consumed by IDE controller `case "palette"` + AppShell keydown + Search item.
- AppShell: Search item always shown (workspace shell); lazy palette mount, workspace variant only.
- controller.ts + client/ide.ts: palette code path retired (⌘K→event; island inert on SSR docs).
- ide-shell.tsx: palette dialog markup removed; `data-palette` embed moves to `.ide` root.
- check-spa-entry-graph: deny `cmdk` (+ palette module path) in entry graph.
- dom-contract: retire `data-ide-palette`/`data-palette-sections`/`data-palette-search`/
  `data-palette-results`/`data-palette-empty`; `data-palette-input`/`data-palette` kept
  (re-emitted); add `data-app-palette`, `data-palette-scope`, `data-palette-list`,
  `data-palette-hit`, `data-palette-snippet`, `data-palette-search-all`, `data-palette-cmd`.
- ADR-132: owned decisions (DTO+grouping; one palette; command registry; palette-search retired;
  demo=off). DEFERRALS D-R7SHELL.1c-1 (250).

## Test matrix

- api `search.test.ts`: /search grouping + voices + project scope + exclusions + 401 + mutation leg.
- probe: seeded `project_search_docs` marker per tenant; query-bearing legs + own-sanity + foreign `project=` filter.
- `rls-catalog.test.ts` untouched (no new tables; project_search_docs+personas already pinned).
- web `bff*.test`: /bff/search 401/empty/mapping/no-`/edit/`.
- `palette.dom.test.tsx`: ⌘K pages; scope + widen row; zero non-GET fetch; `<b>` text; EmptyState; demo inert.
- `app-shell.dom.test.tsx`: Search item + chord visible on non-IDE page; demo variant unchanged.
- entry-graph test: cmdk denied in entry.

## Progress

- 2026-11-05 — ledger seeded; implementing.
- 2026-11-05 — implemented so far (uncommitted): contracts `domain/workspace-search.ts` DTO +
  export; api `search.ts` shared `queryProjectSearchDocs` (+ draft `n` join) and `GET /search`
  (grouped + personas ilike + `?project=` incl. linked-voice scope); api-client `workspaceSearch`;
  web `DataSource.workspaceSearch?` + live binding + `GET /bff/search` (deep links, slug scope);
  `/p/:project/palette-search` RETIRED (231 T5 discharged); demo `endpointFor`/`allowed` arm +
  `demoDataSource.searchPalette` removed; `ide-shell.tsx` palette dialog removed (`data-palette`
  moved to `.ide` root; `paletteSearchUrl` prop gone); controller.ts palette path retired →
  `rhema:palette-open` CustomEvent; `client/ide.ts` island palette retired (⌘K inert on SSR docs);
  `spa/palette.tsx` written (cmdk lazy palette); `app-shell.tsx` Search always + lazy mount +
  keymap dispatch + `rhema:app-theme` seam; COPY.palette keys added.
- Remaining: two-tenant-probe query legs + seeded marker doc; tests (api search.test.ts,
  /bff/search twin test, palette.dom.test.tsx, fixture updates for paletteSearchUrl/palette-search
  across bff.test.ts, demo.test.ts, ide-chrome.dom, editor.dom, export.dom, onboarding.dom,
  transitions.dom, control-base.dom, dom-contract.test); verify; ADR-132 + D-R7SHELL.1c-1; PR +
  closeout.
- Done since: paletteSearchUrl stripped everywhere (chrome-data/chrome/pages/page-data/queries);
  dom-contract palette rows migrated (data-ide-palette/sections/search retired; new
  data-app-palette/scope/results/snippet/empty/search-all/cmd rows); check-spa-entry-graph now
  denies cmdk + spa/palette in entry chunks; two-tenant-probe extended (seeded marker
  project_search_docs + MARKER_T_SEARCHDOC in textMarkers; query-bearing legs: foreign q token,
  foreign ?project= filter, own-token sanity incl. MARKER_T_VOICE).
- Done: all implementation + tests green. search.test.ts 10/10 (incl. mutation leg);
  probe test 1/1 (query-bearing legs); bff.test.ts 225/225; palette.dom.test.tsx 10/10;
  ide-chrome.dom 41/41; full apps/web suite green; rls-catalog 6/6; check:dom-contract OK;
  check:spa-budget OK — entry delta +11.0 kB ≤ 15 kB, palette 7.7 kB async, cmdk not in entry;
  entry-graph test 9/9 with cmdk case; lint+typecheck touched pkgs green; ADR-132 +
  D-R7SHELL.1c-1 + pr/R7SHELL.1c.md written.
- Remaining: full pnpm test tail; commit/push; gh pr create --base stevevitali/r7shell-1b-headers;
  BUILD_INDEX 267; LEDGER advance; ci-boundary; check-build-memory + append-only.

## Gap table

| Req/AC | Required layer | Achieved layer | Status | Evidence |
|---|---|---|---|---|
| `GET /search` RLS-bound tenant read | engineered | engineered | met | `search.ts` shared `queryProjectSearchDocs` on `deps.db` (`withTenant`); mutation leg in `search.test.ts` proves the predicate; rls-catalog 6/6 |
| Probe query-bearing legs | engineered | engineered | met | `two-tenant-probe.ts` MARKER_T_SEARCHDOC + foreign-q/foreign-project/own-sanity legs; `two-tenant-probe.test.ts` 1/1 |
| `/search` probed not exempted | engineered | engineered | met | census walks `app.routes` — `/search` enters `GET` legs automatically |
| BFF deep links, no `/edit/` | engineered | engineered | met | `bff.test.ts` mapping + not-contain assertion; `/p/:project/palette-search` retired |
| ⌘K on every signed-in page + scopes | engineered | engineered | met | `palette.dom.test.tsx` (workspace + project scope + Search-all widen) |
| Zero non-GET + snippet escaping | engineered | engineered | met | `palette.dom.test.tsx` fetch-recorder + planted-`<b>` test |
| Lazy chunk + entry delta ≤ 15 kB | engineered | engineered | met | `check-spa-entry-graph` cmdk/palette denial + test; `check:spa-budget` +11.0 kB |
| DOM-contract same change | engineered | engineered | met | `check:dom-contract` OK |
| Demo-boot read-free | engineered | engineered | met | `palette.dom.test.tsx` demo test — ⌘K inert, zero search calls |
| Stage-B deployed walk | staging-verified | met-engineered → deferred | open | `D-R7SHELL.1c-1` (owner 250) |
| Universal gate (verify/tests/REQ-ids/ADRs/records) | agentic | agentic | met | this ledger + PR #266 + ADR-132 + BUILD_INDEX 267 + LEDGER |

## Evidence log

- `pnpm turbo build lint typecheck` (touched closure: contracts/api-client/api/ui/web/integration-tests) — green.
- `pnpm test` — 6,853 pass / 4 skip / 0 fail (one flaky `demo-tour-legs.local` @390 occlusion — passes on re-run, unchanged file on base).
- `apps/api/src/search.test.ts` — 10/10 incl. the workspace-predicate mutation leg.
- `integration/src/two-tenant-probe.test.ts` — 1/1 (query-bearing legs zero findings).
- `apps/web/src/bff.test.ts` — 225/225; `apps/web/src/spa/palette.dom.test.tsx` — 10/10;
  `ide-chrome.dom.test.tsx` 41/41; `app-shell.dom.test.tsx` 11/11; web suite green.
- `packages/security-checks/src/rls-catalog.test.ts` — 6/6; `check:dom-contract` OK;
  `check:spa-budget` OK (entry **+11.0 kB**, palette 7.7 kB async); `check-spa-entry-graph` OK (9/9 incl. cmdk planted-map case).
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7shell-1b-headers` — OK.
- `check-build-memory.sh` — 0 violations (16 legacy warnings, same count as base).
- Commits: `626909b2` impl+records · `eaab25c2` BUILD_INDEX 267 + LEDGER · `7b3d4a6c` ADR revisit + adr-index.
- PR #266 open vs `stevevitali/r7shell-1b-headers` — unmerged (OPERATOR). CI read at exact head: pending → see Evidence report.

## Evidence report

- Head `7b3d4a6c` — CI run 42057029695 pending at close; first head `626909b2` run 42056600661 cancelled by supersede; `eaab25c2` run 42056670386 covered the BUILD_INDEX/LEDGER head (in progress at close). Boundary re-read owed on the operator/CI side or next ticket's first read (D8 ledger-note rule).
- Layer achieved: **engineered** (Stage A only per GD-PREVIEW.R7; no preview, $0).
- Deferrals: `D-R7SHELL.1c-1` OPEN (owner 250_R7DEP.2). Carries: 231 T5 discharged; 248 demo=hidden.
