# R7FIX.6 (250f) — defect-boundary owner fix, round 6

**Base:** `stevevitali/r7dep-2-t1-prod` · **Stage A only, $0** (deployed proof is 250's T1f
re-walk on `pr-293`; no preview touched). **Unmerged — mergePolicy: OPERATOR.**

Ticket: `docs/tickets/250f_R7FIX.6__defect-round-6.md` · run ledger:
`docs/build/runs/250f_R7FIX.6.md`.

## What changed (~60 lines, 3 files)

The T1e re-walk at `5d001e6b` greened 15/16 legs. ONE remained — `U5.write` at its deepest
layer (title-focus ✓, pointer-drag bubble ✓, composer-survives-collapse ✓,
`[data-comment-submit]` clicked — but `[data-comment-card]` never mounted, 30 s). Diagnosis
of the ticket's three live hypotheses:

- **(2) hook mismatch — ruled out.** The margin card emits `data-comment-card` /
  `data-anchor-block` verbatim (`surfaces/editor.tsx` — the 237_R7WRITE.1a contract
  surface); the leg-pin is honest.
- **(3) anchor lost on submit — ruled out.** The submit dispatches `rhema:comment-submit`
  → PageMount's `onCommentSubmit` → `POST /p/:slug/edit/:draftId/note` → 200 →
  `rhema:comment-added`, all leaf-agnostic; even a collapsed selection yields a storable
  anchor.
- **(1) the write path — TRUE, at its last seam.** The POST succeeds, but the ONLY
  read-back listener — `EditorEventBridge` → `invalidateQueries(["bff","p",slug])` —
  was mounted solely in `VersionPageSurface` (`/p/:slug/v/:v`). The scratch create lands
  `/p/<slug>?created=scratch` → `ProjectPageSurface`, which POSTs the note and publishes
  `useCommentMargin` identically — but with no bridge the event fell on the floor, the
  twin never refetched, and the card could never mount. R7WRITE.1b added the margin to
  this leaf ("on the working head too") and missed the bridge half.

**Fix:** `ProjectPageSurface` wraps in `ToastProvider` (the bridge's `useToast` requires
it — `VersionPageSurface`'s structure verbatim) and mounts `<EditorEventBridge slug={slug} />`.
Both arms land: the comment-card refetch AND the REQ-WRITE-7 fork-undo toast, which was
absent on the working-head Page identically (the collab wire can frozen-fork there too).

**Surfaced wart:** mounting the provider put the toast viewport inside the leaf's
component-axe leg, which flagged `aria-allowed-role` — the viewport emitted
`<ul role="region">` / `<li role="status">` (disallowed roles; latent on `/v/:n` today).
Fixed honestly: viewport + rows are `<div>`s carrying the identical classes and roles.
Every consumer selector is unchanged.

**Regression test:** `/p/:slug` mounted through the production router —
`rhema:comment-added` → `["bff","p",slug]` refetch → `[data-comment-card]` mounts keyed
to `data-anchor-block` (fails pre-fix).

## Verify (fresh build at this head)

- `pnpm turbo build --filter=@rhema/web... --force` — 13/13 fresh
- typecheck (web + ui + journeys) clean · `turbo lint` 0 errors
- web sweep **1669/1669** · journeys sweep **228/228** · ui sweep **178/178**
- `check:dom-contract` / `check:spa-env` / `check:protocol-markers` / `check:no-cookies` — OK
- `check:spa-budget` — all ceilings held; cumulative entry +33.3 kB vs `04a4e98b`
  (pre-existing deficit — GD-KIT3A-BUDGET / GD-SPA-ENTRY.R7; ≈ 0 kB this ticket)
- No new selectors — declared vocabulary only (`data-comment-card`, `data-anchor-block`,
  `data-fork-undo`)

## Records

- `docs/build/runs/250f_R7FIX.6.md` (diagnosis → fix → verdict)
- `docs/tickets/DEFERRALS.md` — `D-R7FIX.6-1` → 250_R7DEP.2 ("verified at T1f re-walk")
- `docs/build/BUILD_INDEX.md` row 299 · `docs/build/LEDGER.md` PHASE LOG
