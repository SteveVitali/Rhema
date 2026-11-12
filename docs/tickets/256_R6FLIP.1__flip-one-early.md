# 256_R6FLIP.1 — flip 1, evaluated and executed early (GD-THRESH13.R6 park lifted)

**Status:** open · **Phase:** R6 tail insert · **Prereqs:** merged `main`; GATE-ACCEPT.R6 signed · **Size:** S · **Ruling:** operator 2026-11-11 — "ignore dates if it makes sense" lifts the `GD-THRESH13.R6` ≥2026-12-01 park for flip 1; signed §R6.3 row 5 stands as the deviation record.

## Run

Find flip 1's definition: `GD-THRESH13.R6` in `docs/build/LEDGER.md` GATE DECISIONS + the `D-PRB.08-*`/`D-ECON.*` carriers it gates (start in `docs/tickets/DEFERRALS.md` — it is the parked activation flip the R6 launch deferred). Read the owning spec clause it flips and its activation conditions.

1. Evaluate flip 1's activation conditions against current evidence (read-only where possible — the R6WATCH.1 read's datums may already carry the answer).
2. If the conditions are met and the flip is a repo change (a flag, a threshold, an enabled arm): implement it with its focused test, honestly — never flip to make a check green.
3. If the flip is a live/operator act beyond a code change, disposition it with owner+date and stop — do not perform live mutations.
4. If the conditions are genuinely not met, record the evidence and re-park with a dated note (an honest "still parked" is a valid outcome — the ruling permits early evaluation, it does not force the flip).

## Verify

Focused tests + `pnpm turbo build lint typecheck` on the touched set; `docs/build/runs/256_R6FLIP.1.md`; DEFERRALS disposition on `GD-THRESH13.R6`'s carrier row(s); BUILD_INDEX + LEDGER lines; PR `--base main`; boundary checks.

## Constraints

Never merge; no prod writes beyond what the flip's own contract names (a deploy is NOT in scope — the change deploys on the next deploy arm); $0 expected.
