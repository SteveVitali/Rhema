# R6WATCH.1 — the contractual REQ-WATCH-1 post-launch read at launch + 14 d

**Ticket:** `docs/tickets/200_R6WATCH.1__post-launch-read.md` (manifest row 200) · **Req IDs:**
REQ-WATCH-1 · **Layer:** live-executed (prod read-only, $0) · **Harness:**
devin-desktop/swe-2-high/subagent · **Base:** `main` @ `ee466fa0` (flat — the stack is merged;
not stacked).

## What this PR is

Records-only: the owed launch +14 d cohort read (`D-R6WATCH-ON-TIME`, discharging it) — run
ledger `docs/build/runs/R6WATCH.1.md`, the `GD-WATCH.R6` LEDGER GATE DECISIONS row, dated
tails on the 11 named DEFERRALS rows + four adjacent rows, the RELEASE_NOTES_DRAFT on-time
append (`D-R7DOC.1-1` discharged), BUILD_INDEX row, LEDGER advance. Zero code. Zero prod
writes.

## Verdict

**The organic cohort is empty end-to-end at window-age ≈14.58 d** (collected
2026-11-11T18:05–18:10Z over the matured window `2026-10-28T04:0xZ`→`2026-11-11T04:0xZ`,
system-role `postgres` DSN via the IAP tunnel, `BEGIN READ ONLY` throughout):

- 0 organic signups — verbatim `first-finding-latency.mjs` (direct entrypoint, PR #313's
  `fileURLToPath` fix) returns only the 3 pre-launch rows; windowed + full cohort clause: 0.
- 0 organic runs — the single in-window non-test run is the named smoke's `01M60AR5…`
  (`unverified`, cohort-excluded; the raw non-test success rate honestly reads 0% on n=1).
- 0 organic admissible cost observations (3 exist: 1 named-smoke ws + 2 is_test ws).
- 0 organic funnel legs — every in-window non-test `analytics_events` row sits on the named
  smoke ws; raw anonymous legs recorded with the committed caveat (`landing.viewed` n=1,313,
  `landing.dropzone_used` n=44).

**Per the contract §4 the empty cohort is itself the finding** → `GD-WATCH.R6`: all 11 named
rows converted to standing alert-backed watches — `owner: operator` · `trigger:
slo.review.weekly` (proven firing, Monday 07:12Z) · `re-read: 2026-11-25T04:0xZ` (launch + 28
d). **Zero rows closed on evidence; zero rows presented as a pass on zero data.**

Per-row: D-R5OPS.1-1 n=0<3 · D-COST.1-2 organic n=0<10 (the 4 smoke samples aged out of ~7 d
`slo_samples` retention; convert-svc decision stays unevaluable) · D-SLO.1-5 n<10 · D-SLO.1-7
n=0<5 (the smoke run WOULD read divergent 14.2%/69.4% — R6FOR.1 attribution) · D-SLO.1-8
vacuous (0 denials on all runs) · D-ECON.1-3 organic admissible n=0 · D-ECON.1-4 named cells
still derived · D-ECON.2-5 conditionally parked · D-ECON.2-6 no refit · D-ECON.2-7 watch
behind -6 · D-P1.17-2 funnel **below / below / unmeasurable**.

## Machinery + honest carries

- `slo.review.weekly` fired 2026-11-09 ×3 (`ok:6,breach:0,empty:7,unmeasured:2`) —
  corroborates the DB reads; next firing 11-16 rides every watch's `trigger:`.
- `billing.estimator-refit` weekly (4 insufficient-sample report rows); `test-tenant.purge`
  hourly (the synthetic-row count drops since 11-09 are purge reaping, expected).
- **`usage.reconcile` now fails daily ×7** — `provider report fetch failed: 403` since
  2026-11-05 (a bound-but-denied admin key, vs the recorded placeholder-skip). Dated tails on
  D-ECON.1-1 / D-PRB.08-1; the operator key act stays owed.
- **`billing_export_prod` still zero tables** (~14.6 d) — billed actuals blocker unchanged;
  dated tails on D-COST.1-1 / D-OPS.1-3.

## Spend / mutations

$0 metered. Zero prod writes, zero paid dispatch, zero deploys (a separate journeys-cron
rerun was in flight during the read — not this run's act; all its rows are `is_test` and
count toward no threshold).

## Checks

`node docs/build/tools/check-append-only.mjs --base origin/main` → recorded in
`runs/R6WATCH.1.md` · `check-build-memory.sh` → recorded · CI boundary read at the pushed
head (docs-only class → fast-path; recorded in the PHASE LOG/INDEX per convention).
