#!/usr/bin/env node
// Preview-cost hygiene — the orphan sweep for `pr-<n>` resources left live after a preview's
// teardown (the finding behind the 2026-11-17 pr-385 bill: a merged PR's stack sat at ~$400+/mo
// of GKE/AlloyDB/LB/NAT until the operator noticed). Every preview resource is stack-named —
// `rhema-pr-<n>-*`, `rhema-507501-turbo-cache-pr-<n>` — so a name scan across the project's
// resource classes finds a leaked stack without needing Pulumi state access.
//
// Usage:
//   node scripts/live/preview-orphan-sweep.mjs [--region us-central1] [--allow pr-<n>]… [--json]
//
//   --allow pr-<n>   exempt a stack that is intentionally live (an open PR's preview mid-walk)
//   --json           emit the machine-readable report instead of text
//
// Exit codes: 0 clean, 1 orphans found, 2 the sweep itself could not see the estate
// (a gcloud call failed — fail-closed: a blind sweep must never report green).
//
// Intended cadence: a scheduled CI/cron leg (nightly is enough — the burn is tens of dollars
// per day, not per hour) or on-demand after every preview teardown's destroy → orphan check.

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REGION = "us-central1";

/** The `pr-<digits>` token a preview stack embeds in every resource name it owns. */
export function previewStackOf(name) {
  const m = /(?:^|[^a-z0-9])pr-(\d+)(?=[^0-9]|$)/.exec(name);
  return m ? `pr-${m[1]}` : null;
}

export function parseArgs(argv) {
  const args = { region: DEFAULT_REGION, allow: new Set(), json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--region") args.region = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--allow") {
      const v = argv[++i];
      if (!/^pr-\d+$/.test(v ?? "")) {
        throw new Error(`--allow takes a pr-<n> stack name, got ${JSON.stringify(v)}`);
      }
      args.allow.add(v);
    } else if (a === "--help" || a === "-h") {
      args.help = true;
    } else {
      throw new Error(`unknown argument ${JSON.stringify(a)}`);
    }
  }
  return args;
}

/**
 * One gcloud list call per resource class. Each entry returns bare resource names.
 * Global-ish classes use --region=- / no region; serverless classes need a concrete region.
 */
export function scansFor(region) {
  return [
    { kind: "gke-cluster", cmd: ["container", "clusters", "list", "--region=-"] },
    { kind: "cloudsql-instance", cmd: ["sql", "instances", "list"] },
    { kind: "alloydb-cluster", cmd: ["alloydb", "clusters", "list", "--region=-"] },
    { kind: "redis-instance", cmd: ["redis", "instances", "list", "--region=-"] },
    { kind: "gce-instance", cmd: ["compute", "instances", "list"] },
    { kind: "network", cmd: ["compute", "networks", "list"] },
    { kind: "address-global", cmd: ["compute", "addresses", "list", "--global"] },
    { kind: "address-regional", cmd: ["compute", "addresses", "list", `--regions=${region}`] },
    { kind: "forwarding-rule", cmd: ["compute", "forwarding-rules", "list"] },
    { kind: "router-nat", cmd: ["compute", "routers", "list", `--regions=${region}`] },
    {
      kind: "cloudrun-service",
      cmd: ["run", "services", "list", `--region=${region}`, "--platform=managed"],
      format: "value(metadata.name)",
    },
    {
      kind: "cloudrun-job",
      cmd: ["run", "jobs", "list", `--region=${region}`],
      format: "value(metadata.name)",
    },
    { kind: "gcs-bucket", cmd: ["storage", "buckets", "list"] },
    { kind: "artifact-repo", cmd: ["artifacts", "repositories", "list"] },
  ];
}

function runScan(scan) {
  const r = spawnSync("gcloud", [...scan.cmd, `--format=${scan.format ?? "value(name)"}`], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    return { kind: scan.kind, error: (r.stderr || r.error?.message || "gcloud failed").trim() };
  }
  return {
    kind: scan.kind,
    names: r.stdout
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Group scan findings by owning preview stack. Names with no `pr-<n>` token are not preview
 * resources (prod, shared, and Google-managed names fail the regex by design).
 */
export function findingsByStack(scanResults, allow) {
  const orphans = new Map(); // stack -> [{kind, name}]
  const allowed = new Map();
  for (const { kind, names = [] } of scanResults) {
    for (const name of names) {
      const stack = previewStackOf(name);
      if (!stack) continue;
      const bucket = allow.has(stack) ? allowed : orphans;
      const list = bucket.get(stack) ?? [];
      list.push({ kind, name });
      bucket.set(stack, list);
    }
  }
  return { orphans, allowed };
}

export function buildReport(scanResults, allow) {
  const { orphans, allowed } = findingsByStack(scanResults, allow);
  const scanErrors = scanResults
    .filter((s) => s.error)
    .map((s) => ({ kind: s.kind, error: s.error }));
  const flat = (m) =>
    [...m.entries()].map(([stack, rows]) => ({
      stack,
      count: rows.length,
      kinds: [...new Set(rows.map((r) => r.kind))].sort(),
      resources: rows,
    }));
  return {
    ok: scanErrors.length === 0 && orphans.size === 0,
    orphanStacks: flat(orphans),
    allowedStacks: flat(allowed),
    scanErrors,
  };
}

export function formatReport(report) {
  const lines = [];
  for (const e of report.scanErrors) {
    lines.push(`SCAN-ERROR ${e.kind}: ${e.error.split("\n")[0]}`);
  }
  for (const s of report.orphanStacks) {
    lines.push(`ORPHAN ${s.stack}: ${s.count} live resource(s) — ${s.kinds.join(", ")}`);
    for (const r of s.resources) lines.push(`  ${r.kind.padEnd(16)} ${r.name}`);
  }
  for (const s of report.allowedStacks) {
    lines.push(`ALLOWED ${s.stack}: ${s.count} live resource(s) — ${s.kinds.join(", ")}`);
  }
  if (lines.length === 0) lines.push("CLEAN — no live pr-<n> resources");
  else if (report.ok) lines.push("OK — only allowed stacks are live");
  return lines.join("\n");
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`usage error: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log("usage: preview-orphan-sweep.mjs [--region R] [--allow pr-<n>]… [--json]");
    process.exit(0);
  }
  const results = scansFor(args.region).map(runScan);
  const report = buildReport(results, args.allow);
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exit(report.scanErrors.length > 0 ? 2 : report.ok ? 0 : 1);
}

// The `ē` in the checkout path percent-encodes import.meta.url — compare path↔path, never
// URL↔path (infra/AGENTS.md gotcha 9).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main();
