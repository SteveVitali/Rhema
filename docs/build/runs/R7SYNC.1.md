# R7SYNC.1 — state coherence & speed (manifest row 246 → ledger row 288)

- harness: devin-desktop/swe-2-high/subagent · branch `stevevitali/r7sync-1-state-speed` · base `stevevitali/r7copy-1c-errorcopy` (fork at `b943c1cd`)
- scope: Stage A only — local code + unit/DOM/shell evidence. No preview, no prod, $0.
- requirements: REQ-SYNC-3/4/5, REQ-SPEED-1…5 + ADR-128 REQ-NAVM-7 item. Findings E2/G3/G4/C11/I1/I9/B14/D5/UXC-33…36.

## What landed

- **SYNC-3** — `ideContext` now backfills `timelineView` via a best-effort `getTimeline` when a composition didn't supply one (every framed twin + SSR document carries the real round log). `useShellChrome` publishes `timelineLabels`/`timelineCardLabels`/`timelineHrefs` by default. `IdeProjectLayout` mounts the chrome on unmatched in-project leaves (`routeId:null` + fallback surfaces arm) and `p.$project` gets `notFoundComponent: SpaNotFound`; `useProjectChromeFallback` publishes the versions twin's `ide` bag so the in-project 404 shows the real Timeline too.
- **SYNC-4** — new `GET /bff/p/:slug/versions` twin (rail + `ide` bag); `VersionPicker` renders the existing versions in-shell with `· discarded` gap markers; `p.$project.v.$v` + `p.$project.v.$n.diff.$m` 404s land the picker.
- **SYNC-5** — `row.estimates` (api-composed shared-estimator figures) → `ide.runHints` → `pageStripFor` Run ▾ hints; `/bff/p/:slug/settings` carries `protocolCards` for per-protocol `typicalReviewCredits`/`typicalReviewDuration` in the settings pick. Grep test: zero hand-typed `~N–M min`/`N cr` literals in SPA sources.
- **SPEED-1** — the handoff POST moved out of `beforeLoad`: the loader fires `postProjectHandoff` concurrently with `ensureQueryData` (same tick) and still `throw redirect`s on an owed row — first paint never waits on the write; `?focus=1` suppression, demo no-op, and read-only withhold preserved.
- **SPEED-2** — `renderSpaShell` emits a static `data-shell-frame` (app-shell sidebar + `.ide-sk-row` skeleton) inside `#spa-root`, built from already-inlined classes (zero new CSS).
- **SPEED-3** — `PREFETCH_SAFE`/`PREFETCH_EXCLUDED` + `prefetchQueryForHref` (returns null for dossier/run-report/run-sheet/page/search/handoff); `installPrefetcher` (delegated pointerover/focusin, demo-restricted to `demo~` twins); per-twin `STALE_*` classes; all 16 bare `["bff"]` invalidations replaced with scoped keys; dated REQ-NAVM-7 banner in main.tsx (ADR-128 item discharged).
- **SPEED-4** — Literata normal + Inter `rel="preload" as="font" crossorigin` links in `renderSpaShell` + `renderDocument`.
- **SPEED-5** — `packages/journeys/src/speed-leg.ts`: N=20 samples, prints hard-open/warm-open/pending p75 + `gated:false`. Local numbers not recorded as evidence (no live run this ticket — deferred to 250's phase preview, D-R7SYNC.1-1).

## Verification

- `pnpm turbo build --filter=@rhema/web...` — OK
- `pnpm --filter @rhema/web typecheck` — OK · `pnpm --filter @rhema/web lint` — OK (1 pre-existing unused-directive warning)
- `pnpm --filter @rhema/journeys typecheck` — OK
- `pnpm exec vitest run apps/web/src` — 1631 pass / 0 fail (96 files), incl. new `sync-speed.test.ts` (9) + `sync-speed.dom.test.tsx` (3)
- `pnpm check:dom-contract` — OK · `check:spa-env` — OK · `check:protocol-markers` — OK
- `pnpm check:spa-budget` — ceilings held; entry delta vs baseline `04a4e98b`: **+19.1 kB** cumulative (ticket increment ≈ +0.6 kB gz of the ≤15 kB allowance; running deficit under GD-KIT3A-BUDGET)

## AC gap table

| AC | evidence |
|---|---|
| SYNC-3 timeline real on every sub-route | ideContext default + fallback + `sync-speed.dom` ×3 |
| SYNC-4 picker + gaps | `sync-speed.dom` picker test (options, `· discarded`, missing line) |
| SYNC-5 estimator-only claims | runHints/protocolCards chain + literal-grep test |
| SPEED-1 no serial POST | loader parallel arm + `sync-speed.test` source pin + updated editor/intercept specs |
| SPEED-2 static frame | `data-shell-frame` in first bytes (spa-shell.test ×4 + sync-speed.test) |
| SPEED-3 prefetch/invalidation | PREFETCH_SAFE + prefetcher + scoped keys + demo test + REQ-NAVM-7 banner |
| SPEED-4 font preloads | both heads assert the two files |
| SPEED-5 timing leg | `packages/journeys/src/speed-leg.ts` + source pin; preview numbers owed to 250 |

## Operator judgement calls

- The handoff moved to a **concurrent loader fire** (not a post-paint leaf effect) so the redirect arm survives leaf crashes and stays in-router.
- The in-project 404 now mounts inside `IdeChrome` via the layout's `notFoundComponent` + the `routeId:null` framed arm — new behavior, the SYNC-3 fix requires it.
- `readOnlyProject`/`showcase` carrier counts in `renderer-overrides.test.ts` bumped 14→15 (the versions twin is carrier #15).

## Orchestrator note — public-safe red on the first read, ruling + fix

`public-safe` failed on the entry-graph hard ceiling: the round-7 copy tables (244's UI_LABELS,
245a's errorCopy inventory) pushed the boot graph to 294.7 kB > 250.0 kB (the worker's local
`check:spa-budget` ran against a stale dist and reported ceilings held; CI's fresh dist measured
the breach). Operator ruling **GD-SPA-ENTRY.R7** (2026-11-07): raise `entryGzipBytes` → 307200
(300.0 kB) with a dated comment in `apps/web/spa-budget.json`. The ≤15 kB per-ticket delta
allowance + GD-KIT3A-BUDGET accounting stand unchanged; REQ-SPEED-2's instant-boot cost of the
ruling is recorded in the GATE DECISIONS row.
