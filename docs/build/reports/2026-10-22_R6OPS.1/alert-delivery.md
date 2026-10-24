# R6OPS.1 — REQ-DEP-2(d): alert-delivery evidence (read-only posture, 2026-10-22)

## The two paging paths and their live state

| Path | Armed? | Evidence |
|---|---|---|
| **Worker direct POST** — `OPS_ALERT_WEBHOOK_URL` env on `rhema-prod-worker-*`, Secret `rhema-prod-ops-alert-webhook-url` v1 → host `rhema-prod-ops-alert-catcher-25012989319.us-central1.run.app` | **YES** | `ops_alert_received` ×488 in the readable window 2026-10-10 → 2026-10-22 (`balance_divergence` ×8 — nightly, latest **2026-10-22T03:15:12Z** today; `slo_violation/run_success_rate_24h_pct` ×288; `slo_violation/unverified_review_rate_7d_pct` ×191; `research_preflight_failed` ×1). Worker env confirmed bound (`OPS_ALERT_WEBHOOK_URL → secretKeyRef rhema-prod-ops-alert-webhook-url:latest`). |
| **GCP Monitoring AlertPolicy → NotificationChannel** | **NO** | `rhema:opsAlertWebhookUrl` is **unset** on the prod stack (`pulumi config --stack prod` — key absent) ⇒ `monitoring.ts` `channels=[]` ⇒ **all 14 policies `notificationChannels: []`**; `gcloud alpha monitoring channels list` returns none. Policies record incidents on the dashboard but **page nothing**. Binding the channel is a prod config write outside R6OPS.1's authorized mutation set (scratch instance + canary only). |

## Per-policy status (all 14, live-read 2026-10-22, all `enabled:true`, all `notificationChannels:[]`)

| AlertPolicy | Worker-side equivalent (the page that reaches the operator) | Receipt |
|---|---|---|
| SLO breach — run_start_latency_p95_s | `probeSlos` tick → `slo_violation` POST (same signal key) | mechanism proven (see below); no receipt — signal has not breached |
| SLO breach — run_success_rate_24h_pct | same | **288 receipts**, latest in window 2026-10-16T23:00:18Z |
| SLO breach — gate_resume_latency_p95_s | same | no receipt — not breached in window |
| SLO breach — orphaned_runs | same | no receipt — not breached |
| SLO breach — mirror_errors_10m | same | no receipt — not breached |
| SLO breach — egress_denied_10m | same | no receipt — not breached (drill canary rows are `NOT_FROM_TEST_RUN`-excluded by design) |
| SLO breach — provider_429_5xx_pct_5m | same | no receipt — not breached |
| SLO breach — proxy_vs_sdk_cost_runs_over5pct_1h | same | no receipt — not breached |
| SLO breach — absorbed_adjustments_pct_24h | same | no receipt — `empty` in latest probe (no data) |
| SLO breach — event_delivery_latency_p95_s | same | no receipt — not breached |
| SLO breach — autosave_roundtrip_p95_ms | same | no receipt — not breached |
| SLO breach — unverified_review_rate_7d_pct | same | **191 receipts** in window |
| SLO breach — import_preview_p95_s | same | no receipt — `empty` (no imports in window) |
| route 5xx errors — LB-observed (lb5xx + route5xx composite) | **none** — no worker-side emitter for this signal | **no paging path at all** — incident-only until the channel is armed |

Plus the non-AlertPolicy emitters the worker pages through the same sink: `balance_divergence`
(nightly assertion — **receipt today 2026-10-22T03:15:12Z**), `cost_drift_pct_nightly`
(`measured_elsewhere` — pages via usage.reconcile on >2%), `research_preflight_failed` (×1
receipt in window).

## Verdict — honest

- **Worker→sink delivery: live-executed, proven.** 488 receipts including one today. Every
  DB-probed SLO signal shares the identical `alertSink` POST path — 2 of 13 signals have
  receipts in the readable window; the remaining 11 have never breached, so no per-signal
  receipt exists to record (fabricating one would be a fake green).
- **Monitoring policy→channel paging: absent.** Not a synthetic-trigger failure — the channel
  resource does not exist (`rhema:opsAlertWebhookUrl` never set on prod; H10's "alert sink
  bound" evidently meant the worker env, which IS bound). Recorded as finding
  **F-R6OPS.1-1**: page path for the 14 GCP AlertPolicies is incident-only; the operator act
  is `pulumi -C infra/pulumi config set --secret rhema:opsAlertWebhookUrl <catcher-url>
  --stack prod && pulumi up --stack prod` — one config key arms all 14 policies
  (`monitoring.ts` already wires `notificationChannels: channels` on every policy).
- **`route 5xx errors — LB-observed`**: uniquely uncovered — it has no worker-side emitter
  either; until the channel is armed it produces incidents with zero page path.
