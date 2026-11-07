# R7FIX.4 — Owner fixes for the R7DEP.2 defect boundary, round 4 (run-time insert)

- **Sequence:** 250d of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path, round 4; T1c at `d372de85` greened 13/15 legs — R8.showcase.spa
  regression closed, F-1/F-5 discharged — leaving 2 evolved legs)
- **base_branch:** `stevevitali/r7dep-2-t1-prod` (250's Part-B records branch at `07036a91`)
- **Depends on:** 250c_R7FIX.3 + the T1c re-walk report (`docs/build/reports/2026-11-07_R7DEP.2/t1c-*-legs/`).
- **Run:** `implement-spec spec=docs/tickets/250d_R7FIX.4__defect-round-4.md`
- **Gate status:** none — recorded defects/dispositions.
- **Live stage:** Stage A only ($0 — deployed proof is 250's T1d re-walk; you do NOT touch the preview).
- **Production mutations:** none
- **Size budget:** S (~50–200 changed lines — two precise fixes)

## Goal — the last two owed legs (fix the honest side — surface defect OR stale leg-pin):
- **U2.noreload (evolved)** — the leg's `chatTab.click()` fires BEFORE the `]` panel-open
  (`packages/journeys/src/r7legs.ts` ~1254): the Chat tab lives inside the closed right panel
  (`aria-selected`, invisible) → unconditional click times out. Honest fix: open the panel
  first → wait for its open state → click (the walk mirrors what a user does — this is a leg
  ordering bug, not a surface defect).
- **U5.write (evolved)** — F-3's title-focus assert now PASSES; the next layer fails:
  `editor.selectText()` never surfaces `[data-format-bubble]` (10 s `waitFor` timeout).
  Diagnose: does the bubble need a real pointer-drag selection (leg arm too synthetic), or did
  its mount break in the R7b chrome (a genuine surface defect — the bubble is a 237_R7WRITE.1a
  deliverable)? Fix whichever is true — a real mount regression gets a code fix, a too-synthetic
  leg arm gets a real selection.

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.2.md` (T1c diagnoses) + `docs/build/runs/250c_R7FIX.3.md` (round-3).
- `packages/journeys/src/r7legs.ts` (U2 + U5 bodies incl. `editor.selectText()`) + the
  surfaces: `apps/web/src/spa/` (chat tab wiring), `apps/web/src/` + `packages/editor`/
  `packages/ui` (the format bubble's mount + selection hook).

## In scope — the two fixes; each leg's local arm green.
## Out of scope — preview/deploy/Stage-B; weakening legs; any reorder to satisfy a selector.

## AC
1. U2.noreload local arm green (or an honest disposition).
2. U5.write local arm green — the bubble surfaces on a REAL selection (or a real mount defect fixed).
3. Fresh-build full sweeps green (web + journeys).
4. `docs/build/runs/250d_R7FIX.4.md` (ticket-prefixed) + `D-R7FIX.4-*` → 250 (T1d re-walk).
