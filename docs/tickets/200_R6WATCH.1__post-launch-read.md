# R6WATCH.1 — Post-launch read at launch + 14 d (REQ-WATCH-1)

- **Sequence:** 200 of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 199_R6CLK.1 + the launch timestamp (recorded by 198_R6LCH.1:
  **2026-10-28T04:0xZ**, `docs/build/reports/2026-10-27_R6LCH.1/LAUNCH-REPORT.md`) + 14 days.
- **Run:** `implement-spec spec=docs/tickets/200_R6WATCH.1__post-launch-read.md` —
  **no earlier than 2026-11-11T04:0xZ** (launch `2026-10-28T04:0xZ` + 14 d). Running the read
  before the window closes fabricates a short window; an early run only re-verifies the
  "not yet" rows, which R6CLK.1 already carries.
- **Gate status:** none — the disposition itself is recorded as `GD-WATCH.R6` (LEDGER GATE
  DECISIONS row written by this ticket's close).
- **Live stage:** prod read-only (system-role DSN over the IAP proxy tunnel, `BEGIN READ
  ONLY`) + the billing-export dataset; $0. **Zero writes.**
- **Production mutations:** none
- **Size budget:** ~250 changed lines (queries committed here, run ledger, dated tails)

> **Expanded 2026-10-28 by R6CLK.1** — was a skeleton-kind row awaiting the launch
> timestamp. The window, cohort, queries, and per-row sample thresholds below are now
> fixed; the live read itself is **not** executed in R6CLK.1.

## Goal

On the committed queries below over the **organic non-test cohort**, close each
cohort-bound deferral on evidence, or convert it to a standing alert-backed watch with a
named owner and a re-read date — the `GD-WATCH.R6` contract. Empty cohorts are recorded
as "no data", never as passing evidence.

## The cohort (verbatim, used by every query below)

Organic non-test traffic only:

- `workspaces.is_test = false` on every workspace-scoped table.
- Exclude the two named smoke accounts: `14stevevitali@gmail.com`
  (`01M2V3PM0WYEPXH26NA2J9BRWB`, workspace `01M2V3PM11XSF05VJ9G01PM5ZB`) and
  `14stevevitali+r6lch1@gmail.com` (`01M60AJ502VX74JMKMM8AW6DJM`, workspace
  `01M60AJ5083CBJS56EQPZAGGBE`).
- Exclude synthetic journey/probe accounts by shape: `email like 'test%@rhema.tools'` and
  `email like '%probe%@rhema.tools'` (they ride `is_test` workspaces anyway; the clause is
  belt-and-suspenders for any probe row that ever lands unflagged).
- `acquisition_events` is anonymous by design (`ip_hash`, no user join) — its funnel rows
  cannot exclude the smokes. Funnel legs therefore record the raw counts with a note that
  smoke sessions are a bounded additive error on `landing.viewed`, and never use them as
  the sole evidence for a per-user claim.
- `analytics_opt_out = true` users are excluded from behavioural funnels (the
  `first-finding` CTE already does this).

## The window

- **Start:** `2026-10-28T04:0xZ` (launch, recorded).
- **End:** `2026-11-11T04:0xZ` (launch + 14 d). The read runs at or after the end.

## Load

- `docs/round-6-draft-spec.md` §4.9 REQ-WATCH-1; ADR-111 (the first-finding post-launch
  target); `scripts/live/first-finding-latency.mjs` (`FIRST_FINDING_QUERY` /
  `FIRST_FINDING_SUMMARY` — committed verbatim); `scripts/live/billing-read.mjs`
  (observed-side list-price recomputation); `packages/orchestrator/src/slo.ts` (the
  weekly `slo.review.weekly` probes — Mondays 07:12Z); DEFERRALS **D-R5OPS.1-1**,
  **D-COST.1-2**, **D-SLO.1-5/-7/-8** (after R6FOR.1's verdicts), **D-ECON.1-3/-4**,
  **D-ECON.2-5/-6/-7**, **D-P1.17-2**; `docs/build/runs/R6CLK.1.md` §pre-window glance
  (the 2026-10-28T05:3xZ baseline snapshot this expansion committed).
- Re-confirm at run: `pgboss.job`, `slo_samples`, `fetch_log`, `usage_records`,
  `cap_calibration_reports`, `cost_card_cells`, `analytics_events`,
  `acquisition_events`, `runs`.

## In scope — deliverables, one per named row

Each row runs its committed query over the window and cohort. **Sufficient samples →
close the deferral on evidence. Thin or no data → convert to a standing alert-backed
watch** with `owner:` / `trigger:` / `re-read:` cells in the deferral's dated tail —
that conversion IS the `GD-WATCH.R6` disposition.

| # | Row | Committed query (run verbatim, read-only) | Sample threshold for closure | Close / watch contract |
|---|-----|-------------------------------------------|------------------------------|-------------------------|
| 1 | **D-R5OPS.1-1** first-finding p50 ≤ 4 min (ADR-111) | `DATABASE_URL=<system dsn> node scripts/live/first-finding-latency.mjs` — `FIRST_FINDING_QUERY` + `FIRST_FINDING_SUMMARY`, restricted to signups `ae.at` inside the window | ≥ 3 organic signups with a `finding.viewed` (n≥3 rows in the join; the smoke accounts' rows are excluded by the cohort clause) | p50 ≤ 4 min on n≥3 → close; n<3 → watch: `owner: operator`, `trigger: slo.review.weekly` + a re-read at launch + 28 d |
| 2 | **D-COST.1-2** `import_preview_p95_s` + convert-svc min-scale decision | `select percentile_cont(0.95) within group (order by value_ms)/1000.0 from slo_samples where signal='import_preview_ms' and at > '<window start>' and detail in ('md','txt','html','docx') and (workspace_id is null or workspace_id not in (select id from workspaces where is_test))` — the verbatim `weeklyProbe` in `slo.ts` windowed | ≥ 10 preview samples in the window | p95 ≤ 20 s on n≥10 → close the measurement half and take the convert-svc `min 1→0` decision on the cold-start evidence (in-class flip stays an operator `pulumi up`); n<10 → watch on the same trigger |
| 3 | **D-SLO.1-5** weekly run-success rate ≥ 97% | the `slo.ts` `run_success_rate_24h_pct` `weeklyProbe` windowed to the 14 d | ≥ 10 non-test terminal runs in the window | ≥ 97% on n≥10 → close; n<10 → record the rate honestly + watch; a breach on n≥10 stays open with the failure names |
| 4 | **D-SLO.1-7** `proxy_vs_sdk_cost_runs_over5pct_1h` | the `slo.ts` `proxy_vs_sdk_cost_runs_over5pct_1h` `weeklyProbe` windowed + per-attempt `usage_records` rows for any flagged attempt | ≥ 5 organic completed attempts in the window | 0 divergent attempts on n≥5 → close the re-check half (R6FOR.1's attribution already named the mechanism); divergence found → keep open + attach the per-attempt rows; n<5 → watch |
| 5 | **D-SLO.1-8** `egress_denied_10m` | the `slo.ts` `egress_denied_10m` `weeklyProbe` windowed (`fetch_log` `decision='deny'`, non-test runs) | ≥ 1 organic run in the window for the read to be non-vacuous | 0 denials → close; any denial → enumerate per run/url and keep open (the `api/hello` canary class is already dispositioned by R6FOR.1 — only non-canary denials count) |
| 6 | **D-ECON.1-3** cap calibration | `select * from cap_calibration_reports order by computed_at desc` + `select bucket, count(*) from cost_observations where admissible group by bucket` | `CAP_REFIT_MIN_SAMPLE` = n≥5 admissible in a bucket | a bucket reaching n≥5 with `adopted=true` + `cap_reach_pct≤10` → close the discharged buckets + re-owe the rest; zero admissible → watch (organic traffic is the only admissible source) |
| 7 | **D-ECON.1-4** unmeasured cost cells | `select key, n, fit_version from cost_card_cells where …` for the named cells (`review/standard/base/{s,m}/completed` + balanced/frontier bands) + the `cost_observations` rows behind them | ≥ 1 admissible measured row per named cell | measured cells close per-cell; still-`derived` cells → watch with the same trigger |
| 8 | **D-ECON.2-5** skipped L4 leg | the conditional-reopen check: cross-phase cache-hit evidence in the deferred lever legs' `usage_records` (cache-creation vs cache-read token split per phase) | any admissible lever-leg row in the window | cross-phase cache-hit evidence found → reopen the leg at ≤$3 (the pre-registered condition); none → record "no evidence" + the row stays conditionally parked |
| 9 | **D-ECON.2-6** cost-card/`pricing.json` refit | `cap_calibration_reports` + `cost_observations` admissibility per REQ-SPEC-32(c) buckets (30-day window, n≥5, p95 within the bound) | n≥5 admissible in a priced bucket | refit produced through the estimator machinery → close; no admissible evidence → record no-data + watch (never a hand-edit) |
| 10 | **D-ECON.2-7** lever-A/B restore re-check | the restore read on the moved store (the §"Restore" evaluation machinery, re-run after #9's refit) | #9 must have produced a refit (chained) | p90 ≤ $6 on the refit store → stage `wordCap: 6000` emit-only for the operator (REQ-SPEC-8 pause stands); else record the updated gap + candidates; no refit → watch behind #9 |
| 11 | **D-P1.17-2** funnel metrics | `acquisition_events` (`landing.viewed`, `landing.dropzone_used`, `entry.chosen` where present), `analytics_events` (`signup.completed`, `draft.imported`, `showcase.finding_anchor_viewed`/`showcase.opened`), `runs` (first organic run), `account_exports`/`export_jobs` (first export), `personas` (non-test voices) — all windowed, cohort-claused where a user/workspace join exists | ≥ 3 organic signups in the window for a ratio claim; absolute counts always recorded | record every funnel leg honestly: landing→signup ≥ 6%, drop-zone→signup ≥ 40%, anchor ≤ 60 s ≥ 70% where measurable; a leg below threshold or unmeasurable (empty numerator/denominator) is recorded, not called — the row's remainder converts to watch with per-leg notes |

## The `GD-WATCH.R6` close-or-alert contract (verbatim obligations)

1. Every named row gets a dated tail in `DEFERRALS.md`: `DONE` (evidence cited),
   `PARTIAL` (some cells discharged), or `OPEN` + the watch cells.
2. A row that converts to watch MUST name: `owner:` (who re-reads), `trigger:` (the
   `slo.review.weekly` readout or a dated re-read), and `re-read:` (the next date —
   default launch + 28 d ≈ 2026-11-25T04:0xZ).
3. The `GD-WATCH.R6` LEDGER GATE DECISIONS row records the per-row dispositions and the
   funnel verdict (growth leg above/below/unmeasurable per metric).
4. Organic cohort empty end-to-end is itself the finding: record it, convert every
   cohort-bound row to watch, and say so in the PR — never present zero rows as a pass.

## Out of scope

- Writes of any kind (no reseeds, no hand-dates, no `pulumi up`).
- The watch read itself in R6CLK.1 — this ticket expands the contract only.
- The convert-svc `min 1→0` flip and `wordCap: 6000` staging — operator `pulumi up` /
  REQ-SPEC-8 pause; this ticket produces the evidence, never the mutation.

## Acceptance criteria

- [ ] Every named row closed on windowed evidence or converted to a standing
      alert-backed watch with owner/trigger/re-read (`GD-WATCH.R6` recorded)
      *(live-executed)*
- [ ] The funnel verdict recorded per leg — no empty-cohort passes *(live-executed)*
- [ ] verification green; every new behaviour has a test that fails if it is removed;
      requirement ids stamped in the PR; anything not automatically verifiable is a
      `DEFERRALS.md` row with its compensating control; ADRs written for every deviation
      and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating
      clauses met — dates from the clock, PR checks read and recorded, AC layers stated,
      no living-record pins, protected records only appended, gate words verbatim,
      harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR

REQ-WATCH-1

## Cross-cutting invariants

- Round-6 spec §8 + manifest invariants. Read-only stage: `BEGIN READ ONLY` on the
  system-role DSN; no ticket under REQ-WATCH-1 writes to prod.

## Operating clauses

- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.
