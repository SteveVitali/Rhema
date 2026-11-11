# PR — 256_R6FLIP.1: flip 1 (metered debit) evaluated early → re-parked with evidence

- **Ticket:** `docs/tickets/256_R6FLIP.1__flip-one-early.md` (manifest seq 256; R6 tail
  run-time insert, pre-authorized by the 2026-11-11 operator ruling)
- **Branch:** `stevevitali/r6flip-1-early` → **base `main`** · **mergePolicy: OPERATOR**
  — this run does not merge.
- **Scope:** evaluate flip 1's activation conditions against current evidence (the
  `GD-THRESH13.R6` ≥2026-12-01 park lifted by the operator's 2026-11-11 "ignore dates"
  ruling); execute if met, disposition if an operator act, re-park with evidence if unmet.
- **Posture:** records-only — zero production mutations, **$0 spend**, no live/preview
  stage, no prod reads (same-day R6WATCH.1 datums carried the answer).
- **Requirement IDs stamped:** none (ruling-carried insert; `GD-THRESH13.R6`).

## Verdict

**Re-parked with evidence (ticket arm 4).** Flip 1 = `infra/config/stages.ts` prod
`debitMode: "committed"` → `"metered"` (`docs/ops/launch-flips.md`, runbook
`docs/ops/debit-mode-flip.md`). Its four preconditions read on the freshest committed
datum (R6WATCH.1 on-time read, 2026-11-11, window-age ≈14.58 d):

| # | Precondition | Verdict |
|---|---|---|
| 1 | `cap_calibration_reports` `adopted=true` rows on paid-surface cells | **UNMET** — 4 rows, all `adopted=false` insufficient-sample; organic admissible n=0 |
| 2 | `cap_reach_pct ≤ 10%` on adopted buckets | **UNMET** — vacuous, zero adopted buckets; `capFor` null ×5 |
| 3 | Notice sent + effective date reached | **UNARRIVED** — notice sent 2026-10-22 naming `EFFECTIVE_DATE=2026-12-01`; the ruling lifted the park's date, not the customers' notice (moot — 1–2 fail) |
| 4 | `DEBIT_MODE=committed` live | MET (pre-flip state; `stages.ts` prod line ~540) |

`GD-THRESH13.R6` parked on **two** grounds — the calibration gap (a data precondition,
not a date) and the calendar. The ruling lifted the date arm for evaluation; the data
arm still fails, so `stages.ts` stays `committed` and prod is untouched. Committing the
flip now would arm metered debit on the next deploy against uncalibrated caps and ahead
of the noticed date — the premature activation the runbook's operator-pause exists to
prevent.

## What changed (records only)

- `docs/ops/launch-flips.md` — dated evaluation note in the flip-1 section
- `docs/ops/debit-mode-flip.md` — **Evaluation log** note under Preconditions
- `docs/tickets/DEFERRALS.md` — `D-ECON.1-3` dated disposition (stays OPEN + watch)
- `docs/build/runs/256_R6FLIP.1.md`, `docs/build/BUILD_INDEX.md` row, LEDGER

## Verification

- `node docs/build/tools/check-append-only.mjs --base origin/main` — **OK**
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 10
  violations / 40 warnings, all classes identical to the `main` baseline (10 / 37) —
  nothing new introduced (inherited: missing `logs/.gitignore`, insert-ticket filename
  grammar, duplicate D-ids, stacked CURRENT-STATE keys, budget classes)
- `ci-boundary --pr` — **`ci: pass #325@d6dd3b8`** (run 43120274677 — fast-path +
  `typecheck / lint / unit` + `contracts` + `public-safe` + `integration` + `images` +
  `ci-pass` anchor; record `logs/ci-256_R6FLIP.1.json`)
- No turbo/vitest legs — docs/records-only diff, zero code touched (unrun, reported)

## Re-evaluation triggers (recorded for the operator)

- A `cap_calibration_reports` row reaching `adopted=true` (D-ECON.1-3's standing watch:
  `slo.review.weekly`, re-read 2026-11-25T04:0xZ), or
- The noticed `EFFECTIVE_DATE=2026-12-01`, or
- A fresh operator ruling on either arm.
