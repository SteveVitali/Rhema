# PRB.25 — Synthesis-phase churn: the last under-modeled estimator term

Spec: `docs/tickets/28p_PRB.25__synthesis-phase-churn-term.md` · run ledger: `docs/build/runs/PRB.25.md`
**Stage A only** — code + measurement at $0. Stage B (one capped live `review/quick`, ≤$8) is operator-gated.

## Summary

PRB.24's Stage B proved the verification bound (verification committed 223/233, both runs) but the
derived cap still couldn't cover a full run: `01M364236…` died `cap_reached` at exactly 783 in `letter`,
and `01M36663…` only delivered at 720/1100 because the operator raised the cap. This ticket measured the
`letter` phase live and priced the real residual.

## The measurement (prod `usage_records`, read-only via the IAP tunnel)

Letter **does** accumulate transcript like pre-bound verification — one `query()` session, 12–13 requests,
cache-read growing 10.7K → 131–135K, two giant generations (19K/24K output). **But:**

- `allowsSubagents: false` / `phaseClass: "generate"` — no subagent channel exists; `research_fanout`
  never applied; **0 fetches / 0 searches**.
- `autoCompactWindow = 80_000` did **not** bound it — requests ran to 131–135K (verification hit 235K
  post-deploy); the setting is not a hard per-request ceiling.
- **Letter metered ≈ committed (119 vs 120)** — the ticket's "~241 metered" was a `spent_credits`
  harvest-lag artifact. Synthesis churn is already honestly priced by `perPhase` + intercept.

The real residual is the **committed-vs-metered delta**: `sdk_stream` rollups miss the fan-out subagent
sessions' token usage (+277K cache-write in verification) and web-search request fees (+24) that the
proxy — the cap's accountant — sees. Delivered run: 720 metered vs 586 committed = **1.23×** whole-run
(verification alone: +112; run 1: +196). The estimator was committed-calibrated while the cap enforces
on metered — the systematic shortfall that killed run 1 at exactly 783.

## What changed

- `packages/protocols/src/estimator.ts` — new `EstimatorSpec.meteredCoverage` applied in
  `estimateCredits` beside `calibrationScale` (matches `InstrumentedMeasurement.measuredCredits`
  semantics — the estimate predicts the metered platform cost; folds compose because `predicted`
  already includes coverage):
  - `METERED_VS_COMMITTED_COVERAGE = 1.25` on `review` + `revise` (measured 1.23 + headroom; revise
    derived-by-similarity)
  - `RESEARCH_WORKFLOW_METERED_COVERAGE = 1.5` on `fact_check` (its whole shape IS intake +
    verification; measured verification-phase ratios 1.48 / 1.88)
  - voice workflows carry none — `profile_voice` was already calibrated to proxy-metered credits
    (PRB.16b), so coverage would double-count
- `packages/run-sheet/src/view.ts` — `whyLine` scale includes `meteredCoverage` for consistency.
- Tests: `estimator.test.ts` (coverage applied; absent ⇒ ×1; fold still reproduces measured anchors),
  `estimate.test.ts` (quick/701w → **652 est / 978 cap**, asserts cap ≥ 720), `lever-matrix.test.ts`,
  `run-routes.test.ts` figures; `server.test.ts` — fact_check's floor (630 min) now always crosses the
  500-credit consent threshold, so it asserts the confirm label + a separate no-consent case covers the
  plain Run label.

## Recalibrated figures (review/quick, 701-word draft, base)

| | est | cap | metered truth |
|---|---|---|---|
| before | 522 | 783 | run 2 delivered at 720 (cap raised to 1100); run 1 died at 783 |
| after | **652** | **978** | covers 720 (+36%) and run-1's ~830 trajectory (+18%) — ≈ the operator's empirical 1100 minus ~10% |

## Ruling (evidence-decided)

- **Bound extension: rejected** — no subagent/tool loop exists to bound; `autoCompactWindow`
  demonstrably did not cap requests; and the phase doesn't need it (metered ≈ committed).
- **`SYNTHESIS_CHURN_CREDITS`: rejected** — letter is already honestly priced; the term would
  misattribute the residual.
- **`METERED_VS_COMMITTED` multiplier: landed** — the structural gap between what the debit channel
  commits and what the meter of record sees.

## Verification

- `pnpm turbo build lint typecheck` — **111/111**
- `pnpm test` — **2162 pass / 2 skip / 0 fail**
- `pnpm check:licenses` — 502 pkgs OK · `check:protocol-markers` — 39 files clean ·
  `check-upstream-diff.mjs` — OK (no protocol file touched) · `check-build-memory.sh` — 0 violations

## Acceptance

| spec item | status | evidence |
|---|---|---|
| Measure letter's request profile before fixing | ✅ | run ledger § "Letter's measured profile" (live pulls above) |
| Bound or price it; document the ruling | ✅ | `meteredCoverage` in `estimator.ts`; ruling in run ledger |
| Derived cap covers real metered total (~720 → ≥ ~800–900) | ✅ model-side | quick/701w cap **978**; Stage B (one capped live run) is operator-gated |
| Deterministic tests + green gates | ✅ | above |
| Stage B live verify | ⏳ gate-pending | operator-gated; ≤$8 ceiling, derived cap only |

**Spend: $0.** No deploy, no live run; prod DB access was read-only SELECTs. mergePolicy=OPERATOR — do not merge.
