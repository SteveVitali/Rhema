# R7KIT.3d — batch d: IDE/workspace surfaces on shared primitives

Migrates the round-7 batch-d surfaces to the 225/225a `@rhema/ui` primitives and generated `uiCss()` classes: `gate-card`, `run-card`, `timeline`, `findings-desk`, `compare`, `page-editor`, `ide-shell`, `run-sheet`, and `approval-settings`. Dossier composition stays out (moved to `243a_R7KIT.3e`).

## Changes

- Raw controls → `Button`/`IconButton`/`TextField`/`TextArea`; deliverable/origin/section labels → `Chip` — `variant="static"` spans (no role/tabindex/pointer) for non-interactive labels, `variant="action"` real `<a>` links for verb/origin links, real submit `<button>`s for actions.
- All displaced inline spacing/type/colour/radius literals → generated `.ui-d-*` classes + a second `uiCss()` decl-hoist dedup (every ≥2-site declaration in a shared group before its member rules — the c2 pattern, identical cascade). `uiCss()`: **23,162 B ≤ 24,576**.
- Named no-JS/native exemptions (`GateCheck`/`GateSelect`, `RunSheet`/`RunButton`/`AskButton` — RV-36 inline-script selectors, `FilterSelect`, `TaskMark` disabled preview, `PolicyRadio`/`OverrideSelect`/`HiddenField` no-JS carriers) recorded in the exemptions ledger; `rhema/no-raw-controls` enabled `error` on all nine files with seeded batch-d legs (21/21 rule tests).
- DOM-contract hooks, `data-*` attributes, severity CSS vars, and every no-JS form's method/action/field names preserved.

## Evidence (Stage A, `$0`, unmerged — `mergePolicy: OPERATOR`)

- `turbo build --filter=@rhema/web...` PASS · ui + web typecheck PASS · eslint on touched files clean
- `vitest packages/ui/src` **157/157** · `vitest apps/web/src` **1,601/1,601** · `no-raw-controls.test.ts` **21/21**
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` PASS · `check:spa-budget` PASS — entry **+15.5 kB vs baseline `04a4e98b`, ticket increment +0.0 kB** (the WARN is the parent's accumulated `GD-KIT3A-BUDGET` deficit, unchanged)
- `server.test.ts` verb-row leg updated — Chip emits `data-verb` after `rel`; hook + href unchanged
- Changed lines: **+721/−924** (over the ~600 estimate — the `ui-css.ts` decl-hoist regeneration drives ~470 of them; honestly reported)
- Run record: `docs/build/runs/R7KIT.3d.md` · Deferral: `D-R7KIT.3d-1` (Stage-B walk → 250_R7DEP.2, OPEN)
- Exact-head CI: run `42303234177` @ `5ac978e4` — observed in-progress at write time; re-read before any green claim

Owed at Stage B (never claimed here): screenshots + computed-style probe at the 250 preview SHA.
