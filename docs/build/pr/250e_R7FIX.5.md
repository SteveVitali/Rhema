# R7FIX.5 (250e) — defect-boundary owner fixes, round 5

**Base:** `stevevitali/r7dep-2-t1-prod` · **Stage A only, $0** (deployed proof is 250's T1e
re-walk on `pr-293`; no preview touched). **Unmerged — mergePolicy: OPERATOR.**

Ticket: `docs/tickets/250e_R7FIX.5__defect-round-5.md` · run ledger:
`docs/build/runs/250e_R7FIX.5.md`.

## What changed (~80 lines, 4 files)

The T1d re-walk at `e143828f` greened 14/15 legs. Two remained at deeper layers — one is a
leg bug, one is a **real surface defect** (each diagnosed honestly, never weakened):

- **`U2.noreload`** — leg bug, the surface is honest: chat-send's `]` press leaves the
  right panel open, and at the harness's 1280-px signed-in viewport an open panel is the
  `paneLayout` **rail** ceiling (REQ-PANE-2, tested) — `data-ide-sidebar="rail"` puts the
  sidebar's whole recents group `display:none`, so `.first()` resolved `untitled-N` in DOM
  but unactionable. The leg now closes the panel a reader would close (blur → `]` →
  `waitForSelector('.ide[data-panel="closed"]')`) before the unchanged peer pick.
- **`U5.write`** — real surface defect in `spa/ide/controller.ts`: `onDocSelectionChange`
  closes `kind="format-bubble"` menus on any collapsed document selection — but the
  Comment (and Link) composer's own `input.focus()` collapses that selection, so the
  composer self-destructed on open and `data-comment-submit` never existed (reproduced in
  live Chromium: `selectionchange collapsed=true active=TEXTAREA → CLOSE`). The Post is a
  REQ-WRITE-2 write path that must exist. Guard: the collapse close now exempts the menu
  while it holds `document.activeElement` — a menu in use is never a lost selection; every
  other close path (mousedown-outside, outside-mouseup, Esc, item handlers, the plain
  bubble's own collapse) is preserved. Regression test added to
  `format-bubble.dom.test.tsx`.
- **`U3.occlusion` hardening** (the recorded `]`-press race): `u3-probe.ts` blurs focus
  zones first, then bounded `waitForSelector` on the open/closed state with one retry —
  a still-wrong state throws the same honest error. The ≥1280 close arm gets the same arm
  so a raced toggle can't poison the next size's auto-open check.

## Verify (fresh build at this head)

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys --force` — 15/15 fresh
- typecheck (web + journeys) clean · `turbo lint` 0 errors
- web sweep **1668/1668** · journeys sweep **228/228** (all local leg arms green, incl. the
  hardened U3 probe and the new composer-collapse regression test)
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` / `check:no-cookies` — OK
- `check:spa-budget` — all ceilings held; cumulative entry +33.3 kB vs `04a4e98b`
  (pre-existing deficit — GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7; ≈ 0 kB this ticket — a
  predicate clause inside an existing function)
- Live-Chromium repro of the composer defect + the guard fix (uncommitted instrument)
- No new selectors — declared vocabulary only (`data-panel`, `data-shell-recent`,
  `data-comment-*`)

## Records

- `docs/build/runs/250e_R7FIX.5.md` (per-leg diagnosis → fix → verdict)
- `docs/tickets/DEFERRALS.md` — `D-R7FIX.5-1` → 250_R7DEP.2 ("verified at T1e re-walk")
- `docs/build/BUILD_INDEX.md` row 298 · `docs/build/LEDGER.md` PHASE LOG
