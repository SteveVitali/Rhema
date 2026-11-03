# R7FIX.1 — Pane overlay/occlusion stopgap + Desk head visible + Focus-mode exit

**Ticket:** `docs/tickets/212_R7FIX.1__pane-stopgap-focus-exit.md` (seq 212 of 254; manifest row 212)
**Requirements:** REQ-PANE-0, REQ-WRITE-4 · **Base:** `stevevitali/r7ro-1-read-only` (chainTip `6784e64`; mergePolicy OPERATOR)
**Stage:** A only ($0) — unit/DOM/computed-geometry tests + the offline bundled-Chromium occlusion harness; no preview (GD-PREVIEW.R7). Stage B + the `U3.stopgap` flip ride 224's phase preview via `D-R7FIX.1-1`.

## Summary

Before the Round-7 demo, three observed defects made the IDE overlay chain unfocused: at
1024–1279 px the Timeline became an absolute overlay over the draft and finding ticks with no
scrim and no dismiss path (F1); below 1024 the Timeline sheet and the Files drawer did the same
(F2); at ≥1280 with Files open the Page column could slide under the Timeline instead of
reflowing (B1); the Desk head could sit behind the status bar at laptop heights (B2); and Focus
mode had no visible exit and Esc did nothing (B12). This ticket is the R7a stopgap only — the
`REQ-PANE-1/2` SplitPane engine stays owned by row 229 (`R7PANE.1`).

`paneLayout()` — previously a pure function with no runtime caller — is now the geometry
source: the SPA controller derives `data-pane-mode` / `data-timeline-mode` / `data-files-mode`
and every pane's effective open state from `paneLayout(viewportWidth, state)` on mount and on
resize, and a unit test pins the CSS-breakpoint ↔ paneLayout() parity at each boundary.

## What changed

- `packages/ide/src/layout.ts` — the `<1600 + Files open` arm no longer turns the Timeline into
  an overlay at ≥1280 (the Page column reflows under it; B1). Margin→ticks is unchanged.
- `packages/ide/src/state.ts` — `view:"focus"` is session-scoped: a stored blob coerces `focus`→
  `write` on parse and `serializePaneState` emits `write` for it (REQ-WRITE-4; legacy blobs and
  the `?focus=1` seed can never resurrect a trapped session).
- `packages/tokens/src/ide-css.ts` — the Timeline-absolute rule removed from the `<1600` block;
  `.ide-scrim` (z 19, covers `.ide-main`; the rail z 30 and the open pane z 20 stay above) shown
  only while a pane is open in an overlay/sheet mode; `.ide-focus-exit` — the fixed top-centre
  pill under `data-view='focus'`, `opacity:0` until `:hover`/`:focus-visible`.
- `packages/ui/src/ide-shell.tsx` — SSR emits `data-timeline="closed"` and no `data-open` (no
  document can statically paint an un-scrimmed overlay or an open-then-close flash; the
  controller docks the pane on bind at ≥1280 per stored intent). `.ide-scrim` mounts inside
  `.ide-main`; the focus-exit `<button data-ide-focus-exit>` renders (COPY leaf
  `ide.focusExit` = "Exit focus · Esc"); the View menu gains a `role="menuitemcheckbox"`
  `data-ide-timeline-toggle` row — the on-demand pointer path at <1280 (the `×` lives inside
  the closed pane; ⌘2 was keyboard-only).
- `apps/web/src/spa/ide/controller.ts` — `presentationNow()` runs `paneLayout` with both panes
  treated as open, so `timeline:"overlay"|"sheet"` / `files:"overlay"` describe the MODE;
  effective opens pick session intent for overlays/sheets and persisted intent otherwise.
  Overlay/sheet open flags are session-scoped refs — `togglePane` flips them via `apply()`
  (never `commit()`), so nothing written to `rhema:panes:*` can auto-open an overlay at a
  narrow width (a persisted wide-mode `timelineOpen:true` docks at ≥1280, never overlays at
  <1280). Esc is layered: menus/palette/cheatsheet → open overlay/sheet → focus view.
  Outside clicks (incl. the scrim) dismiss open overlays; focus returns to the opener only
  when it was inside the dismissed pane. Pane drags in an overlay/sheet mode stay
  session-scoped. A `resize` listener re-derives geometry on every viewport change.
- `apps/web/src/copy.ts` — `ide.focusExit` + `ide.viewMenu.timeline` leaves.
- `apps/web/src/dom-contract.ts` — `data-pane-mode`, `data-timeline-mode`, `data-files-mode`,
  `data-ide-scrim`, `data-ide-focus-exit` declared. `data-open` is now runtime-only (the shell
  emits every pane closed; the island + controller still emit it — the parity test's
  static-emission list was updated honestly, not weakened).
- `packages/journeys/src/r7legs.ts` — the real `U3.stopgap` body: at 1440×900 (Files open),
  1280×800, 1024×768 and 820×1180 it asserts the Timeline never auto-opens an overlay/sheet
  below 1280, no open un-scrimmed overlay/sheet intersects the Page column / dossier letter /
  finding ticks, the Desk tabs stay actionable, an on-demand overlay carries a scrim + Esc
  closes it, and focus view mounts the exit pill + Esc leaves. `expected:"red"` at head —
  224 flips. `runner.test.ts`/`registry.test.ts` exempt it like `R8.showcase.spa`.
- `packages/journeys/src/occlusion-harness.test.ts` — NEW offline Stage-A harness: the real
  `<IdeShell>` markup + real `ideCss()`/`themeCss()` in bundled Chromium at the four sizes,
  1440×757, and the 1279/1280 boundary: docked-reflow non-intersection, scrim coverage
  (`elementFromPoint` hits `.ide-scrim`, never bare chrome), Desk-head vs status-bar
  non-intersection + actionable tabs, and the pill's hover/focus-visible reveal.
- `packages/journeys/package.json` — devDeps: `@rhema/ide`, `@rhema/tokens`, `@rhema/ui`,
  `react`, `react-dom`, `@types/react`, `@types/react-dom` (fixture rendering only; journeys
  still ships nothing browser-bound).

## Desk-head finding (B2 — recorded honestly)

The static CSS already keeps `.ide` children (`.ide-main` → `.ide-desk` → `.ide-statusbar`)
in a flex column with `overflow:hidden`, and the bundled-Chromium probe measures the Desk
head strictly above the status bar at 1440×757, 1440×900, 1280×800, 1024×768 and 820×1180
with the desk open — the R5-era defect is not reproducible in this geometry (RUN.1's column
fix covers it). The harness now pins the guarantee at every reference height.

## AC → evidence

| AC | layer req/achieved | verdict | evidence |
|---|---|---|---|
| paneLayout() runtime-wired; CSS↔paneLayout parity test at each boundary | engineered/engineered | met | `controller.ts` `presentationNow()`+`apply()`; `ide.test.ts` parity block (media breakpoints ARE LAYOUT tokens; arm content vs `paneLayout` verdict at 1599/1279/1023/767) |
| Timeline closed by default <1280 and single-pane; on demand; SSR default matches | fixture-verified | met | `ide-chrome.dom.test.tsx` R7FIX.1 block (mount at 1100/900 → `data-timeline="closed"` even with stored `timelineOpen:true`; SSR `data-timeline="closed"`) |
| Overlay+sheet: scrim, Esc+outside-click dismiss w/ focus return, never persisted | fixture-verified | met | dom tests (scrim emits, Esc closes, scrim click closes, storage lacks `timelineOpen`); harness (`elementFromPoint`→`.ide-scrim`) |
| ≥1280+Files: Page reflows within REQ-IDE-9's measure | fixture-verified | met | `paneLayout(1440,filesOpen).timeline==="pane"`; harness: computed `position` static + `.paper` ∩ `.ide-timeline` = ∅ at 1440×900 and 1280×800 |
| Desk head never intersects status bar at any height incl. ~757 px | fixture-verified | met | harness: desk-head ∩ statusbar = ∅ + tabs actionable at 1440×757/900, 1280×800, 1024×768, 820×1180 |
| Focus exit pill (hover+keyboard, COPY leaf) + Esc exits + session-scoped view | fixture-verified | met | `COPY.ide.focusExit`; harness hover/`:focus-visible` reveal + `display:none` under write; dom tests (click+Esc exit, reload→write); codec tests (serialize/parse coerce) |
| U3.stopgap body wired; red at head; ready-to-flip | engineered | met | `r7legs.ts` real body; `expected:"red"`; `ready-to-flip` recorded — the offline harness is its Stage-A proxy (6/6 green); live target rides 224 (D-R7FIX.1-1) |
| Stage B deferred → D-R7FIX.1-1 | staging-verified at 224 | met-engineered | DEFERRALS row naming the four-size walk, B1/B2/F1/F2 screenshots, the pill screenshot + the flip |
| Universal phase-gate AC | agentic | met | this PR + `runs/R7FIX.1.md`; BUILD_INDEX row 244; LEDGER advance; ci-boundary read at head |

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — repo-wide green per `runs/R7FIX.1.md` evidence log (dom-contract parity list updated honestly for the runtime-only `data-open`).
- Touched suites: `ide.test.ts` 33 · `tokens.test.ts` · `ide-chrome.dom.test.tsx` 41 · `packages/ui` 102 · `packages/journeys` 205+6 harness.
- **Offline occlusion harness** (`occlusion-harness.test.ts`, bundled Chromium): 6/6 legs green — 1440×900 docked reflow, 1279/1280 boundary parity, 1024×768 overlay scrim, 820×1180 sheet scrim, Desk-head/statusbar at 5 sizes, pill hover+focus reveal.
- `pnpm check:dom-contract` / `check:spa-env` / `check:spa-budget` / `check:protocol-markers` / `check:no-cookies` — green.
- Not run: the `U3.stopgap` leg live — no local target can host a signed-in walk ($0 Stage A); rides 224's phase preview (D-R7FIX.1-1).

## Deferrals / deviations

- **Opened:** `D-R7FIX.1-1` — Stage-B walk + `U3.stopgap` flip at 224 (four sizes, B1/B2/F1/F2 + pill screenshots).
- **Closed:** none (no OPEN row unblocked by this ticket).
- **Deviation (recorded):** the View-menu gains a `timeline` toggle row — the on-demand pointer path at <1280 — as the first `VIEW_MENU_TOGGLES` entry (`viewMenuIds` extended honestly; the row renders `data-ide-timeline-toggle` so the island's overlay-aware path owns it; "Source" stays absent).
- The phone-only island `apps/web/src/client/ide.ts` is NOT extended — desktop documents never mount it post-R7RO.1 (phone UA hides every pane; its `data-open` toggle is harmless there).

**Ready to flip at 224:** `U3.stopgap` (real body; offline-harness evidence committed) — same posture as `R8.showcase.spa`.
