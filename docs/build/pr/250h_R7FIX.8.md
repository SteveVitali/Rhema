# 250h R7FIX.8 — the sync-pill/focus-exit overlap (F-R7DEP.3-1)

Fixes the R7DEP.3 deploy walk's residual: `P1.pill` FAIL deterministic ×2 at `b8307a40` —
`sync pill covers text at desktop: button "Exit focus · Esc"` at 1440×900. Base
`stevevitali/r7deploy-tip`. **mergePolicy: OPERATOR** — the operator merges bottom-up; a
run never merges itself.

## Root cause

A cascade-order defect, not a geometry choice. `.ide-focus-exit { display: none }` (the
authored gate — the exit pill is focus-view-only by REQ-WRITE-4 design) ties its carrier's
own `.ui-btn { display: inline-flex }` on specificity and loses on source order. The
invisible `position:fixed` button kept a live 116×29 hit-box at top-centre in EVERY view —
overlapping the page strip's `synced ✓` pill at 1440×900 (what `pillTextOverlap` reported)
and swallowing pointer hits over the strip's controls. Measured live on a local
`demoDataSource` server: `display:flex` (blockified `inline-flex`), rect `{662,4,116,29}`
in `data-view="write"`.

## Fix

- `packages/tokens/src/ide-css.ts` — hide rule `.ide-focus-exit` → `.ide .ide-focus-exit`
  (two-class specificity beats `.ui-btn`'s one; the `.ide[data-view='focus']` reveal still
  out-specifies it). The reader keeps BOTH affordances: the strip's pill in write/read
  view, the exit reveal in focus view — nothing hidden, no control dropped, no U3-class
  exemption needed.
- `packages/tokens/src/tokens.test.ts` — the cascade pin (scoped hide + reveal + a
  no-bare-selector guard).
- `packages/journeys/src/steps.ts` — `pillTextOverlap` exported so the new local arm runs
  the leg's verbatim measure.
- `packages/journeys/src/p1-pill.local.test.ts` — the local Stage-A arm: write view asserts
  the exit pill computes `display:none`/zero box + probe `null`; focus view asserts the
  exit mounts its box while the strip's pill owns none (they never coexist); a seeded
  negative proves a restyled exit box over the pill fails the probe with the prod error
  (the guard can fail).

## Verification (fresh `pnpm turbo build` 46/46 first)

- `turbo typecheck lint` clean on the touched set (tokens · journeys · web).
- `p1-pill.local.test.ts` 2/2 · `packages/tokens` 48/48 · `packages/journeys/src` 233/233 ·
  `apps/web/src` 1669/1669.
- `check:dom-contract` · `check:spa-budget` (entry +33.3 kB cumulative vs `04a4e98b`, ~0 kB
  this ticket; the GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 rulings stand) · `check:spa-env` ·
  `check:protocol-markers` · `check:no-cookies` · `check:licenses` — all green.
- Live-Chromium before/after on the demo-hosted `.ide`: pre-fix `display:flex` + live rect
  in write view; post-fix `display:none`/zero box, `f` → `data-view="focus"` mounts the
  reveal, Esc restores.
- **Deferred:** the deployed `P1.pill` re-walk rides the NEXT deploy → `D-R7FIX.8-1`
  (dated, in DEFERRALS); `D-R7DEP.3-1` stays OPEN on the deployed arm.
- Stage A only — no preview, no prod mutation. Spend: **$0**.

## Records

`docs/build/runs/250h_R7FIX.8.md` · `D-R7FIX.8-1` in `docs/tickets/DEFERRALS.md` ·
BUILD_INDEX 305 · LEDGER PHASE LOG + ci boundary.
