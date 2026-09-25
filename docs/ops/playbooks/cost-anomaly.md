# Playbook: cost anomaly (§13.5 — cost drift / proxy-vs-SDK / absorbed adjustments)

**Alerts:**
- `cost_drift_pct_nightly` — nightly `usage.reconcile` vs the provider report; > 2% pages via alertSink.
- `proxy_vs_sdk_cost_runs_over5pct_1h` — a run whose SDK-reported cost differs from the proxy meter of record by > 5%.
- `absorbed_adjustments_pct_24h` — absorbed cap adjustments > 5% of gross usage (the §14.4 circuit-breaker floor).

## Detect

- `[slo] violation` lines for the two probe signals; `[worker] billing alert:` lines for reconcile drift and balance divergence.

## Diagnose

1. **Cost drift > 2%:** pull the reconcile report — which run_ids diverged? Distinguish: (a) rate-table drift (rates.ts version vs the provider's actual pricing — check the rate-table version stamped on the diverging `usage_records`), (b) metering gaps (proxy rows missing for SDK-reported tokens — the proxy's meter-of-record pipeline), (c) an upstream billing change.
2. **Per-run ±2% breach:** compare the run's `usage_records` — `source='proxy'` (meter of record) vs `source='sdk_estimate'` (SDK-reported). A systematic offset = cache-token accounting drift; a single-run spike = a retry/abort double-count.
3. **Absorbed adjustments > 5%:** cap overruns the platform ate — read `credit_ledger` `kind='adjustment' and reason='absorbed'` against gross debits in the window. The §14.4 circuit breaker should already have raised the cap multiplier to 2× for new runs; verify `circuit-breaker.ts` tripped.

## Contain

- If the circuit breaker did not trip on an absorbed-share breach, raise the multiplier manually (the breaker flag) before anything else — a leaky cap is the unbounded-money-loss row.
- Drift-only incidents don't block launches; they block billing trust — freeze the estimator refit (`BILLING_REFIT` cron) until the divergence is explained so a bad fold doesn't poison estimates.

## Recover + post-incident

- Land the rate-table or metering fix; rerun `usage.reconcile` — user-favourable refunds apply automatically on the rerun.
- Record the corrected figures; the §17 cost claims only cite rows marked reconciled.
