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
  /** the worker Cloud Run service name (for the `[slo] *` log-metric filters — see below). */
  readonly workerServiceName?: pulumi.Input<string>;
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
  // STB.2 / D-P0.08b-3 + D-P1.22-1 — now probed off `slo_samples` (migration 0042): the SSE
  // append→flush p95 and the server-side autosave p95. Both alert at the same breach line shape.
  "event_delivery_latency_p95_s",
  "autosave_roundtrip_p95_ms",
  // RES.2 — the weekly Unverified-review rate (ADR-015's revisit trigger: > 1% of Reviews in a week).
  "unverified_review_rate_7d_pct",
  // ONB.1 — REQ-GROWTH-1's amended text-import latency: presign→preview-ready p95 ≤ 20 s, alerting
  // when the rolling 30-minute p95 exceeds 40 s (the probe's `slo_samples.import_preview_ms` window
  // IS the 30-minute duration; the breach line only exists while that window's p95 is breached).
  "import_preview_p95_s",
] as const;

export function createMonitoring(args: MonitoringArgs): {
  sloViolationsMetric: gcp.logging.Metric;
  sloWeeklyMetric: gcp.logging.Metric;
  sloWeeklyValueMetric: gcp.logging.Metric;
  lb5xxMetric: gcp.logging.Metric;
  route5xxMetric: gcp.logging.Metric;
  dashboard: gcp.monitoring.Dashboard;
  alertPolicies: gcp.monitoring.AlertPolicy[];
  apiAvailabilitySlo: gcp.monitoring.Slo;
  notificationChannel?: gcp.monitoring.NotificationChannel;
} {
  const { stack, project, region } = args;

  // Cloud Run services are Pulumi-AUTONAMED — `rhema-prod-worker` deploys as e.g.
  // `rhema-prod-worker-cbdaf0f`, and THAT full name is the `service_name` resource label on every
  // log line + run.googleapis.com metric. Any filter naming the base string silently matches
  // nothing: the violations counter, the weekly metrics, the api-availability Slo and the dashboard's
  // api tiles all read zero until the real name is threaded through (found on prod at SLO.1 close).
  const workerServiceName = args.workerServiceName ?? `rhema-${stack}-worker`;
  const apiServiceName = args.apiServiceName ?? `rhema-${stack}-api`;

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
    filter: pulumi.interpolate`resource.type="cloud_run_revision" AND resource.labels.service_name="${workerServiceName}" AND textPayload:"[slo] violation"`,
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "INT64",
      unit: "1",
      labels: [{ key: "signal", valueType: "STRING", description: "the §13.5 signal key" }],
    },
    labelExtractors: {
      // textPayload shape: `[slo] violation {"signal":"key",...}` — extract the signal value.
      signal: 'REGEXP_EXTRACT(textPayload, "\\"signal\\":\\"([a-z0-9_]+)\\"")',
    },
  });

  // SLO.1 / REQ-ARCH-34 — the weekly review's log-based metrics. The `slo.review.weekly` cron logs one
  // `[slo] weekly {"signal":…,"status":…,"value":…}` line per reading; `rhema_slo_weekly` counts them by
  // signal + status (an `empty`/`unmeasured`/`error` status is VISIBLE on the tile — never silently
  // absent) and `rhema_slo_weekly_value` distributions the numeric value (a null value — an empty or
  // unmeasured reading — extracts nothing, correctly recording no point). The `[slo] weekly-summary`
  // rollup line is the one-glance row; both are what the docs/ops/slo-review.md weekly checklist reads.
  const sloWeeklyMetric = new gcp.logging.Metric(`rhema-${stack}-slo-weekly`, {
    name: "rhema_slo_weekly",
    project,
    filter: pulumi.interpolate`resource.type="cloud_run_revision" AND resource.labels.service_name="${workerServiceName}" AND textPayload:"[slo] weekly {"`,
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "INT64",
      unit: "1",
      labels: [
        { key: "signal", valueType: "STRING", description: "the §13.5 signal key" },
        { key: "status", valueType: "STRING", description: "ok|breach|empty|unmeasured|error" },
      ],
    },
    labelExtractors: {
      signal: 'REGEXP_EXTRACT(textPayload, "\\"signal\\":\\"([a-z0-9_]+)\\"")',
      status: 'REGEXP_EXTRACT(textPayload, "\\"status\\":\\"([a-z_]+)\\"")',
    },
  });
  const sloWeeklyValueMetric = new gcp.logging.Metric(`rhema-${stack}-slo-weekly-value`, {
    name: "rhema_slo_weekly_value",
    project,
    filter: pulumi.interpolate`resource.type="cloud_run_revision" AND resource.labels.service_name="${workerServiceName}" AND textPayload:"[slo] weekly {"`,
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "DISTRIBUTION",
      unit: "1",
      labels: [{ key: "signal", valueType: "STRING", description: "the §13.5 signal key" }],
    },
    // GCP 400s a DISTRIBUTION log metric with no explicit buckets (update 127). Explicit bounds
    // cover the §13.5 scales: ms-class autosave/delivery values up to minute-class latencies.
    bucketOptions: {
      exponentialBuckets: { numFiniteBuckets: 14, growthFactor: 2, scale: 0.01 },
    },
    valueExtractor: 'REGEXP_EXTRACT(textPayload, "\\"value\\":([0-9.eE+-]+)")',
    labelExtractors: {
      signal: 'REGEXP_EXTRACT(textPayload, "\\"signal\\":\\"([a-z0-9_]+)\\"")',
    },
  });

  // OBS.1 — the spec'd log-based 5xx metric, over HOT.1's LB request logs: every request the external
  // HTTPS LB answered 5xx (`httpRequest.status>=500`), labelled by the backend service that served (or
  // failed to serve) it. The LB log is the outermost frame of the trace trail — it sees 5xxs the app
  // never reached (backend timeout, no healthy backend) — and `resource.labels.backend_service_name`
  // is the join key to the backend, while `trace` on the entry joins the app line.
  const lb5xxMetric = new gcp.logging.Metric(`rhema-${stack}-lb-5xx`, {
    name: "rhema_lb_5xx_requests",
    project,
    filter:
      'resource.type="http_load_balancer" AND ' +
      "httpRequest.status>=500",
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "INT64",
      unit: "1",
      labels: [
        { key: "backend_service", valueType: "STRING", description: "the LB backend service name" },
        { key: "status", valueType: "STRING", description: "the httpRequest.status the LB logged" },
      ],
    },
    labelExtractors: {
      backend_service: "EXTRACT(resource.labels.backend_service_name)",
      status: "EXTRACT(httpRequest.status)",
    },
  });

  // OBS.1 — the app-side counterpart: every unhandled/5xx route error emits ONE structured line
  // through the fixed allowlist formatter (@rhema/contracts observability):
  // {"severity":"ERROR","msg":"route_error|route_5xx|…","service":…,"route":"<hono template>",
  // "status":5xx,…}. Cloud Logging parses the JSON stdout line into jsonPayload and hoists the
  // `severity` field to entry severity, so `severity=ERROR` plus the `status>=500` + `service`/`msg`
  // presence predicates match exactly the trail an operator is meant to follow — and nothing else
  // can carry that field shape (the formatter does not accept arbitrary fields). requestId is
  // deliberately NOT a label: one label value per request would explode the metric's cardinality
  // (each distinct value is a new time series). The `route` label is the template — raw paths are
  // user-selected and never reach a log.
  const route5xxMetric = new gcp.logging.Metric(`rhema-${stack}-route-5xx`, {
    name: "rhema_route_5xx_errors",
    project,
    filter:
      'resource.type="cloud_run_revision" AND ' +
      'severity=ERROR AND ' +
      'jsonPayload.status>=500 AND ' +
      'jsonPayload.service:* AND ' +
      'jsonPayload.msg:*',
    metricDescriptor: {
      metricKind: "DELTA",
      valueType: "INT64",
      unit: "1",
      labels: [
        { key: "service", valueType: "STRING", description: "emitting service (api|web|…)" },
        { key: "route", valueType: "STRING", description: "the registered route template, never a raw path" },
        { key: "status", valueType: "STRING", description: "HTTP status emitted" },
        { key: "msg", valueType: "STRING", description: "the structured event name (route_error, route_5xx, …)" },
      ],
    },
    labelExtractors: {
      service: "EXTRACT(jsonPayload.service)",
      route: "EXTRACT(jsonPayload.route)",
      status: "EXTRACT(jsonPayload.status)",
      msg: "EXTRACT(jsonPayload.msg)",
    },
  });

  // OBS.1 — the alert keys the LB-view counter (ADR-055): the LB log is the outermost frame, so it
  // catches 5xxs the app never saw. Any 5xx is the defect signal (the request was user-visible and
  // must leave exactly one trail), so the policy fires on count > 0 over the 300s alignment window.
  // On stages without the ops webhook configured it still records incidents unnotified — the trail
  // is the deliverable; paging is H7's.
  //
  // `resource.type` here is `l7_lb_rule`, NOT the log filter's `http_load_balancer`: the metric
  // selects log entries under the LOGGING resource type, but logs-based metric TIME SERIES for an
  // external HTTPS LB land on the "Application Load Balancer Rule (Logs-based Metrics)" MONITORING
  // resource `l7_lb_rule` (GCP LB docs, monitoring-resource table). Alert/dashboard queries address
  // the time series, not the log. (Update 124 proved `http_load_balancer` is not a Monitoring
  // descriptor — the API 400'd on exactly this field.)
  const route5xxPolicy = new gcp.monitoring.AlertPolicy(`rhema-${stack}-route-5xx`, {
    displayName: `route 5xx errors — LB-observed (${stack})`,
    project,
    combiner: "OR",
    conditions: [
      {
        displayName: "LB request log 5xx",
        conditionThreshold: {
          filter:
            'metric.type="logging.googleapis.com/user/rhema_lb_5xx_requests" AND ' +
            'resource.type="l7_lb_rule"',
          comparison: "COMPARISON_GT",
          thresholdValue: 0,
          duration: "0s",
          aggregations: [{ alignmentPeriod: "300s", perSeriesAligner: "ALIGN_COUNT" }],
          trigger: { count: 1 },
        },
      },
      {
        displayName: "app route 5xx structured error logged",
        conditionThreshold: {
          filter:
            'metric.type="logging.googleapis.com/user/rhema_route_5xx_errors" AND ' +
            'resource.type="cloud_run_revision"',
          comparison: "COMPARISON_GT",
          thresholdValue: 0,
          duration: "0s",
          aggregations: [{ alignmentPeriod: "300s", perSeriesAligner: "ALIGN_COUNT" }],
          trigger: { count: 1 },
        },
      },
    ],
    notificationChannels: channels,
    alertStrategy: { autoClose: "1800s" },
    enabled: true,
  });

  // One alert policy per probed signal — a breach line is already thresholded by the probe; the policy
  // fires on count > 0 over the alignment window.
  const alertPolicies = SLO_ALERT_SIGNALS.map(
    (sig) =>
      new gcp.monitoring.AlertPolicy(`rhema-${stack}-slo-${sig.replace(/_/g, "-")}`, {
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
  // `deleteBeforeReplace`: the serviceId is the resource's physical name — a create-replacement of a
  // renamed monitored service would collide. Deleting a monitored service cascade-deletes its SLOs,
  // so the Slo below carries `deletedWith` to be recreated in lockstep (one `up`, no orphan).
  const apiService = new gcp.monitoring.GenericService(
    `rhema-${stack}-api-svc`,
    {
      serviceId: `api-${stack}`,
      basicService: {
        serviceType: "CLOUD_RUN",
        serviceLabels: {
          service_name: apiServiceName,
          location: region,
        },
      },
    },
    { deleteBeforeReplace: true },
  );
  const apiAvailabilitySlo = new gcp.monitoring.Slo(
    `rhema-${stack}-api-availability`,
    {
      service: apiService.serviceId,
      sloId: `api-availability-${stack}`,
      displayName: "API availability 99.9% monthly (§13.5)",
      goal: 0.999,
      calendarPeriod: "MONTH",
      requestBasedSli: {
        goodTotalRatio: {
          // good: 2xx/3xx/4xx; total: all requests. 5xx burns the budget (error-budget burn >2x alerts).
          // Scoped to the api service — an unscoped filter would fold every Cloud Run service's
          // request count into the api's availability (the pre-SLO.1 filters did exactly that).
          goodServiceFilter: pulumi.interpolate`metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND resource.labels.service_name="${apiServiceName}" AND metric.labels.response_code_class!="5xx"`,
          totalServiceFilter: pulumi.interpolate`metric.type="run.googleapis.com/request_count" AND resource.type="cloud_run_revision" AND resource.labels.service_name="${apiServiceName}"`,
        },
      },
    },
    // deletedWith pairs the replace with the monitored service's (GCP cascade-deletes SLOs with
    // their service); deleteBeforeReplace avoids an sloId collision on the replacement create.
    { deletedWith: apiService, deleteBeforeReplace: true },
  );

  // The §13.5 dashboard — one widget per probe signal's breach counter + the api request latency/error
  // tiles + the availability SLO tile (select_slo_health over the Slo resource, name interpolated after
  // the Slo exists). dashboardJson is the Cloud Monitoring grid layout.
  const dashboard = new gcp.monitoring.Dashboard(`rhema-${stack}-slo-dashboard`, {
    project,
    // Built via pulumi.all + JSON.stringify (not a hand-escaped interpolate template): the provider
    // validates dashboard_json at plan time, and a serialized Output inside a raw string literal
    // produced invalid JSON live (update 75 preview: "invalid character 'l' after object key:value").
    dashboardJson: pulumi.all([apiAvailabilitySlo.name, apiServiceName]).apply(([sloName, apiName]) =>
      JSON.stringify({
        displayName: `rhema-${stack} — §13.5 SLOs`,
        gridLayout: {
          columns: "2",
          widgets: [
            {
              title: "SLO breach events by signal (probe-logged)",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter:
                          'metric.type="logging.googleapis.com/user/rhema_slo_violations" resource.type="cloud_run_revision"',
                        aggregation: {
                          alignmentPeriod: "300s",
                          perSeriesAligner: "ALIGN_COUNT",
                          groupByFields: ["metric.label.signal"],
                        },
                      },
                    },
                    plotType: "STACKED_BAR",
                  },
                ],
                yAxis: { label: "breaches", scale: "LINEAR" },
              },
            },
            {
              // OBS.1 — the LB-observed 5xx count by backend service: the outermost frame of the
              // trace trail, including 5xxs the app never reached. (`l7_lb_rule` — the
              // logs-based-metrics monitoring resource; see the alert policy note.)
              title: "LB 5xx requests by backend service",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter:
                          'metric.type="logging.googleapis.com/user/rhema_lb_5xx_requests" resource.type="l7_lb_rule"',
                        aggregation: {
                          alignmentPeriod: "300s",
                          perSeriesAligner: "ALIGN_COUNT",
                          groupByFields: ["metric.label.backend_service"],
                        },
                      },
                    },
                    plotType: "STACKED_BAR",
                  },
                ],
                yAxis: { label: "5xx requests", scale: "LINEAR" },
              },
            },
            {
              // OBS.1 — the app-side 5xx trail, broken down by service + route template.
              title: "route 5xx errors (structured log)",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter:
                          'metric.type="logging.googleapis.com/user/rhema_route_5xx_errors" resource.type="cloud_run_revision"',
                        aggregation: {
                          alignmentPeriod: "300s",
                          perSeriesAligner: "ALIGN_COUNT",
                          groupByFields: ["metric.label.service", "metric.label.route"],
                        },
                      },
                    },
                    plotType: "STACKED_BAR",
                  },
                ],
                yAxis: { label: "5xx errors", scale: "LINEAR" },
              },
            },
            {
              title: "api request count by response class",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter: `metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision" resource.labels.service_name="${apiName}"`,
                        aggregation: {
                          alignmentPeriod: "60s",
                          perSeriesAligner: "ALIGN_RATE",
                          groupByFields: ["metric.label.response_code_class"],
                        },
                      },
                    },
                    plotType: "STACKED_AREA",
                  },
                ],
                yAxis: { label: "req/s", scale: "LINEAR" },
              },
            },
            {
              title: "api request latencies (p95)",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter: `metric.type="run.googleapis.com/request_latencies" resource.type="cloud_run_revision" resource.labels.service_name="${apiName}"`,
                        aggregation: {
                          alignmentPeriod: "60s",
                          perSeriesAligner: "ALIGN_PERCENTILE_95",
                        },
                      },
                    },
                    plotType: "LINE",
                  },
                ],
                yAxis: { label: "ms", scale: "LINEAR" },
              },
            },
            {
              title: "API availability SLO health (99.9% monthly)",
              scorecard: {
                timeSeriesQuery: {
                  timeSeriesFilter: { filter: `select_slo_health("${sloName}")` },
                },
              },
            },
            {
              // SLO.1 / REQ-ARCH-34 — the weekly-review tile: every `[slo] weekly` reading's status,
              // grouped. An `empty`/`unmeasured`/`error` bar is an honest "not measured" flag; a
              // `breach` bar is the budget-breach the ops runbook's weekly checklist acts on.
              title: "weekly SLO review — readings by status",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter:
                          'metric.type="logging.googleapis.com/user/rhema_slo_weekly" resource.type="cloud_run_revision"',
                        aggregation: {
                          alignmentPeriod: "86400s",
                          perSeriesAligner: "ALIGN_COUNT",
                          groupByFields: ["metric.label.status"],
                        },
                      },
                    },
                    plotType: "STACKED_BAR",
                  },
                ],
                yAxis: { label: "readings", scale: "LINEAR" },
              },
            },
            {
              // SLO.1 — the weekly readout's measured values per signal (one point per signal per
              // week; mean over a 7-day alignment collapses the single weekly sample to itself).
              title: "weekly SLO review — measured value by signal",
              xyChart: {
                dataSets: [
                  {
                    timeSeriesQuery: {
                      timeSeriesFilter: {
                        filter:
                          'metric.type="logging.googleapis.com/user/rhema_slo_weekly_value" resource.type="cloud_run_revision"',
                        aggregation: {
                          alignmentPeriod: "604800s",
                          perSeriesAligner: "ALIGN_MEAN",
                          groupByFields: ["metric.label.signal"],
                        },
                      },
                    },
                    plotType: "LINE",
                  },
                ],
                yAxis: { label: "value", scale: "LINEAR" },
              },
            },
          ],
        },
      }),
    ),
  });

  return {
    sloViolationsMetric,
    sloWeeklyMetric,
    sloWeeklyValueMetric,
    lb5xxMetric,
    route5xxMetric,
    dashboard,
    alertPolicies: [...alertPolicies, route5xxPolicy],
    apiAvailabilitySlo,
    ...(notificationChannel ? { notificationChannel } : {}),
  };
}
