import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SLO_SIGNALS } from "@rhema/orchestrator";

// P1.22 W9 — the observability audit (§13.5; REQ-ARCH-34). Asserts the chain is wired end-to-end:
//   SLO registry (orchestrator) → worker `slo.probe` sweep → `[slo] violation` log lines → log-based
//   metric + per-signal alert policies (monitoring.ts) → ops webhook channel → dashboard; and that the
//   five playbooks + the REQ-ARCH-34 review rule exist verbatim.

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (rel: string) => readFileSync(join(REPO, rel), "utf8");

const monitoring = read("infra/pulumi/monitoring.ts");
const worker = read("apps/worker/src/main.ts");
const index = read("infra/pulumi/index.ts");

describe("the §13.5 SLO wiring — registry → sweep → metric → policies → channel (REQ-ARCH-34)", () => {
  it("every probed signal has a matching alert policy in infra/pulumi/monitoring.ts", () => {
    const probed = SLO_SIGNALS.filter((s) => s.probe !== undefined).map((s) => s.key);
    const alertList = monitoring.match(/export const SLO_ALERT_SIGNALS = \[([\s\S]*?)\]/)?.[1] ?? "";
    for (const key of probed) {
      expect(alertList, `monitoring.ts is missing an alert policy for ${key}`).toContain(`"${key}"`);
    }
  });

  it("the worker registers the 5-minute slo.probe sweep and logs [slo] violation lines", () => {
    expect(worker).toContain("probeSlos(systemExec)");
    expect(worker).toContain("SLO_SWEEP_INTERVAL_MS = 5 * 60_000");
    expect(worker).toContain("[slo] violation");
    expect(worker).toContain('kind: "slo_violation"');
  });

  it("the log-based metric keys on the worker's breach lines and is labelled by signal", () => {
    expect(monitoring).toContain('"rhema_slo_violations"');
    expect(monitoring).toContain('textPayload:"[slo] violation"');
    expect(monitoring).toContain('key: "signal"');
    expect(monitoring).toContain("labelExtractors");
  });

  it("the API availability SLO is a real Cloud Monitoring Slo resource at 99.9% monthly", () => {
    expect(monitoring).toContain("gcp.monitoring.Slo");
    expect(monitoring).toContain("goal: 0.999");
    expect(monitoring).toContain('calendarPeriod: "MONTH"');
    expect(monitoring).toContain("GenericService");
    expect(monitoring).toContain('serviceType: "CLOUD_RUN"');
  });

  it("the ops notification channel exists but only when the webhook secret is configured", () => {
    expect(monitoring).toContain('type: "webhook_tokenauth"');
    expect(monitoring).toContain("args.opsAlertWebhookUrl");
    expect(index).toContain('rhemaConfig.getSecret("opsAlertWebhookUrl")');
    expect(index).toContain("createMonitoring");
  });

  it("the dashboard is wired with the breach-counter, api tiles, and the SLO health scorecard", () => {
    expect(monitoring).toContain("gcp.monitoring.Dashboard");
    expect(monitoring).toContain("§13.5 SLOs");
    expect(monitoring).toContain("select_slo_health");
  });
});

describe("the ops docs — five playbooks + the REQ-ARCH-34 review rule", () => {
  const playbooks = readdirSync(join(REPO, "docs/ops/playbooks"));

  it.each([
    "provider-outage.md",
    "orphan-storm.md",
    "cost-anomaly.md",
    "boundary-violation.md",
    "egress-denied-spike.md",
  ])("%s exists and names its alert + steps", (file) => {
    const body = read(`docs/ops/playbooks/${file}`);
    expect(body).toMatch(/\*\*Alert/i);
    expect(body.length).toBeGreaterThan(500);
  });

  it("all five §13.5 playbooks are present", () => {
    expect(playbooks.sort()).toEqual(
      ["boundary-violation.md", "cost-anomaly.md", "egress-denied-spike.md", "orphan-storm.md", "provider-outage.md"].sort(),
    );
  });

  it("REQ-ARCH-34's weekly-review + breach-pauses-feature-work rule is recorded", () => {
    const review = read("docs/ops/slo-review.md");
    expect(review).toContain("REQ-ARCH-34");
    expect(review).toContain("weekly");
    expect(review).toMatch(/breach.*pauses feature work|pauses feature work.*breach/i);
    expect(review).toContain("unmeasured");
  });
});
