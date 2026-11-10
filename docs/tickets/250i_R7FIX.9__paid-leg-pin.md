# R7FIX.9 — F-PAIDU6-1: the paid leg's optimistic-turn pin (run-time insert)

- **Sequence:** 250i of 254 · **Phase:** round 7 (R7b — tail) · **Kind:** ticket (run-time insert —
  `D-PAIDU6-1` records the leg-side defect; the re-proof rides the Monday paid cron — no fresh
  ruling needed)
- **base_branch:** `stevevitali/r7deploy-tip` (the deployed-tip records branch at `dc1ba197`)
- **Depends on:** `docs/build/runs/paid-u6-run.md` — the paid run's full evidence: product
  verdict GREEN (funded turn POST → `chat_turn` run `01M70QP0XCS5BZ9TPPCYYVA0J8` completed,
  `predicatesPassed`, metered $0.092175) but R4's leg arm FAILED.
- **Run:** `implement-spec spec=docs/tickets/250i_R7FIX.9__paid-leg-pin.md`
- **Gate status:** none — recorded leg-side defect.
- **Live stage:** Stage A ($0) — the re-proof rides the Monday paid cron (already authorized;
  you do NOT dispatch a paid run).
- **Production mutations:** none
- **Size budget:** S (~50–150 lines — a leg-pin repair)

## Goal — the paid leg's R4 pick resolves the REAL turn, never the placeholder:
`r7legs.ts`'s R4 `data-chat-turn` pick: `.last()` reads R7b's `data-chat-turn="optimistic"`
placeholder (`chat-panel.tsx:434`) → `turns/optimistic` → 404 → deadline fail. The turn's real
id lands after the POST completes — the leg's pick must wait for a non-`optimistic` turn (or
assert on the turn id that resolves in DOM after the send, the same arm the signed-in legs
already use). NEVER weaken the leg's product assertion — the placeholder just isn't the
pickable turn.

## Load (read these — do not re-read others)
- `docs/build/runs/paid-u6-run.md` (the paid run's evidence + the leg failure's timing).
- `packages/journeys/src/r7legs.ts` (the R4 arm + the turn-pick shape) +
  `apps/web/src/spa/` (`chat-panel.tsx` — the `optimistic` placeholder's emission + the real
  turn's id arrival).

## In scope — the leg-pin repair + its local arm green.
## Out of scope — a paid run (re-proof rides the authorized Monday cron); weakening the leg.

## AC
1. R4's pick resolves the real turn id (never `optimistic`) — local arm green.
2. `runs/250i_R7FIX.9.md` + `pr/250i_R7FIX.9.md` + `D-R7FIX.9-1` dated (re-proof rides the
   Monday paid cron, `D-PAIDU6-1`'s owner-row disposition).
3. Fresh-build sweeps green (web + journeys).
