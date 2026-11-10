# R7FIX.3 — Owner fixes for the R7DEP.2 defect boundary, round 3 (run-time insert)

- **Sequence:** 250c of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path, round 3; T1b at `2817ba73` greened 12 legs and discharged
  F-2/F-4/F-6/F-7, leaving 4 precisely-diagnosed legs)
- **base_branch:** `stevevitali/r7dep-2-t1-prod` (250's Part-B records branch at `46850249`)
- **Depends on:** 250b_R7FIX.2 + the T1b re-walk report (`docs/build/reports/2026-11-07_R7DEP.2/t1b-*-legs/`).
- **Run:** `implement-spec spec=docs/tickets/250c_R7FIX.3__defect-round-3.md`
- **Gate status:** none — recorded defects/dispositions.
- **Live stage:** Stage A only ($0 — deployed proof is 250's own T1c re-walk; you do NOT touch the preview).
- **Production mutations:** none
- **Size budget:** S–M (~100–300 changed lines — pin-level fixes)

## Goal — the last four owed legs, each with its recorded diagnosis (fix surface OR leg-pin honestly — the T1b worker's calls are diagnoses, not orders; pick the honest side):

- **R8.showcase.spa (×3 identical FAIL)** — `a[href*="/review/"].first()` catches the
  findings-desk **filter-Clear** anchor (`packages/ui/src/findings-desk.tsx:141` or its current
  home) inside the closed right panel — legitimately invisible; the real dossier-letter review
  link exists but isn't DOM-first. Options: re-scope the leg's selector to the dossier letter's
  review link (preferred — the surface is honest), or give the real link a declared hook.
  NEVER reorder markup just to satisfy `.first()`.
- **U2.noreload (evolved)** — the export hop wants `a[href="/p/showcase/export"]`, absent on
  the read-only project. Diagnose whether the read-only project SHOULD carry the export hop
  (if the R7b surface honestly dropped it — a `GD`-class decision, record + re-pin the leg) or
  whether it's a regression (restore the link).
- **U5.write (×3 identical)** — `data-inline-title` is emitted on the `<form>` wrapper
  (`page-chrome.tsx:492`) but focus lands on the inner `<input>`; the leg asserts
  `document.activeElement` on the attr-carrier — never passes. Pick the honest side: move the
  attribute onto the input (the element the contract names) OR the leg asserts the input.
- **U1.shell (evolved)** — the sidebar reviews item doesn't get `aria-current` after SPA nav
  to `/p/:slug/review/:runId`. Wire `aria-current` on the resolved item (or record why the
  leaf's item shouldn't get it + re-pin the leg's assertion).

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.2.md` (T1b diagnoses + screenshot paths) + `docs/build/runs/250b_R7FIX.2.md`.
- `packages/journeys/src/r7legs.ts` (R8.showcase.spa, U1, U2, U5 legs) + the surfaces:
  `apps/web/src/page-chrome.tsx`, `apps/web/src/spa/app-shell.tsx`,
  `apps/web/src/dossier-view.tsx`, `packages/ui/src/findings-desk.tsx`.

## In scope — the four pin-level fixes; each leg's local arm green.
## Out of scope — preview/deploy/Stage-B; weakening legs; cosmetic reordering to satisfy selectors.

## AC
1. Each of the four legs' local arm green — or an honest recorded disposition where the surface
   is right and the leg's pin is stale (then the leg itself is the fix).
2. `hero-capture` still green (do not regress F-7's repair).
3. Fresh-build full sweeps green (web + journeys).
4. `docs/build/runs/250c_R7FIX.3.md` (ticket-prefixed path — `runs/R7FIX.*` are taken) +
   `D-R7FIX.3-*` → 250 ("verified at T1c re-walk"; first free index).
