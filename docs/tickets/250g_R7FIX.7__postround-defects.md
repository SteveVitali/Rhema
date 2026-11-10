# R7FIX.7 — The acceptance-routed post-round defects (run-time insert)

- **Sequence:** 250g of 254 · **Phase:** round 7 (R7b — tail) · **Kind:** ticket (run-time insert —
  GATE-ACCEPT.R7's signed list routed F-9 → "the F-9 insert" and F-10…14 → "a post-round defect
  insert"; operator authorized 2026-11-08)
- **base_branch:** `stevevitali/r7rec-1-reconcile` (the chain tip at `1276f669`)
- **Depends on:** the signed acceptance list (`docs/build/CAPSTONE_CLOSURE.md` § R7) +
  `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` (F-9…14 dispositions).
- **Run:** `implement-spec spec=docs/tickets/250g_R7FIX.7__postround-defects.md`
- **Gate status:** none — recorded defects under the signed list.
- **Live stage:** Stage A ($0) + the legs' prod arms where a finding's proof is deployed-only
  (prod read-only leg runs — the existing journey authority; no preview needed).
- **Production mutations:** none.
- **Size budget:** M (~200–400 changed lines)

## Goal — the acceptance-routed defects fixed + the D2.tour prod flip discharged:
- **F-9** — hero-mp4 asset-parity: `GET /hero.mp4` serves 206 (range-correct) on prod but the
  D2.tour leg's prod arm fails on the asset class — diagnose whether it's the asset's encoding
  / the leg's parity check, fix the honest side, then **discharge `D-R7TOUR.2-1`'s prod arm**
  (D2.tour flips green at the deployed SHA).
- **F-10…F-14** — the five product defects the capstone split out (credit copy, P1 links,
  axe, select, checkbox — the finding-map rows name each precisely; fix at source, not the legs).
- Each finding's leg arm (local or prod) green after the fix; the finding-map rows get dated
  fix dispositions.

## Load (read these — do not re-read others)
- `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` (F-9…14 rows — the recorded
  diagnoses + evidence paths).
- `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R7.md` (the split's reasoning).
- `packages/journeys/src/r7legs.ts` (the D2.tour prod arm + the F-10…14 legs) + the surfaces
  each finding names.
- The hero recording: `apps/web/public/media/` + `packages/contracts/src/hero-recording.ts` +
  `docs/adr/ADR-127.md` (the asset entry).

## In scope — the six fixes + their leg-arm greens + `D-R7TOUR.2-1` prod discharge.
## Out of scope — a second preview/deploy; weakening legs; any reorder to satisfy a selector.

## AC
1. F-9: the asset-parity defect root-caused + fixed; `D-R7TOUR.2-1` carries the dated prod-flip
   disposition (D2.tour green at `e578a767` or the current deployed SHA).
2. F-10…14: each root-caused + fixed; finding-map rows carry dated dispositions.
3. Fresh-build full sweeps green (web + journeys).
4. `docs/build/runs/250g_R7FIX.7.md` + `docs/build/pr/250g_R7FIX.7.md` +
   `D-R7FIX.7-*` (dated; first free index) for any leg that can only be proven on a NEW deploy.
