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
    const ret = SRC.slice(SRC.indexOf("alertPolicies: ["), SRC.indexOf("apiAvailabilitySlo,"));
    for (const name of ["alertPolicies,", "route5xxPolicy", "apiBurnRatePolicy", "uptimeFailPolicy", "uptimeAbsentPolicy"]) {
      expect(ret).toContain(name);
    }
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
  // by EVERY AlertPolicy construction site. 273_R6OPS.5 (RH-27) added a second channel
  // resource (the email leg) plus the config-bound mobile leg — the count pins below name the
  // new totals honestly.
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
    // Exactly TWO channel resources exist — the webhook above + the RH-27 email channel below.
    // The mobile leg is deliberately NOT a resource (GCP's API cannot mint `mobile_app`).
    expect(SRC.match(/new gcp\.monitoring\.NotificationChannel/g)).toHaveLength(2);
  });

  it("materializes only when the rhema:opsAlertWebhookUrl secret config is bound", () => {
    expect(channelBlock).toContain("if (args.opsAlertWebhookUrl)");
    // The reference list is derived, never a literal: unset ⇒ [] (incident-only policies,
    // clean preview); set ⇒ every configured channel's resource name.
    expect(SRC).toContain("const channels: pulumi.Input<string>[] = [");
    expect(SRC).toContain("...(notificationChannel ? [notificationChannel.name] : []),");
    // The URL rides a Pulumi SECRET config — getSecret, never get/getObject (it must stay
    // encrypted in stack state; the plaintext URL lives only in SM + the operator's env).
    expect(INDEX_SRC).toContain('rhemaConfig.getSecret("opsAlertWebhookUrl")');
    expect(INDEX_SRC).toContain("...(opsAlertWebhookUrl ? { opsAlertWebhookUrl } : {})");
  });

  it("is referenced by every AlertPolicy — route-5xx, per-signal SLO, burn-rate, uptime, absence", () => {
    // Five AlertPolicy construction sites exist: route-5xx + the SLO_ALERT_SIGNALS map + the
    // RH-20 burn-rate policy + the RH-22 uptime-failure policy + the RH-22 no-data/absence
    // policy. Every one must carry the derived `channels` binding verbatim.
    expect(SRC.match(/new gcp\.monitoring\.AlertPolicy/g)).toHaveLength(5);
    expect(policyBlock).toContain("notificationChannels: channels");
    expect(sloPolicyBlock).toContain("notificationChannels: channels");
    // No policy site may bind an empty literal or a hand-rolled channel list.
    expect(SRC).not.toContain("notificationChannels: []");
    expect(SRC.match(/notificationChannels: channels/g)).toHaveLength(5);
  });
});

describe("RH-27 paging channels (273_R6OPS.5 — email + operator-paired mobile)", () => {
  const channelBlock = SRC.slice(
    SRC.indexOf("let notificationChannel"),
    SRC.indexOf("const channels"),
  );

  it("creates ONE email channel to the configured on-call address, enabled", () => {
    expect(channelBlock).toContain(
      "new gcp.monitoring.NotificationChannel(`rhema-${stack}-ops-email`",
    );
    expect(channelBlock).toContain('type: "email"');
    expect(channelBlock).toContain("labels: { email_address: args.opsAlertEmail }");
    expect(channelBlock).toContain("enabled: true");
    expect(channelBlock).toContain("if (args.opsAlertEmail)");
    // The address is the operator's config act — a Pulumi SECRET key (encrypted in stack state),
    // never a committed address.
    expect(INDEX_SRC).toContain('rhemaConfig.getSecret("opsAlertEmail")');
    expect(INDEX_SRC).toContain("...(opsAlertEmail ? { opsAlertEmail } : {})");
    expect(SRC).toContain("...(emailChannel ? [emailChannel.name] : []),");
  });

  it("binds the GCP mobile-app channel by resource name — the program never tries to mint one", () => {
    // GCP's API 404s every `mobile_app` create/get/update — console pairing (the operator's act,
    // HUMAN row 274) is the only mint path. The scaffolding consumes the paired channel's
    // resource name from plain config; the operator's remaining acts are pair + set + up.
    expect(SRC).toContain("opsMobileChannelName");
    expect(SRC).toContain("...(args.opsMobileChannelName ? [args.opsMobileChannelName] : []),");
    expect(SRC.match(/type: "mobile_app"/g)).toBeNull();
    expect(INDEX_SRC).toContain('rhemaConfig.get("opsMobileChannelName")');
    expect(INDEX_SRC).toContain("...(opsMobileChannelName ? { opsMobileChannelName } : {})");
  });
});

describe("RH-20 availability burn-rate alert (273_R6OPS.5 — ADR-054's missing policy)", () => {
  // ADR-054 records the §13.5 burn-rate rule as "already implemented for the availability SLO" —
  // only the Slo resource existed; no policy consumed it. These pins assert the honest add: a
  // `select_slo_burn_rate` threshold condition on the real SLO resource name.
  it("alerts on select_slo_burn_rate > 2 over the recorded 1h burn window", () => {
    expect(SRC).toContain("apiBurnRatePolicy = new gcp.monitoring.AlertPolicy(");
    expect(SRC).toContain("-api-burn-rate`");
    expect(SRC).toContain("select_slo_burn_rate(");
    expect(SRC).toContain(
      'select_slo_burn_rate("projects/${project}/services/${apiService.serviceId}/serviceLevelObjectives/${apiAvailabilitySlo.sloId}", "3600s")',
    );
    expect(SRC).toContain("thresholdValue: 2");
  });
  it("depends on the SLO resource so the selector name resolves", () => {
    const burnBlock = SRC.slice(SRC.indexOf("-api-burn-rate`"), SRC.indexOf("const uptimeTargets"));
    expect(burnBlock).toContain("dependsOn: [apiAvailabilitySlo]");
    expect(burnBlock).toContain("notificationChannels: channels");
  });
});

describe("RH-22 uptime checks + no-data alerts (273_R6OPS.5)", () => {
  it("checks app + api /healthz over the stage's public domains only", () => {
    expect(SRC).toContain("new gcp.monitoring.UptimeCheckConfig(`rhema-${stack}-uptime-${key}`");
    expect(SRC).toContain('["app", args.domains.app]');
    expect(SRC).toContain('["api", args.domains.api]');
    expect(SRC).toContain('path: "/healthz"');
    expect(SRC).toContain("useSsl: true");
    expect(SRC).toContain('type: "uptime_url"');
    // The healthz handler's `"ok":true` marks the app-owned answer (a parked-host 200 still fails).
    expect(SRC).toContain('content: \'"ok":true\'');
    // Domain-less stages get no checks — index.ts only passes cfg.domains when the stage carries one.
    expect(INDEX_SRC).toContain("...(cfg.domains ? { domains: cfg.domains } : {})");
  });

  it("pages on 2+ failing checker regions (count_false) on the check_passed metric", () => {
    const uptimeBlock = SRC.slice(
      SRC.indexOf("const uptimeFailPolicy"),
      SRC.indexOf("const uptimeAbsentPolicy"),
    );
    expect(uptimeBlock).toContain('metric.type="monitoring.googleapis.com/uptime_check/check_passed"');
    expect(uptimeBlock).toContain('resource.type="uptime_url"');
    expect(uptimeBlock).toContain('metric.labels.check_id="${chk.uptimeCheckId}"');
    expect(uptimeBlock).toContain('crossSeriesReducer: "REDUCE_COUNT_FALSE"');
    expect(uptimeBlock).toContain('perSeriesAligner: "ALIGN_NEXT_OLDER"');
    expect(uptimeBlock).toContain("thresholdValue: 1");
    expect(uptimeBlock).toContain("dependsOn: uptimeChecks");
  });

  it("pages on absence: uptime metric silence AND the always-on worker going quiet", () => {
    const absentBlock = SRC.slice(SRC.indexOf("const uptimeAbsentPolicy"), SRC.indexOf("const dashboard"));
    expect(absentBlock).toContain("conditionAbsent:");
    // (a) the check pipeline itself dead — no check_passed points for 15 min.
    expect(absentBlock).toContain('metric.type="monitoring.googleapis.com/uptime_check/check_passed"');
    // (b) the dead-worker class: the worker is min-instances 1 instance-billed, so a live worker
    // emits billable_instance_time continuously and silence means dead.
    expect(absentBlock).toContain('metric.type="run.googleapis.com/container/billable_instance_time"');
    expect(absentBlock).toContain('resource.labels.service_name="${workerServiceName}"');
    expect(absentBlock).toContain('duration: "900s"');
    expect(absentBlock).toContain("notificationChannels: channels");
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
