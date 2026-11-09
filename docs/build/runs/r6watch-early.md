# r6watch-early — the EARLY expedited R6WATCH.1 read at launch + 12 d (interim, read-only)

- **Spec:** `docs/tickets/200_R6WATCH.1__post-launch-read.md` (manifest row 200; REQ-WATCH-1).
- **Authorization:** the operator's verbatim 2026-11-09 ruling (LEDGER PHASE LOG + the recorded
  dispositions): *"clock rows? can we expedite these somehow? i want you to do everything
  remaining, including prod deploy, etc."* — disposition (a): the EARLY expedited read runs NOW
  at launch+12d; every datum records its exact timestamp + window-age honestly; the contractual
  launch+14d read still runs ≥ `2026-11-11T04:0xZ`. **This record is disclosed interim evidence,
  NOT the REQ-WATCH-1 14-day artifact and NOT a substitute for it.** The owed on-time read is
  carried as `D-R6WATCH-ON-TIME`; `nextTicket` stays `200_R6WATCH.1`.
- **Base / branch:** PR base `stevevitali/r7fix-9-paid-leg-pin` @ `13e7d9dc` · branch
  `stevevitali/r6watch-early` (records ride the new branch; mergePolicy=OPERATOR — never merge).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Live stage:** prod read-only — system-role (`postgres`, `rolbypassrls=t`) DSN over the IAP
  tunnel (`rhema-prod-proxy-czpk`, us-central1-b → `10.46.0.3:5432` via `127.0.0.1:15433`),
  `BEGIN READ ONLY` on every session via `scripts/live/funded-query.mjs`; one BigQuery metadata
  read (`billing_export_prod`); two Cloud Logging reads (`[slo] weekly`). **Zero writes. $0.**
- **Production mutations:** none.
- **Window:** start `2026-10-28T04:0xZ` (launch, recorded — the `0x` bucketing is the committed
  convention; queries use `≥ 2026-10-28T04:00:00Z`, conservative). Contractual end
  `2026-11-11T04:0xZ`. **Window-age at collection ≈ 12.7 d** (2026-11-09T21:1xZ — launch+12 d per
  the ruling).
- **The `not-yet-elapsed` class:** the same honest class R6CLK.1 used for rows whose window has
  not matured — recorded with exact dates, never faked green and never presented as a pass.

## Headline finding — the organic cohort is still empty end-to-end

At window-age 12.7 d: **zero organic signups, zero organic runs, zero organic admissible cost
observations.** Every in-window `signup.completed` row is a `test+*@rhema.tools` journey
synthetic on an `is_test` workspace (60 rows today alone); the only in-window non-test run is the
named smoke's `01M60AR5GG6Y0NXAWW5QH4GE2J`; the only non-test behavioural events belong to the
two named smoke workspaces. Raw anonymous acquisition traffic exists (`landing.viewed` n=1079,
`landing.dropzone_used` n=42) — the anonymous table cannot exclude smoke sessions, recorded as
raw counts with the committed bounded-additive-error caveat. Per the ticket's contract §4, an
empty organic cohort is itself the finding; at the on-time read (≥2026-11-11T04:0xZ) the
cohort-bound rows convert to standing watches with owner/trigger/re-read. **Today they record
`not-yet-elapsed` — the window has not matured; the early read discloses the trajectory
(12.7 d, zero organic) without pre-empting the contractual disposition.**

## The 11 rows — verdicts at window-age 12.7 d

| # | Row | Datum (collected 2026-11-09T21:1xZ, window-age 12.7 d) | Threshold | Verdict at this window-age |
|---|-----|--------------------------------------------------------|-----------|-----------------------------|
| 1 | **D-R5OPS.1-1** first-finding p50 ≤ 4 min | `FIRST_FINDING_QUERY` verbatim: 3 rows, ALL pre-launch signups (09-17, 09-18 smoke, 10-01); windowed + full cohort clause: **0 rows** | ≥3 organic signups w/ `finding.viewed` | **not-yet-elapsed** (n=0 <3) |
| 2 | **D-COST.1-2** `import_preview_p95_s` | verbatim windowed probe: n=4, p95=0.717 s — **all 4 rows on named smoke ws `01M2V3PM11XSF05VJ9G01PM5ZB`** (2026-11-03T15:50Z); organic n=0. Weekly sweep reads the same 0.717 s ok (machinery healthy) | ≥10 preview samples | **not-yet-elapsed** (organic n=0 <10); convert-svc `min 1→0` decision not evaluable |
| 3 | **D-SLO.1-5** success rate ≥ 97% | 0 organic terminal runs in-window (the one non-test run is the named smoke's, `unverified`); weekly probe reads `empty` | ≥10 non-test terminal runs | **not-yet-elapsed** (n=0 <10) |
| 4 | **D-SLO.1-7** `proxy_vs_sdk` ±5% | in-window (run,attempt)s w/ both meters on non-test ws: 2 — both the named smoke's `01M60AR5…` (att.1 proxy $5.332/sdk $4.574 −14.2%; att.2 proxy $0.996/sdk $0.305 −69.4%) — cohort-excluded → organic n=0; weekly 7 d probe: 0 | ≥5 organic completed attempts | **not-yet-elapsed** (n=0 <5); honest flag: the smoke run WOULD read divergent were it cohort traffic — R6FOR.1's search/fetch-granularity attribution likely applies; re-examine at the on-time read |
| 5 | **D-SLO.1-8** `egress_denied_10m` | `fetch_log` denials on non-test runs in-window: **0** — but organic runs = 0 → the read is vacuous by the row's own rule; weekly 7 d probe: 0 | ≥1 organic run for a non-vacuous read | **not-yet-elapsed** (vacuous) |
| 6 | **D-ECON.1-3** cap calibration | machinery now demonstrably live: `billing.estimator-refit` ran 2026-11-01 + 2026-11-08; `cap_calibration_reports` 0→4 rows (`review/full_board/frontier/s` n=2, `review/standard/base/xs` n=1 — all `adopted=false` "insufficient sample"); `cost_observations` 199→258, admissible 0→3 — but all 3 cohort-excluded (1 named-smoke ws, 2 is_test ws) | `CAP_REFIT_MIN_SAMPLE` n≥5 admissible/bucket | **not-yet-elapsed** (organic admissible n=0); machinery half proven green |
| 7 | **D-ECON.1-4** named cost cells | `cost_card_cells` = 48 at fit `econ1@2026-11-08`; named cells `review/standard/base/{s,m}/completed` **still absent**; standard-rigor balanced/frontier `{s,m}/completed` also absent (only `full_board/frontier/{s,xs}/completed` measured) | ≥1 admissible measured row per named cell | **not-yet-elapsed** (still `derived`) |
| 8 | **D-ECON.2-5** skipped L4 leg | in-window `usage_records` on organic runs: **0** (no cache-read/write rows exist to inspect) | any admissible lever-leg row in window | **not-yet-elapsed** — "no evidence", stays conditionally parked |
| 9 | **D-ECON.2-6** refit | no bucket reaches n≥5 (max n=2, cohort-excluded) → no adopted refit produced | n≥5 admissible in a priced bucket | **not-yet-elapsed** |
| 10 | **D-ECON.2-7** restore re-check | chained on #9 — no refit → nothing to re-read | #9 must have produced a refit | **not-yet-elapsed** (watch behind #9) |
| 11 | **D-P1.17-2** funnel | raw anonymous legs in-window: `landing.viewed` n=1079 (10-28T05:18Z→11-09T21:08Z), `landing.dropzone_used` n=42 (10-28T12:41Z→11-09T16:02Z); cohort-claused `analytics_events` funnel legs: **all zero** (non-test-ws events exist — `finding.viewed` 127, `surface.dwell` 23, `run.report_viewed` 12, `secondread.opened` 7, `entry.chosen` 1, `showcase.opened` 1, `draft.imported` 1 — every one on the two named-smoke workspaces → excluded); organic runs 0; `account_exports` in-window 3 rows all `is_test`; `export_jobs` is not a table (the export surface is `account_exports` + pgboss `account.export`); new organic personas 0 (the 2 non-test voices are pre-launch probes) | ≥3 organic signups for a ratio claim | **not-yet-elapsed** — every leg recorded; ratios unmeasurable; landing→signup numerator is honestly 0 |

## Machinery re-confirmation (the committed at-run list)

All present and live at 2026-11-09T21:1xZ — `pgboss.job` firing normally
(`slo.review.weekly` 2026-11-09T07:12Z Monday-schedule; `billing.estimator-refit`
2026-11-08T04:30Z; `usage.reconcile` hourly; `notify.sweep.weekly` 2026-11-09T04:45Z);
`slo_samples` 244 total / all in-window; `fetch_log` 9 058 / 619 in-window; `usage_records`
8 669 / 365 in-window; `analytics_events` 2 134 / 1 588 in-window; `acquisition_events`
3 668 / 1 121 in-window; `cap_calibration_reports` 4; `cost_card_cells` 48; `cost_observations`
258 / 55 new in-window; `estimator_cells` 0; `runs` 149 / 65 in-window (non-test 85 / 1 — the
named smoke's).

## `slo.review.weekly` corroboration (Cloud Logging, read 2026-11-09T21:14Z)

Today's sweep fired twice (07:12Z + 17:02Z — second firing unscheduled in committed records,
noted): summary `{"ok":6,"breach":0,"empty":7,"unmeasured":2,"error":0}` at both —
`proxy_vs_sdk` 0 · `egress_denied` 0 · `mirror_errors` 0 · `orphaned_runs` 0 ·
`import_preview_p95_s` ok 0.717 s (the 4 smoke-ws rows) · `run_success_rate` `empty` ·
`unverified_review_rate` `empty` — consistent with the DB reads above (the weekly probes' 7-day
window is also organic-empty).

## Carried datum — the billing-export surface (CLK-4's blocker, stage-named)

`rhema-507501:billing_export_prod` tableList read 2026-11-09T21:14Z: **totalItems = 0** — still
zero tables ~12 d after the R6CLK.1 finding; the billed-actuals blocker stands unchanged
(operator re-check of the console export config stays owed — rides D-COST.1-1 / D-OPS.1-3, not
this ticket's 11 rows).

## Honest mechanics notes

- `scripts/live/first-finding-latency.mjs` did not execute its main block: its
  `import.meta.url === 'file://' + argv[1]` entrypoint check fails on this checkout because the
  repo path `Rhēma` percent-encodes to `Rh%C4%93ma` in `import.meta.url`. Recorded, not worked
  around silently — the committed `FIRST_FINDING_QUERY` ran **verbatim** through
  `scripts/live/funded-query.mjs` (identical `BEGIN READ ONLY` posture). The script bug is
  environmental, not a contract deviation; flagged for a future hygiene fix (use
  `fileURLToPath`).
- The verbatim cohort queries embedded in the ticket count `is_test` only; the named-smoke
  exclusion comes from the ticket's own cohort clause and was applied on top, exactly as
  committed ("smoke sessions are a bounded additive error on `landing.viewed`" stands for the
  anonymous table).
- `export_jobs` does not exist as a relation (checked `to_regclass`) — the export surface is
  `account_exports` (+ pgboss `account.export` jobs); recorded verbatim per the row's "where
  present" wording.
- The two admissible `review/full_board/frontier/s` observations sit on `is_test` workspaces
  (2026-10-31, 2026-11-07 runs — journey/funded legs) and the `review/standard/base/xs` one on
  the named smoke ws (the refunded launch-day run `01M605XT…`, measured pre-window 10-28T03:30Z).
  The store's own admissibility (completed+verified+paid+proxy+preset) is workspace-agnostic by
  design; the cohort clause is layered for this read — recorded both ways.

## Dispositions this run

- New deferral: **`D-R6WATCH-ON-TIME`** — the contractual ≥14 d read owed ≥2026-11-11T04:0xZ.
- The 11 named rows: dated `not-yet-elapsed` tails appended; **no row closed, none converted**
  — `GD-WATCH.R6` dispositions are the on-time read's act.
- `nextTicket` stays `200_R6WATCH.1`; `lastCompleted` unchanged (interim read, not a chain
  completion).
- **Spend: $0. Zero prod writes. No paid dispatch, no preview, no deploy** (the deploy ruling's
  arm (b) belongs to another worker).
