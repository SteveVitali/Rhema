# R7FIX.5 — Owner fixes for the R7DEP.2 defect boundary, round 5 (run-time insert)

- **Sequence:** 250e of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path, round 5; T1d at `e143828f` greened 14/15 legs — the two remaining
  evolved again)
- **base_branch:** `stevevitali/r7dep-2-t1-prod` (250's Part-B records branch at `577bf8f3`)
- **Depends on:** 250d_R7FIX.4 + the T1d re-walk report (`docs/build/reports/2026-11-07_R7DEP.2/t1d-*-legs/`).
- **Run:** `implement-spec spec=docs/tickets/250e_R7FIX.5__defect-round-5.md`
- **Gate status:** none — recorded defects/dispositions.
- **Live stage:** Stage A only ($0 — deployed proof is 250's T1e re-walk; you do NOT touch the preview).
- **Production mutations:** none
- **Size budget:** S (~50–200 changed lines — two precise fixes)

## Goal — the last two owed legs (fix the honest side — surface defect OR stale leg-pin):

- **U2.noreload (evolved)** — chat-send now passes; the peer hop's `.first()` non-showcase
  recent resolves `untitled-4` — in DOM but `element is not visible` (the recents group
  collapsed/overflowed; repeated U5 runs keep seeding `untitled-N` scratch projects). The leg
  needs the first **visible** writable recent or a disclosure step before the pick — mirror
  what a reader does (a collapsed group gets disclosed; a `.first()` on a hidden row is a leg
  bug, not a surface defect — unless the surface itself hides the only writable recent
  permanently, which is a real defect; diagnose which).
- **U5.write (evolved)** — title-focus AND the pointer-drag bubble both pass now; next layer:
  `[data-comment-submit]` absent after the comment composer opens (the composer mounts; its
  submit control isn't where the leg expects). Diagnose: did 237_R7WRITE.1a's comment card
  move the submit onto a different hook (leg re-pin), or is the submit genuinely missing
  (surface defect — the composer's Post button is a write path, must exist)? Fix whichever
  is true.

- **Recorded timing note** — U3.occlusion's `]`-press panel-open raced once at `e143828f`
  (isolated retry passed — recorded as a timing flake). If the leg's panel-open arm can be
  hardened cheaply (a bounded retry or a `waitForSelector` on the open state before
  interacting), do it — otherwise carry the note.

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.2.md` (T1d diagnoses) + `docs/build/runs/250d_R7FIX.4.md` (round-4).
- `packages/journeys/src/r7legs.ts` (U2 + U5 bodies) + the surfaces:
  `apps/web/src/spa/app-shell.tsx` (recents group), `apps/web/src/spa/` +
  `packages/ui`/`packages/editor` (the comment composer's submit control + hook).

## In scope — the two fixes (+ the optional U3 hardening); each leg's local arm green.
## Out of scope — preview/deploy/Stage-B; weakening legs; any reorder to satisfy a selector.

## AC
1. U2.noreload local arm green (or an honest disposition if the surface's recents-group
   hiding is genuinely correct and the leg's substrate pick was wrong — then the leg is the fix).
2. U5.write local arm green — `data-comment-submit` (or its honest rename) reachable after
   the composer opens.
3. Fresh-build full sweeps green (web + journeys).
4. `docs/build/runs/250e_R7FIX.5.md` (ticket-prefixed) + `D-R7FIX.5-*` → 250 (T1e re-walk).
