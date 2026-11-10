# R7FIX.1 — Owner fixes for the R7DEP.2 Part-A defect boundary (run-time insert)

- **Sequence:** 250a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path: "these need owner insert-rows on the chain (the R7FIX.2 shape) + a
  re-walk at the advanced tip")
- **base_branch:** `stevevitali/r7dep-2-phase-preview` (250's branch — the preview's T1 update +
  re-walk pulls the composed tip, so these fixes stack on it)
- **Depends on:** 250_R7DEP.2 Part A's committed findings (`F-R7DEP.2-1…5` in
  `docs/build/runs/R7DEP.2.md` + `docs/build/reports/2026-11-07_R7DEP.2/`).
- **Run:** `implement-spec spec=docs/tickets/250a_R7FIX.1__defect-boundary-fixes.md`
- **Gate status:** none — the findings are recorded defects, not judgement calls.
- **Live stage:** Stage A only ($0: build + lint + typecheck + unit + the specific failing legs
  locally against `demoDataSource`). The preview re-walk that proves them deployed is 250's own
  T1 act, NOT this ticket's.
- **Production mutations:** none
- **Size budget:** M (~250–400 changed lines — five targeted fixes + one records disposition)

## Goal
The five `F-R7DEP.2-*` findings + one incumbent regression are fixed on the R7b surface so 250's
T1 re-walk can honestly report every `D*/U*` leg green:
- **F-R7DEP.2-1** — `/review/` dossier link present in DOM but `element is not visible`
  (R8.showcase.spa GREEN→REGRESSION + U2.noreload): the R7b layout change hid the anchor —
  restore its actionability (visible, reachable, pass `assertActionable`).
- **F-R7DEP.2-2** — `[data-ide-panel-tab="chat"]` not enabled @1440×900 (U3.occlusion):
  a disabled tab blocks every walk's chat beat — find why the control is disabled at that size
  and enable it honestly (not by removing the guard).
- **F-R7DEP.2-3** — blank Page's inline title not focused (U5.write, REQ-HOME-3):
  the create-and-type flow loses title focus.
- **F-R7DEP.2-4** — Conversion notes lack the `title_extracted` normalization (U7.import):
  the notes list misses the title-derived sentence.
- **F-R7DEP.2-5** — returning tenant's recents empty (U1.shell): leg-vs-seed gap —
  diagnose whether it's a real recents defect or a seeded-fixture gap; fix whichever is true
  (an honest fixture correction is a fix, not a workaround).
- **Records:** `U3.stopgap` is superseded by `U3.occlusion` — append the dated re-disposition
  in the legs table / DEFERRALS (whichever owns it) rather than deleting the row.

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.2.md` — the five findings' full reproduction notes + screenshot paths.
- The leg sources: `packages/journeys/src/r7legs.ts` (U1/U2/U3/U5/U7 + R8.showcase.spa +
  U2.noreload + U3.stopgap), `packages/journeys/src/u3-probe.ts`.
- The surfaces the findings touch: `apps/web/src/spa/` (editor Page title, chat panel tab,
  project recents), `apps/web/src/` import/conversion notes, `apps/web/src/server.ts` links.

## In scope
- The five fixes + the U3.stopgap records disposition.
- Re-running the specific failing legs locally to green (`pnpm exec vitest run` the file / the
  journey leg's local arm).

## Out of scope
- Preview/deploy/Stage-B — 250's re-walk proves these deployed.
- Redesigning any surface or weakening a leg's assertions.

## AC (every item verified)
1. Each `F-R7DEP.2-*` leg's local arm green (or its honest disposition recorded if a finding
   proves to be a leg-vs-fixture gap — F-5).
2. Fresh-build full sweep green (`pnpm turbo build --filter=@rhema/web` + web + journeys suites).
3. `runs/R7FIX.1.md` complete; the records disposition for U3.stopgap appended; the deferred
   re-walk row appended (`D-R7FIX.1-1` → 250_R7DEP.2 — "verified at T1 re-walk").
