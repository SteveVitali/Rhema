# 255_R6WATCH.2 — the EARLY standing-watch re-read (run ledger)

- **Spec:** `docs/tickets/255_R6WATCH.2__early-watch-reread.md` (manifest insert row 255; REQ-WATCH-1
  via `GD-WATCH.R6`). The early re-read of the 11 `GD-WATCH.R6` standing watches + the four unmet
  clock reads — **operator ruling 2026-11-11** verbatim: *"others we can pick up now and ignore
  dates if it makes sense"* — the `re-read: 2026-11-25T04:0xZ` date is lifted; the paid-leg
  re-proof (`D-R7FIX.9-1`) and the external pen test (`D-P1.22-3`) stay deferred.
- **Baseline:** `docs/build/runs/R6WATCH.1.md` (the contractual launch+14d read, window-age
  ≈14.58 d, collected 2026-11-11T18:05–18:10Z). Same committed `GD-WATCH.R6` query set, same
  cohort clause, same `BEGIN READ ONLY` posture. This run re-collects every datum fresh —
  nothing is carried from the baseline except the comparison itself.
- **Base / branch:** `main` @ `da10ab5f` · branch `stevevitali/r6watch-2-reread`, PR base `main`
  (flat — mergePolicy=OPERATOR, never merge).
- **Harness:** devin-desktop/swe-2-high/subagent
- **Live stage:** prod read-only — system-role (`postgres`, `rolbypassrls=t`) DSN
  (`rhema-prod-proxy-database-url` from Secret Manager, host rewritten to `127.0.0.1:15433`,
  `sslmode=disable`, never printed/committed) over the IAP tunnel
  (`gcloud compute ssh rhema-prod-proxy-m4g8 --zone us-central1-b --tunnel-through-iap --
  -NL 15433:10.46.0.3:5432`). Every session `BEGIN READ ONLY … ROLLBACK` via
  `scripts/live/funded-query.mjs`; `scripts/live/first-finding-latency.mjs` ran as a direct
  entrypoint. Plus one BigQuery metadata read (`bq ls billing_export_prod`) and Cloud Logging
  reads (`[slo] weekly`, `[worker] project.purge`, `test-tenant.purge`). **Zero writes. $0.**
- **Production mutations:** none. **Spend:** $0.
- **Collection window:** 2026-11-11T23:24:15Z–23:28:43Z, **window-age ≈ 14.80 d**
  (launch `2026-10-28T04:0xZ`; queries use `≥ 2026-10-28T04:00:00Z`, unbounded top — the
  standing watch reads launch→now, ~19.4 h fresher than the baseline's closed window).

## Headline finding — the organic cohort is still empty end-to-end at launch + 14.8 d

At window-age ≈14.80 d: **zero organic signups, zero organic runs, zero organic admissible
cost observations, zero organic funnel legs — unchanged from the 14.58 d baseline.** The
only in-window non-test run is still the named smoke's `01M60AR5GG6Y0NXAWW5QH4GE2J`
(`completed` `unverified`, cohort-excluded); every surviving in-window `signup.completed`
row is on an `is_test` workspace (today's journey-cron synthetics; last-72 h users 46, all
`test+*@rhema.tools`). Raw anonymous acquisition traffic grew again (`landing.viewed`
n=1,410, `landing.dropzone_used` n=48 — the anonymous table cannot exclude smoke sessions;
recorded as raw counts with the committed bounded-additive-error caveat).

**NEW live finding — `F-R6WATCH.2-1`:** the armed `project.purge` job for the CLK-1
tombstone `01M3SK380GQX41RKMD4KVFB34Q` **vanished without firing** — the project row still
sits `deleted_at=2026-09-30T21:41Z`, 11.6 d past the armed +30 d fire date. The 30-day
purge contract did NOT complete. Recorded → BL-112 (see the CLK-1 section).

## The 11 watch rows — dispositions at window-age ≈ 14.80 d

| # | Row | Datum (collected 2026-11-11T23:24–23:25Z, window-age ≈14.80 d) | Threshold | Disposition |
|---|-----|--------------------------------------------------------------|-----------|-------------|
| 1 | **D-R5OPS.1-1** first-finding p50 ≤ 4 min | `first-finding-latency.mjs` direct entrypoint: 3 rows, ALL pre-launch (09-17, 09-18 named smoke, 10-01) — identical to baseline; windowed + full cohort clause (`≥ launch`, smoke/test/probe excluded): **0 rows** | ≥3 organic signups w/ `finding.viewed` | **OPEN — watch stands** (n=0<3) — `owner: operator` · `trigger: slo.review.weekly` · `re-read: 2026-11-25T04:0xZ` stands |
| 2 | **D-COST.1-2** `import_preview_p95_s` + convert-svc decision | verbatim windowed probe (non-test): **n=0, p95 null** — unchanged (slo_samples oldest row still 11-04T14:21Z). Test-inclusive windowed: n=202 across 79 ws, p95 0.837 s (baseline 166/67/0.841 s — `is_test` journey traffic, machinery healthy, not cohort evidence) | ≥10 organic preview samples | **OPEN — watch stands** (organic n=0<10); convert-svc `min 1→0` decision stays unevaluable — same cells |
| 3 | **D-SLO.1-5** weekly run-success ≥ 97% | windowed verbatim probe: **n=1 non-test terminal** — the named smoke's `01M60AR5…` (`completed` `unverified`, cohort-excluded) → raw non-test rate reads 0% on n=1; organic n=0 | ≥10 non-test terminal runs | **OPEN — watch stands** (n<10; rate honest — 0% on the single cohort-excluded smoke run, never a breach claim) — same cells |
| 4 | **D-SLO.1-7** `proxy_vs_sdk` ±5% | in-window (run,attempt)s w/ both meters on non-test ws: 2 — both the named smoke's `01M60AR5…` (att.1 proxy $5.332112/sdk $4.573744, 14.2% divergent; att.2 proxy $0.996165/sdk $0.305151, 69.4% divergent) — identical to baseline; cohort-excluded → organic n=0 | ≥5 organic completed attempts | **OPEN — watch stands** (n=0<5) — the honest flag stands: the smoke run WOULD read divergent were it cohort traffic; R6FOR.1's search/fetch-granularity attribution stands — same cells |
| 5 | **D-SLO.1-8** `egress_denied_10m` | `fetch_log` `decision='deny'` since launch: **0 rows on ALL runs** (non-test and test alike); organic runs = 0 → vacuous by the row's own rule | ≥1 organic run for a non-vacuous read | **OPEN — watch stands** (vacuous — 0 denials recorded, not called a pass) — same cells |
| 6 | **D-ECON.1-3** cap calibration | `cap_calibration_reports` = 4 rows (unchanged; latest `computed_at` 2026-11-08T04:30Z — `billing.estimator-refit` next due 11-15): `review/full_board/frontier/s` n≤2, `review/standard/base/xs` n≤1, all `adopted=false`; `cost_observations` admissible = 3 — all cohort-excluded (1 named-smoke ws `01M2V3PM11XSF05VJ9G01PM5ZB`, 2 `is_test` ws) → **organic admissible n=0** | `CAP_REFIT_MIN_SAMPLE` n≥5 admissible/bucket | **OPEN — watch stands** (zero organic admissible; machinery half proven green) — same cells |
| 7 | **D-ECON.1-4** named cost cells | `cost_card_cells` = 48 at fit `econ1@2026-11-08` (unchanged); named cells `review/standard/base/{s,m}/completed` **still absent**; standard-rigor balanced/frontier `{s,m}/completed` also absent (only `full_board/frontier/{s,xs}/completed` measured) | ≥1 admissible measured row per named cell | **OPEN — watch stands** (still `derived`) — same cells |
| 8 | **D-ECON.2-5** skipped L4 leg | in-window `usage_records` on organic (non-test, non-smoke) runs: **0** — no cache-creation vs cache-read token split exists to inspect | any admissible lever-leg row in window | **OPEN — conditionally parked** ("no evidence"; the pre-registered ≤$3 reopen condition unmet) — same cells |
| 9 | **D-ECON.2-6** cost-card/`pricing.json` refit | no bucket reaches n≥5 admissible (max n=2, cohort-excluded) → no adopted refit produced; `estimator_cells` 0 | n≥5 admissible in a priced bucket | **OPEN — watch stands** (never a hand-edit) — same cells |
| 10 | **D-ECON.2-7** lever-A/B restore re-check | chained on #9 — no refit exists to re-read | #9 must have produced a refit | **OPEN — watch stands** behind #9 (the updated gap stands: stateless estimate $20.25 vs $6) — same cells |
| 11 | **D-P1.17-2** funnel metrics | raw anonymous legs since launch: `landing.viewed` n=1,410 (10-28T05:18→11-11T23:23Z), `landing.dropzone_used` n=48 (10-28T12:41→11-11T18:05Z) — grew +97/+4 vs baseline; cohort-claused `analytics_events` legs: **all zero organic** (non-test events exist — `finding.viewed` 127, `surface.dwell` 24, `run.report_viewed` 12, `secondread.opened` 7, `entry.chosen` 2, `showcase.opened` 1, `draft.imported` 1, `chat.empty_state_shown` 1 — every one on the named smoke ws → excluded); organic `signup.completed` 0; organic runs 0; `account_exports` in-window 3 rows, ALL `is_test` (organic exports 0); `export_jobs` still not a relation; new organic personas 0 (the 2 non-test voices are the same pre-launch probes) | ≥3 organic signups for a ratio claim | **OPEN — watch stands** — per-leg funnel verdict: landing→signup **below** (0 organic / 1,410 anonymous, smoke-additive caveat); drop-zone→signup **below** (0/48); anchor-≤60 s ≥70% **unmeasurable** (empty numerator+denominator) — same cells |

Zero rows closed on matured evidence; zero rows presented as a pass on zero data. Every
row's watch cells are unchanged — the standing `owner: operator` · `trigger:
slo.review.weekly` · `re-read: 2026-11-25T04:0xZ` is the re-dated disposition: this early
pass adds the dated datum, the next bounded look stays the committed launch+28 d date (or
earlier on organic-traffic arrival, which the weekly readout catches first).

## The four unmet clock reads — carriers re-read where query-only

### CLK-1 (D-BL38.1-2) — CRITERION UNMET; new finding `F-R6WATCH.2-1`

Collected 2026-11-11T23:26Z. The committed verify query `select id, deleted_at from
projects where id='01M3SK380GQX41RKMD4KVFB34Q'` returns **1 row** —
`deleted_at=2026-09-30T21:41:10.945Z` — the tombstone **survives 11.6 d past** the armed
+30 d purge fire date (`start_after=2026-10-30T21:41:10.952Z`, verified armed 2026-10-28).

- The armed job `57bbef6f-bf5d-4f48-8f5b-1c7065aed5ff` is **absent from `pgboss.job`
  entirely** — no row in any state.
- Cloud Logging (freshness 15 d, covering the fire date): **zero `[worker] project.purge`
  executions for this project id.** The 12 observed `project.purge` executions (11-02→
  11-05) all return `{"purged":false,"restored":true}` — the restored-inside-grace /
  row-already-gone no-op path on OTHER (test-churn) projects; none `purged:true`.
- `pgboss.job` completed-row retention ≈ 7 d (oldest completed 11-04T06:00Z) explains the
  missing row for a WOULD-BE completed job — but a completed purge would have deleted the
  project row itself, which survives. And a `rescheduled` outcome would leave a new
  `created` job under the same singleton key — none exists (all 48 pending
  `project.purge` jobs are future-dated 11-13→12-06, none past-due).
- So: no execution log + no pending job + surviving tombstone ⇒ **the armed job was lost
  silently between the 10-28 armed-state verification and its 10-30 fire date** (mechanism
  not determinable from read-only evidence — expire/failed-then-retention, a maintenance/
  deploy-window drop, or a dedup edge are the candidate classes).

**Disposition:** the CLK-1 criterion (zero rows on the verify select) is **unmet** — the
30-day purge contract failed silently for this row. Recorded as finding
**`F-R6WATCH.2-1`** → new backlog row **BL-112**. D-BL38.1-2 stays **OPEN** — re-arming
the purge is a prod write outside this read-only run; the fix (re-enqueue + a lost-job
audit) needs an owner ticket. The project is also the only `deleted_at < now()−30 d`
survivor — the loss is row-specific, not a systemic purge outage (the 10-21 purge of
`01M5G7M7…` completed green).

### CLK-2 (D-FIX.1-4) — unchanged datum

Collected 2026-11-11T23:27Z. `notification_deliveries`/`inbox_items` `voice_stale` rows:
**0**; `persona_profiles` n=2 last built 2026-09-26T07:35Z; **zero T16 personas on prod**
(the T16 `paid:true`/`expected:red` substrate was never run — the funded wave stays parked
per GD-ENV.R6 and the paid-leg re-proof stays deferred per the 2026-11-11 ruling).
`notify.sweep.weekly` last fired 2026-11-09T04:45Z completed (Monday `45 4 * * 1`);
claim-once criterion still untriggerable — **still unmet**, row stays OPEN. A claim
requires the T16 substrate first; earliest remains the next paid sweep after substrate
lands.

### CLK-4 (D-COST.1-1 / D-OPS.1-3) — unchanged datum (257/258 own the fix)

Collected 2026-11-11T23:28Z. `bq ls rhema-507501:billing_export_prod` → **still zero
tables** ~14.8 d post-launch (baseline: zero at 14.6 d; first surfaced ~14 d post-
provisioning by R6CLK.1). The billed-actuals blocker stands; the console export re-check
stays operator-owed. **258_R6OPS.2 owns diagnosis/fix — this run only re-reads.**

### CLK-5 (D-ECON.1-1 / D-PRB.08-1) — unchanged datum (257/258 own the fix)

Collected 2026-11-11T23:28Z. `pgboss.job` `usage.reconcile` (daily `15 3 * * *`): **7
consecutive `failed` rows, 2026-11-05T03:15Z → 2026-11-11T03:15Z**, all
`provider report fetch failed: 403` at `AnthropicAdminReportSource.fetchAll` — identical
streak to the baseline read (the next firing is due 2026-11-12T03:15Z, not yet due).
The green-read criterion stays unmet; the operator key-seeding act remains owed.
**257_R6OPS.1 owns diagnosis/fix — this run only re-reads.**

## Machinery re-confirmation (the committed at-run list)

All present and live at 2026-11-11T23:28Z — `pgboss.schedule` unchanged (15 schedules;
`slo.review.weekly` `12 7 * * 1`, `billing.estimator-refit` `30 4 * * 0`,
`notify.sweep.weekly` `45 4 * * 1`, `test-tenant.purge` `10 * * * *`, `usage.reconcile`
`15 3 * * *`). Firings: `slo.review.weekly` last 2026-11-09T07:12Z (+ the two same-day
unscheduled 17:02Z/21:42Z — confirmed in Cloud Logging); `billing.estimator-refit`
2026-11-08T04:30Z (next due 11-15); `notify.sweep.weekly` 2026-11-09T04:45Z;
`test-tenant.purge` hourly — 191 completed rows in retention, last 2026-11-11T23:11Z,
still actively reaping journey synthetics.

Counts (baseline → now): `slo_samples` 249→264 (retention floor unchanged, oldest row
still 11-04T14:21Z); `fetch_log` 8,899→8,994 (since-launch 555); `usage_records`
8,679→8,684 (since-launch 380); `analytics_events` 1,447→1,934 (since-launch 1,388 —
journey-cron test traffic churning); `acquisition_events` 3,948→4,005 (since-launch
1,458); `cap_calibration_reports` 4; `cost_card_cells` 48 @ `econ1@2026-11-08`;
`cost_observations` 258 (since-launch 55; admissible 3, all cohort-excluded);
`estimator_cells` 0; `runs` 118→137 (since-launch non-test still 1 — the named smoke's;
the +19 are `is_test` journey runs); `user` 54 total (last-72 h 46, all
`test+*@rhema.tools` minted by the running journeys cron).

## `slo.review.weekly` corroboration (Cloud Logging, read 2026-11-11T23:27Z)

Latest firings remain the 2026-11-09 triple (07:12Z scheduled + 17:02Z/21:42Z
unscheduled): all read `{"ok":6,"breach":0,"empty":7,"unmeasured":2,"error":0}` —
`proxy_vs_sdk` 0 · `egress_denied` 0 · `mirror_errors` 0 · `orphaned_runs` 0 ·
`import_preview_p95_s` ok 0.717 s · `run_success_rate`/`unverified_review_rate`/`run_start`/
`gate_resume`/`provider_429_5xx`/`event_delivery`/`absorbed_adjustments` `empty`. Next
scheduled firing **2026-11-16T07:12Z** — the watches' `trigger:` cell rides exactly this
readout. No firing between the baseline and this re-read (the Monday sweep is due next
week); consistent with the DB reads.

## Honest mechanics notes

- `scripts/live/first-finding-latency.mjs` ran as a **direct entrypoint** (post-#313
  `fileURLToPath` fix — no workaround). All other SQL ran verbatim through
  `funded-query.mjs` (`BEGIN READ ONLY … ROLLBACK` per session).
- The `pg` module needed `pnpm install --frozen-lockfile` in the fresh worktree (the
  script's `createRequire` resolves `integration/package.json`); install only, no codegen.
- The windowed probes read `≥ 2026-10-28T04:00:00Z` unbounded-top (standing-watch window
  = launch→now). The baseline's closed-window values are quoted where the convention
  differed; every organic-cohort count is 0 either way.
- `usage_records` carries `cache_write_tokens`/`cache_read_tokens` (not
  `cache_creation_input_tokens`/`cache_read_input_tokens`) — the cache-split check used
  the live column names; the cohort count is 0 regardless.
- `cap_calibration_reports`/`cost_card_cells` columns are
  `workflow/rigor/model_tier/size_band(/outcome)` (no `bucket`/`key` column) — the
  committed reads used the live column names.
- `pgboss.job` completed-row retention ≈ 7 d (oldest completed 11-04T06:00Z) — rows for
  completed jobs older than that are pruned; recorded because it bounds what CLK-1's
  absent job row can and cannot mean.
- The `project.purge` `{"restored":true}` executions are benign no-ops: the handler
  re-reads `projects.deleted_at` and reports `restored` when the row is gone or
  un-tombstoned (`apps/worker/src/jobs.ts:78`) — the test-tenant cascade removes the row
  first for churned test projects.
- A journeys-cron rerun is in flight (fresh `is_test` workspaces/users/runs minted today
  — `01M75…` ULIDs). No organic datum is affected.

## Dispositions this run

- The 11 `GD-WATCH.R6` watch rows: dated tails appended — all stay **OPEN** on the same
  watch cells (row 8 "conditionally parked"); this early pass adds the ~14.80 d datum.
- **CLK-1 (D-BL38.1-2):** criterion UNMET — finding **`F-R6WATCH.2-1`** (armed
  `project.purge` job silently lost; tombstone survives 11.6 d past the armed +30 d date)
  → **BL-112**; row stays OPEN (re-arm is a prod write — outside read-only).
- **CLK-2 (D-FIX.1-4):** still unmet — dated datum appended.
- **CLK-4 (D-COST.1-1 / D-OPS.1-3):** still unmet — dated datum appended; 258 owns.
- **CLK-5 (D-ECON.1-1 / D-PRB.08-1):** still failing — dated datum appended; 257 owns.
- `GD-R6WATCH.2-1` records the dispositions in LEDGER GATE DECISIONS.
- `nextTicket` → `256_R6FLIP.1`; `lastCompleted` → `255_R6WATCH.2`; `chainTip` →
  `stevevitali/r6watch-2-reread`; `projectStatus` stays IN_PROGRESS per BM-TAIL-03.
- **Spend: $0. Zero prod writes. No paid dispatch, no preview, no deploy.**

## AC ledger

- [x] The 11 watch rows re-read with fresh datums + exact UTC timestamps + window-age
      *(live-executed)* — all collected 2026-11-11T23:24–23:28Z ≈14.80 d; all still-empty
      → dated datum, watch OPEN with the standing re-dated trigger.
- [x] The four unmet clock carriers run where query-only *(live-executed)* — CLK-1
      unmet → finding + BL-112 (not faked); CLK-2/4/5 dated datums.
- [x] `usage.reconcile` 403 + `billing_export_prod` zero-tables re-checked for freshness
      *(live-executed)* — both unchanged; owner tickets 257/258 named.
- [x] Universal phase-gate AC — read-only stage held (`BEGIN READ ONLY` every session);
      DEFERRALS dated tails on every re-read row; BUILD_INDEX/LEDGER advanced;
      `GD-R6WATCH.2-1` recorded; no deviations needing an ADR (the dispositions are the
      standing contract's own); dates from the clock; harness in this header.

## Self-review / gap analysis

- P1 — every datum re-derived fresh at 23:24–23:28Z, not carried from the baseline: the
  deltas caught (the lost purge job, +97/+4 funnel growth, +19 test runs, 46 churned
  users) are exactly what a re-read exists to catch.
- P2 — trap-check: the 202 `import_preview_ms` samples, 1,388 in-window analytics events,
  3 account_exports rows and 46 fresh users are all `is_test` journey traffic — none
  counts toward any organic threshold; the named smoke's run/events/personas were
  cohort-excluded before any verdict.
- Honest flags: (a) the raw non-test success rate still reads 0% on n=1 — recorded as
  the smoke's cohort-excluded run, never a breach; (b) CLK-1's absent job row is bounded
  by ~7 d completed-retention — the finding rests on the surviving project row + absent
  execution log, not the absent job row alone; (c) `account_exports` gained two new
  in-window rows — both `is_test` (test churn), organic exports still 0.
