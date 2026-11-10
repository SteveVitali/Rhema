## R7SYNC.1 — state coherence & speed

Ticket `docs/tickets/246_R7SYNC.1__state-coherence-speed.md`. Stage A only — local/unit/DOM/shell evidence at $0; no preview, no prod mutation. **Unmerged (OPERATOR).**

- **SYNC-3** the Timeline tab reads one project-scoped source on every project sub-route (`ideContext` backfills `getTimeline`; `useShellChrome` publishes labels/hrefs by default; the in-project 404 mounts inside the chrome via `notFoundComponent` + the `routeId:null` framed arm and publishes the versions twin's `ide` bag).
- **SYNC-4** new `GET /bff/p/:slug/versions` twin + `VersionPicker`: a missing `/v/:n` or diff endpoint lists the real rail with `· discarded` gap markers inside the shell.
- **SYNC-5** every duration/cost claim flows the shared estimator: `row.estimates` → `ide.runHints` → Run ▾ hints; `protocolCards` (api `typicalReview*` fields) on the settings pick. No hand-typed literals (grep-tested).
- **SPEED-1** the REQ-BFF-22 handoff POST is out of `beforeLoad` — the loader fires it concurrently with the twin GET (same tick) and still redirects in-router on an owed row; `?focus=1`/demo/read-only arms verbatim.
- **SPEED-2** the shell's first bytes paint a static `data-shell-frame` + `.ide-sk-row` skeleton inside `#spa-root` — zero new CSS (already-inlined classes).
- **SPEED-3** `PREFETCH_SAFE` query-level hover/focus prefetch (side-effect-free twins only; mark-read/mint twins excluded by name; demo-restricted), per-twin `STALE_*` classes, scoped `["bff","p",slug]`/`["bff","app","inbox"]`-style invalidations replacing every bare `["bff"]`. Dated REQ-NAVM-7 banner — ADR-128's item discharged.
- **SPEED-4** Literata-normal + Inter `rel="preload" as="font" crossorigin` in the SPA shell + SSR heads.
- **SPEED-5** `packages/journeys/src/speed-leg.ts` — printed p75s, recorded-not-gated; preview numbers owed to `250_R7DEP.2` (D-R7SYNC.1-1).

### Verification

- `pnpm turbo build --filter=@rhema/web...`, `typecheck`, `lint` — OK (lint: 1 pre-existing unused-directive warning)
- `pnpm --filter @rhema/journeys typecheck` — OK
- `pnpm exec vitest run apps/web/src` — **1631 pass / 0 fail** (96 files; +12 new tests)
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK
- `pnpm check:spa-budget` — ceilings held; entry delta +19.1 kB cumulative vs `04a4e98b` (this ticket ≈ +0.6 kB gz of the ≤15 kB allowance; running deficit under GD-KIT3A-BUDGET)

### Deferrals

- opens `D-R7SYNC.1-1` → `250_R7DEP.2`: Stage-B preview verification + the SPEED-5 timed-leg record.
