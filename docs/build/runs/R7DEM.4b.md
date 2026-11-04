# R7DEM.4b — Demo serving (SPA half)

- **Spec:** `docs/tickets/220a_R7DEM.4b__demo-spa-boot-url.md` (seq 220a of 254; round 7 R7a)
- **Base:** `stevevitali/r7dem-4-demo-serving` @ `df7f18775d998ced3fd05ae67c02f2b1fc4b7335` (PRs #240–#253 stacked, unmerged — mergePolicy OPERATOR)
- **Branch:** `stevevitali/r7dem-4b-demo-spa`
- **Harness:** `devin-desktop/swe-2-high/subagent`
- **Skills:** implement-spec (siblings build-memory, self-review)
- **Started:** 2026-11-04T08:31:29Z
- **Closed:** —
- **Config:** Stage A only ($0) — repo-only + a local web server serving `demoDataSource`; no preview (GD-PREVIEW.R7); no production mutations; no API/DB needed on the demo path.
- **ci:** —

## Deferrals read

- `D-R7DEM.4-1` OPEN — Stage-B evidence for 220's demo surface, owed to 224's R7a phase preview. My work rides the same gate; this ticket adds `D-R7DEM.4b-1`.
- `D-R7OPEN.1-1` OPEN — the 14 round-7 legs (incl. `P1.demo` + `R11.demo`, owner R7DEM.4b) report `owed`; the phase deploys flip. Registry rows stay `expected:"red"`.
- `D-FIX.1-2` OPEN — `P1.demo` reuses the real-mobile-UA context pattern but does NOT close the row (per the ticket's DEFERRALS interactions).
- `D-OPS.1-1` OPEN — the signed-in leg at 224 adds evidence only; not closed here.

## Requirements

1. **S-1 URL spike (≤ half-day):** TanStack Router `rewrite` mapping `/demo/<essay>/…` ↔ `/p/demo~<essay>/…`; answer R3 P7's two open questions with a test (does `router.navigate({href})` apply the output rewrite to raw `/p/demo~…` anchors? does `getMatchedRoutes(url.pathname)` need the input form?). If the spike fails → 302 `/demo/:essay/*` → `/p/demo~:essay/*` + `/demo/<essay>` alias. Record outcome + evidence in ADR-126 (dated append) + this record. No `/p/${slug}` href rewrites. *(REQ-DWEB-9)*
2. **SPA boot fixes (the three `/login`-breakers + R3 P1–P4):**
   - `_authenticated` `beforeLoad` skipped when `boot.demo` AND the path predicate hold (pathname, not boot alone — an in-SPA hop to `/app` still gates).
   - Feed labels warm from public `GET /bff/demo/feed-labels` (key `["feed-labels"]`).
   - `sessionQuery` disabled in demo; `onSessionExpired` never redirects a demo boot.
   - The handoff `beforeLoad` (`p.$project.index`) is a no-op in demo.
   - Demo QueryClient: `staleTime: Infinity`, no refetch-on-window-focus.
   - `?b=<sha>` on demo twin fetches (S-13; boot `demo.build`). *(REQ-DWEB-6 client half)*
3. **Document-navigation entry/exit (S-14):** every demo exit carries `data-spa-native` + `data-demo-exit`; the click interceptor treats any href into `/demo*` or `/p/demo~*` from a non-demo boot as a document navigation **by predicate** (never shares the workspace QueryClient); symmetric — a non-demo href inside a demo boot doc-navs. Two DOM tests (entry → fresh document + `boot.demo`; exits leave the same way). 222 adds entry links. *(REQ-DWEB-11/16)*
4. **The imported-figure card (S-7):** read-only Figures list renders `{specKind:"image", provenance:"imported"}` rows through `/bff/demo/asset/:essay/:file`; the figure card leaf renders the image arm (no spec/SVG/run provenance invented). DOM test on the synthetic fixture. *(REQ-DWEB-17 render)*
5. **DOM contract:** add `data-demo-exit`, `data-demo-banner`, `data-figure-image` (+ any others emitted) to the `demo` bucket — declared, emitted, asserted.
6. **Legs `R11.demo` + `P1.demo`** (`expected:"red"` at head — ready-to-flip; 224 flips):
   - `R11.demo` (returning): signed-in `/demo` renders the same content as logged out via `returningUser("a")`.
   - `P1.demo` (phone): demo Pages SPA-compact at 390 + 320 px, axe clean, no desktop-capability subtree (restated REQ-DACC-4; real-UA context per D-FIX.1-2).
   - Assertions derive from the registry/snapshot, never hard-coded essay text.
   - Stage A: run bodies locally vs a local web server (logged out + planted session cookie; desktop, narrow-desktop, phone widths); commit screenshots as ready-to-flip evidence under `docs/build/reports/`.
   - *(REQ-DACC-1, REQ-DACC-4)*
7. **DEFERRALS row `D-R7DEM.4b-1`** — Stage-B at 224: `R11.demo` + `P1.demo` green on the preview with `--expect-sha`, logged out/in, three widths, screenshots; signed-in-SPA → `/demo` doc-nav entry + exits on the preview; S-1 URL behaviour on the deployed router; flips at prod.

## Acceptance criteria

- [ ] S-1 outcome recorded + a test pins the URL behaviour *(engineered)*
- [ ] Demo boot: no `/session` or `/bff/feed-labels` request, never `/login`, logged out or with a cookie; phone-UA DOM test — SPA, no `SsrHandoff`, PM view not editable *(engineered)*
- [ ] Entering `/demo*` from a signed-in SPA page is a document navigation yielding `boot.demo`; every `data-demo-exit` is `data-spa-native` *(engineered)*
- [ ] Figures list renders the fixture's imported image card via the asset route, no spec/SVG (DOM test) *(engineered)*
- [ ] `R11.demo` + `P1.demo` bodies pass locally at three widths (logged out + planted cookie), screenshots committed; registry stays `red` *(fixture-verified)*
- [ ] `check:dom-contract`, `check:spa-env`, `check:spa-budget` green, no ceiling raised *(engineered)*
- [ ] `D-R7DEM.4b-1` open with the capture list *(staging-verified, owed to 224)*
- [ ] Universal phase-gate AC: verification green; test-fails-if-removed per behaviour; req ids stamped; unverifiable → DEFERRALS rows; ADRs for deviations/owned decisions; BUILD_INDEX + LEDGER; operating clauses *(agentic)*

## Plan

1. Contracts: `demoInternalPath`/`demoPublicPath`/`isDemoNamespacePath` helpers in `packages/contracts/src/demo.ts` (+ tests).
2. SPA demo module `apps/web/src/spa/demo.ts`: `isDemoBoot`, `demoTwinPath` (`?b=` arm).
3. `main.tsx`: `rewrite` on `createRouter`; demo QueryClient (`staleTime: Infinity`, `refetchOnWindowFocus: false`); `onSessionExpired` no-op under demo.
4. `_authenticated.tsx` gate skip; `p.$project.tsx` demo feed-labels; `chrome.tsx` `sessionQuery` off + `userId="demo"`; handoff beforeLoad no-op (verify existing readOnly arm covers; add explicit demo arm + test); `bff.ts` `?b=` arm.
5. `nav-intercept.ts` demo-boundary predicate (in-tree test uses the input-rewritten pathname); `DemoBanner` (exits `data-spa-native` + `data-demo-exit`) mounted via `IdeProjectLayout` (+ `IdeShell` banner slot for framed leaves); COPY.demo leaves.
6. `figures.tsx` image card arms (list row `<img>` + card page image arm).
7. `dom-contract.ts` demo bucket entries.
8. `r7legs.ts` real bodies `R11_DEMO` + `P1_DEMO`; local driver test `demo-legs.local.test.ts` (bundled Chromium + `apps/web/dist/main.js` on an ephemeral port; planted `rhema-dev.session_token` cookie); screenshots → `docs/build/reports/2026-11-04_r7dem-4b-local/`.
9. DEFERRALS row + ADR-126 append + records.

## Test matrix

- `packages/contracts/src/demo.test.ts` — path-map inverses, registered-only gating.
- `apps/web/src/spa/demo.dom.test.tsx` (new) — rewrite resolution, gate skip, demo feed-labels, no `/session`, `?b=`, exits doc-nav, PM not editable on phone demo boot.
- `apps/web/src/spa/intercept.dom.test.tsx` — boundary predicate legs.
- `apps/web/src/spa/figures.dom.test.tsx` — imported-image row + card arms.
- `apps/web/src/demo.test.ts` — extend for any new emitted hooks if needed.
- `packages/journeys/src/demo-legs.local.test.ts` — run `R7_LEGS_IMPLS` bodies vs local server (skip without Chromium/browser build; fail in CI if missing).
- `pnpm check:dom-contract`, `check:spa-env`, `check:spa-budget`.

## Progress

- 2026-11-04 — Ledger seeded; load + anchors read.

## Gap table

(filled at Phase 4)

## Evidence log

(filled at Phase 5)

## Evidence report

(filled at Phase 6)
