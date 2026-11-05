# R7PANE.1 — SplitPane engine, breakpoints, and the right panel (Desk bodies moved unchanged)

**verdict: green locally (engineered layer, Stage A only, $0) — entry delta +11.1 kB gz vs `spa-budget-baseline.json` `04a4e98b` (≈+0.1 kB marginal over head; allowance 15 kB)**

## What lands

- **In-house SplitPane** (ADR-129, 2026-11-05 dated note): `paneLayout()`/`paneDrag()` +
  attribute-driven CSS — no `react-resizable-panels`. The library models none of REQ-PANE-2's
  modes (docked/overlay/sheet breakpoints, session-vs-persisted intent, the ≥1440
  default-open rule, the ADR-128 collapse priority); the adapter would cost more than the
  engine it wraps. REQ-DOPS-8 re-asserted — nothing to pin, `check:licenses` unchanged.
- **`paneLayout()` is the runtime geometry source** for the REQ-PANE-2 table, exactly:
  ≥1440 docked + open-by-default-when-findings; 1280–1439 docked + sidebar auto-rail
  (the `data-ide-sidebar` advisory stamped on `.app-shell`); 1024–1279 scrimmed overlay
  (closed by default, Esc/outside-click, never persisted); 768–1023 full-height sheet;
  <768 the REQ-SHELL-6 sheet content. Panels collapse in the ADR-128 order — **Files →
  strip, then the right panel → closed, then the Margin → hidden** — before the Page drops
  below 45 ch at ≥768.
- **The Desk retires** (REQ-PANE-3): the bottom drawer + the right-edge Timeline pane become
  ONE right panel — `data-pane="panel"`, tabs **Chat · Findings · Claims · Timeline · Live
  feed**, bodies moved unchanged (232/233 own restyle). The B2 status-bar collision is gone
  with the drawer. `data-desk*`/`data-timeline*` attributes stay emitted as **aliases** so
  the R7a journey legs resolve on both surfaces during the merge→250 window.
- **Codec v2** (`rhema:panes:v2:u:p`) with a total v1→v2 migration: an open Desk wins the tab,
  an open Timeline maps to `timeline`, `panelWidth` inherits the Timeline width; malformed
  blobs fall back per key. `panelOpen` is three-state — absent = derive the table default.
- **`]` → `pane:panel`** (the retired ⌘1/⌘2/⌘J stay retired); View-menu panel row;
  `data-ide-open-feed` opens the feed tab; ⌘⇧T triage opens findings.
- **`role="separator"`** on both pane handles with `aria-valuenow/min/max` + arrow-key
  resize (UXC-26). Drag persistence + double-click reset stay BACKLOG (RV-31).
- **`U3.occlusion` ready-to-flip**: the real leg body (`u3ProbePage` shared with the local
  test) implemented, typechecks, stays `expected:"red"` — 250_R7DEP.2 flips it
  (D-R7PANE.1-1).
- **Demo boot**: Chat trigger hidden (`data-demo`/`data-demo-gated` on `.ide`); no
  EventSource ever; zero requests outside 221's allowlist; panel state stays local.
- Journey legs dual-probed (R4 chat send, P1.pill, stb5a findings) — they resolve on prod
  R7a AND this shape.

## Requirements

REQ-PANE-1 (SplitPane) · REQ-PANE-2 (breakpoints) · REQ-PANE-3 (Desk→panel) ·
REQ-PANE-4 (occlusion checks) · REQ-DACC-7 (U3 held ready-to-flip) · REQ-KIT-5 (entry
delta) · REQ-DWEB-7 (demo-boot clause) · REQ-SEQ-12 (per-user/project localStorage,
never the URL) · REQ-IDE-8 banner (DS §5.1) · UXC-19/20/21/26, B1/B2/B16, F1–F3.

## Acceptance

| AC | Layer | Evidence |
|---|---|---|
| paneLayout() collapse order + 45-ch floor at every table width | engineered | `packages/ide/src/ide.test.ts` — boundary widths, collapse order, defaults, floor sweep |
| codec v1→v2 total; malformed fallback per key | engineered | `ide.test.ts` — migration table (desk-wins/tab/width) + v2 round-trip + three-state panelOpen |
| separators carry ARIA + arrow-key resize | engineered | `ide-shell.test.tsx` ARIA census; controller `onHandleKey` ←/→ steps with the 45-ch guard |
| overlay mode: scrim, Esc/outside-click, never persisted | engineered | `ide-chrome.dom.test.tsx` overlay legs (retargeted to `data-panel`) |
| moved bodies' markup unchanged | engineered | `ide-shell.test.tsx` `data-panel-body` fixture legs (chat/findings/claims/timeline/feed) |
| tabs actionable at every table width | fixture-verified | `u3-occlusion.local.test.ts` — real probe vs a local build, all five sizes |
| every R7a tour target hook resolves | engineered | `check:dom-contract` OK + `demo-tour-legs.local` green at 3 widths |
| entry delta ≤ 15 kB gz, reported | engineered | `check:spa-budget` — **+11.1 kB vs baseline `04a4e98b`** |
| demo boot: Chat + feed tail gated, no out-of-allowlist request | engineered | `ide-chrome.dom.test.tsx` demo arm — hidden trigger, `FakeEventSource` count 0, no workspace fetch |
| U3.occlusion held ready-to-flip | engineered | leg body + shared probe in `r7legs.ts`/`u3-probe.ts`; `expected:"red"` retained |
| Stage-B deployed walk | met-engineered → staging-verified @250 | `D-R7PANE.1-1` (owner 250_R7DEP.2; `U3.stopgap` re-disposition noted) |

## Verify

`pnpm turbo build lint typecheck` — 138/138 · `pnpm test` green (full suite; the only
mid-run failure, `check-coverage-matrix` missing the new REQ-PANE-1 row, was fixed by
adding the row and re-verified green) · `check:dom-contract` OK · `check:spa-budget` OK
(entry +11.1 kB) · `check-coverage-matrix` OK · append-only OK vs the PR base ·
check-build-memory 0 violations (legacy warnings only).

Caught-and-fixed during the run: the breakpoint media-block restructure initially dropped
the <1280 Margin→ticks arm below 768 (crushed the hosted phone's page column — the
D2.tour local leg caught it; restored the full <1280 arm), and `presentationNow` now runs
two pure `paneLayout()` passes so the stamped effective verdicts are the real intents.

## Carries / operator asks

- `D-R7PANE.1-1` OPEN — `U3.occlusion` green at the five sizes at the 250 preview SHA with
  `--expect-sha` + screenshot per size; 250 also re-dispositions `U3.stopgap` (its chords +
  Desk-era hooks are R7a-only).
- `nextTicket` per the manifest is `230_R7SHELL.2` (the task brief said `230_R7TALK.1` —
  the manifest owns order; flagged here).
- Merge policy OPERATOR — this PR is never merged by the run.
