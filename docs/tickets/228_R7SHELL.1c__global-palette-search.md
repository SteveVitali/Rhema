# R7SHELL.1c — Global ⌘K palette + tenant-scoped `GET /search` + two-tenant probe

- **Sequence:** 228 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 226_R7SHELL.1a: the palette mounts in the AppShell and wires the sidebar Search item seam, and
    the demo-boot variant it follows is 226's.
  - 225a_R7KIT.2b: the cmdk Combobox and palette list base, and EmptyState.
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/228_R7SHELL.1c__global-palette-search.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and integration tests, the deterministic two-tenant
  probe, and a local build). No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at
  the R7b phase preview (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250. Any need
  for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~650 changed lines excl. generated/fixtures (M). Entry-delta allowance ≤ 15 kB
  gz (REQ-KIT-5), with the actual figure stated in the PR; the palette is a lazy chunk.

## Goal
⌘K works on every signed-in page. It searches projects, drafts, letters, Voices and commands
across the workspace through a new **tenant-scoped** API read, `GET /search`. Inside a project it
opens project-scoped by default, with a "Search all projects" row. There is one palette, which
absorbs the IDE's project palette. The new read is `withTenant`-scoped, and the two-tenant probe
is extended to prove it leaks nothing (root gotcha 2).

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §4.5 REQ-SHELL-7; §4.8 REQ-RELOAD-3 (palette targets go to
  `/p/:project/v/:n`); §4.12 Rule 4 (⌘K kept); §4.6 REQ-KIT-5; §8.1 (tenancy).
- R6 `…/R6-ux-code-audit.md` UXC-25 (the ⌘K part) and §2 T5. REVIEW RV-24 (the workspace search
  endpoint).
- `apps/api/AGENTS.md` (gotcha 1: the request-scoped db and the two-tenant probe) and
  `packages/db/AGENTS.md` (`withTenant`; no bypass pool).
- Anchors (re-confirm at build time):
  - **API search:** `apps/api/src/search.ts` `createSearchRoutes`. The existing
    `GET /projects/search?q=&project=` reads `project_search_docs` (migration 0029; kinds
    `project|draft|letter`) and has a self-heal insert. It is registered at
    `apps/api/src/index.ts` ≈:672.
  - **Scoping:** `apps/api/src/auth-context.ts` (`createScopedDb` → `withTenant`) and
    `packages/db/src/rls.ts`.
  - **Probes:**
    - `integration/src/two-tenant-probe.ts`: a census-pinned GET probe (`GET_EXEMPTIONS`,
      `fillPath`). A bare call to a `?q=` route returns empty, so it proves nothing by itself.
    - `packages/security-checks/src/rls-catalog.test.ts`.
  - **The project palette today:**
    - `apps/web/src/server.ts` ≈:1524-1550 `/p/:project/palette-search` emits
      `/p/${slug}/edit/${refId}`, the T5 reload stub;
    - `apps/web/src/spa/ide/controller.ts` ≈:619;
    - `packages/ui/src/ide-shell.tsx` ≈:443 (`data-palette-search`);
    - `apps/web/src/dom-contract.ts` ≈:1543 and :1584.
  - **Voices:** the personas table (`display_name`); the voice detail route
    (`routes/_authenticated/v.$persona.tsx`).
- 225a's cmdk palette base; 226's sidebar Search seam, AppShell and demo-boot variant;
  `apps/web/AGENTS.md`;
  `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **`GET /search?q=&project=`** in `apps/api` (REQ-SHELL-7; gotcha 2).
   - Uses the request-scoped (`withTenant`) db with an explicit workspace predicate.
   - Returns grouped hits: projects, drafts and letters from `project_search_docs` (reusing the
     existing query through a shared function, with `/projects/search` behaviour unchanged), plus
     Voices by name.
   - Deleted and archived rows are excluded; results are bounded.
   - The DTO lives in `packages/contracts`.
2. **Two-tenant probe extension** (gotcha 2).
   - A query-bearing probe case: tenant A searches with tenant B's marker token as `q`, then the
     reverse, and the response is scanned for the other tenant's markers.
   - `/search` appears in the census as probed, not exempted.
   - The `rls-catalog` test is updated if any table is touched (none expected).
3. **BFF twin** `GET /bff/search` on the web host: session-forwarded, GET only. Deep links:
   - drafts → `/p/:slug/v/:n`, never `/edit/:id` (REQ-RELOAD-3);
   - letters → `/p/:slug/revisions/:cid`;
   - Voices → the voice route.
4. **One palette** (REQ-SHELL-7).
   - The cmdk palette is mounted by the AppShell and loaded as a lazy chunk on first ⌘K (not in
     the entry graph).
   - ⌘K opens it on every signed-in page. Inside a project it is project-scoped by default and
     offers a "Search all projects" row.
   - **Command sources:**
     - the IDE palette's local-only commands, which make no POSTs (REQ-ISL-10);
     - workspace commands (New project, Inbox, Voices, Settings, theme).
   - The IDE palette markup and controller path retire in its favour. Its `data-palette-*` hooks
     are kept or migrated through the DOM contract.
   - Snippets render as escaped text (a `ts_headline` output is never HTML).
   - Empty and no-results states use EmptyState. Keyboard navigation is cmdk's.
5. **Sidebar Search item** wired to the palette (226's seam). It shows its chord from the keymap.
6. **Demo boot** (P4-3; 226's demo-boot variant). In a demo boot the palette is disabled or hidden:
   - ⌘K is inert and the sidebar Search item is not rendered;
   - the palette chunk is not loaded;
   - no `GET /bff/search` or `/p/:project/palette-search` request is issued.

   An R7a tour step or D-leg might use the R7a demo palette (220's demo-scoped rows). In that
   case the palette may instead open with those local-only commands and no search source, still
   issuing no request. Record the choice for 248.

## Out of scope
- The contextual ⌘K-as-link with an editor selection: 237_R7WRITE.1a (leave the hook).
- The full keymap table: 239. Hover/focus prefetch: 246 (REQ-SPEED-3).
- Write redirects and the remaining reload stubs: 231_R7RELOAD.1. If this ticket retires
  `/p/:project/palette-search`, record that 231's T5 item is discharged here. If the route stays,
  231 fixes its `/edit/` deep link.
- Search-index changes (indexing Voices into `project_search_docs`). Voices are read by name in
  the route. An index change would be a new decision with its own migration.

## Acceptance criteria
- [ ] `GET /search` returns only the principal's workspace rows. The two-tenant probe's
      query-bearing case passes and **fails** when the workspace predicate is removed (a mutation
      test). *(deterministic · layer: engineered)*
- [ ] The probe census lists `GET /search` as probed, and `rls-catalog` is green.
      *(deterministic · layer: engineered)*
- [ ] No palette deep link contains `/edit/` (a test over the twin's mapping).
      *(deterministic · layer: engineered)*
- [ ] ⌘K opens the palette on `/app`, `/app/inbox`, `/voices`, `/usage`, `/app/settings/*` and
      `/p/:slug/*`. Inside a project it is project-scoped and the "Search all projects" row
      widens it. *(deterministic · layer: engineered)*
- [ ] The palette issues zero non-GET requests, and a planted `<b>` in a snippet renders as text.
      *(deterministic · layer: engineered)*
- [ ] The palette chunk is not in the entry graph (entry-graph guard). The entry delta is
      ≤ 15 kB gz and is reported. *(deterministic · layer: engineered)*
- [ ] DOM-contract updates land in the same change, and `check:dom-contract` is green.
      *(deterministic · layer: engineered)*
- [ ] A demo-boot DOM test presses ⌘K and inspects the sidebar with `boot.demo` set. No search
      request of any kind is issued, and the palette is disabled or hidden (or local-only, per
      deliverable 6). The test fails if a demo boot issues a search request.
      *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7SHELL.1c-n`, owner
      250). The row names what 250 captures:
      - from `/app`, ⌘K finds a draft in a second project and opens it by SPA navigation (the
        window marker survives, and the navigation entry count is 1);
      - inside a project the palette opens scoped;
      - screenshots of both;
      - the two-tenant probe's LIVE mode against the preview with two test sessions, or an
        explicit "skipped" with its reason.

      Unblock: 250's preview walk. Compensating control: the deterministic probe and the Stage-A
      tests above. *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SHELL-7, REQ-KIT-5 (allowance). REQ-SPEC-30 is re-asserted for the new read (two-tenant
probe extended).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 3 (no protocol/eval text in bundles or DTOs), 13 (tenant
  isolation in depth; probe extended), 12, 17.
- Spec §8: 1 (tenancy: `withTenant`, probe extended), 3, 4, 5, 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the `/search` DTO and how results are grouped;
  - one palette, replacing the IDE palette;
  - the command-source registry, which 239 consumes for shortcut display;
  - the fate of `/p/:project/palette-search` (retire, or keep as a thin alias), recorded for 231;
  - the palette's demo-boot behaviour (off, or local-only commands), recorded for 248.
- **Shared decisions consumed:** cmdk base (225a); AppShell, Search seam and the demo-boot variant
  (226); ReadOnlyProject (211), so palette write commands are hidden in read-only projects.
- **System pool.** This is a user request, so no elevated pool is used and
  `tools/system-pool-boundary.json` is unchanged (root gotcha 2).
