# R7FIX.2 — Owner fixes for the R7DEP.2 defect boundary, round 2 (run-time insert)

- **Sequence:** 250b of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path, round 2; the T1 re-walk at `3d790572` discharged 3 of 5
  round-1 findings and surfaced 2 residuals, 1 evolved, and 2 new)
- **base_branch:** `stevevitali/r7dep-2-t1-prod` (250's Part-B records branch, forked at
  `3d790572` — the composed tip the preview serves; fixes stack here)
- **Depends on:** 250a_R7FIX.1 (round 1) + 250_R7DEP.2's T1 re-walk report
  (`docs/build/reports/2026-11-07_R7DEP.2/t1-*-legs/`).
- **Run:** `implement-spec spec=docs/tickets/250b_R7FIX.2__defect-round-2.md`
- **Gate status:** none — recorded defects.
- **Live stage:** Stage A only ($0 — the deployed proof is 250's own T1b re-walk, not yours;
  you do NOT touch the preview stack).
- **Production mutations:** none
- **Size budget:** M (~200–400 changed lines)

## Goal — five residuals/new findings fixed on the surface the preview walks:
- **F-1 residual** — `R8.showcase.spa` still fails identically: the dossier `.ui-d-l` "Clear"
  link stays invisible (round 1 moved the sidebar item but not the dossier link itself);
  U2.noreload evolved — `/p/untitled/review/` link absent. Restore the dossier Clear link's
  actionability in the R7b dossier layout.
- **F-3 residual** — U5.write: blank Page's inline title still not focused despite the
  mount + RAF re-assert — find what actually claims focus and beat it (or pin the owner).
- **F-5 evolved** — U1.shell: recents now resolve, but `/p/untitled/outline` loses the
  "Project › Surface" breadcrumb (or 404s) — the leaf's breadcrumb/redirect wiring.
- **F-6 (new)** — U4.controls regression: the now-enabled `data-ide-panel-tab="chat"` counts
  as a native-styled control on `/p/untitled` — the F-2 fix un-disabled it, and U4's census
  reads it raw. Settle it honestly: give it the primitive semantics the census expects, or a
  named U4 exemption if it's a genuine carrier — never disable it again.
- **F-7 (new)** — hero-capture recipe broken end-to-end: `context.cookies()` after
  `context.close()` crashes deterministically after a completed walk (exit 2, zero artifacts),
  AND its bare `/healthz` provenance fetch is GFE-intercepted on `*.run.app` (needs the
  trailing-slash/`/healthz/` route the app serves). Both defects are in
  `packages/journeys/src/hero-capture.ts` (249a's recipe — in-scope here as a defect repair).
  BLOCKS the hero recording AND the T1 commit.

## Load (read these — do not re-read others)
- `docs/build/runs/250a_R7FIX.1.md` (round-1 ledger) + `docs/build/runs/R7DEP.2.md` (T1 re-walk).
- `packages/journeys/src/r7legs.ts` (R8.showcase.spa, U1, U2, U3, U4, U5, U7 legs),
  `packages/journeys/src/u3-probe.ts`, `packages/journeys/src/hero-capture.ts`,
  `packages/journeys/src/u4-controls` (or wherever U4's census lives).
- The surfaces: `apps/web/src/dossier-view.tsx`, `apps/web/src/spa/surfaces/editor.tsx`,
  `apps/web/src/spa/ide/chrome.tsx`, `apps/web/src/spa/routes/` (breadcrumb/outline leaves).

## In scope — the five fixes; re-run each failing leg's local arm to green.
## Out of scope — preview/deploy/Stage-B (250 owns); redesigning surfaces; weakening legs.

## AC
1. Each finding's local leg arm green (or an honest recorded disposition if a finding proves
   a fixture gap again).
2. `hero-capture` completes a walk with artifacts + the correct provenance route on a local
   server (its `*.run.app` GFE case is exercised by the capture against a local build
   where feasible).
3. Fresh-build full sweeps green (web + journeys).
4. `docs/build/runs/250b_R7FIX.2.md` (NOTE: `runs/R7FIX.2.md` already exists from 223c —
   use the ticket-prefixed path); `D-R7FIX.2-*` deferral → 250 ("verified at T1b re-walk").
