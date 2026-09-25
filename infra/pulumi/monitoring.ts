// Monitoring (P1.22 W9; §13.5; REQ-ARCH-34) — the SLO dashboard + alert policies, as code.
//
// Wiring: the worker's `slo.probe` sweep (apps/worker/src/main.ts → @rhema/orchestrator `probeSlos`)
// measures the DB-backed §13.5 signals every 5 minutes and logs ONE structured line per breach —
// `[slo] violation {"signal":...,"value":...,"threshold":...}` — on the worker service's Cloud Run logs.
// This module turns those lines into a `logging.googleapis.com/user/rhema_slo_violations` counter
// (labelled by `signal`), raises one AlertPolicy per probed signal (a breach line IS the breach — the
// probe already applies the §13.5 thresholds, so the policy fires on count > 0), stands up the API
// availability SLO as a Cloud Run request-based `gcp.monitoring.Slo` (the `api_availability_monthly_pct`
// row is measured platform-side, not by the DB probe), and lays out the §13.5 dashboard.
//
// The notification channel is a webhook to the ops-alert sink; its URL is a SECRET (Pulumi secret config
// `rhema:opsAlertWebhookUrl`, mirroring the worker's OPS_ALERT_WEBHOOK_URL Secret Manager container). The
// channel + channel wiring exist only when that config is set — the policies still record incidents
// unnotified on unseeded stages, which keeps `pulumi preview` clean.

import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";

export interface MonitoringArgs {
  readonly stack: string;
  readonly project: pulumi.Input<string>;
  /** the api Cloud Run service name (for the availability Slo's monitored-service labels). */
  readonly apiServiceName?: pulumi.Input<string>;
  /** the api service's region (Cloud Run serviceLabel `location`). */
  readonly region: pulumi.Input<string>;
  /** the ops webhook URL (Pulumi secret config) — the channel exists only when set. */
  readonly opsAlertWebhookUrl?: pulumi.Output<string> | string;
}

/** The §13.5 signals the worker probe measures + logs as `[slo] violation` lines. One policy each. */
export const SLO_ALERT_SIGNALS = [
  "run_start_latency_p95_s",
  "run_success_rate_24h_pct",
  "gate_resume_latency_p95_s",
  "orphaned_runs",
  "mirror_errors_10m",
  "egress_denied_10m",
  "provider_429_5xx_pct_5m",
  "proxy_vs_sdk_cost_runs_over5pct_1h",
  "absorbed_adjustments_pct_24h",
] as const;

export function createMonitoring(args: MonitoringArgs): {
  sloViolationsMetric: gcp.logging.Metric;
  dashboard: gcp.monitoring.Dashboard;
  alertPolicies: gcp.monitoring.AlertPolicy[];
  apiAvailabilitySlo: gcp.monitoring.Slo;
  notificationChannel?: gcp.monitoring.NotificationChannel;
} {
  const { stack, project, region } = args;

  // The notification channel — only when the webhook URL is configured (unseeded stages still get the
  // policies; they record incidents, they just don't page).
  let notificationChannel: gcp.monitoring.NotificationChannel | undefined;
  if (args.opsAlertWebhookUrl) {
    notificationChannel = new gcp.monitoring.NotificationChannel(`rhema-${stack}-ops-webhook`, {
      type: "webhook_tokenauth",
      displayName: `rhema-${stack} ops alert webhook`,
      project,
      labels: { url: args.opsAlertWebhookUrl },
      enabled: true,
    });
  }
  const channels = notificationChannel ? [notificationChannel.name] : [];

  // The log-based counter over the worker's `[slo] violation` lines, labelled by signal.
  const sloViolationsMetric = new gcp.logging.Metric(`rhema-${stack}-slo-violations`, {
    name: "rhema_slo_violations",
    project,
    filter:
      'resource.type="cloud_run_revision" AND ' +
      'resource.labels.service_name="rhema-' + stack + '-worker" AND ' +
      'textPayload:"[slo] violation"',
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "INT64",
      unit: "1",
      labels: [{ key: "signal", valueType: "STRING", description: "the §13.5 signal key" }],
    },
    labelExtractors: {
      // textPayload shape: `[slo] violation {"signal":"key",...}` — extract the signal value.
      signal: 'REGEXP_EXTRACT(textPayload, "\\\\"signal\\\\":\\\\"([a-z0-9_]+)\\\\"")',
    },
  });

  // One alert policy per probed signal — a breach line is already thresholded by the probe; the policy
  // fires on count > 0 over the alignment window.
  const alertPolicies = SLO_ALERT_SIGNALS.map(
    (sig) =>
      new gcp.monitoring.AlertPolicy(`rhema-${stack}-slo-${sig.replaceAll("_", "-")}`, {
        displayName: `SLO breach — ${sig} (${stack})`,
        project,
        combiner: "OR",
        conditions: [
          {
            displayName: `${sig} breached (probe-logged)`,
            conditionThreshold: {
              filter:
                'metric.type="logging.googleapis.com/user/rhema_slo_violations" AND ' +
                'resource.type="cloud_run_revision" AND ' +
                `metric.labels.signal="${sig}"`,
              comparison: "COMPARISON_GT",
              thresholdValue: 0,
              duration: "0s",
              aggregations: [
                { alignmentPeriod: "300s", perSeriesAligner: "ALIGN_COUNT" },
              ],
              trigger: { count: 1 },
            },
          },
        ],
        notificationChannels: channels,
        alertStrategy: { autoClose: "1800s" },
        enabled: true,
      }),
  );

  // API availability — a Cloud Run request-based SLO on the api service (the §13.5 99.9%/month row;
  // measured platform-side, `api_availability_monthly_pct` is unmeasured at the DB layer on purpose).
  const apiService = new gcp.monitoring.GenericService(`rhema-${stack}-api-svc`, {
    serviceId: `api-${stack}`,
    basicService: {
      serviceType: "CLOUD_RUN",
      serviceLabels: {
        service_name: args.apiServiceName ?? `rhema-${stack}-api`,
        location: region,
      },
    },
  });
  const apiAvailabilitySlo = new gcp.monitoring.Slo(`rhema-${stack}-api-availability`, {
    service: apiService.serviceId,
    sloId: `api-availability-${stack}`,
    displayName: "API availability 99.9% monthly (§13.5)",
    goal: 0.999,
    calendarPeriod: "MONTH",
    requestBasedSli: {
      goodTotalRatio: {
        // good: 2xx/3xx/4xx; total: all requests. 5xx burns the budget (error-budget burn >2x alerts).
        goodServiceFilter:
          'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" ' +
          'AND metric.labels.response_code_class!="5xx"',
        totalServiceFilter:
          'metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision"',
      },
    },
  });

  // The §13.5 dashboard — one widget per probe signal's breach counter + the api request latency/error
  // tiles + the availability SLO tile (select_slo_health over the Slo resource, name interpolated after
  // the Slo exists). dashboardJson is the Cloud Monitoring grid layout.
  const dashboard = new gcp.monitoring.Dashboard(`rhema-${stack}-slo-dashboard`, {
    project,
    dashboardJson: pulumi.interpolate`{
      "displayName": ${JSON.stringify(`rhema-${stack} — §13.5 SLOs`)},
      "gridLayout": {
        "columns": "2",
        "widgets": [
          {
            "title": "SLO breach events by signal (probe-logged)",
            "xyChart": {
              "dataSets": [
                {
                  "timeSeriesQuery": {
                    "timeSeriesFilter": {
                      "filter": "metric.type=\"logging.googleapis.com/user/rhema_slo_violations\" resource.type=\"cloud_run_revision\"",
                      "aggregation": {
                        "alignmentPeriod": "300s",
                        "perSeriesAligner": "ALIGN_COUNT",
                        "groupByFields": ["metric.label.signal"]
                      }
                    }
                  },
                  "plotType": "STACKED_BAR"
                }
              ],
              "yAxis": { "label": "breaches", "scale": "LINEAR" }
            }
          },
          {
            "title": "api request count by response class",
            "xyChart": {
              "dataSets": [
                {
                  "timeSeriesQuery": {
                    "timeSeriesFilter": {
                      "filter": "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"rhema-${stack}-api\"",
                      "aggregation": {
                        "alignmentPeriod": "60s",
                        "perSeriesAligner": "ALIGN_RATE",
                        "groupByFields": ["metric.label.response_code_class"]
                      }
                    }
                  },
                  "plotType": "STACKED_AREA"
                }
              ],
              "yAxis": { "label": "req/s", "scale": "LINEAR" }
            }
          },
          {
            "title": "api request latencies (p95)",
            "xyChart": {
              "dataSets": [
                {
                  "timeSeriesQuery": {
                    "timeSeriesFilter": {
                      "filter": "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.labels.service_name=\"rhema-${stack}-api\"",
                      "aggregation": {
                        "alignmentPeriod": "60s",
                        "perSeriesAligner": "ALIGN_PERCENTILE_95"
                      }
                    }
                  },
                  "plotType": "LINE"
                }
              ],
              "yAxis": { "label": "ms", "scale": "LINEAR" }
            }
          },
          {
            "title": "API availability SLO health (99.9% monthly)",
            "scorecard": {
              "timeSeriesQuery": {
                "timeSeriesFilter": {
                  "filter": "select_slo_health(\"${apiAvailabilitySlo.name}\")"
                }
              }
            }
          }
        ]
      }
    }`,
  });

  return { sloViolationsMetric, dashboard, alertPolicies, apiAvailabilitySlo, ...(notificationChannel ? { notificationChannel } : {}) };
}
