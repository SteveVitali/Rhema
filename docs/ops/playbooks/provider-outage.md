# Playbook: provider errors

**Alert:** `provider_429_5xx_pct_5m` exceeds 5. The probe calculates the share of allowed `fetch_log` responses with HTTP 429 or 5xx in the trailing five minutes, excluding test tenants. Its source is [`packages/orchestrator/src/slo.ts`](../../../packages/orchestrator/src/slo.ts).

## Diagnose

1. Identify affected runs and correlate the worker's `[slo] violation` with proxy request/status records. Distinguish provider throttling, provider failure, proxy failure, and an application deploy regression. A status count alone does not establish which service caused it.
2. Check the provider's status report and the [proxy health procedure](../proxy-ha.md). Any inference canary needs an approved spend bound; do not repeatedly launch paid runs to diagnose an outage.
3. Inspect failed/active attempts and user-visible run events before deciding whether recovery or cancellation is appropriate.

## Contain and recover

The specification calls for an outage banner and a bounded launch pause. **Source review on 2026-10-27 found no implemented global `launch_paused` switch or operator outage-banner control.** The trial kill switch is a different, narrower control. Escalate the admission-control gap to the operator; do not invent a configuration key or assume the SLO probe pauses new launches. The [readiness review](../../open-source-readiness.md) tracks this limitation.

Use the reviewed incident response for the affected layer: restore a known-good proxy/application deployment when the regression is local, or monitor provider recovery when it is upstream. Preserve metering and credential enforcement throughout. Recovery is established by fresh response samples and affected-run disposition, not just a cleared dashboard tile.

If the incident persists beyond the specification's two-hour bound, record the breach and the operator's user-communication decision. Notification to users is an explicit incident action, not an automatic consequence of this probe.

## After the incident

Record affected run ids, outcome, measured spend, and any support/refund decisions in the restricted incident record. Use the normal ledger paths for adjustments; do not infer a refund amount from HTTP errors. Follow the [cost-anomaly playbook](cost-anomaly.md) when metering or provider-report divergence also occurred, and publish only a sanitized incident summary.
