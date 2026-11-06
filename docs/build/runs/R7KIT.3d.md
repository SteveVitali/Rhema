# R7KIT.3d — run record (batch d: gate card, run card, timeline, findings desk, compare, page editor, IDE shell, run sheet, approval settings)

- **Ticket:** `docs/tickets/243_R7KIT.3d__migrate-ide-dossier-layout.md` — REQ-KIT-3 batch d, REQ-KIT-5, REQ-GUARD-1.
- **Branch:** `stevevitali/r7kit-3d-ide-surfaces` ← `stevevitali/r7kit-3c2-outline-figures` @ `6f1fd345`.
- **Scope:** Stage A only, `$0`, no preview (`GD-PREVIEW.R7`), unmerged (`mergePolicy: OPERATOR`). Dossier composition excluded (moved to `243a_R7KIT.3e`).

## What changed

- `gate-card.tsx`, `run-card.tsx`, `timeline.tsx`, `findings-desk.tsx`, `compare.tsx`, `page-editor.tsx`, `ide-shell.tsx`, `run-sheet.tsx`, `approval-settings.tsx` migrated to the 225/225a primitives — `Button`/`IconButton`/`TextField`/`TextArea`/`Chip` — and generated `.ui-d-*` classes on `uiCss()` for every displaced inline spacing/type/colour/radius literal.
- `ui-css.ts`: a second dedup pass after the batch-d additions — every declaration with ≥2 call sites was hoisted into a shared selector group placed before its member rules (the 240a/c2 "groups-before-members" pattern, identical values, cascade preserved). Batch-d adds ~44 own rules + ~24 selector-only `.ui-d-*` classes appended into the shared muted/micro/dense/faint/sev/caption/weight/gap/radius groups. Pinned rules (`.ui-pill`, `.ui-action-link`, `button.ui-chip` cursor) keep their decls inside their own rules — the pins are byte-exact.
- Chip semantics (C6): deliverable/origin/next-step labels that never acted became `variant="static"` spans (no role/tabindex/cursor); verb and origin links became `variant="action"` real `<a>`s; the dismiss stays a real submit `<button>`.
- Named no-JS/native exemptions in `no-raw-controls-exemptions.js`: `GateCheck`, `GateSelect` (gate-card native controls inside the SSR form grammar), `RunSheet`, `RunButton`, `AskButton` (RV-36 — inline `recomputeScript` reads `input[name^="toggle."]` and native select carriers), `FilterSelect` (findings-desk no-JS filter), `TaskMark` (page-editor disabled/read-only preview checkbox), `PolicyRadio`, `OverrideSelect`, `HiddenField` (approval-settings no-JS radio/select/hidden carriers).
- `eslint.config.js`: `rhema/no-raw-controls` enabled `error` on the nine batch-d files; dossier files left off (243a_R7KIT.3e). Rule test: 21/21 — seeded raw-control legs fail on every batch-d file, exemptions beat enabled config, not-yet-migrated dossier files stay unconfigured.
- `server.test.ts`: the §5.5 verb-row leg now asserts `href` and `data-verb` separately — React emits `data-verb` after `rel` on the Chip anchor; the hook + href are unchanged.
- Changed lines: **721 added / 924 deleted** (1,645 touched). Over the ~600 ticket estimate — the honest driver is `ui-css.ts` (473 lines churned by the decl-hoist regeneration, not by rule-count growth); the nine migrated sources are roughly +300/−450.

## Verification (ran at head `HEAD` of `stevevitali/r7kit-3d-ide-surfaces`)

| Check | Result |
| --- | --- |
| `pnpm turbo build --filter=@rhema/web...` | PASS — 13 tasks |
| `pnpm --filter @rhema/ui typecheck` / `@rhema/web typecheck` | PASS |
| `pnpm exec eslint` on the ten touched sources | PASS — zero errors/warnings |
| `pnpm exec vitest run packages/ui/src` | PASS — 157/157 (ui-css bound, chip pins, gate/run/timeline/findings/compare/page-editor/ide-shell DOM legs) |
| `pnpm exec vitest run apps/web/src` | PASS — 1,601/1,601 |
| `pnpm exec vitest run tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts` | PASS — 21/21 |
| `pnpm check:dom-contract` | PASS |
| `pnpm check:spa-env` | PASS |
| `pnpm check:protocol-markers` | PASS |
| `pnpm check:spa-budget` | PASS (ceilings held) — entry delta **+15.5 kB vs baseline `04a4e98b`**, ticket increment **+0.0 kB**; the WARN is the parent's accumulated `GD-KIT3A-BUDGET` deficit, unchanged by this ticket |
| `uiCss()` raw size | **23,162 B ≤ 24,576** (was ~26,800 before the hoisted-dedup pass) |
| `node docs/build/tools/check-append-only.mjs --base <PR base>` / build-memory structural check | recorded in the PR evidence |
| Exact-head CI | run `42303234177` on `5ac978e4` — observed **in_progress** at write time; re-read before any green claim (never inferred) |

Not run: any deployed/browser journey, preview, or production mutation (none owed — Stage A).

## Deferrals

- `D-R7KIT.3d-1` — Stage-B walk of the batch-d surfaces at the 250 phase preview (OPEN, 2026-11-06).

## Budget/impact

- Entry JS: +0.0 kB ticket increment; +15.5 kB cumulative vs `04a4e98b` — parent deficit under `GD-KIT3A-BUDGET`, unchanged.
- `uiCss()`: 23,162 B ≤ 24,576 — headroom ~1.4 kB.
- DOM-contract hooks, no-JS form grammar (methods, action paths, field names, hidden carriers), severity `--d-sev`/`--d-fill` CSS vars, and journey selectors preserved.

## Orchestrator note — CI red on the records head, repaired in-branch

CI run 42303880120 failed `typecheck / lint / unit` on `u3-occlusion.local.test.ts` (the
ready-to-flip PANE.1 geometry probe): the migrated `IconButton` close button's `.ui-btn--sm`
box widened `.ide-panel-head` past the 320px panel, so the feed tab's center was occluded.
Fix in `packages/tokens/src/ide-css.ts`: panel-head gap/padding s2→s1 / s3→s2, tab gap s2→s1,
tab padding 8px→6px, close button pinned to 22×22 — all five probe sizes green + 88 chrome/
tokens tests. Guardrails untouched (probe is the oracle).
