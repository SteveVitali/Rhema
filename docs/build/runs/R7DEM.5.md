# R7DEM.5 — Demo mode side effects (recording proxy) + labels/excluded refs/escalations + lazy tour seam + `D3.readonly`

- **Spec:** `docs/tickets/221_R7DEM.5__demo-mode-hub.md` (seq 221 of 254; round 7 R7a)
- **Base:** `stevevitali/r7dem-4b-demo-spa` @ `5210298102c37b2d4f01c42801cbbd896fa86884` (PRs #240–#254 stacked, unmerged — mergePolicy OPERATOR)
- **Branch:** `stevevitali/r7dem-5-side-effects`
- **Harness:** `devin-desktop/swe-2-high/subagent`
- **Skills:** implement-spec @ e981ec5 (siblings build-memory, self-review)
- **Started:** 2026-11-04T09:49:32Z
- **Closed:** (pending)
- **Config:** Stage A only ($0) — repo-only + a local web server serving `demoDataSource`; no preview (GD-PREVIEW.R7); no production mutations.
- **ci:** (read at head — see Evidence report)

## Deferrals read

- `D-R7DEM.4b-1` OPEN — Stage-B of the demo SPA half, owed to 224. This ticket adds `D-R7DEM.5-1` on the same gate.
- `D-R7OPEN.1-1` OPEN — the 14 round-7 legs report `owed`; `D3.readonly` is mine — its real body lands here, stays `expected:"red"`, 224 flips.
- `D-R5OPS.1-1` OPEN — organic-cohort first-finding. This ticket stops the beacon *requests*; the cohort-level suppression contract is 223's (REQ-DOPS-5). Not closed.
- No OPEN row this ticket or a landed prerequisite unblocks → none closed.

## Requirements (from the ticket's Goal + deliverables)

1. **Recording proxy + regenerated side-effect table** (REQ-DWEB-7; RV-10): committed $0 harness; bundled Chromium over every `DEMO_ROUTE_ID` × essay × {logged out, session cookie} × {desktop, phone} vs a local web server; fails on any request outside the allowlist (GETs to demo twins/shell/assets + `/bff/demo/*` + pre-declared `POST /a/demo`); emits the regenerated table as committed generated output; reports which DataSource methods the walk reached (finalizes DWEB-3); a re-run entry point 221a/222/R7TOUR.2 reuse.
2. **Close every effect the walk finds** (R3 §4 rows minus 11–13): feed `EventSource`, palette fetch (allowlisted), theme/paper POSTs, keymap out-of-scope navigations, `/doc` poll, ⌘S restore-point (no-op + read-only notice, never a fake syncing pill), dwell, showcase beacon, gate presence, source-mode commit, figures write hooks. Gates key off one demo read (`demoBootNow()`/`isDemo()` from boot, never `?demo=`/env). Write affordances via 211's `ReadOnlyProject`.
3. **Excluded artifacts render as "not published" non-links** (REQ-TOUR-6).
4. **Escalations render as Decisions** in the ledger view — GM disclosure escalation + CoR E1/E3, proven on the synthetic fixture's escalation shape (REQ-TOUR-7).
5. **Replayed-run + import labels render** from 218a's DTOs: badge "Replayed from the agent-discourse record"; "inferred from the delivered files" per phase; "approvals not recorded"; time/credits/model "not recorded"; the run card's "What it delivered" (213's composition); REQ-CONV-14 import-rule labels. (REQ-DWEB-15 render; REQ-CONV-14 consume)
6. **DOM-contract `demo` bucket completed** for the surfaces this ticket touches — each hook declared, emitted, asserted (REQ-DWEB-12).
7. **Lazy tour seam + bundle guards**: the demo layout module (not a route file) owns a dynamic `import()` boundary for the tour module (222 fills it); a bundle grep test fails on snapshot markers in `public/spa`; `check:spa-budget` green, no ceiling raised (REQ-DWEB-13).
8. **`D3.readonly` leg body** (REQ-DACC-1/3/5): logged out + `returningUser`; zero same-origin non-GET except the REQ-TOUR-9 POST; no EventSource/WebSocket; no 4xx/5xx; no mutation forms or contenteditable. Stage A: local run + committed screenshots; registry stays `red` (ready-to-flip).
9. **`D-R7DEM.5-1`** staging DEFERRALS row per deliverable 9.

## Acceptance criteria (verbatim from the ticket)

- [x] Recording-proxy walk: every `DEMO_ROUTE_ID` × essay × {logged out, cookie} × {desktop, phone}; fails on out-of-allowlist; a negative test re-enabling one gated effect makes it fail. *(fixture-verified — `demo-side-effects.local.test.ts`, 4 walks × 3 tests green ×2 runs)*
- [x] Regenerated table committed + re-run entry point recorded; DataSource methods reached == `demoDataSource`'s implemented set. *(fixture-verified — `docs/demo-side-effects.md` + `emitWalkArtifacts`; reach diff asserted via `RHEMA_DEMO_DS_TRACE`; `checkSession`/`postAcquisitionEvent` left the Pick per DWEB-3's amended contract)*
- [x] SPA DOM test (R3 §7 test 7): demo boot constructs no `EventSource`, no `sendBeacon` to `/a/dwell`/`/a/acq`, no POST, no `/doc` poll, only allowlisted fetches; ⌘S shows the read-only notice. *(engineered — `demo-effects.dom.test.tsx` 12 legs)*
- [x] Excluded-artifact links → "not published" non-links; escalations → Decisions. *(engineered — `rewriteDemoDocLinks` + `DemoLedgerDecisions`, asserted in the DOM suite)*
- [x] Replayed-run labels, "not recorded" fields, import-rule labels render (DOM test on the synthetic fixture). *(engineered — run-card/run-report replayed arms + `DemoDocMarkers`, asserted)*
- [x] New demo copy passes `lintCopy`, copy containment, launch-surface lint; no "author" for an agent. *(engineered — COPY.demo keys ride the same gates; role vocabulary is data-side)*.
- [x] `check:dom-contract` + `check:spa-budget` green; snapshot-marker bundle grep passes. *(engineered — `demo-bundle.test.ts` + both gates green)*
- [x] `D3.readonly` passes locally (logged out + planted cookie), screenshots committed; stays `red` (ready-to-flip). *(fixture/real-corpus-verified — `demo-readonly.local.test.ts` 182s; `docs/build/reports/2026-11-04_r7dem-5-legs/`)*
- [ ] Stage B → staging-verified at 224: `D-R7DEM.5-1` open; no preview here. *(staging-verified, owed to 224 — D-R7DEM.5-1 OPEN)*
- [ ] Universal phase-gate AC. *(agentic)*

## Plan

1. Gate every client effect at its source on `isDemo()` (feed/dwell/showcase/gate-presence/controller/page-mount/editor), suppress out-of-scope navigations (`/run` links withheld: overview next-step + `timelineHrefs.nextStep`/`verbHref` on `isDemoSlug`).
2. `DemoEffects` mounts capture-phase submit interception → `data-demo-readonly-notice` pill (the backstop the walk's negative leg targets); `demo-tour.ts` behind `import()` only.
3. Labels/markers: replayed arms on run-card/run-report; `rewriteDemoDocLinks` (notPublished→non-link, assetRefs→asset route, external-src sweep); `DemoLedgerDecisions` on the response-ledger artifact page.
4. DataSource honesty: `files()` flattens artifactIds (`/`→`--`), `getArtifactPage` decodes, `figureId` arm for binary figure rows; reach == implemented (implemented-only trace).
5. Recording proxy harness + regenerated table + negative leg; `D3.readonly` body + local screenshots; DEFERRALS row; records + PR.

## Test matrix

| Layer | What | Result |
|---|---|---|
| DOM | `demo-effects.dom.test.tsx` — §7 test 7 (no ES/beacon/POST/poll), readonly notice, replayed labels, markers, escalations | 12/12 green |
| DOM | `demo-bundle.test.ts` — snapshot markers absent from public/spa | green |
| Local browser | `demo-side-effects.local.test.ts` — 4 walks zero violations, negative leg, reach==implemented | 3/3 green (222s) |
| Local browser | `demo-readonly.local.test.ts` — real `D3.readonly` body vs real corpus | green (182s), 2 screenshots |
| Gates | turbo build lint typecheck; check:dom-contract; check:spa-env; check:spa-budget | 138/138; all OK |

## Progress

- 2026-11-04T09:49Z — Phase 0: branch cut at 52102981; DEFERRALS read (no closable rows); ticket + spec docs (R3/R4/REVIEW/§3.3/§4.3/§4.4/§4.17/§8) read; anchors walked (feed.ts, controller.ts, page-mount.tsx, dwell/showcase-beacon/gate-presence, demo.ts/demo-data.ts/demo-page.tsx, demo.dom.test.tsx, r7legs.ts/registry.ts, read-only.tsx, page-chrome.tsx).
- 2026-11-04 — Phase 2 started. EDITED SO FAR (uncommitted):
  - `apps/web/src/spa/demo.ts` — added `isDemo()` + `useDemoMode()` (the ONE demo-mode read, REQ-DWEB-7).
  - `apps/web/src/spa/ide/feed.ts` — `isDemo()` return before `new EventSource` (row 1, belt-and-braces).
  - `apps/web/src/spa/dwell.ts` — `isDemo()` return at effect start (row 8).
  - `apps/web/src/spa/showcase-beacon.ts` — `isDemo()` return (row 9, inert anyway).
  - `apps/web/src/spa/gate-presence.ts` — `isDemo()` return (row 10, inert anyway).
  - `apps/web/src/spa/ide/controller.ts` — `post()` skips when `isDemo()` (row 3 theme/paper POSTs); `sheet` + `run-next` keymap actions inert under demo (row 4).
  - `apps/web/src/spa/page-mount.tsx` — `demoMount = isDemo()`: `/doc` poll skipped (interval `-1`, visibility re-poll early-return, fetch guarded); `mintRestorePoint` with `wire==null` && demo → `setPill({state:"readonly"})` (row 6: no-op + honest read-only pill, never "syncing").
  - KEY FACTS learned: `DemoMarkersDto` = {importRule, roles, notPublishedRefs, fragmentsNote, notRecorded, assetRefs}; `ReplayedRunCardView`/`ReplayedRunSummaryView`/`ReplayedRunReportView` in packages/findings-core/src/replayed.ts (replayed:true, recordSource:"agent-discourse", phaseSource, approvals|not_recorded, notRecorded[]); dossier fixture dto.demo={importRule×8, notRecorded×7, roles}; run-card.tsx ~L198-460 renders card (phases ~L354, delivered block ~L414-460 already exists); dossier.tsx:292 passes card.decisions→TimelineGateCard; chrome.tsx `IdeProjectLayout` mounts DemoBanner framed+unframed (mount DemoEffects there); demo-legs.local.test.ts = local-server+planted-cookie precedent; r7legs.ts REAL_BODIES map gets "D3.readonly"; response-ledger artifact dto has NO demo markers (markdown only) — fixture F6 escalate|escalated in markdown table.
  - REMAINING (todo list order): DemoEffects component (capture-submit → data-demo-readonly-notice + lazy `import("./demo-tour.js")` seam in chrome.tsx — NOT a route file) + demo-tour.ts stub; run-card/report replayed labels + page-chrome DemoDocMarkers (importRule/notPublished) + stripNotPublishedLinks; escalations→Decisions on response-ledger artifact page; COPY.demo keys + dom-contract demo entries; demo.ts DataSource trace seam; recording-proxy harness in packages/journeys + generated table + negative leg; D3.readonly body + local screenshots; DOM tests incl. §7 test 7 + bundle grep; DEFERRALS D-R7DEM.5-1 + ADR + records/PR.
- 2026-11-04 — Phase 2 continued (uncommitted). NEW: `spa/demo-effects.tsx` (capture-submit → `data-demo-readonly-notice` + lazy `import("./demo-tour.js")`), `spa/demo-tour.ts` stub, mounted in `chrome.tsx` (framed+unframed). `ui/run-card.tsx` + `ui/run-report.tsx` replayed arms (badge/phase-inferred/approvals/not-recorded labels). `dossier-view.tsx` labels wired. `copy.ts` COPY.demo keys. `demo-markers.tsx` (DemoDocMarkers + rewriteDemoDocLinks[notPublished→non-link + assetRefs→asset-route] + DemoLedgerDecisions on response_ledger). `page-chrome.tsx` wired + `/run` next-step withheld under demo. `editor.tsx` rewriteDemoDocLinks. `dom-contract.ts` demo bucket (11 hooks). `demo.ts`+`server.ts`+`main.ts`: `demoDataSourceTrace` (implemented-only via `prop in t`) + `RHEMA_DEMO_DS_TRACE`/`RHEMA_DEMO_CORPUS_ROOT` envs. `demo-data.ts`: `files()` flattens `/`→`--` artifactIds, `getArtifactPage` decodes. TESTS: `spa/demo-effects.dom.test.tsx` (12 pass), `spa/demo-bundle.test.ts` (marker grep, markers: inferred_from_delivered_files, recordSource, v1-response-ledger, taxonomy_reference_sheet, marsh-viscosity-2021, ondatje-ledger-2024, freeform-gazette-note, .md.json). `packages/journeys/src/demo-side-effects.ts` (recording proxy: allowlist GET/HEAD-only except POST /a/demo; BFS crawl + seeds + interactions[palette/theme/⌘S]; coverage per DEMO_ROUTE_ID; violations+4xx/5xx; renderSideEffectsTable + emitWalkArtifacts + CLI) + `.local.test.ts` (spawns dist/main.js w/ corpus root+trace envs; 4 walks; negative leg; DataSource reach diff).
  - WALK FINDINGS fixed: multi-segment artifactIds 404 (flatten `--`), `figures/*.png` relative doc links 404 (assetRefs rewrite), `/p/demo~*/run` out-of-scope link (withheld), trace recorded unimplemented calls (now `prop in t`), corpus root needed `RHEMA_DEMO_CORPUS_ROOT` env.
  - 2026-11-04 — Phase 3 (walk green, further findings fixed). Recording proxy GREEN ×2 runs: 4 walks zero out-of-allowlist, full DEMO_ROUTE_ID coverage, /a/dwell negative detected, reach==implemented. D3.readonly leg body landed in r7legs.ts REAL_BODIES (anon+returningUser arms, twin-derived seeds, coverage-of-seeded-shapes, post-form/contenteditable sweep, collect violations+4xx/5xx/WS) + demo-readonly.local.test.ts → PASS 181s, screenshots docs/build/reports/2026-11-04_r7dem-5-legs/{anon,returning}.png. DEFERRALS D-R7DEM.5-1 appended (Stage-B preview re-verify).
  - WALK FINDINGS FIXED (round 2): `kind:"figure"` files rows linked `/a/<png>` → added `FileRowDto.figureId` + FileRowView/hrefs.figure arm (demo emits basename-minus-ext) → links `/p/<slug>/figures/<id>`; `checkSession`+`postAcquisitionEvent` unreached → left the Pick → DemoUnsupported (DWEB-3 contract); external `substackcdn.com` `<img>` srcs in real-corpus published docs → rewriteDemoDocLinks external-src sweep (inDemo flag) — corpus-copy rewrite via assetRefs basename, else in-place text node " (not published)"; `timelineHrefs.nextStep`/`verbHref` `/run` links → omitted when isDemoSlug(slug) (SSR-safe: slug-based, not spa isDemo()).
  - VERIFICATION: turbo build lint typecheck 138/138 ✓; check:dom-contract ✓; check:spa-env ✓ (fixed process.env.CI→import.meta.env in demo-bundle.test); check:spa-budget ✓; demo-side-effects.local.test.ts 3/3 ✓ (222s); demo-readonly.local.test.ts ✓ (182s); demo-effects.dom.test.tsx 12/12 (earlier). pnpm test running (shell 7034b1).
  - STILL TODO: pnpm test result; fill test matrix + plan + gap table + verification rows below; ADR note (DWEB-3 amendment + artifactId/figureId encoding + external-src policy); PR body + BUILD_INDEX 256 + LEDGER advance; push + ci-boundary + gh pr create.

## Gap table

| Finding (the proxy's job — it found these) | Fix |
|---|---|
| `files()` emitted corpus-path `artifactId`s (`agents/author/...`) — `/a/` is single-segment → document 404s | Flatten `/`→`--` in `getFiles`; decode in `getArtifactPage` |
| `kind:"figure"` rows linked `/a/<png>` — a binary has no artifact page | `FileRowDto.figureId` (additive) + `hrefs.figure` arm → `/figures/<id>` |
| `figures/*.png` relative doc links → `/demo/<e>/v/figures/*.png` 404 | `rewriteDemoDocLinks` assetRefs arm → `/bff/demo/asset/...` |
| External `substackcdn.com` `<img>` srcs in real-corpus published docs — third-party fetches on a read-only public page | external-src sweep: asset-copy rewrite by basename else in-place " (not published)" text node; runs whenever `isDemo()` |
| `/p/demo~*/run` links (overview next-step + `timelineHrefs.nextStep`/`verbHref`) — out-of-allowlist 404s | withheld under `withhold`/`isDemoSlug` |
| `checkSession`, `postAcquisitionEvent` implemented but never invoked by the walk | Left the Pick → DemoUnsupported (DWEB-3's amended contract: implemented == reached) |
| Trace logged calls that hit the throwing seam as "reached" | `prop in t` gate — only implemented invocations count |
| Local server resolved the real corpus root; the fixture essay isn't in it | `RHEMA_DEMO_CORPUS_ROOT` env → `demoCorpusRoot` dep in `main.ts` |

## Evidence log

- `demo-side-effects.local.test.ts` — 3/3 green ×2 (222s): 4 walks (fixture essay × {anon, cookie} × {1440, 390}), zero out-of-allowlist requests, every `DEMO_ROUTE_ID` visited, `/a/dwell` negative leg detected in 560ms, `RHEMA_DEMO_DS_TRACE` reach == `demoDataSource` Pick.
- `demo-readonly.local.test.ts` — `D3.readonly` REAL body green locally (182s): anon + planted-cookie over all 4 real essays; zero non-GET, zero ES/WS, zero same-origin 4xx/5xx, no post forms, no contenteditable. Screenshots: `docs/build/reports/2026-11-04_r7dem-5-legs/d3-readonly-{anon,returning}.png`.
- `docs/demo-side-effects.md` — regenerated committed table (0 violations; `demo-tour-*.js` is its own lazy chunk — REQ-DWEB-13 seam proven by the table itself).
- `docs/build/reports/demo-side-effects/` — walk PNGs + `datasource-trace.jsonl` + per-run table.
- `apps/web/src/spa/demo-effects.dom.test.tsx` — 12 legs green (the §7 test-7 effect census, the capture-submit backstop, replayed labels, markers, escalation decisions, lazy-seam import).
- `apps/web/src/spa/demo-bundle.test.ts` — 8 snapshot markers absent from every emitted bundle file.
- Gates: `turbo build lint typecheck` 138/138; `check:dom-contract` OK; `check:spa-env` OK; `check:spa-budget` OK (no ceiling raised).

## Evidence report

- `pnpm test`: first full run — 4 failures, all mine, all fixed and re-verified green:
  (a) registry.test/runner.test real-bodies census needed `D3.readonly` added to the
  real-body arm; (b) read-only.dom.test source pin needs the literal
  `if (wire == null) return;` — restructured the demo pill ahead of it; (c) spa-env bans
  `import.meta.env` outside `spa/env.ts` too — `demo-bundle.test.ts` moved out of `spa/`;
  (d) unused `docNavSpy`/`Page` imports trimmed.
- `pnpm turbo build lint typecheck` — 138/138 after all fixes.
- `check:dom-contract` / `check:spa-env` / `check:spa-budget` — all green.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7dem-4b-demo-spa` — OK.
- `check-build-memory.sh` — 0 violations (16 warnings, all legacy/pre-existing patterns;
  `221a_R7DEM.5b` resolves to manifest row 221a).
- Commit `56d0f2b`, PR #255 → base `stevevitali/r7dem-4b-demo-spa`; ci-boundary read at head
  recorded in `docs/build/logs/ci-R7DEM.5.json`.
