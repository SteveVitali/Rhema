# R7FIX.3 (250c) — defect-boundary owner fixes, round 3

**Base:** `stevevitali/r7dep-2-t1-prod` · **Stage A only, $0** (deployed proof is 250's T1c
re-walk on `pr-293`; no preview touched). **Unmerged — mergePolicy: OPERATOR.**

Ticket: `docs/tickets/250c_R7FIX.3__defect-round-3.md` · run ledger:
`docs/build/runs/250c_R7FIX.3.md`.

## What changed (~110 lines, 5 files)

The T1b re-walk at `2817ba73` greened 12 legs; four remained — all leg-pin-vs-surface
mismatches with the honest side picked per diagnosis (no markup reordering, no weakened
asserts):

- **`R8.showcase.spa`** — `/showcase` 302s onto the dossier itself; `a[href*="/review/"]`
  `.first()` DOM-first resolved the findings-desk filter "Clear" anchor inside the
  legitimately-closed panel. Re-pinned: hop dossier → project Page → back through the
  declared `[data-project-item="reviews"]`, then assert the landing IS a
  `/p/<slug>/review/` path (`r7legs.ts`).
- **`U2.noreload`** — the read-only Showcase honestly withholds Export/Project settings
  (`aria-disabled` + reason — a GD-class surface decision, not a regression). The leg now
  asserts the withheld state and walks `export→settings` on the first writable
  `[data-shell-recent]`; the tail returns to the Showcase so approve/chat exercise their
  safe skip arms (a chat turn is a metered `chat_turn` run — never sent on a `paid:false`
  leg; the disabled-composer arm asserts `data-chat-readonly`).
- **`U5.write`** — `data-inline-title` moved off the `<form>` wrapper onto the `<input>` —
  the element the contract names and the one that owns `document.activeElement`
  (`page-chrome.tsx` + selector updates in `editor.tsx`, `steps.ts`,
  `editor.dom.test.tsx`). Leg body unchanged.
- **`U1.shell`** — on a review-less project the Reviews item's `/p/:slug` fallback is the
  designed destination; `aria-current` is now asserted on the item whose route family
  OWNS the landed pathname (mirroring the items' `active` rules), with the same-URL hop
  asserted directly.

## Verify (fresh build at this head)

- `pnpm turbo build --filter=@rhema/web... --filter=@rhema/journeys` — 15/15 green
- typecheck (web + journeys) clean · `turbo lint` 0 errors
- web sweep **1667/1667** · journeys sweep **228/228** (all local leg arms green)
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK
- `check:spa-budget` — all ceilings held; cumulative entry +33.3 kB vs `04a4e98b`
  (pre-existing deficit — GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7; ≈ +0 kB this ticket)

## Records

- `docs/build/runs/250c_R7FIX.3.md` (per-leg diagnosis → fix → verdict)
- `docs/tickets/DEFERRALS.md` — `D-R7FIX.3-1` → 250_R7DEP.2 ("verified at T1c re-walk")
- `docs/build/BUILD_INDEX.md` row 296 · `docs/build/LEDGER.md` PHASE LOG
