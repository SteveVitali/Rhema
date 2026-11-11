# R6WATCH.1 — the CONTRACTUAL post-launch read at launch + 14 d (run ledger)

- **Spec:** `docs/tickets/200_R6WATCH.1__post-launch-read.md` (manifest row 200; REQ-WATCH-1).
  This is the owed REQ-WATCH-1 14-day artifact — NOT the 2026-11-09 early expedited read
  (`runs/r6watch-early.md`, interim at launch +12.7 d). `D-R6WATCH-ON-TIME` discharges here.
- **Window:** start `2026-10-28T04:0xZ` (launch, recorded — the `0x` bucketing is the committed
  convention; queries use `≥ 2026-10-28T04:00:00Z`), end `2026-11-11T04:0xZ` (launch + 14 d;
  queries use `< 2026-11-11T04:00:00Z`). The read ran **after** the end: collection timestamps
  2026-11-11T18:05Z–18:10Z, **window-age ≈ 14.58 d**.
- **Base / branch:** `main` @ `ee466fa0` (fully merged stack; PR #311 tip) · branch
  `stevevitali/r6watch-ontime`, PR base `main` (flat — mergePolicy=OPERATOR, never merge).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Live stage:** prod read-only — system-role (`postgres`, `rolbypassrls=t`) DSN
  (`rhema-prod-proxy-database-url` from Secret Manager, host rewritten to `127.0.0.1:15433`,
  `sslmode=disable`, never printed/committed) over the IAP tunnel
  (`gcloud compute ssh rhema-prod-proxy-m4g8 --zone us-central1-b --tunnel-through-iap --
  -NL 15433:10.46.0.3:5432`; the post-R7DEP-composed MIG roll retired `czpk`, `m4g8`/`g556`
  now serve). Every session `BEGIN READ ONLY … ROLLBACK` via `scripts/live/funded-query.mjs`;
  `scripts/live/first-finding-latency.mjs` ran as a **direct entrypoint** (PR #313's
  `fileURLToPath` fix — the `Rhēma`-path defect from the early read's mechanics note is closed;
  no workaround needed). Plus one BigQuery metadata read (`billing_export_prod`) and Cloud
  Logging reads (`[slo] weekly`). **Zero writes. $0.**
- **Production mutations:** none. **Spend:** $0.

## Headline finding — the organic cohort is still empty end-to-end at launch + 14.6 d

At window-age ≈14.58 d: **zero organic signups, zero organic runs, zero organic admissible cost
observations, zero organic funnel legs.** Every `signup.completed`/user row surviving at read
time on non-test workspaces is pre-window or the named smokes; the only in-window non-test run
is the named smoke's `01M60AR5GG6Y0NXAWW5QH4GE2J` (`unverified`, cohort-excluded). Raw
anonymous acquisition traffic grew (`landing.viewed` n=1,313, `landing.dropzone_used` n=44 —
the anonymous table cannot exclude smoke sessions; recorded as raw counts with the committed
bounded-additive-error caveat).

**Per the ticket's `GD-WATCH.R6` contract §4, the empty organic cohort is itself the finding:
every cohort-bound row converts to a standing alert-backed watch** — `owner: operator`,
`trigger: slo.review.weekly` (the Monday 07:12Z readout, proven firing 2026-11-09 ×3) and the
armed alert policies, `re-read: 2026-11-25T04:0xZ` (launch + 28 d default). No row is called
green on zero rows.

## The 11 rows — dispositions at window-age ≈ 14.58 d

| # | Row | Datum (collected 2026-11-11T18:05–18:10Z, window-age ≈14.58 d) | Threshold | Disposition |
|---|-----|--------------------------------------------------------------|-----------|-------------|
| 1 | **D-R5OPS.1-1** first-finding p50 ≤ 4 min | `first-finding-latency.mjs` direct entrypoint (PR #313 fix): 3 rows, ALL pre-launch (09-17, 09-18 named smoke, 10-01); windowed + full cohort clause: **0 rows** | ≥3 organic signups w/ `finding.viewed` | **OPEN → watch** (n=0<3) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 2 | **D-COST.1-2** `import_preview_p95_s` + convert-svc decision | verbatim windowed probe (non-test): **n=0, p95 null** — the early read's 4 smoke-ws samples (11-03) aged out of `slo_samples`' ~7-day retention (min `at` now 11-04T14:21Z). Test-inclusive windowed: n=166 across 67 ws, p95 0.841 s (is_test journey traffic — machinery healthy, not cohort evidence); weekly sweep read the old 0.717 s ok at 11-09 | ≥10 organic preview samples | **OPEN → watch** (organic n=0<10); convert-svc `min 1→0` decision stays unevaluable (the floor IS the ≤20 s design) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 3 | **D-SLO.1-5** weekly run-success ≥ 97% | windowed verbatim probe: **n=1 non-test terminal** — the named smoke's `01M60AR5…` (`completed` `unverified`, cohort-excluded) → raw non-test rate reads 0% on n=1; organic n=0 | ≥10 non-test terminal runs | **OPEN → watch** (n<10; rate recorded honestly — 0% on the single cohort-excluded smoke run, never called a breach on organic data) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 4 | **D-SLO.1-7** `proxy_vs_sdk` ±5% | in-window (run,attempt)s w/ both meters on non-test ws: 2 — both the named smoke's `01M60AR5…` (att.1 proxy $5.332/sdk $4.574, 14.2% divergent; att.2 proxy $0.996/sdk $0.305, 69.4% divergent) — cohort-excluded → organic n=0; weekly 7 d probe: 0 | ≥5 organic completed attempts | **OPEN → watch** (n=0<5) — the flag stands honestly: the smoke run WOULD read divergent on both attempts were it cohort traffic; R6FOR.1's search/fetch-granularity attribution likely applies — re-examine at re-read · owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 5 | **D-SLO.1-8** `egress_denied_10m` | `fetch_log` `decision='deny'` in-window: **0 rows on ALL runs** (non-test and test alike); organic runs in-window = 0 → the read is vacuous by the row's own rule | ≥1 organic run for a non-vacuous read | **OPEN → watch** (vacuous — 0 denials recorded, not called a pass) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 6 | **D-ECON.1-3** cap calibration | `cap_calibration_reports` = 4 rows (unchanged; latest `computed_at` 2026-11-08T04:30Z — `billing.estimator-refit` fired 11-01 + 11-08, next due 11-15): `review/full_board/frontier/s` n≤2, `review/standard/base/xs` n≤1, all `adopted=false` "insufficient sample"; `cost_observations` admissible = 3 — all cohort-excluded (1 named-smoke ws, 2 is_test ws) → **organic admissible n=0** | `CAP_REFIT_MIN_SAMPLE` n≥5 admissible/bucket | **OPEN → watch** (zero organic admissible — organic traffic is the only admissible source); machinery half proven green — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 7 | **D-ECON.1-4** named cost cells | `cost_card_cells` = 48 at fit `econ1@2026-11-08` (unchanged); named cells `review/standard/base/{s,m}/completed` **still absent**; standard-rigor balanced/frontier `{s,m}/completed` also absent (only `full_board/frontier/{s,xs}/completed` measured) | ≥1 admissible measured row per named cell | **OPEN → watch** (still `derived`) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 8 | **D-ECON.2-5** skipped L4 leg | in-window `usage_records` on organic (non-test, non-smoke) runs: **0** — no cache-creation vs cache-read token split exists to inspect | any admissible lever-leg row in window | **OPEN — conditionally parked** ("no evidence"; the pre-registered ≤$3 reopen condition unmet) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 9 | **D-ECON.2-6** cost-card/`pricing.json` refit | no bucket reaches n≥5 admissible (max n=2, cohort-excluded) → no adopted refit produced; `estimator_cells` 0 | n≥5 admissible in a priced bucket | **OPEN → watch** (never a hand-edit) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 10 | **D-ECON.2-7** lever-A/B restore re-check | chained on #9 — no refit exists to re-read | #9 must have produced a refit | **OPEN → watch** behind #9 (the updated gap stands: stateless estimate $20.25 vs $6) — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |
| 11 | **D-P1.17-2** funnel metrics | raw anonymous legs in-window: `landing.viewed` n=1,313 (10-28T05:18→11-11T03:53), `landing.dropzone_used` n=44 (10-28T12:41→11-10T14:46); cohort-claused `analytics_events` funnel legs: **all zero organic** (non-test events exist — `finding.viewed` 127, `surface.dwell` 24, `run.report_viewed` 12, `secondread.opened` 7, `entry.chosen` 2, `showcase.opened` 1, `draft.imported` 1, `chat.empty_state_shown` 1 — every one on the named smoke ws `01M2V3PM11XSF05VJ9G01PM5ZB` → excluded); organic `signup.completed` 0 (in-window `user` rows: 0 survive the purge; last-72 h users: 35, all `test+*@rhema.tools` created today by the in-flight journeys cron); organic runs 0; `account_exports` in-window 1 row `t8exp_jrn_…` on `is_test` ws (organic exports 0); `export_jobs` still not a table; new organic personas 0 (the 2 non-test voices are the same pre-launch probes) | ≥3 organic signups for a ratio claim | **OPEN → watch** — per-leg funnel verdict: landing→signup **0 organic signups over 1,313 anonymous views** (below the ≥6% target; numerator honestly 0, denominator carries the smoke-additive caveat); drop-zone→signup **0/44** (below ≥40%); anchor-≤60 s ≥70% **unmeasurable** (empty numerator and denominator). Every leg recorded, none called — owner: operator · trigger: `slo.review.weekly` · re-read: 2026-11-25T04:0xZ |

## Machinery re-confirmation (the committed at-run list)

All present and live at 2026-11-11T18:05–18:10Z — `pgboss.job` firing normally
(`slo.review.weekly` last 2026-11-09T07:12Z scheduled + two unscheduled same-day firings
17:02Z/21:42Z — the early read's class, recorded; `billing.estimator-refit` 2026-11-08T04:30Z,
weekly Sundays `30 4 * * 0`; `notify.sweep.weekly` 2026-11-09T04:45Z; `test-tenant.purge`
hourly `10 * * * *` — active, see below); `slo_samples` 249 (in-window 220 — retention ≈ 7 d,
oldest row 11-04T14:21Z); `fetch_log` 8,899 / 295 in-window; `usage_records` 8,679 / 370
in-window; `analytics_events` 1,447 / 175 in-window; `acquisition_events` 3,948 / 1,357
in-window; `cap_calibration_reports` 4; `cost_card_cells` 48 @ `econ1@2026-11-08`;
`cost_observations` 258 / 55 in-window (admissible 3, all cohort-excluded); `estimator_cells` 0;
`runs` 118 / 1 in-window (the named smoke's; non-test 1, organic 0).

**Counts DOWN since the early read (11-09→11-11):** `analytics_events` 2,134→1,447, `runs`
149→118, `fetch_log` 9,058→8,899 — the hourly `test-tenant.purge` reaped the journey
synthetics' rows (the 60 in-window test signups of 11-09 are gone; the 35 live users today are
all `test+*@rhema.tools` minted 2026-11-11 by the running cron). Consistent, not a defect.

**New machinery datum — `usage.reconcile` now FAILS daily.** The job (schedule `15 3 * * *`,
daily 03:15Z) completed-with-skip on the placeholder admin key through R6CLK.1; since
**2026-11-05 it has failed 7 consecutive times** (11-05→11-11), error
`provider report fetch failed: 403` in `AnthropicAdminReportSource.fetchAll`. The admin key
now reaches a real HTTP 403 (an actual key bound but denied upstream) rather than the recorded
placeholder-skip — the D-ECON.1-1 / D-PRB.08-1 green-read criterion is still unmet and now
fails loudly. Recorded; dated tails appended on those rows (not this ticket's 11 — the
operator key-seeding act remains owed).

## `slo.review.weekly` corroboration (Cloud Logging, read 2026-11-11T18:08Z)

The last sweep inside the window fired 2026-11-09 (the Monday schedule, plus two unscheduled
same-day firings): **07:12Z, 17:02Z, 21:42Z** — all three read
`{"ok":6,"breach":0,"empty":7,"unmeasured":2,"error":0}` — `proxy_vs_sdk` 0 · `egress_denied`
0 · `mirror_errors` 0 · `orphaned_runs` 0 · `import_preview_p95_s` ok 0.717 s ·
`run_success_rate` `empty` · `unverified_review_rate` `empty` · `run_start`/`gate_resume`/
`provider_429_5xx`/`event_delivery`/`absorbed_adjustments` `empty` — consistent with the DB
reads (the weekly probes' 7-day window is also organic-empty). Next scheduled firing
2026-11-16T07:12Z; the watches' `trigger:` cell rides exactly this readout.

## Carried datum — the billing-export surface (CLK-4's blocker, stage-named)

`rhema-507501:billing_export_prod` `bq ls` read 2026-11-11T18:0xZ: **still zero tables** —
~14.6 d after the R6CLK.1 finding; the billed-actuals blocker stands unchanged (operator
re-check of the console export config stays owed — rides D-COST.1-1 / D-OPS.1-3, dated tails
appended; not this ticket's 11 rows).

## Honest mechanics notes

- `scripts/live/first-finding-latency.mjs` ran as a **direct entrypoint** — PR #313's
  `fileURLToPath` fix closed the `Rhēma`-path defect recorded by r6watch-early. The committed
  `FIRST_FINDING_QUERY`/`FIRST_FINDING_SUMMARY` output is verbatim above; the ticket's
  windowed + full-cohort-clause restriction ran through `funded-query.mjs` (identical
  `BEGIN READ ONLY` posture).
- The verbatim cohort queries embedded in the ticket count `is_test` only; the named-smoke
  exclusion comes from the ticket's own cohort clause and was applied on top, exactly as
  committed.
- `slo_samples` retention ≈ 7 days: the early read's 4 smoke-ws `import_preview_ms` samples
  (2026-11-03) aged out — the verbatim windowed probe now reads n=0 non-test even though the
  11-09 interim read saw 4. Recorded both ways; the datum for the row is the organic count
  (0 either way).
- The one surviving in-window `account_exports` row (`t8exp_jrn_c9ce823f785d01`) sits on an
  `is_test` workspace whose current row re-created 2026-11-11T14:09Z — test-tenant lifecycle
  churn; the organic-export datum is 0 either way.
- `export_jobs` does not exist as a relation (`to_regclass` → null, re-verified) — the export
  surface is `account_exports` + pgboss `account.export` jobs.
- A separate journeys-cron rerun was in flight during the read (fresh `is_test` workspaces +
  `import_preview_ms` samples landing mid-read, 18:05–18:09Z) — not this run's act; recorded
  for timestamp honesty. No datum above is affected (all test-side).

## `GD-WATCH.R6` — the disposition row (written to LEDGER GATE DECISIONS)

Per-row: all 11 → **OPEN + standing alert-backed watch** (`owner: operator` · `trigger:
slo.review.weekly` · `re-read: 2026-11-25T04:0xZ`); row 8 additionally records "conditionally
parked". Funnel verdict: landing→signup **below** (0 organic / 1,313 anonymous), drop-zone→
signup **below** (0/44), anchor-≤60 s **unmeasurable**; machinery corroborated; organic cohort
empty end-to-end is the finding itself (contract §4). **Zero rows closed on evidence; zero
rows presented as a pass on zero data.**

## Dispositions this run

- **`D-R6WATCH-ON-TIME` → DONE** — the contractual ≥14 d read executed at window-age ≈14.58 d.
- The 11 named rows: dated tails appended — all `OPEN` + watch cells (row 8 "conditionally
  parked"); the `GD-WATCH.R6` LEDGER GATE DECISIONS row records per-row dispositions + the
  funnel verdict.
- **`D-R7DOC.1-1` → DONE** — RELEASE_NOTES_DRAFT round-7 addendum appended with the on-time
  read's dated verdict lines.
- Dated tails appended on **D-ECON.1-1 / D-PRB.08-1** (the reconcile 403 datum) and
  **D-COST.1-1 / D-OPS.1-3** (billing export still zero tables at +14.6 d) — dated
  verification notes, not in the 11.
- `nextTicket` → `201_R6CAP.1` (the R6 tail resumes; row 200 landed). `lastCompleted` →
  `R6WATCH.1`. `projectStatus` stays `IN_PROGRESS` per BM-TAIL-03 (R6 tail 201–208 unlanded,
  GATE-ACCEPT.R6 unsigned, OPEN watch deferrals lack landings).
- **Spend: $0. Zero prod writes. No paid dispatch, no preview, no deploy.**

## AC ledger

- [x] Every named row closed on windowed evidence or converted to a standing alert-backed
      watch with owner/trigger/re-read (`GD-WATCH.R6` recorded) *(live-executed)* — all 11
      converted; the empty cohort is the recorded finding.
- [x] The funnel verdict recorded per leg — no empty-cohort passes *(live-executed)* — below /
      below / unmeasurable.
- [x] Universal phase-gate AC — verification green (live-executed reads; no new behaviour, no
      new tests owed; req id REQ-WATCH-1 stamped in the PR); DEFERRALS rows carry the
      compensating watches; no deviations needing an ADR (the disposition is the contract's
      own); BUILD_INDEX/LEDGER advanced; dates from the clock; protected records appended
      only; harness in this header.

## Self-review / gap analysis

- P1 — every datum re-derived fresh at 18:05–18:10Z, not carried from the early read: the
  deltas (purged synthetics, aged-out slo_samples, the reconcile 403s, the third weekly-sweep
  firing) were caught because the reads re-ran, not because records differed.
- P2 — trap-check: the 190/166 `import_preview_ms` samples and 35 fresh users are `is_test`
  journey traffic mid-cron-rerun — none counts toward any organic threshold; the named
  smoke's run/persona/events were cohort-excluded per the committed clause before any verdict.
- Honest flags: (a) the raw non-test success rate reads 0% on n=1 — recorded as the smoke's
  cohort-excluded run, never a breach claim; (b) `account_exports`' surviving row's workspace
  re-created post-window — recorded, not resolved (test churn); (c) `usage.reconcile` is
  DAILY per the live schedule (`15 3 * * *`) — R6CLK.1's "hourly" wording corrected by dated
  note, not rewritten.
