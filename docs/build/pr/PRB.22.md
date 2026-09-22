# PRB.22 — Bound review research burn + estimator research addend

> Stacked on #50 (PRB.21). **Merge operator-held.** Live-verify defect ticket for
> D-PRB.21-1: five consecutive `cap_reached` deaths on prod showed verification's
> web-research burn is unbounded and unmodeled by the estimator.

## Summary

- **Per-run web-research budget on the run credential** — `webTools{fetchBudget,
  searchBudget, fetchMaxContentTokens}` resolved at run creation, propagated to the
  egress-proxy `RunContext`, and enforced/tracked per request (fetched content truncated
  to `fetchMaxContentTokens` before context ingress).
- **Estimator research addend** — `buildEstimate` carries a `verification` addend when the
  workflow's resolved toggles enable fact-checking, lifting the derived cap floor for
  claim-priced runs (quick: 73→138 est / 110→207 cap).
- **Stage B live proof (bounded, ≤$5):** run `01M35Q8M2A9YRCE66HZZPSP2X2` on the 701-word
  zero-URL draft — bound propagated end-to-end (`fetchBudget:24, searchBudget:11` asserted
  on the proxy credential), but the run died `cap_reached` at 211 with **zero**
  fetches/searches made: the residual burn is multi-turn context accumulation
  (~151K cache-read/request), not research. Sharpened D-PRB.21-1 (stays OPEN) — the
  unmodeled term is now isolated to baseline context churn + the quick-rigor floor.
- Acceptance deliberately not claimed; ticket's stop-clause honored (no retry, no raise on
  a terminal run). Spend 169 committed credits.

## Test plan

- [x] `pnpm turbo build lint typecheck` — 111/111
- [x] `pnpm test` — 2138 pass / 2 skip
- [x] `pnpm check:licenses` + `check:protocol-markers` — clean
- [x] `check-build-memory.sh .` — 0 violations
- [x] Live: budgets propagated to prod proxy credential; estimator floor lifted; one bounded
      run executed (failed `cap_reached` on non-research burn — documented)

Generated with [Devin](https://devin.ai)
