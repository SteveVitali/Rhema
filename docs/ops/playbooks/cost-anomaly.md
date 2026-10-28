# Playbook: cost anomaly

## Signals

**Alerts:** the following SLO signals identify different kinds of cost discrepancy.

| Signal                               | Meaning                                                                             |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| `cost_drift_pct_nightly`             | Provider-report reconciliation differs from the proxy meter by more than 2%         |
| `proxy_vs_sdk_cost_runs_over5pct_1h` | At least one run attempt with both sources differs by more than 5% in the last hour |
| `absorbed_adjustments_pct_24h`       | Absorbed cap adjustments exceed 5% of gross usage in the trailing day               |

Read `[slo] violation` and the billing alert records. The probe definitions live in [`slo.ts`](../../../packages/orchestrator/src/slo.ts); the 2% proxy/SDK target and the 5% alert threshold serve different purposes.

## Diagnose

1. Compare matching windows and rate-table versions. Distinguish a pricing change, a missing meter row, and a reporting mismatch.
2. For proxy/SDK divergence, group by **run id and attempt** and compare `list_cost_usd` from `source='proxy'` and `source='sdk_estimate'`. Do not combine a restarted attempt's burn with an earlier attempt's SDK summary. Crash/abort behavior can leave real proxy spend without a committed SDK summary.
3. For absorbed adjustments, inspect the ledger and [`circuit-breaker.ts`](../../../packages/ledger/src/circuit-breaker.ts). That function derives the new-run cap multiplier from ledger data and excludes trial-entitlement burn. There is no manual breaker flag in this implementation. Explain any difference between the SLO aggregate and the breaker's eligibility scope before treating it as a failed trip.

## Contain and recover

Escalate an unexplained debit or metering discrepancy to the operator and pause changes to the affected billing surface under the [SLO rule](../slo-review.md). Preserve the rows and report identities needed for reconciliation. The weekly estimator-refit schedule is registered in worker source; there is no `BILLING_REFIT` environment switch. Any schedule or admission change needs a reviewed implementation/deployment.

Reconciliation has two distinct paths in [`reconcile.ts`](../../../packages/ledger/src/reconcile.ts): request-matched reports can issue idempotent user-favorable refunds, while the aggregate provider-window comparison cannot attribute a discrepancy to individual runs and does not issue per-run refunds. Re-running the same request report is a no-op for already processed identities; it is not a generic compensation command.

After the fix, record matched evidence, remaining unmatched rows, and any separately authorized adjustments. Never mark unmeasured or unreconciled figures as verified costs.
