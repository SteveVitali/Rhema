import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// OBS.1 — the log-based 5xx metrics, alert policy, and dashboard tiles exist in monitoring.ts. As with
// compute.test.ts this is a structural assertion over the Pulumi program's source (the program isn't a
// pure function); the assertions pin the contract the runtime side relies on: the LB-log 5xx filter the
// ticket names (`httpRequest.status>=500`, labelled by backend service), the app structured-line filter,
// the low-cardinality label set (no requestId), and the count>0 alert.

const SRC = readFileSync(fileURLToPath(new URL("./monitoring.ts", import.meta.url)), "utf8");
const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

const lbBlock = SRC.slice(SRC.indexOf('new gcp.logging.Metric(`rhema-${stack}-lb-5xx`'), SRC.indexOf("const route5xxMetric"));
const appBlock = SRC.slice(SRC.indexOf('new gcp.logging.Metric(`rhema-${stack}-route-5xx`'), SRC.indexOf("const route5xxPolicy"));
const policyBlock = SRC.slice(SRC.indexOf("route5xxPolicy"), SRC.indexOf("SLO_ALERT_SIGNALS.map"));

describe("OPS.1 stack-scoped metric names (project-global namespace)", () => {
  it("prod keeps the bare rhema_* names; every other stack suffixes itself (fresh-name 409 on collide)", () => {
    expect(SRC).toContain('const metricPrefix = stack === "prod" ? "rhema" : `rhema_${stack.replace(/-/g, "_")}`;');
    // Every metric name derives from the prefix — no bare-name literal survives off prod.
    for (const k of ["sloViolations", "sloWeekly", "sloWeeklyValue", "lb5xx", "route5xx"]) {
      expect(SRC).toContain(`name: METRIC.${k}`);
    }
  });
  it("alert policies dependOn their log metrics (fresh-descriptor ~10min propagation)", () => {
    expect(policyBlock).toContain("dependsOn: [lb5xxMetric, route5xxMetric]");
  });
});

describe("OBS.1 LB-observed 5xx metric (HOT.1 request logs)", () => {
  it("creates rhema_lb_5xx_requests over http_load_balancer entries with status>=500", () => {
    expect(lbBlock).toContain("name: METRIC.lb5xx");
    expect(lbBlock).toContain('resource.type="http_load_balancer"');
    expect(lbBlock).toContain("httpRequest.status>=500");
    expect(lbBlock).toContain('metricKind: "DELTA"');
    expect(lbBlock).toContain('valueType: "INT64"');
  });

  it("is labelled by backend service + status", () => {
    expect(lbBlock).toContain('key: "backend_service"');
    expect(lbBlock).toContain('backend_service: "EXTRACT(resource.labels.backend_service_name)"');
    expect(lbBlock).toContain('key: "status"');
    expect(lbBlock).toContain('status: "EXTRACT(httpRequest.status)"');
  });
});

describe("OBS.1 app-side 5xx metric (structured line)", () => {
  it("filters on the structured error line's allowlisted fields only", () => {
    expect(appBlock).toContain("name: METRIC.route5xx");
    expect(appBlock).toContain('resource.type="cloud_run_revision"');
    expect(appBlock).toContain("severity=ERROR");
    expect(appBlock).toContain("jsonPayload.status>=500");
    expect(appBlock).toContain("jsonPayload.service:*");
    expect(appBlock).toContain("jsonPayload.msg:*");
  });

  it("labels by service/route/status/msg — never requestId (cardinality)", () => {
    for (const key of ["service", "route", "status", "msg"]) {
      expect(appBlock).toContain(`key: "${key}"`);
      expect(appBlock).toContain(`${key}: "EXTRACT(jsonPayload.${key})"`);
    }
    // requestId must not become a metric label — one label value per request explodes the time series.
    expect(appBlock).not.toContain("requestId");
  });
});

describe("OBS.1 route-5xx alert policy", () => {
  it("fires on count > 0 over the 300s alignment window, on both the LB and app signals", () => {
    expect(policyBlock).toContain('new gcp.monitoring.AlertPolicy(`rhema-${stack}-route-5xx`');
    expect(policyBlock).toContain('metric.type="logging.googleapis.com/user/${METRIC.lb5xx}" AND');
    // logs-based metric time series for an external HTTPS LB land on `l7_lb_rule` ("Application Load
    // Balancer Rule (Logs-based Metrics)") — NOT the log filter's `http_load_balancer` resource type.
    expect(policyBlock).toContain('resource.type="l7_lb_rule"');
    expect(policyBlock).toContain('metric.type="logging.googleapis.com/user/${METRIC.route5xx}" AND');
    expect(policyBlock).toContain('comparison: "COMPARISON_GT"');
    expect(policyBlock).toContain("thresholdValue: 0");
    expect(policyBlock).toContain('alignmentPeriod: "300s"');
    expect(policyBlock).toContain("autoClose");
    expect(policyBlock).toContain("notificationChannels: channels");
    expect(policyBlock).toContain("enabled: true");
  });

  it("is returned alongside the SLO alert policies", () => {
    expect(SRC).toContain("alertPolicies: [...alertPolicies, route5xxPolicy]");
  });
});

describe("OBS.1 dashboard tiles", () => {
  it("charts the LB 5xx count by backend service", () => {
    expect(SRC).toContain('title: "LB 5xx requests by backend service"');
    expect(SRC).toContain("${metricPrefix}_lb_5xx_requests");
    expect(SRC).toContain('"metric.label.backend_service"');
  });

  it("charts the app 5xx count by service + route template", () => {
    expect(SRC).toContain('title: "route 5xx errors (structured log)"');
    expect(SRC).toContain("${metricPrefix}_route_5xx_errors");
    expect(SRC).toContain('"metric.label.service"');
    expect(SRC).toContain('"metric.label.route"');
    expect(SRC).toContain('plotType: "STACKED_BAR"');
  });
});

describe("R6OPS.2 ops-alert NotificationChannel (F-R6OPS.1-1)", () => {
  // The finding: all 14 prod AlertPolicies carried `notificationChannels: []` because
  // `rhema:opsAlertWebhookUrl` was never bound on the prod stack — the channel resource only
  // materializes when that Pulumi SECRET config is set. These pins assert the contract the
  // prod bind relies on: ONE webhook_tokenauth channel to the configured sink URL, referenced
  // by EVERY AlertPolicy construction site.
  const channelBlock = SRC.slice(
    SRC.indexOf("let notificationChannel"),
    SRC.indexOf("const channels"),
  );
  const sloPolicyBlock = SRC.slice(
    SRC.indexOf("SLO_ALERT_SIGNALS.map"),
    // `const apiService =` (the ` =` guard matters — `const apiServiceName` shares the prefix).
    SRC.indexOf("const apiService ="),
  );

  it("creates ONE webhook_tokenauth channel to the configured sink URL, enabled", () => {
    expect(channelBlock).toContain(
      "new gcp.monitoring.NotificationChannel(`rhema-${stack}-ops-webhook`",
    );
    // webhook_tokenauth is the right descriptor — the sink URL is a bare unguessable
    // https://*.run.app (the shared secret travels AS the URL, per the descriptor's
    // "token as a query string parameter" contract; `url` is its only label). The worker
    // already POSTs to the same URL unauthenticated, so no basic-auth leg exists.
    expect(channelBlock).toContain('type: "webhook_tokenauth"');
    expect(channelBlock).toContain("labels: { url: args.opsAlertWebhookUrl }");
    expect(channelBlock).toContain("enabled: true");
    // no second channel construction may appear — policies share the one channel resource.
    expect(SRC.match(/new gcp\.monitoring\.NotificationChannel/g)).toHaveLength(1);
  });

  it("materializes only when the rhema:opsAlertWebhookUrl secret config is bound", () => {
    expect(channelBlock).toContain("if (args.opsAlertWebhookUrl)");
    // The reference list is derived, never a literal: unset ⇒ [] (incident-only policies,
    // clean preview); set ⇒ the one channel's resource name.
    expect(SRC).toContain(
      "const channels = notificationChannel ? [notificationChannel.name] : [];",
    );
    // The URL rides a Pulumi SECRET config — getSecret, never get/getObject (it must stay
    // encrypted in stack state; the plaintext URL lives only in SM + the operator's env).
    expect(INDEX_SRC).toContain('rhemaConfig.getSecret("opsAlertWebhookUrl")');
    expect(INDEX_SRC).toContain("...(opsAlertWebhookUrl ? { opsAlertWebhookUrl } : {})");
  });

  it("is referenced by every AlertPolicy — route-5xx and every per-signal SLO policy", () => {
    // Exactly two AlertPolicy construction sites exist (route-5xx + the SLO_ALERT_SIGNALS map);
    // both must carry the derived `channels` binding verbatim.
    expect(SRC.match(/new gcp\.monitoring\.AlertPolicy/g)).toHaveLength(2);
    expect(policyBlock).toContain("notificationChannels: channels");
    expect(sloPolicyBlock).toContain("notificationChannels: channels");
    // No policy site may bind an empty literal or a hand-rolled channel list.
    expect(SRC).not.toContain("notificationChannels: []");
    expect(SRC.match(/notificationChannels: channels/g)).toHaveLength(2);
  });
});

describe("SLO.1 weekly-review metrics (REQ-ARCH-34)", () => {
  const weeklyBlock = SRC.slice(
    SRC.indexOf('new gcp.logging.Metric(`rhema-${stack}-slo-weekly`'),
    SRC.indexOf('new gcp.logging.Metric(`rhema-${stack}-slo-weekly-value`'),
  );
  const weeklyValueBlock = SRC.slice(
    SRC.indexOf('new gcp.logging.Metric(`rhema-${stack}-slo-weekly-value`'),
    SRC.indexOf("const lb5xxMetric"),
  );

  it("counts every `[slo] weekly` reading on the worker, labelled by signal + status (an empty/unmeasured/error status is visible, never absent)", () => {
    expect(weeklyBlock).toContain("name: METRIC.sloWeekly");
    // The filter threads the AUTONAMED worker service name (rhema-prod-worker-cbdaf0f), not the
    // literal Pulumi base name — a literal filter silently matches zero log entries.
    expect(weeklyBlock).toContain('resource.labels.service_name="${workerServiceName}"');
    expect(weeklyBlock).toContain('textPayload:"[slo] weekly {"');
    expect(weeklyBlock).toContain('metricKind: "DELTA"');
    expect(weeklyBlock).toContain('key: "signal"');
    expect(weeklyBlock).toContain('key: "status"');
  });

  it("distributions the numeric value per signal (a null value extracts nothing)", () => {
    expect(weeklyValueBlock).toContain("name: METRIC.sloWeeklyValue");
    expect(weeklyValueBlock).toContain('valueType: "DISTRIBUTION"');
    expect(weeklyValueBlock).toContain("valueExtractor");
    expect(weeklyValueBlock).toContain('key: "signal"');
    // no `status` label — a distribution point belongs to its signal; the status split lives on the counter.
    expect(weeklyValueBlock).not.toContain('key: "status"');
  });

  it("charts the weekly readings by status and the measured value by signal", () => {
    expect(SRC).toContain('title: "weekly SLO review — readings by status"');
    expect(SRC).toContain('"metric.label.status"');
    expect(SRC).toContain('title: "weekly SLO review — measured value by signal"');
    expect(SRC).toContain("${METRIC.sloWeeklyValue}");
    expect(SRC).toContain('"metric.label.signal"');
  });
});
