# R7FIX.6 — Owner fix for the R7DEP.2 defect boundary, round 6 (run-time insert)

- **Sequence:** 250f of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket (run-time insert —
  250_R7DEP.2's defect path, round 6; T1e at `5d001e6b` greened 15/16 legs — one remains)
- **base_branch:** `stevevitali/r7dep-2-t1-prod` (250's Part-B records branch at `a1e05cec`)
- **Depends on:** 250e_R7FIX.5 + the T1e re-walk report (`docs/build/reports/2026-11-07_R7DEP.2/t1e-*-legs/`).
- **Run:** `implement-spec spec=docs/tickets/250f_R7FIX.6__defect-round-6.md`
- **Gate status:** none — recorded defect.
- **Live stage:** Stage A only ($0 — deployed proof is 250's T1f re-walk; you do NOT touch the preview).
- **Production mutations:** none
- **Size budget:** S (~50–200 changed lines — one diagnosis + fix)

## Goal — the last owed leg, closing the board:
- **U5.write (evolved, deepest layer)** — every prior arm passes: title-focus ✓, pointer-drag
  bubble ✓, composer survives its own collapse ✓, `[data-comment-submit]` clicked — but
  `[data-comment-card]` never renders post-submit (30 s timeout). Three live hypotheses,
  diagnose which is true:
  1. the comment POST actually fails (network/validation — check the request + response);
  2. the anchored margin card mounts but its emitted DOM hook differs from
     `data-comment-card` (a leg-pin vs the card's real attr — check the card component's
     emitted attributes vs the leg's selector);
  3. the anchored selection is lost on submit so the card never anchors (the composer
     closes but its anchor target was dropped).
  A genuine missing/renamed hook is a leg re-pin or a hook restoration (237_R7WRITE.1a's
  comment card is the contract surface); a failing POST is a real write-path defect —
  fix whichever is true.

## Load (read these — do not re-read others)
- `docs/build/runs/R7DEP.2.md` (T1e diagnosis) + `docs/build/runs/250e_R7FIX.5.md` (round-5's
  composer-collapse repair — the same code path family).
- `packages/journeys/src/r7legs.ts` (the U5 comment arm) + the surfaces:
  `apps/web/src/spa/` (comment composer + POST + card mount),
  `packages/ui`/`packages/editor` (the margin card's emitted attributes + anchor wiring),
  the BFF route the comment POSTs through.

## In scope — the one fix; U5.write's local arm green end-to-end.
## Out of scope — preview/deploy/Stage-B; weakening the leg; any reorder to satisfy a selector.

## AC
1. U5.write local arm green — `[data-comment-card]` (or its honest rename, re-pinned) mounts
   after a real submit.
2. Fresh-build full sweeps green (web + journeys).
3. `docs/build/runs/250f_R7FIX.6.md` (ticket-prefixed) + `D-R7FIX.6-*` → 250 (T1f re-walk).
