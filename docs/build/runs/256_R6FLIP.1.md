# 256_R6FLIP.1 — flip 1 (metered debit), evaluated early → re-parked with evidence

- **Ticket:** `docs/tickets/256_R6FLIP.1__flip-one-early.md` (manifest seq 256; R6 tail
  run-time insert)
- **Branch:** `stevevitali/r6flip-1-early` · **base:** `main` @ `da10ab5f` · **date:** 2026-11-11
- **Harness:** devin-desktop/swe-2-high/subagent · **mode:** records-only evaluation —
  zero production mutations, **$0 spend**, no live/preview stage, no prod reads (the
  freshest committed datums are the same-day R6WATCH.1 on-time read's)
- **Verdict:** **re-parked with evidence (ticket arm 4)** — the ruling permits early
  evaluation; it does not force the flip, and the activation conditions are genuinely
  unmet

## Deferrals read (protocol — first)

`docs/tickets/DEFERRALS.md` read first. `GD-THRESH13.R6`'s carrier for the flip's data
preconditions is **D-ECON.1-3** (per-bucket cap calibration — its status cell already
carries R6MNY.1's "debit-mode-flip runbook preconditions 1–2 UNMET" finding); adjacent
rows D-ECON.1-4 / D-ECON.2-6 carry the same-day watch dispositions from R6WATCH.1.
No rows closed; D-ECON.1-3 gets this run's dated evaluation note (stays OPEN + standing
watch). No new deferrals owed — the re-park is recorded on the existing carrier, in the
two ops docs, and in the LEDGER.

## Flip 1 — definition and contract

`docs/ops/launch-flips.md` flip 1 + `docs/ops/debit-mode-flip.md` (ECON.1; ADR-014
sequencing guard; ADR-031): a one-line stage-fact diff, `infra/config/stages.ts` prod —
`debitMode: "committed"` → `"metered"` — deploying on the next deploy arm (the ticket
forbids deploying here). **Four preconditions, all must hold:**

| # | Precondition | Evidence read | Verdict |
|---|---|---|---|
| 1 | Migration `0049` applied + harvest running; `cap_calibration_reports` carries `adopted=true` rows for the paid-surface cells | `0049` applied + `billing.estimator-refit` firing weekly (11-01 + 11-08 observed) ✓ — but reports = 4 rows, **all `adopted=false` "insufficient sample"** (max n=2, cohort-excluded; organic admissible `cost_observations` n=0; `estimator_cells` 0) — R6WATCH.1 on-time read 2026-11-11, window-age ≈14.58 d (`docs/build/runs/R6WATCH.1.md` §row 6) | **UNMET** |
| 2 | In-sample `cap_reach_pct ≤ 10%` on adopted buckets | Vacuous — zero adopted buckets; `capFor` null on all five paid surfaces (same datum) | **UNMET** |
| 3 | Paid-account notice sent + chosen effective date reached (≥30 d, REQ-BILL-2/ADR-014) | Notice **sent 2026-10-22** (R6DEP.1 — 2 emails + 2 inbox rows, dedup `metered-debit-notice:v1`) naming **`EFFECTIVE_DATE=2026-12-01`** — not yet reached; the runbook forbids flipping before the noticed date | **UNARRIVED** (see Judgment calls) |
| 4 | `DEBIT_MODE=committed` live on api + worker | `infra/config/stages.ts` prod `debitMode: "committed"` (line ~540); ECON.1 verified the live env 2026-10-02; no flip since | **MET** (pre-flip state) |

## Why this is a re-park, not an early flip

- `GD-THRESH13.R6` (2026-10-27) parked flip 1 on **two independent grounds**: the
  calibration precondition (`cap_calibration_reports`=0) and the calendar
  (`EFFECTIVE_DATE 2026-12-01`). The 2026-11-11 verbatim — "ignore dates if it makes
  sense" — lifts the date arm **for evaluation**; it cannot lift the data arm, which is
  not a date.
- The data arm is still failing on the freshest committed evidence: the same-day
  R6WATCH.1 on-time read reports organic admissible observations n=0 — the funded wave
  that would supply them (REQ-DISC-1) was declined (GD-R6B stays closed), so admissible
  samples accumulate only from organic traffic, of which there is none yet.
- Flipping `stages.ts` now would arm metered debit on the *next* deploy arm — against
  uncalibrated caps and ahead of the date the notice promised the two paid accounts.
  That is exactly the premature-activation posture the "ship dark" design + this
  runbook's operator-pause exist to prevent, and the ticket's arm 4 names the honest
  outcome: re-park with a dated note.

## What changed (records only)

1. `docs/ops/launch-flips.md` — flip-1 section: dated 256_R6FLIP.1 evaluation note
   (preconditions 1–2 UNMET, 3 unarrived; re-park; re-evaluation triggers).
2. `docs/ops/debit-mode-flip.md` — **Evaluation log** note under Preconditions.
3. `docs/tickets/DEFERRALS.md` — `D-ECON.1-3` status cell: dated disposition note
   (row stays OPEN + standing watch `slo.review.weekly`, re-read 2026-11-25T04:0xZ).
4. `docs/build/runs/256_R6FLIP.1.md` + `docs/build/pr/256_R6FLIP.1.md`,
   `docs/build/BUILD_INDEX.md` row, LEDGER CURRENT STATE + PHASE LOG.

## Judgment calls

- **Precondition 3 read conservatively.** The ruling's "ignore dates" is read as
  lifting the *park's* calendar for early evaluation, not as permission to flip ahead
  of the `2026-12-01` date the 2026-10-22 notice named to paying accounts — flipping
  earlier would make the sent notice false (REQ-BILL-2 ≥30-day rule is about the
  noticed date, not the send date). Recorded so the operator can overrule explicitly;
  the call is moot anyway since preconditions 1–2 fail independently.
- **No fresh prod read.** The ticket allows read-only evaluation "where possible"; the
  R6WATCH.1 on-time read (`BEGIN READ ONLY`, system-role DSN, 18:05–18:10Z) is hours
  old and covers exactly the needed datums. Re-reading adds no information.
- **`D-ECON.1-3` is the disposition carrier.** No dedicated flip-1 deferral row exists
  (the park lives in `GD-THRESH13.R6` + the two ops docs); the evaluation is appended
  to the row whose unblock condition IS the flip's data precondition.
- **No code/test change.** Re-park means `stages.ts` is untouched — there is nothing
  to build/test beyond the boundary checks (recorded below). §R6.4's classification
  resolves to "records-only" for this run (the deploy-carry arm was conditional on
  landing the flip).

## Checks

- `node docs/build/tools/check-append-only.mjs --base origin/main` — **OK** (appends
  only; the D-ECON.1-3 tail + CURRENT-STATE/PHASE-LOG/BUILD_INDEX appends)
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — **10
  violations, 40 warnings, all inherited classes:** baseline `main` (`da10ab5f`)
  measures the identical **10 violations / 37 warnings** — this diff adds no new
  violation or warning class (the +3 are instances of pre-existing classes: the
  over-256 B CURRENT-STATE lines every prepended row creates, the index
  column-count class every recent row shares, the masked-`x` timestamp convention).
  The one genuinely new warning (`ledger-stale` `ops/…` path refs) was fixed before
  close by writing `docs/ops/…` paths.
- `ci-boundary --pr` — **pass #325@164112f** (run 43120748235 — all seven legs +
  `ci-pass` anchor; record `logs/ci-256_R6FLIP.1.json`)
- No `turbo`/`vitest` legs run — docs/records-only diff, zero code touched (honest
  skip, reported as unrun; the PR's `typecheck / lint / unit` leg is the CI truth)

## Spend

**$0** — no prod contact, no inference, no cloud mutations. PR unmerged
(`mergePolicy: OPERATOR`).
