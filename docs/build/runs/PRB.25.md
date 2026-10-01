# PRB.25 — Synthesis-phase churn: the last under-modeled estimator term (run ledger)

- **Ticket:** `docs/tickets/28p_PRB.25__synthesis-phase-churn-term.md` (seq 28p — inserted
  2026-09-23; defect-repair, G3 stays parked).
- **Branch:** `stevevitali/prb-25-synthesis-churn` (stacked on
  `stevevitali/prb-24-intra-phase-transcript`, PR #53; base commit `1f852ab`).
- **Scope executed:** **Stage A only** — code + measurement at $0. Stage B (one capped live
  `review/quick` on draft `01M35KC9K6N6R2P6EJD19T30E9`, ≤$8 ceiling, `pulumi up`) stays
  OPERATOR-GATED — no deploy, no live run, no spend this run.
- **Prod evidence:** pulled live from the `rhema` DB via the IAP tunnel `127.0.0.1:15433`
  (`usage_records` for runs `01M364236C8856Y5DJV28ZDSQT` + `01M36663QG1ZJ7VEZ036Y54NSG`;
  read-only SELECTs — $0 spend, no mutation).

## Deferrals read

`docs/tickets/DEFERRALS.md` — **D-PRB.21-1 is DONE** (PRB.24 Stage B run 2 delivered; the
residual pricing gap is recorded on the row for G3). This ticket does not reopen it — it prices
the residual the row carried forward. **D-PRB.16-5** (committed-vs-proxy accounting) is DONE by
operator ruling: uncommitted burn is cap-enforcement metering absorbed as platform cost; users
are invoiced on committed debits only; the ~18% list-vs-platform divergence is by-design. No
`OPEN` row is unblocked by this ticket; no new row opened (Stage B is the ticket's own
operator-gated half, carried in the ticket's `Live stage`).

## Requirements / acceptance criteria (Stage A)

1. **Measure letter's request profile** — per-request breakdown in this ledger BEFORE fixing:
   request count, per-request cache-read, fetches; does the phase accumulate transcript like
   verification did; is it `allowsSubagents`; did `autoCompactWindow` fire for it.
2. **Bound or price it** (evidence decides) — (a) extend the bound if the phase has its own
   subagent/tool loop; (b) `SYNTHESIS_CHURN_CREDITS` and/or a `METERED_VS_COMMITTED`
   multiplier so the derived cap covers a full run's real metered total (~720 → cap needs
   ≥ ~800–900); (c) document the ruling.
3. Deterministic tests + `turbo build lint typecheck` + `pnpm test` + memory validator green.

## Letter's measured profile — the spec's question, answered (pre-fix)

Phase-end timestamps come from the `sdk_stream`/`sdk_estimate` step rows; `source='proxy'` rows
are unattributed (`step_id` NULL) and are windowed by those boundaries.

### Run `01M36663QG1ZJ7VEZ036Y54NSG` — delivered, est 522 / cap 1100 (operator-raised)

`usage_records` by source: `proxy` 94 rows / **720cr** (the meter of record = `spent_credits`);
`sdk_stream` 5 step rows / **586cr** (the committed debits); `sdk_estimate` 5 rows / 860cr.

| phase | proxy reqs | metered cr | cache-read | avg/req | max/req | fetch/search | committed | Δ metered−committed |
|---|---|---|---|---|---|---|---|---|
| intake | 14 | 104 | 0.50M | 36K | 104K | 0/1 | 79 | **+25** |
| craft | 12 | 69 | 0.56M | 46K | 89K | 0/0 | 70 | −1 |
| verification | 45 | 345 | 2.35M | 52K | 128K | 26/24 | 233 | **+112** |
| argument | 10 | 83 | 0.41M | 41K | 106K | 0/0 | 84 | −1 |
| letter | 13 | 119 | 0.86M | 66K | 131K | 0/0 | 120 | **−1** |
| **total** | **94** | **720** | 4.68M | | | 26/25 | **586** | **+134** |

### Run `01M364236C8856Y5DJV28ZDSQT` — died `cap_reached` at exactly 783 (est 522 / cap 783)

| phase | proxy reqs | metered cr | max/req | fetch/search | committed | Δ |
|---|---|---|---|---|---|---|
| intake | 13 | 82 | 104K | 0/0 | 83 | −1 |
| craft | 12 | 83 | 105K | 0/0 | 83 | 0 |
| verification | 22 | 419 | **235K** | 22/25 | 223 | **+196** |
| argument | 12 | 89 | 109K | 0/0 | 90 | −1 |
| letter (partial — died mid-phase) | 12 | 110 | 135K | 0/0 | — | — |
| **at death** | **71** | **783** | | | 479 | |

### What letter actually does

- **Yes, letter accumulates transcript exactly like pre-bound verification** — one `query()`
  session (`sdk-adapter.ts` forwards no `resume`), 12–13 sequential requests, cache-read
  growing monotonically **10.7K → 131–135K** as dossier reads + `Write` payloads accumulate.
  Two of the requests are huge single generations (19K and 24K output tokens — the letter
  draft itself, ~3.5–4.7 min each).
- **No subagent/tool loop to bound:** `letter` is `allowsSubagents: false`,
  `phaseClass: "generate"` in `manifests/review.ts` — the `research_fanout` contract never
  applied (it's injected only for `allowsSubagents` phases), the hook would reject `Agent`,
  and the phase made **0 fetches / 0 searches** in either run.
- **`autoCompactWindow = 80_000` did NOT bound it:** per-request cache-read reached 131–135K
  (and run 1's verification hit **235K** post-deploy) — the flag-tier setting did not act as a
  hard per-request ceiling in the deployed build (each run shows only 1 `context.compacted`
  event; compaction is a between-turns summarizer, not a request-size cap). Session-wide in
  principle, unproven as a bound in practice.
- **But letter is already honestly priced:** metered 119 vs committed 120 (run 2); run 1's
  partial letter had burned 110 of the ~120 it needed. The ticket's "~241 metered vs 120
  committed" was a **harvest-lag artifact** — `runs.spent_credits` posts periodically, so the
  "479→720 during letter" reading conflated earlier-phase proxy burn that landed late. The
  per-request rows (timestamped at request completion) attribute only **119cr** to the letter
  window — covered by its 120 committed.

### Where the residual actually lives — committed-vs-metered delta, concentrated in verification

Token-level diff (run 2, verification window): proxy observed **+277K cache-write**,
+310K cache-read, +36K input, +25K output, and **+24 web-search request fees** beyond what the
`sdk_stream` step rollup recorded. The PRB.24 `research_fanout` moved research into subagent
sessions whose usage (and the server-tool search fees) never reaches the committed-debit
channel; the egress proxy — the meter of record and the cap's accountant — sees all of it.
Intake shows the same shape at smaller scale (+25: io under-report + 1 search). Non-research
phases (craft/argument/letter) reconcile to ±1.

So: **the estimate (committed-calibrated) tracks the debit channel; the cap meters the proxy
channel; the gap is structural.** Delivered run: 720/586 = **1.23×** whole-run; run 1's
through-argument trajectory was ~1.4× (its un-fanned-out verification loop metered 419 vs 233
committed — a single request ballooned to 235K). The derived cap `ceil(1.5 × est)` = 783 was
~50–150cr short of the real metered total — exactly the observed deaths.

## Fix-shape ruling (AC2c)

Evidence-ranked:

- **(a) Extend the context bound to synthesis — REJECTED.** There is nothing to bind to:
  `allowsSubagents: false` means no subagent channel exists; `autoCompactWindow` did not
  demonstrably bound requests anyway (135K > 80K observed). And the phase doesn't need it —
  metered ≈ committed, already inside the `perPhase`+intercept pricing.
- **`SYNTHESIS_CHURN_CREDITS` — REJECTED as a term.** Letter's churn is already priced
  (119 metered vs 120 committed). Adding a synthesis-specific constant would misattribute the
  residual and over-price the phase.
- **`METERED_VS_COMMITTED` coverage multiplier — LANDED (ticket option b).** A
  `meteredCoverage` field on `EstimatorSpec`, applied in `estimateCredits` alongside
  `calibrationScale`. This is also the fold's own semantics:
  `InstrumentedMeasurement.measuredCredits` is defined as the PROXY-metered platform cost —
  the estimator was always supposed to predict the metered figure; the committed-vs-metered
  gap was the unmodeled remainder. `foldInstrumentedRun` composes correctly: `predicted`
  includes coverage, so the fold's `calibrationScale` absorbs any residual error.
  - `review`/`revise`: `METERED_VS_COMMITTED_COVERAGE = 1.25` — the delivered run's measured
    ratio 720/586 = 1.23 plus headroom. (revise is derived-by-similarity — same research
    channel via `perMoveWithResearch`; its only observed run's ~2× ratio was polluted by
    debug-phase burn, so no clean anchor exists.)
  - `fact_check`: `RESEARCH_WORKFLOW_METERED_COVERAGE = 1.5` — the delta concentrates in the
    research loop, and fact_check IS intake + verification; measured verification-phase ratios
    were 345/233 = 1.48 (run 2) and 419/223 = 1.88 (run 1).
  - `profile_voice`/`refresh_voice`/`calibrate_voice`: **no coverage** — PRB.16b already
    calibrated `profile_voice` to PROXY-metered credits ("0.09/word sizes the estimate to the
    measured burn"); applying coverage would double-count.

### Recalibrated figures (review/quick, 701-word draft, base tier)

- estimate: ceil(868.412 × 1.25 × 0.6) = **652** (was 522)
- derived cap: ceil(652 × 1.5) = **978** (was 783) — covers the delivered run's metered 720
  (+36% margin) AND run 1's ~810–830 trajectory (+18% margin); ≈ the operator's empirical
  1100 raise minus ~10%. No operator raise needed if the bound holds.
- Standard/701w all-toggles: ceil(1306.123 × 1.25) = **1633** est / 2450 cap.
- fact_check/standard (10 claims): 490 → **735** est.

## Plan

- `packages/protocols/src/estimator.ts` — `EstimatorSpec.meteredCoverage`, the two constants,
  apply in `estimateCredits`; document on the affected specs.
- Tests: `estimator.test.ts` (coverage applied, tier/rigor composition, fold reproduces
  measured), `estimate.test.ts` (quick 701w → 652/978; toggle deltas), `lever-matrix.test.ts`
  (golden repriced), `run-routes.test.ts` (server-derived figures).

## Test matrix

| AC | test |
|---|---|
| letter profile measured before fix | this ledger § "Letter's measured profile" (live `usage_records` pulls) |
| coverage multiplier prices the metered residual | `estimator.test.ts` (spec field applied; absent → ×1), `estimate.test.ts` (652/978) |
| derived cap covers the real metered total (~720; ≥ ~800–900 headroom) | `estimate.test.ts` — cap 978 ≥ 720 delivered & ~830 trajectory |
| fold composes (calibrationScale absorbs coverage) | `estimator.test.ts` — folded spec reproduces the measured anchor exactly |
| figures consumers updated | `lever-matrix.test.ts`, `run-routes.test.ts` |
| green gates | turbo build/lint/typecheck, `pnpm test`, licenses, protocol-markers, build-memory |

## Progress

- [x] Branch `stevevitali/prb-25-synthesis-churn` created from `1f852ab` (PRB.24 tip).
- [x] Live `usage_records` evidence pulled (IAP tunnel up; read-only; $0).
- [x] Letter's per-request profile written BEFORE the fix (above).
- [x] Ruling documented — `meteredCoverage` multiplier, synthesis term rejected.
- [x] Implemented: `EstimatorSpec.meteredCoverage` + `METERED_VS_COMMITTED_COVERAGE` 1.25
  (review/revise) + `RESEARCH_WORKFLOW_METERED_COVERAGE` 1.5 (fact_check), applied in
  `estimateCredits`; `whyLine` scale includes coverage.
- [x] Tests updated/added; all targeted suites green.
- [x] `pnpm turbo build lint typecheck` — 111/111.
- [x] `pnpm test` — 2162 pass / 2 skip, 0 fail.
- [x] `pnpm check:licenses`, `check:protocol-markers`, `check-upstream-diff.mjs`,
  `check-build-memory.sh` — all clean.

## Gap table (spec → evidence)

| spec item | status | evidence |
|---|---|---|
| AC1 — measure letter's request profile before fixing (requests, cache-read, fetches; `allowsSubagents`?; did `autoCompactWindow` fire?) | DONE | § "Letter's measured profile": 13 reqs (run 2) / 12 (run 1 partial), cache-read 10.7K→131–135K, 0 fetches/searches; `manifests/review.ts` `allowsSubagents: false` + `phaseClass: "generate"`; requests exceeded the 80K setting (131–135K; verification hit 235K) ⇒ the window did not bound per-request context |
| AC2 — bound or price it, evidence decides; document the ruling | DONE | § "Fix-shape ruling": (a) rejected (no subagent channel exists; window didn't fire; metered ≈ committed); `SYNTHESIS_CHURN_CREDITS` rejected (letter already honestly priced — 119 vs 120); **(b) `meteredCoverage` multiplier landed** — `estimator.ts` field + constants + `estimateCredits` application |
| AC2b — derived cap covers a full run's real metered total (~720 → ≥ ~800–900 headroom) | DONE (model-side; Stage B proves live) | quick/701w: est 522→652, cap 783→**978** ≥ delivered-run 720 and run-1's ~830 trajectory; `estimate.test.ts` asserts cap ≥ 720 |
| AC3 — deterministic tests + green gates | DONE | estimator/estimate/lever-matrix/run-routes/server figure updates + a dedicated coverage test; turbo 111/111; `pnpm test` 2162/0-fail; licenses + protocol-markers + upstream-diff + build-memory all clean |
| Out of scope honored | DONE | no deploy, no live run, no merges, no protocol-text edits, no pricing-copy changes; $0 spend (read-only SELECTs only) |

## Evidence log

- Prod `usage_records` pulls (IAP tunnel `127.0.0.1:15433`, read-only): per-source totals
  (proxy 94 rows/720cr; sdk_stream 5/586; sdk_estimate 5/860) and per-phase windowed
  breakdowns for both runs — tables above. Token-level delta decomposition: verification
  proxy-vs-stream +277K cache-write / +310K cache-read / +24 searches; craft/argument/letter
  reconcile to ±1.
- `pnpm vitest run` (targeted): estimator 19, estimate 7, lever-matrix 8, run-routes 20,
  server 57 — all green.
- `pnpm turbo build lint typecheck` — 111/111 successful.
- `pnpm test` — 277 files, **2162 pass / 2 skip / 0 fail**.
- `pnpm check:licenses` — 502 packages OK; `pnpm check:protocol-markers` — 39 files clean;
  `node scripts/check-upstream-diff.mjs` — OK (no protocol file touched);
  `bash check-build-memory.sh .` — 0 violations.

## Evidence report

**Letter's measured profile (the ticket's question).** The synthesis phase IS a
single-session accumulating loop — 12–13 requests, cache-read growing monotonically
10.7K → 131–135K, dominated by two giant generations (19K/24K output tokens). But it has
**no subagent channel** (`allowsSubagents: false`, `phaseClass: "generate"`) and ran **zero**
fetches/searches; `autoCompactWindow = 80_000` did not cap its requests (observed up to 135K;
verification hit 235K post-deploy — the setting is not a hard per-request ceiling). Crucially,
**letter metered ≈ committed** (119 vs 120 on the delivered run; ~110 of ~120 on the died run)
— the "~241 metered" figure in the ticket was a harvest-lag artifact of `spent_credits`
posting late. Synthesis churn was never under-priced; the perPhase+intercept terms cover it.

**The real residual — committed-vs-metered delta, concentrated in verification.** The
`sdk_stream` committed rollup misses what the proxy (cap accountant, meter of record) sees:
the PRB.24 fan-out's subagent-session token usage (+277K cache-write in one phase) and the
web-search request fees (+24). Delivered run: 720 metered vs 586 committed = **1.23×**; the
died run's trajectory was ~1.4×. The estimator was calibrated to committed figures while the
cap enforces on metered — the systematic ~50–150cr shortfall that killed `01M364236…` at
exactly 783.

**Fix landed (ticket option b — `METERED_VS_COMMITTED` multiplier).** `EstimatorSpec.
meteredCoverage` applied inside `estimateCredits` next to `calibrationScale` — the estimate
now predicts the proxy-metered platform cost, which is exactly what
`InstrumentedMeasurement.measuredCredits` anchors folds to (so `foldInstrumentedRun` composes:
`predicted` includes coverage, `calibrationScale` absorbs residual). `review`/`revise` = **1.25**
(measured 1.23 + headroom); `fact_check` = **1.5** (research-only shape; measured
verification-phase ratios 1.48/1.88); voice workflows carry none (PRB.16b already calibrated
to proxy-metered credits — coverage would double-count).

**Recalibrated:** review/quick on the 701-word draft reprices **522 → 652 est / 783 → 978
cap** — covering the delivered run's real 720 (+36% margin) and the died run's ~830 trajectory
(+18%), ≈ the operator's empirical 1100 raise minus ~10%. fact_check's floor now exceeds the
500-credit consent threshold at every claim count (min 630) — the launcher test now asserts
the confirm label for it (a real product consequence worth noting for G3's pricing review:
quick review's honest cap is ≈ $9.78).

**Not taken:** `SYNTHESIS_CHURN_CREDITS` (letter is already honestly priced — the term would
misattribute the residual); a synthesis context bound (no subagent/tool loop exists to bound;
`autoCompactWindow` demonstrably did not bound requests); cap-side multiplier in
`capFromEstimate` (would break the spec'd `cap = ceil(1.5 × estimate)` invariant in §5.6 item 4).

**Stage B (operator-gated, NOT run):** one `review/quick` on draft `01M35KC9K6N6R2P6EJD19T30E9`
at the derived cap only (expected ~978 — server-derived, no raise). Success = `delivered` +
`spent ≤ cap`. On `cap_reached`: stop, record, the honest-floor finding goes to G3.

**Deferrals:** none opened; **D-PRB.21-1 stays DONE** (this ticket prices the residual its row
carried forward — it is not reopened).

**Spend this run: $0.** No deploy, no live run; prod DB access was read-only SELECTs.

## Stage B — live verify (operator run, 2026-09-23)

Deployed via Pulumi update 73 (api `b889b52b`, web `ad6661e3`, worker `f4e0fb87`,
run-task `0f22f9e2`). Verify run `01M37GSGXCQ9ACSS8G670VVQBY` — `review`/`quick` on draft 6,
**derived cap only** (est 652 / cap 978, no operator raise).

**Result: `failed` / `cap_reached` at 16:55Z in `letter` — 985 metered vs cap 978.**

| Phase | Committed | Delivered run `01M36663…` |
|---|---|---|
| intake | 81 | 79 |
| craft | 65 | 70 |
| verification | **389** | 233 |
| argument | 96 | 84 |
| letter | failed | 120 |

Committed 631; metered 985; 3 compactions; usage: verification top-level 2 reqs / 3.2M
cache-read / ~1072cr + 72 unattributed editor reqs / 4.47M cache-read; 32 fetches / 33
searches total.

**Reading — variance is the unmodeled term:** same draft + config produced verification
committed 233 vs 389 (+67%) across two runs; whole-run metered 720 vs ~985+. The 1.25×
`meteredCoverage` was calibrated on the delivered run; this run needed ≈1.35× through
verification alone plus synthesis headroom. No static multiplier prices this workload
tightly — honest quick pricing is ~$7–10 with ±30% run variance. **Conclusion for G3:**
engineering bounds landed and work (verification completes consistently now); what remains
is a pricing-model/product ruling — per-run headroom policy or honest advertised floors —
not another estimator notch. Stop-on-failure honored; no retry.
