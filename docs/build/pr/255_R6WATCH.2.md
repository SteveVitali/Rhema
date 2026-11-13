# PR — 255_R6WATCH.2: the early standing-watch re-read (REQ-WATCH-1 via GD-WATCH.R6)

- **Ticket:** `docs/tickets/255_R6WATCH.2__early-watch-reread.md` (manifest insert row 255)
- **Branch:** `stevevitali/r6watch-2-reread` → **base `main`** · **mergePolicy: OPERATOR** — this run does not merge.
- **Ruling:** operator 2026-11-11 — *"others we can pick up now and ignore dates if it makes
  sense"* — the `re-read: 2026-11-25T04:0xZ` date is lifted for the 11 watches + the four unmet
  clock reads. The paid-leg re-proof (`D-R7FIX.9-1`) and the external pen test (`D-P1.22-3`)
  explicitly stay deferred.
- **Scope:** re-run the committed `GD-WATCH.R6` query set against prod, read-only — the
  `R6WATCH.1` IAP-tunnel `BEGIN READ ONLY` pattern (`funded-query.mjs`;
  `first-finding-latency.mjs` direct entrypoint post-#313). Fresh datum per row with exact
  UTC timestamps + window-age.
- **Posture:** prod read-only — zero writes, **$0 spend**, no paid dispatch, no preview, no deploy.
- **Requirement IDs stamped:** REQ-WATCH-1

## Result — collected 2026-11-11T23:24–23:28Z, window-age ≈14.80 d (baseline 14.58 d)

**The organic cohort is still empty end-to-end** — 0 organic signups / runs / admissible
cost observations / funnel legs, unchanged from the 14.58 d baseline. All 11
`GD-WATCH.R6` rows keep their standing watch cells (`owner: operator` · `trigger:
slo.review.weekly` · `re-read: 2026-11-25T04:0xZ` stands) — dated tails appended on every
re-read row. No row is called green on zero rows; no row fabricated a pass.

| # | Row | Verdict |
|---|-----|---------|
| 1 | D-R5OPS.1-1 | n=0<3 → OPEN watch stands |
| 2 | D-COST.1-2 | organic n=0<10 (test-inclusive n=202 p95 0.837 s machinery) → OPEN watch stands |
| 3 | D-SLO.1-5 | n=1 non-test terminal (smoke's `unverified`, cohort-excluded) → OPEN watch stands |
| 4 | D-SLO.1-7 | same 2 divergent (run,attempt)s both smoke's (14.2%/69.4%) → OPEN watch stands |
| 5 | D-SLO.1-8 | 0 denials all runs since launch → vacuous → OPEN watch stands |
| 6 | D-ECON.1-3 | organic admissible n=0 (3 obs all cohort-excluded) → OPEN watch stands |
| 7 | D-ECON.1-4 | named cells still `derived` (48 cells @ econ1@2026-11-08) → OPEN watch stands |
| 8 | D-ECON.2-5 | no evidence → OPEN, conditionally parked |
| 9 | D-ECON.2-6 | no refit (n≥5 unmet; `estimator_cells` 0) → OPEN watch stands |
| 10 | D-ECON.2-7 | chained on #9 → OPEN watch stands |
| 11 | D-P1.17-2 | funnel below/below/unmeasurable (1,410 anonymous views → 0 organic signups) → OPEN watch stands |

## Clock carriers — the four unmet reads

- **CLK-1 (D-BL38.1-2) — CRITERION UNMET, new finding `F-R6WATCH.2-1` → BL-112.** The armed
  `project.purge` job `57bbef6f` (verified `state=created`, `start_after` 10-30T21:41Z on
  10-28) **vanished without firing**: no `[worker] project.purge` execution for the project
  id in 15 d of logs, no pending row under the singleton key, and the tombstone
  `01M3SK380GQX41RKMD4KVFB34Q` still sits `deleted_at=2026-09-30T21:41Z` — the only
  past-grace survivor. The 30-day purge contract failed silently for this row. Re-arming
  is a prod write — outside this read-only run; the row stays OPEN.
- **CLK-2 (D-FIX.1-4):** unchanged — 0 `voice_stale` deliveries; no T16 substrate (paid
  legs deferred); last sweep 11-09T04:45Z. Still unmet.
- **CLK-4 (D-COST.1-1/D-OPS.1-3):** `billing_export_prod` still **zero tables** (~14.8 d).
  258_R6OPS.2 owns the fix — this run only re-reads.
- **CLK-5 (D-ECON.1-1/D-PRB.08-1):** `usage.reconcile` still fails daily — 7 consecutive
  `provider report fetch failed: 403` (11-05→11-11). 257_R6OPS.1 owns the fix — re-read only.

## Machinery

Corroborated live: `slo.review.weekly` last fired 11-09 ×3 (`ok:6,breach:0,empty:7,
unmeasured:2`, next due 11-16T07:12Z) · `billing.estimator-refit` weekly (next 11-15) ·
`test-tenant.purge` hourly active (191 completed in retention) · schedules unchanged ·
raw anonymous funnel legs grew +97/+4 (`landing.viewed` 1,410 / `dropzone_used` 48).

## Records

- `docs/build/runs/255_R6WATCH.2.md` — full run ledger with verbatim datums + mechanics.
- DEFERRALS dated tails on all 17 re-read rows + the two PL index rows; BL-112 opened.
- `GD-R6WATCH.2-1` in LEDGER GATE DECISIONS; `nextTicket → 256_R6FLIP.1`;
  `lastCompleted → 255_R6WATCH.2`; `projectStatus` stays IN_PROGRESS per BM-TAIL-03.

## Verification

- `BEGIN READ ONLY` on every DB session (`funded-query.mjs` / direct-entrypoint script);
  the DSN was never printed or committed; BigQuery + Cloud Logging reads are metadata-only.
- `node docs/build/tools/check-append-only.mjs --base origin/main` — recorded below.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — recorded below.
- `ci-boundary.sh --pr` — recorded at head below.
