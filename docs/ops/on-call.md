# On-call / incident response — REQ-DEP-2(e) (R6OPS.1, 2026-10-22)

**Update, source review 2026-10-27:** the 2026-10-23 R6OPS.2 amendment in
[`PROD-BRINGUP.md`](../../infra/PROD-BRINGUP.md) records binding the Monitoring notification
channel. The R6OPS.1 unarmed-state observations below remain the 2026-10-22 record and are
superseded by that later receipt. Before relying on alerts, verify the current policy-channel
binding, sink receipt, and the responder's actual notification path. A log entry in the catcher
proves receipt by that service; it does not by itself prove a human was paged.

## Who responds

**The operator** (the repo owner) is the responder for every page. There is no rotation —
pre-launch prod is single-responder. Pages arrive at the operator's alert sink; the runbook
for the firing signal is the first read, never an improvised fix.

## The paging path (as wired — see the armed-state note)

```
signal breach
  ├── worker slo.probe sweep (apps/worker/src/main.ts, ~5 min cadence)
  │     logs `[slo] violation {"signal":…}`            → log-metric `rhema_slo_violations`
  │     AND posts {kind:"slo_violation", signal, value, threshold} to OPS_ALERT_WEBHOOK_URL
  ├── nightly usage.reconcile / assertion jobs (billing-jobs.ts)
  │     post {kind:"balance_divergence"|…} to OPS_ALERT_WEBHOOK_URL
  └── GCP Monitoring AlertPolicy (14 policies, infra/pulumi/monitoring.ts)
        records an incident on the same breach line   → NotificationChannel (when armed)
```

The following observations are the **2026-10-22** R6OPS.1 receipt:

- **Sink then (armed, real receipts):** `OPS_ALERT_WEBHOOK_URL` → the ops alert catcher
  (`rhema-prod-ops-alert-catcher` Cloud Run service). The worker's direct POST lands as an
  `ops_alert_received` log line on the catcher's stdout — verified live (R5OPS.1 + R6OPS.1
  evidence under `docs/build/reports/2026-10-22_R6OPS.1/`).
- **Unarmed half (recorded gap, R6OPS.1):** the 14 `SLO breach — *` + `route 5xx errors`
  AlertPolicies carry `notificationChannels: []` — no `webhook_tokenauth` channel exists
  (H10's binding did not materialize in live state; `rhema:opsAlertWebhookUrl` is unset on
  the prod stack). Policies still record incidents on the dashboard; they do NOT page until
  the operator provisions the channel (`pulumi config set --secret rhema:opsAlertWebhookUrl`
  + `pulumi up` on prod — a prod mutation outside R6OPS.1's authorized scope). The worker's
  direct POST above is the page that reaches the operator in the meantime.
- **Test tenants never page:** every SLO probe excludes `workspaces.is_test` rows (ADR-020)
  — verified live by the R6OPS.1 egress drill's negative control.

## When a page lands

1. Identify the signal from the page body (`signal` / `kind`).
2. Use the mapping below. A signal without a dedicated playbook follows
   [SLO review — Incidents](slo-review.md#incidents).
3. Record the incident in `docs/build/LEDGER.md` OPEN FINDINGS until the budget recovers
   (the slo-review rule: breach ⇒ pause feature work on the owning surface).
4. Recurring breaches of the same signal in consecutive weeks → a named DEFERRALS row or a
   fix ticket — never a silently-raised threshold.

| Signal                                                                                         | Playbook                                                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `egress_denied_10m`                                                                            | [Egress denials](playbooks/egress-denied-spike.md)                         |
| `cost_drift_pct_nightly`, `proxy_vs_sdk_cost_runs_over5pct_1h`, `absorbed_adjustments_pct_24h` | [Cost anomaly](playbooks/cost-anomaly.md)                                  |
| `provider_429_5xx_pct_5m`                                                                      | [Provider errors](playbooks/provider-outage.md)                            |
| `mirror_errors_10m`                                                                            | [Boundary or delivery validation failure](playbooks/boundary-violation.md) |
| `orphaned_runs`                                                                                | [Orphaned runs](playbooks/orphan-storm.md)                                 |

Store sensitive incident evidence privately. Build findings and public readouts must be sanitized
under [SECURITY.md](../../SECURITY.md).
