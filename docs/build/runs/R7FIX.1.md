# R7FIX.1 — Pane overlay/occlusion stopgap + Desk head visible + Focus-mode exit

- **Spec:** `docs/tickets/212_R7FIX.1__pane-stopgap-focus-exit.md` (seq 212 of 254; manifest row 212)
- **Base:** `stevevitali/r7ro-1-read-only` @ `6784e64` (chainTip; stack rides unmerged PRs #240–#242, OPERATOR)
- **Branch:** `stevevitali/r7fix-1-pane-stopgap`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5 (same checkout as R7RO.1)
- **Started:** 2026-11-03T20:45Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Size budget ~400 changed lines.
- **Closed:** 2026-11-03T23:5xZ — `ci: pass #243@438ee2e (run 41720614270 — all seven legs + ci-pass anchor; PR open, unmerged, OPERATOR)`

## Deferrals read

- `D-R7OPEN.1-1` OPEN — 14 R7 legs incl `U3.stopgap` report `owed`, flip at 224/250. This ticket
  implements the `U3.stopgap` body but keeps `expected:"red"` (nightly hazard — prod serves
  pre-R7a code until 224; a flip in this PR would redden the nightly). Row stays OPEN.
- `D-R7KIT.1-1` OPEN — Stage B at 224; unaffected.
- `D-R7RO.1-1` OPEN — Stage B at 224; unaffected.
- None closable by this ticket. Must OPEN `D-R7FIX.1-1` — Stage-B walk + `U3.stopgap` flip at 224.

## Requirements

1. `paneLayout()` wired as the runtime geometry source: the controller derives the effective mode
   and pane defaults from `paneLayout(viewportWidth, state)` on mount and on resize; CSS
   breakpoints stay in parity (a test pins it). (REQ-PANE-0) [UXC-19]
2. Viewport-aware defaults: Timeline closed by default below 1280 and in single-pane mode; opens
   on demand; the SSR shell default matches (no open-then-close flash). [UXC-19, UXC-20, F2]
3. Overlay (1024–1279) and sheet (<1024) modes: scrim + Esc + outside-click dismiss with focus
   returned to the trigger; open state never persisted from overlay mode; a persisted wide-mode
   `timelineOpen:true` never auto-opens the overlay at narrow width. [UXC-19/20, F1, F2]
4. ≥1280 with Files open: the page column reflows instead of sliding under the Timeline, within
   REQ-IDE-9's measure. [B1]
5. Desk head never occluded by the status bar at any reference height incl. ~757 px. [B2]
6. Focus mode (REQ-WRITE-4) [B12]: hover- and keyboard-revealed exit pill ("Exit focus · Esc",
   COPY leaf); Esc always exits; `view:"focus"` session-scoped — never serialized, codec coerces
   a stored `focus` to `write`; `?focus=1` still seeds the session.
7. `U3.stopgap` journey body implemented + wired; stays `expected:"red"` at PR head; run record
   marks it `ready-to-flip` with the offline-harness result at the four sizes.

## Acceptance criteria → test matrix

- paneLayout() has a runtime caller; unit test pins CSS-breakpoint ↔ paneLayout() parity at each
  boundary (engineered) → `packages/ide/src/ide.test.ts` parity block.
- DOM/controller tests: Timeline closed by default at 1024–1279 and <1024; overlay/sheet open
  shows a scrim and closes on Esc + outside click; overlay open state never persisted; persisted
  wide-mode timelineOpen never opens the overlay at narrow width (fixture-verified)
  → `apps/web/src/spa/ide-chrome.dom.test.tsx` stopgap block (innerWidth stubbed).
- ≥1280+Files: Page column box does not intersect Timeline's; Desk head box does not intersect
  status bar's at 1440×757 (fixture-verified) → `packages/journeys/src/occlusion-harness.test.ts`
  (bundled-Chromium real-layout fixture, offline).
- Focus-mode tests: pill revealed on hover and keyboard focus; Esc exits with no menu open; a
  reload after focus restores `write` (fixture-verified) → dom test + codec test + harness hover.
- `U3.stopgap` body implemented+wired, still `expected:"red"`; `ready-to-flip` recorded
  (engineered + offline-harness evidence).
- Stage B deferred → `D-R7FIX.1-1` (staging-verified at 224_R7DEP.1).
- Universal phase-gate AC (agentic).

## Plan

- `packages/ide/src/layout.ts`: drop the files-open `<1600` arm from the timeline→overlay rule
  (≥1280 reflow; margin→ticks stays). Update doc comment.
- `packages/ide/src/state.ts`: codec never restores/serializes `view:"focus"` (→`write` both ways).
- `packages/tokens/src/ide-css.ts`: remove timeline-absolute rule from the <1600 files block;
  add `.ide-scrim` (shown under `data-timeline-mode` overlay|sheet / `data-files-mode` overlay
  while open) and `.ide-focus-exit` (focus-view pill: hidden until :hover/:focus-visible).
- `packages/ui/src/ide-shell.tsx`: SSR `data-timeline="closed"` + no `data-open` (controller
  derives from paneLayout — no un-scrimmed-overlay flash); `<div class="ide-scrim">` in
  `.ide-main`; focus-exit `<button data-ide-focus-exit>`; View-menu Timeline row (on-demand
  pointer path at <1280). Labels: `focusExit`, `viewMenu.timeline`.
- `apps/web/src/spa/ide/controller.ts`: `paneLayout(innerWidth, state)` on mount+resize →
  `data-pane-mode`/`data-timeline-mode`/`data-files-mode` + effective opens (session overlay
  flags, never persisted); Esc/outside-click dismiss + focus return; focus-exit click; Esc
  exits focus.
- `apps/web/src/copy.ts`: `ide.focusExit` + `ide.viewMenu.timeline` leaves.
- `apps/web/src/dom-contract.ts`: declare `data-pane-mode`, `data-timeline-mode`,
  `data-files-mode`, `data-ide-scrim`, `data-ide-focus-exit`.
- `packages/journeys/src/r7legs.ts`: `U3.stopgap` real body (four sizes; scrimmed-overlay,
  desk tabs actionable, Esc closes, focus pill + Esc exit). `runner.test.ts` exempts it like
  `R8.showcase.spa`.
- `packages/journeys/src/occlusion-harness.test.ts`: offline bundled-Chromium fixture (real
  IdeShell markup + real ideCss/themeCss) asserting geometry at 1440×900/1280×800/1024×768/
  820×1180 (+757 height for B2, +boundary widths); journeys devDeps gain @rhema/ui, @rhema/ide,
  react, react-dom + @types.

## Gap table

| Spec clause | First pass | Fixed by |
|---|---|---|
| `paneLayout()` unused at runtime | Controller derived opens only from persisted `state` | `presentationNow()` + `apply()`; `data-pane-mode`/`data-timeline-mode`/`data-files-mode`; resize listener |
| Overlay/sheet had no scrim or dismiss path (F1/F2) | `.ide-timeline[data-open]` absolute w/o scrim; Esc closed menus only | `.ide-scrim` CSS arm + element; layered Esc; `onDocClick` outside-dismiss; focus-return |
| Overlay open state persisted (storage-driven auto-open) | toggles always `commit()` | session `overlayOpenRef`; `togglePane`/`onUp` never persist in overlay modes |
| ≥1280+Files page slid under Timeline (B1) | `<1600 files-open` timeline→overlay arm | arm removed (paneLayout + CSS); harness asserts reflow non-intersection |
| Focus trapped (B12): no visible exit, Esc inert | ⌘⇧F only; Esc never left | `data-ide-focus-exit` pill (hover/:focus-visible reveal) + layered Esc + codec `focus`→`write` both ways |
| SSR could paint an open overlay pre-JS | `data-timeline="open"` + `data-open` static | SSR emits closed; `data-open` runtime-only (contract test updated) |
| `U3.stopgap` was an owed stub | no body | real body in `r7legs.ts`; registry stays `expected:"red"` |
| View-menu Timeline row added | hardcoded outside `viewMenuModel` in the first pass (self-review catch — broke the "exact ordered model" contract) | row moved into `VIEW_MENU_TOGGLES[0]`; `viewMenuIds` extended honestly; "Source" still absent |

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm exec vitest run` touched suites — `ide.test.ts` 33 ✓ · `tokens.test.ts` ✓ · `ide-chrome.dom.test.tsx` 41 ✓ · `packages/ui` 102 ✓ · `packages/journeys` 205 ✓ + `occlusion-harness.test.ts` 6 ✓.
- `pnpm test` (repo-wide) — one expected-shape failure caught and fixed honestly:
  `dom-contract.test.tsx` still required `data-open` in static SSR markup; the shell now emits
  every pane closed so the hook is runtime-only — the parity list was updated with the recorded
  reason (not weakened: it remains declared + emitted + asserted). Final suite: **6,250 pass /
  4 skip / 0 fail** (see second full run below).
- **Offline occlusion harness** (bundled Chromium, `pnpm --filter @rhema/journeys exec playwright
  install chromium` already present): 6/6 legs —
  - 1440×900 + Files open: `paneLayout` says `pane`; computed `position` static; `.paper` ∩
    `.ide-timeline` = ∅; paper centre hit-test uncovered.
  - 1280×800 docked ↔ 1279 overlay+scrim (the paneLayout↔CSS boundary, both verified against the
    function's own verdict).
  - 1024×768: overlay `position:absolute` + `.ide-scrim` displayed; paper centre hit-tests the scrim.
  - 820×1180: sheet absolute + scrimmed; closed sheet intersects nothing.
  - Desk head ∩ statusbar = ∅ and tabs actionable at 1440×757, 1440×900, 1280×800, 1024×768,
    820×1180 (B2 pinned — current geometry already correct; the R5-era defect does not reproduce).
  - Focus pill: `opacity:0` → `1` on hover AND on keyboard focus; `display:none` under `write`.
- Checks: `check:dom-contract` ✓ (journeys ⊆ manifest ⊆ emitted+asserted) · `check:spa-env` ✓ ·
  `check:spa-budget` ✓ · `check:protocol-markers` ✓ · `check:no-cookies` ✓.
- Server-side persistence re-confirm (ticket Notes): `user.prefs` (`userPrefsSchema`, strict)
  carries no view field; pane view persists only via `rhema:panes:v1:*` localStorage — now
  focus-free on both codec arms. `?focus=1` still seeds the session view then strips.
- Not run: `U3.stopgap` live — no local target can host a signed-in walk ($0); D-R7FIX.1-1.

## Evidence report

`docs/build/pr/R7FIX.1.md` carries the AC→evidence table with per-criterion layers
(engineered / fixture-verified) and the Stage-B deferral boundary. `U3.stopgap` is
**ready-to-flip** — real body wired, Stage-A proxy green (offline harness 6/6); the
registry row stays `expected:"red"` at this PR's head (nightly hazard; 224 flips).
