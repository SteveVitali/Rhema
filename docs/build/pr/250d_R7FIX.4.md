# R7FIX.4 (250d) — defect-boundary owner fixes, round 4

**Base:** `stevevitali/r7dep-2-t1-prod` · **Stage A only, $0** (deployed proof is 250's T1d
re-walk on `pr-293`; no preview touched). **Unmerged — mergePolicy: OPERATOR.**

Ticket: `docs/tickets/250d_R7FIX.4__defect-round-4.md` · run ledger:
`docs/build/runs/250d_R7FIX.4.md`.

## What changed (~25 lines, 1 file)

The T1c re-walk at `d372de85` greened 13/15 legs (R8.showcase.spa regression closed,
F-1/F-5 discharged). Two remained, both evolved layers — and both diagnosed to the
leg side, not the surface (`packages/journeys/src/r7legs.ts` only):

- **`U2.noreload`** — leg-ordering bug: the first `chatTab.click()` ran before the `]`
  panel-open; the Chat tab lives inside the closed right panel (`aria-selected`,
  legitimately invisible), so the click could never land. Re-ordered to the reader's
  sequence: blur any field focus (`]` is a bare chrome chord, inert in
  `input`/`page`/`source` zones — the same arm U5 uses for `f`) → press `]` →
  `waitForSelector('.ide[data-panel="open"]')` → real `chatTab.click()` (the
  `.catch(() => undefined)` swallow is gone — an unactionable tab after a confirmed
  open is its own failure).
- **`U5.write`** — the arm was too synthetic, not a mount regression: the format
  bubble's `selectionMenu` fires on a `mouseup` inside `[data-pane="page"]` (or a
  shift-`keyup`) with a non-collapsed range; `editor.selectText()` sets the DOM range
  directly, dispatching neither. Replaced with a real pointer-drag across the typed
  paragraph — the gesture a reader makes. The mount is verified intact at this head
  (listeners bound, `[data-pane="page"]` emitted, `format-bubble.dom.test.tsx` greens
  the identical arm); no surface code touched, no markup reordered, no assert weakened.

## Verify (fresh build at this head)

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — 15/15 green
- typecheck (web + journeys) clean · `turbo lint` 0 errors
- web sweep **1667/1667** · journeys sweep **228/228** (all local leg arms green)
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK
- `check:spa-budget` — all ceilings held; cumulative entry +33.3 kB vs `04a4e98b`
  (pre-existing deficit — GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7; **0 kB** this ticket —
  journeys-only change, no shipped JS)

## Records

- `docs/build/runs/250d_R7FIX.4.md` (per-leg diagnosis → fix → verdict)
- `docs/tickets/DEFERRALS.md` — `D-R7FIX.4-1` → 250_R7DEP.2 ("verified at T1d re-walk")
- `docs/build/BUILD_INDEX.md` row 297 · `docs/build/LEDGER.md` PHASE LOG
