# R7FIX.8 — F-R7DEP.3-1: the sync-pill/focus-exit overlap (run-time insert)

- **Sequence:** 250h of 254 · **Phase:** round 7 (R7b — tail) · **Kind:** ticket (run-time insert —
  the R7DEP.3 deploy walk's residual; `D-R7DEP.3-1` records it)
- **base_branch:** `stevevitali/r7deploy-tip` (the deployed-tip records branch at `3c46d682`)
- **Depends on:** `runs/R7DEP.3.md` — `F-R7DEP.3-1`'s recorded evidence: `[data-sync-pill]`
  overlaps `[data-ide-focus-exit]` ("Exit focus · Esc") at 1440×900 in focus view, deterministic ×2.
- **Run:** `implement-spec spec=docs/tickets/250h_R7FIX.8__sync-pill-occlusion.md`
- **Gate status:** none — recorded defect.
- **Live stage:** Stage A ($0) — a prod arm re-read rides the NEXT deploy; the fix is layout/CSS.
- **Production mutations:** none
- **Size budget:** S (~50–150 changed lines — a focus-view geometry repair)

## Goal — the P1.pill leg's overlap resolved honestly:
`[data-sync-pill]` must not occlude `[data-ide-focus-exit]` at 1440×900 in focus view —
either the pill's anchor respects the focus-exit's reserved space, the focus-exit clears the
pill zone, or (the honest U3-class option) the overlap is a sanctioned affordance recorded
with a named exemption. NEVER hide the pill or drop the exit control to pass the leg — the
reader must keep both.

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.3.md` (the finding's full evidence + screenshot paths).
- `packages/journeys/src/r7legs.ts` (the P1.pill leg) + `packages/journeys/src/u3-probe.ts`.
- The surfaces: `apps/web/src/spa/` (the focus-view chrome + sync pill) + `packages/tokens`
  (the geometry).

## In scope — the overlap's honest fix + the leg's local arm green.
## Out of scope — a new deploy (the prod arm discharges on the next one); weakening the leg.

## AC
1. The overlap's root cause recorded + the honest fix landed.
2. P1.pill's local arm green; the deployed-read row `D-R7FIX.8-1` appended → next deploy.
3. Fresh-build sweeps green (web + journeys + tokens).
4. `runs/250h_R7FIX.8.md` + `pr/250h_R7FIX.8.md` + `D-R7FIX.8-1` dated.
