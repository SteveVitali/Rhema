# R7HOME.1 — Flat recent projects list + KIT-3 batch c1 (list, inbox)

**Spec:** `docs/tickets/234_R7HOME.1__projects-list.md` (chain row 234)
**Base:** `stevevitali/r7talk-1b-tabs` @ `1bacab19` · **Stage A only** ($0 — no preview, GD-PREVIEW.R7)
**Requirement ids:** REQ-HOME-1 · REQ-KIT-3 (batch c1) · REQ-GUARD-1 · REQ-KIT-5 · ADR-128 · REQ-BFF-1/2/9/11 · REQ-DAT-4 · REQ-UX-6/16 · REQ-VFY-6

## Summary

- **REQ-HOME-1 [flat recent list].** `/app` renders a flat, always-expanded list sorted by last
  edit — the collapsed QUIET bucket, the ▸ marker + Show/Hide cues, and the "QUIET"/"Unfiled"/
  "Sheet" labels are retired (Unfiled survives only as the opt-in Group-by: Voice bucket).
  "Waiting on you" and "Running" pin above the list **only when non-empty**; ready-to-read stays
  in the list carrying the green dot. Rows show status dot (with legend tooltip), title,
  version + state, protocol, voice (only when set), status line, last-edited stamp, one hover
  Open action, and a ⋯ Radix menu. The api still derives the group key and now ships
  `lastEditedAt` + per-verb `estimates` (the shared `surfaceEstimate`/`resolveSheetConfig` at
  the sheet's resolved rigor/tier — fail-soft, never a modelled figure).
- **Toolbar.** One compact row: search TextField + Filter/Sort/Group-by DropdownMenus applying
  instantly (no Apply buttons; no-JS submit inside `<noscript>`). Only non-default params reach
  the URL; `?archived`/`?deleted` encode cleanly as `=1` (numeric-flag narrowing, `flagIntParam`).
- **Lifecycle.** Archive/unarchive/duplicate/delete/restore post through `bffFetch` with
  optimistic updates on every `["bff","app"]` twin cache, a failure rolls the snapshot back and
  raises the error toast, and each success toast carries Undo (the inverse verb). Invalidation
  is scoped to `["bff","app"]` — never `["bff"]`. Paid ⋯ items show the estimator's figure and
  open `/p/:slug/run?workflow=…` — no row item creates a run; disabled no-op items are hidden.
- **KIT-3 batch c1.** `packages/ui/src/project-list.tsx`,
  `apps/web/src/spa/surfaces/{project-home,inbox}.tsx` are rebuilt on the 225a primitives
  (Badge/Chip/Tooltip/DropdownMenu/IconButton/TextField/ToastProvider/EmptyState) with `.ui-*`
  classes in `uiCss()`; `NO_RAW_CONTROLS_ENABLED` grew by those three files, with two named
  exemption-list entries (the `<noscript>` search submit; the mark-read form's hidden `item`
  id). DOM-contract hooks kept (`data-menu-form`/`data-menu-action`/`data-restore-form`/…);
  retired hooks removed from the project-home manifest; journeys updated (`openProjectRowMenu`
  on `[data-row-menu]`, `[data-menu-form="delete"]` item; the dead Quiet-expand branches gone).
- **Spec banner.** `docs/rhema-design-spec.md` §5.2 carries the dated REQ-IDE-4/-6 ADR-128
  amendment marking the collapsed-Quiet sketch superseded.

## Entry delta

`pnpm check:spa-budget`: **entry delta +14.4 kB gz** of the ≤15.0 kB allowance vs baseline
`04a4e98b` (2026-11-05T02:56Z) — all ceilings held. `pnpm check:spa-entry-graph`: OK — only
Tooltip/DropdownMenu may reach the entry (Radix stays leaf-bound).

## Test plan

- `apps/web/src/spa/project-home.dom.test.tsx` (18 legs): all rows visible on load with no
  collapsed group and no QUIET/Unfiled/Sheet text; attention sections absent when empty, present
  when populated; last-edit ordering; instant filter/sort/search with only non-default params
  and clean `?archived=1`; optimistic archive + Undo restoration (fails without Undo); failed
  mutation rolls back + error toast; paid items carry the fixture estimate + run-sheet href and
  no run creation; hidden disabled items; scoped `["bff","app"]` invalidation; group-by menu →
  `POST /app/grouping`; voice grouping Unfiled-first; archived/deleted sections; EmptyState;
  compact-mode suppression; component axe; twin-failure error state; unflipped handoff.
- `packages/ui/src/project-list.test.tsx` (3) — flat-list rendering + non-empty-only sections +
  EmptyState. `spa-journey-hooks.test.tsx` — `data-menu-form`/`data-menu-action` keyed hooks
  (happy-dom, menu opened). `apps/api/src/project-list.test.ts` — DTO unchanged on existing
  legs; new `lastEditedAt`/`estimates` additive. `inbox.dom.test.tsx` — hooks preserved.
- `pnpm check:dom-contract` green (95 project-home hooks emitted + asserted); journeys
  `stb5a.test.ts`/`steps.ts` suite green.

## Stage B

`D-R7HOME.1-1` in `docs/tickets/DEFERRALS.md` — owner **250_R7DEP.2**: ≥6-project workspace,
flat list, one filter, one sort, archive→Undo, `/app`+`/app/inbox` chrome, screenshots at the
250 preview SHA.

## Records

`docs/build/runs/R7HOME.1.md` (ledger, gap table, evidence log); BUILD_INDEX row 273;
LEDGER advanced (`lastCompleted: R7HOME.1`, chainTip → `stevevitali/r7home-1-projects`).

## Do NOT merge

`mergePolicy: OPERATOR` — stacked on `stevevitali/r7talk-1b-tabs` (#PR chain); the operator
merges bottom-up.
