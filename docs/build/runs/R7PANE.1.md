# Run ledger — R7PANE.1 (row 229)

Harness: devin-desktop/swe-2-high/subagent
Skills: e981ec5
Started: 2026-11-05T16:16Z
Closed: (pending)
Spec: docs/tickets/229_R7PANE.1__split-pane-engine.md
Base: `stevevitali/r7shell-1c-palette` @ `a63fca7c` (PR #266 head `113e9395`, unmerged — OPERATOR)
Branch: `stevevitali/r7pane-1-split-pane`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A only per GD-PREVIEW.R7, $0)
Budget: ~850 changed lines excl. generated/fixtures; entry delta ≤ 15 kB gz (REQ-KIT-5)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-05). No `OPEN` row is unblocked by
  this ticket or its landed prerequisites — every open R7 row owes a deployed leg to
  224_R7DEP.1 (closed) or 250_R7DEP.2 (still open: D-R7SHELL.1a-1, D-R7SHELL.1b-1,
  D-R7SHELL.1c-1, D-R7OPEN.1-1 et al.).
- Owes: append `D-R7PANE.1-1` (Stage-B U3.occlusion at 250_R7DEP.2) — owner 250.

## Requirements (spec Goal/In-scope)

1. SplitPane choice per ADR-129/REQ-PANE-1 (library vs in-house under the budget rule;
   append the choice to ADR-129; REQ-DOPS-8 re-asserted only if a dependency is added).
2. Layout sidebar | Page | right panel, reflowing, no un-scrimmed overlay (RV-26); page
   measure 45–80 ch at ≥768; panels collapse in a fixed priority order recorded in ADR-128;
   `role="separator"` handles with aria-valuenow/min/max + arrow-key resize (UXC-26); drag
   persistence + double-click reset stay BACKLOG (RV-31).
3. Breakpoints exactly per spec §4.7 REQ-PANE-2 (≥1440 docked/default-open-when-findings;
   1280–1439 sidebar auto-collapse when panel opens; 1024–1279 scrimmed overlay, session
   only; 768–1023 sheet; <768 the REQ-SHELL-6 sheet content).
4. Desk retires: tabs Chat · Findings · Claims · Timeline · Live feed, bodies moved
   unchanged (RV-25); bottom Desk DOM + Desk/status-bar collision gone (B2/B16); `]` chord
   retargets to the panel; pane-state codec v1→v2 total migration (REQ-SEQ-12 kept).
5. `paneLayout()` stays the single runtime geometry source, extended for sidebar + panel.
6. DOM contract + tour safety in the same change; U3.occlusion steps implemented at the five
   sizes, pass over a local build, held `ready-to-flip` (`expected:"red"`, 250 flips).
7. Dated REQ-IDE-8 / DS §5.1 banner in `docs/rhema-design-spec.md` (ADR-128).
8. Demo boot: Chat + Live-feed tail hidden/disabled; Findings/Claims/Timeline from demo
   twins; no request outside 221's allowlist; open/size state local.

## Acceptance criteria (working checklist — layers on close)

- [ ] No un-scrimmed overlay over the Page column at the four sizes; no main column <45 ch
      at ≥768 (Playwright layout check over a local build). *(fixture-verified)*
- [ ] `paneLayout()` tests cover priority collapse + 45-ch floor at every table width. *(engineered)*
- [ ] Separators expose ARIA values + arrow-key resize. *(engineered)*
- [ ] Overlay mode: scrim, Esc/outside-click close, never persisted. *(engineered)*
- [ ] Moved bodies' markup == pre-move Desk bodies for the same fixture. *(engineered)*
- [ ] Chat/Findings/Claims/Timeline/Live feed actionable at every table width. *(fixture-verified)*
- [ ] v1→v2 codec migration total; malformed blob falls back per key. *(engineered)*
- [ ] Every R7a tour target hook resolves at head. *(engineered)*
- [ ] Entry delta ≤ 15 kB gz reported; check:licenses green if dep added. *(engineered)*
- [ ] Demo-boot DOM test: `boot.demo` → Chat + feed tail hidden/disabled, no EventSource, no
      request outside the demo allowlist; fails if a workspace/stream request issues. *(engineered)*
- [ ] U3.occlusion held `ready-to-flip`: steps implemented + typecheck, local-build layout
      check passes, registry stays `expected:"red"`. *(engineered)*
- [ ] Stage-B deferral row `D-R7PANE.1-1` opened (owner 250: U3.occlusion green at 5 sizes at
      preview SHA + screenshot per size). *(met-engineered → staging-verified @250)*
- [ ] Universal gate AC. *(agentic)*

## Plan

- `@rhema/ide`: `PaneState` v2 (`panelOpen?`, `panelWidth`, `panelTab`; desk/timeline fields
  retire); `paneLayout()` extended — panel modes per REQ-PANE-2, sidebar advisory mode
  (expanded/rail/drawer), default-open ≥1440 when findings, priority collapse
  (files→strip → panel→closed → margin→hidden) before the 45-ch floor; `paneDrag`
  files|panel; codec `PANE_STORAGE_VERSION=2` + total v1 migration.
- keymap: `]` → `pane:panel` (actionKind renamed `pane:timeline`→`pane:panel`).
- `@rhema/ui` ide-shell: Desk section + Timeline aside replaced by the right `<aside>`
  (`data-pane="panel"`, tablist Chat·Findings·Claims·Timeline·Live feed over the moved
  bodies, `data-ide-panel-tab`/`data-ide-panel-toggle`, `data-panel-body` panels); `demo`
  prop hides the Chat trigger and stamps `data-demo` (feed tail already `isDemo()`-gated).
- `@rhema/tokens` ide-css: panel docked/overlay/sheet geometry + scrim arms; sidebar
  rail/drawer geometry under `.app-shell[data-ide-sidebar]`; desk rules removed.
- `spa/ide/controller.ts`: overlay intent gains `panel`; apply() stamps panel attrs +
  `data-ide-sidebar` on `.app-shell`; `]`/View-menu/`data-ide-open-feed`/triage retarget;
  context menu scoped to the timeline tab body.
- `client/ide.ts` (SSR island): same hook renames (desk/timeline → panel).
- `dom-contract.ts`: desk/timeline hooks migrate to the panel set; `data-pane` values
  files|page|margin|panel.
- U3.occlusion real leg (r7legs.ts, held red) + local leg test over the demo build at the
  five sizes; occlusion-harness updated to the panel geometry.
- ADR-128: REQ-IDE-8 banner + collapse priority order; ADR-129: in-house SplitPane choice.
- Records: DEFERRALS row, BUILD_INDEX 268, LEDGER advance (next → 230_R7SHELL.2 per
  manifest — note: task brief said 230_R7TALK.1; manifest owns order), runs/ + pr/ files.

## Test matrix

| AC | Test |
|---|---|
| paneLayout collapse + 45-ch floor | `packages/ide/src/ide.test.ts` — table widths, collapse order, defaults |
| codec v1→v2 total + malformed fallback | `ide.test.ts` parse/serialize legs |
| separator ARIA + arrow resize | `ide-shell.test.tsx` + `ide-chrome.dom.test.tsx` keydown legs |
| overlay scrim/Esc/outside/no-persist | `ide-chrome.dom.test.tsx` (existing overlay legs, retargeted) |
| bodies unchanged | `ide-shell.test.tsx` panel-body fixture equality vs pre-move strings |
| actionable tabs at widths | U3.occlusion leg + local leg test (Playwright) |
| tour targets resolve | dom-contract manifest vs 222 step list test |
| demo-boot gating | `ide-chrome.dom.test.tsx` demo arm (fetch/EventSource recorder) |
| entry delta | `pnpm check:spa-budget` output |

## Progress

- 2026-11-05T16:16Z — branch cut off `a63fca7c`; DEFERRALS read; anchors re-confirmed.
- Implemented: `PaneState` codec v2 + total v1 migration (`state.ts`), `paneLayout()` REQ-PANE-2
  table + sidebar ceiling + ADR-128 collapse order + effective verdicts (`layout.ts`),
  `paneDrag` verdict-driven refusals, `]`→`pane:panel` (keymap), View-menu `panel` row,
  right-panel `<aside>` replacing Timeline+Desk (`ide-shell.tsx`), panel CSS + sidebar
  advisory geometry (`ide-css.ts`), controller apply/toggles/drag/keyboard-resize +
  `data-ide-sidebar` stamping (`controller.ts`), SSR island renames (`client/ide.ts`),
  labels (`copy.ts`), `shortcutFor("pane:panel")` (app-shell), dom-contract migration +
  `role="separator"` declared, demo prop + gate (`chrome.tsx`/`ide-shell.tsx`), U3.occlusion
  leg body + shared `u3ProbePage` + local five-size test, occlusion harness reworked,
  journey legs dual-probed (steps.ts R4/P1.pill, stb5a.ts), records (DEFERRALS row,
  ADR-128/129 dated notes, spec banner, COVERAGE_MATRIX row).
- Fixed-found bugs: the ranged media blocks initially dropped the <1280 margin→ticks arm
  below 768 (crushed the page column on the hosted phone — caught by the D2.tour local leg);
  `presentationNow` now passes real intents through two pure paneLayout passes so the
  effective verdicts are truthful; `files` keeps mode-token semantics for the overlay gate.

## Gap table

| AC | Required | Delivered | Status |
|---|---|---|---|
| paneLayout() collapse + 45-ch floor at table widths | engineered | met | `ide.test.ts` — boundary widths, collapse order, defaults, floor-sweep |
| codec v1→v2 total + malformed fallback | engineered | met | `ide.test.ts` — migration table incl. desk-wins/tab/width rules |
| separator ARIA + arrow-key resize | engineered | met | `ide-shell.test.tsx` ARIA census + controller `onHandleKey` ←/→ steps |
| overlay scrim/Esc/outside/no-persist | engineered | met | `ide-chrome.dom.test.tsx` overlay legs (retargeted) |
| bodies moved unchanged | engineered | met | `ide-shell.test.tsx` — `data-panel-body` fixture legs |
| actionable tabs at five widths | fixture-verified | met | `u3-occlusion.local.test.ts` — real probe vs local build, 5 sizes |
| tour targets resolve | engineered | met | dom-contract OK + D2.tour local leg green at 3 widths |
| entry delta ≤ 15 kB | engineered | met | `check:spa-budget` — +11.1 kB vs baseline |
| demo-boot gating | engineered | met | `ide-chrome.dom.test.tsx` demo arm — Chat hidden, no EventSource, no workspace read |
| U3.occlusion ready-to-flip | engineered | met | leg body + shared probe implemented, `expected:"red"` retained |
| Stage-B deployed walk | staging-verified | deferred | `D-R7PANE.1-1` (owner 250) |

## Evidence log

- `pnpm turbo build lint typecheck` — 138/138 green across the touched closure.
- `pnpm test` — full suite green except nothing related to this ticket (see Evidence report for counts).
- `packages/ide/src/ide.test.ts` 36/36 incl. the REQ-PANE-2 table, collapse order, v1→v2 codec;
  `keymap.test.ts` 35/35; `packages/tokens` green; `ide-shell.test.tsx` 8/8;
  `ide-chrome.dom.test.tsx` 42/42; `transitions.dom.test.tsx` 8/8.
- `packages/journeys/src/occlusion-harness.test.ts` 6/6 (real Chromium fixture at the boundary
  sizes); `u3-occlusion.local.test.ts` — the shared `u3ProbePage` over a local build at all
  five sizes, green; `demo-tour-legs.local.test.ts` green (caught+fixed the margin-ticks arm).
- `check:dom-contract` OK · `check:spa-budget` OK — **entry delta +11.1 kB vs baseline
  `04a4e98b`** (cumulative ≈+0.1 kB marginal over the prior head; allowance 15 kB) ·
  `check-coverage-matrix` OK (REQ-PANE-1 row added).
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7shell-1c-palette` — (below).
- `check-build-memory.sh` — (below).

## Evidence report

- Layer achieved: **engineered** (Stage A only per GD-PREVIEW.R7; no preview, $0).
- Deferrals: `D-R7PANE.1-1` OPEN (owner 250_R7DEP.2 — `U3.occlusion` flip at 5 sizes;
  `U3.stopgap` re-disposition noted). Carries: none new.
- PR: (created at close — see below). CI read at exact head: (see below).
