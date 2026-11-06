# Run ledger — R7HOME.1 (234)

- **Spec:** `docs/tickets/234_R7HOME.1__projects-list.md`
- **Base:** `stevevitali/r7talk-1b-tabs` @ `1bacab19aea510a7195f3b773100e54309032056`
- **Branch:** `stevevitali/r7home-1-projects`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-06T03:41Z
- **Closed:** 2026-11-06T04:52Z
- **Config:** Stage A only ($0 — unit/DOM tests + local build; no preview, GD-PREVIEW.R7). Stage B → DEFERRALS row owned by 250.
- **ci:** pass #272@`a0c57c95` (run 42162561863 — all seven legs + `ci-pass` anchor; first read fail `03fd0a55` → coverage-matrix REQ-HOME-1 row appended `a0c57c95`; `logs/ci-R7HOME.1.json`)

## Deferrals read
`docs/tickets/DEFERRALS.md` read 2026-11-06. All OPEN rows are Stage-B preview legs owned by
224/250 or scoped to other tickets — none unblocked by R7HOME.1. One new row owed: `D-R7HOME.1-1`
(Stage-B staging verification at 250).

## Requirements (spec §Goal + deliverables)
1. Flat list (REQ-HOME-1) — always expanded, sorted by last edit; row shows title, protocol,
   voice (only if set), version + state, last edited, status dot + legend tooltip; "Waiting on
   you"/"Running" sections only when non-empty; "QUIET"/"Unfiled"/"Sheet" chips retired; labels
   move to COPY; api keeps deriving the group key.
2. Toolbar — search, filter menu (protocol/voice/archived/recently deleted), sort menu, optional
   remembered Group-by on the existing preference; instant apply, no Apply buttons, no-JS submit
   inside `<noscript>`; only non-default params in the URL; `?archived` encodes cleanly.
3. Row actions — one hover action (Open) + ⋯ DropdownMenu; paid items show shared-estimator
   figures + open the run sheet (sheet stays the only run creator); archive/unarchive/duplicate/
   delete/restore optimistic with Undo toast; scoped invalidation; disabled no-op items hidden.
4. KIT-3 batch c1 — list + inbox on the primitives; DOM-contract hooks preserved; REQ-GUARD-1
   enabled for `packages/ui/src/project-list.tsx`, `apps/web/src/spa/surfaces/{project-home,
   inbox}.tsx`.
5. ADR-128 banner — dated REQ-IDE-4/-6 banner in `docs/rhema-design-spec.md` § 5.2.

## Acceptance criteria
- Mixed fixture: all rows visible on load, nothing collapsed, no QUIET/Unfiled/Sheet text;
  attention sections absent when empty, present when not. (engineered)
- Filter/sort/search instant; URL carries only non-default params (round-trip). (engineered)
- Archive optimistic; Undo restores; removal of Undo fails the test; failed mutation rolls back
  with error toast. (engineered)
- Paid ⋯ items show shared-estimator figure (fixture) + open the run sheet; no row action creates
  a run. (engineered)
- GUARD-1 enabled for the three files; `pnpm turbo lint` green; `check:dom-contract` green;
  entry delta ≤ 15 kB gz reported. (engineered)
- Stage B staging-verified at 250 → `D-R7HOME.1-n` DEFERRALS row. (met-engineered)
- Universal phase-gate AC. (agentic)

## Plan
- api `project-list.ts`: add `lastEditedAt` (max of project/draft created_at +
  live_docs.materialized_at) + `estimates` (review/revise/fact_check `surfaceEstimate` figures at
  the sheet's resolved config) to `ProjectListRow`; batch the new reads; fail-soft.
- api-client `ProjectRow`: optional `lastEditedAt` + `estimates`.
- `state-map.ts`: flat-recent sort + attention-section derivation (needs_you→"Waiting on you",
  running→"Running", non-empty only); ready_to_read stays in the flat list (green dot + status
  line); `groupByVoice` retained for opt-in group-by; `toProjectRowView` emits the new row
  anatomy (protocol label, voice only if set, paid menu items carrying estimate labels, hidden
  disabled items).
- `ui/project-list.tsx`: rewritten on primitives — Badge/Pill, Tooltip (status-dot legend),
  DropdownMenu (⋯), IconButton, EmptyState; `.ui-*` classes added to `ui-css.ts`. Menu items keep
  `data-menu-action` + `data-menu-form` hooks.
- `project-home.tsx`: compact toolbar (TextField search + DropdownMenu filter/sort/group-by),
  instant apply via in-router navigate with only non-default params; ToastProvider + optimistic
  lifecycle mutations w/ Undo; scoped `["bff","app"]` invalidation; noscript submits via the
  exemption list; EmptyState.
- `inbox.tsx`: migrate controls to Button primitives + `.ui-*` classes; same hooks.
- `eslint.config.js`: `NO_RAW_CONTROLS_ENABLED` += the 3 files; exemption entries for noscript
  submits/hidden inputs.
- `dom-contract.ts`: declare the new hooks; `stb5a.ts` row-menu helper updated for the Radix
  menu (portal).
- Records: DEFERRALS row D-R7HOME.1-1; ADR-128 banner in `docs/rhema-design-spec.md` §5.2;
  BUILD_INDEX 273; LEDGER advance; pr/R7HOME.1.md.

## Test matrix
- `project-home.dom.test.tsx`: flat list all-visible/no QUIET; attention sections non-empty-only;
  instant filter/sort/search round-trip (non-default params only); optimistic archive+Undo;
  failed-mutation rollback+error toast; paid menu items show fixture estimate + run-sheet href;
  no disabled no-op items; scoped invalidation; compact mode; axe.
- `state-map.test.ts` (new or existing): flat sort by lastEditedAt; attention split; menu view
  model (estimates, hidden disabled).
- api `project-list.test.ts`: `lastEditedAt` + `estimates` populated; tenant isolation kept.
- `inbox.dom.test.tsx`: primitive controls keep `data-inbox-*` hooks + posts.
- GUARD-1: `pnpm turbo lint` green w/ the 3 files enabled; dom-contract green.

## Progress
- 2026-11-06 — branch cut at 1bacab19; context loaded (spec §§3.1/3.2/4.6/4.9/4.16/5/7/8,
  R6 §5+UXC-17+Q1, R5 A1–A11+D2, anchors, primitives, GUARD-1 rule). Anchor drift noted:
  `apps/api/src/surface-estimates.ts` does not exist — the shared estimator is
  `surfaceEstimate`/`surfacePricer` in `@rhema/run-sheet` (asserted by
  `apps/api/src/surface-estimates.test.ts`).

## Gap table
| Requirement | Status | Evidence |
|---|---|---|
| Flat recent list, always expanded, sorted by last edit | met-engineered | `project-home.dom.test.tsx` (all-visible, last-edit sort); `state-map.ts` `sortByLastEdit`/`flatRows`; api `lastEditedAt` |
| "Waiting on you"/"Running" only when non-empty | met-engineered | dom test (absent-when-empty + present legs); `attentionSections` emits only populated sections |
| No QUIET/Unfiled/Sheet labels in the default list | met-engineered | dom test text assertions; `groupByVoice` keeps Unfiled for opt-in grouping; retired hooks removed from manifest |
| Row anatomy (dot+legend, title, protocol, voice-if-set, version+state, last edited, hover Open, ⋯) | met-engineered | `ui/project-list.tsx` + `ui-css.ts`; dom test anatomy leg |
| Compact toolbar, instant apply, no Apply, only non-default params, clean ?archived | met-engineered | dom test filter/sort/search + `archived=1` legs; `flagIntParam` |
| Optimistic lifecycle + Undo + rollback + error toast | met-engineered | dom test archive/Undo + 409 rollback legs; `lifecycle` mutation in `project-home.tsx` |
| Paid items show shared-estimator figure + open run sheet; no row-created runs; hidden disabled items | met-engineered | api `menuEstimates` (surfaceEstimate at resolved config); dom test estimate/href/hidden legs |
| KIT-3 c1 primitives; GUARD-1 enabled on 3 files | met-engineered | `eslint.config.js` list + exemption entries; `pnpm turbo lint` green |
| DOM-contract hooks preserved/updated | met-engineered | `check:dom-contract` OK (95 hooks); journeys updated |
| ADR-128 banner in spec §5.2 | met-engineered | dated amendment appended |
| Stage-B staging verification | deferred | `D-R7HOME.1-1` → 250 |
| Entry delta ≤ 15 kB gz | met-engineered | `check:spa-budget`: +14.4 kB vs baseline 04a4e98b |

## Evidence log
- `pnpm turbo build` (api+web+ui+api-client) — 28/28 green.
- `pnpm turbo lint` (web+ui+api) — green (one pre-existing warning, `chat-live.tsx:192` unused eslint-disable, not touched).
- `pnpm turbo typecheck` (web+ui+api+journeys) — green.
- `pnpm exec vitest run apps/api/src apps/web/src` — 133 files, 2115/2116 pass; 1 initial copy-lint fail ("gate" in `legendNeedsYou`) fixed by rewording; re-run green.
- `pnpm exec vitest run packages/ui/src` — 16 files, 157 pass. `packages/journeys/src` — green incl. `stb5a.test.ts`.
- `pnpm check:dom-contract` — OK (95/95 project-home hooks).
- `pnpm check:spa-budget` — OK; entry delta **+14.4 kB** of ≤15.0 kB vs baseline `04a4e98b`.
- `pnpm check:spa-entry-graph` — OK (only Tooltip/DropdownMenu may reach the entry).

## Evidence report
- First CI read on `03fd0a55`: FAIL — `check-coverage-matrix` flagged `REQ-HOME-1` missing a
  matrix row (the spec banner introduced the id to the checked spec). Row appended `a0c57c95`
  (MET-ENGINEERED(D-R7HOME.1-1)); `check-coverage-matrix` green locally; second CI read PASS.
- `check-build-memory.sh`: 0 violations (19 legacy warnings). `check-append-only.mjs --base
  stevevitali/r7talk-1b-tabs`: OK.
- PR: #272 → `stevevitali/r7talk-1b-tabs`, OPEN, unmerged (OPERATOR).
