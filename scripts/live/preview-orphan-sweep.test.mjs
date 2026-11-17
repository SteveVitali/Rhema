import { describe, expect, it } from "vitest";
import {
  buildReport,
  findingsByStack,
  formatReport,
  parseArgs,
  previewStackOf,
  scansFor,
} from "./preview-orphan-sweep.mjs";

describe("previewStackOf — the pr-<n> token extractor", () => {
  it("finds the stack in every preview resource naming shape", () => {
    expect(previewStackOf("rhema-pr-385-net-dc2f0f1")).toBe("pr-385");
    expect(previewStackOf("rhema-pr-385-alloydb")).toBe("pr-385");
    expect(previewStackOf("rhema-pr-385-run-task-gke-d7042bc")).toBe("pr-385");
    expect(previewStackOf("gke-rhema-pr-385-run-rhema-pr-385-run-ea905705-d31f")).toBe("pr-385");
    expect(previewStackOf("rhema-507501-turbo-cache-pr-385")).toBe("pr-385");
    expect(previewStackOf("rhema-pr-385-api-e90c126")).toBe("pr-385");
    expect(previewStackOf("pr-385")).toBe("pr-385");
  });

  it("rejects prod, shared, and Google-managed names", () => {
    for (const n of [
      "rhema-prod-net-ae9fc54",
      "rhema-prod-run-task-gke-c13cb80",
      "rhema-prod-postgres",
      "rhema-prod-lb-ip-1853e1b",
      "nat-auto-ip-46881704-15-1789622804807294",
      "serverless-ipv4-cloudrun-1794905830399838573",
      "rhema-507501_cloudbuild",
      "rhema-507501-turbo-cache-prod",
      "rhema-journeys-sa",
      "spring-385-cleaner", // an unrelated service whose name merely contains digits
    ]) {
      expect(previewStackOf(n), n).toBeNull();
    }
  });
});

describe("parseArgs", () => {
  it("defaults to us-central1 with no allowances", () => {
    const a = parseArgs([]);
    expect(a.region).toBe("us-central1");
    expect(a.allow.size).toBe(0);
    expect(a.json).toBe(false);
  });

  it("accepts --region, repeated --allow, and --json", () => {
    const a = parseArgs([
      "--region",
      "europe-west1",
      "--allow",
      "pr-401",
      "--allow",
      "pr-402",
      "--json",
    ]);
    expect(a.region).toBe("europe-west1");
    expect([...a.allow].sort()).toEqual(["pr-401", "pr-402"]);
    expect(a.json).toBe(true);
  });

  it("refuses a non-conforming --allow name and unknown flags", () => {
    expect(() => parseArgs(["--allow", "prod"])).toThrow(/pr-<n>/);
    expect(() => parseArgs(["--allow", "pr-385x"])).toThrow(/pr-<n>/);
    expect(() => parseArgs(["--force"])).toThrow(/unknown argument/);
  });
});

describe("findingsByStack / buildReport — orphan vs allowed", () => {
  const scans = [
    {
      kind: "gke-cluster",
      names: ["rhema-pr-385-run-task-gke-d7042bc", "rhema-prod-run-task-gke-c13cb80"],
    },
    { kind: "gcs-bucket", names: ["rhema-pr-385-artifacts", "rhema-prod-artifacts"] },
    { kind: "network", names: ["rhema-pr-385-net-dc2f0f1", "rhema-pr-401-net-aaaaaaa"] },
    { kind: "gce-instance", names: [] },
  ];

  it("groups every match under its stack and ignores non-preview names", () => {
    const { orphans } = findingsByStack(scans, new Set());
    expect(orphans.get("pr-385")).toHaveLength(3);
    expect(orphans.get("pr-401")).toHaveLength(1);
    expect(orphans.has("prod")).toBe(false);
  });

  it("--allow moves a stack's resources out of the orphan set", () => {
    const { orphans, allowed } = findingsByStack(scans, new Set(["pr-385"]));
    expect(orphans.has("pr-385")).toBe(false);
    expect(orphans.has("pr-401")).toBe(true);
    expect(allowed.get("pr-385")).toHaveLength(3);
  });

  it("buildReport is ok only when no orphans and no scan errors", () => {
    const clean = buildReport(scans, new Set(["pr-385", "pr-401"]));
    expect(clean.ok).toBe(true);
    const dirty = buildReport(scans, new Set(["pr-385"]));
    expect(dirty.ok).toBe(false);
    expect(dirty.orphanStacks).toEqual([expect.objectContaining({ stack: "pr-401", count: 1 })]);
    const errored = buildReport([{ kind: "gke-cluster", error: "quota" }], new Set());
    expect(errored.ok).toBe(false);
    expect(errored.scanErrors).toHaveLength(1);
  });
});

describe("formatReport", () => {
  it("prints CLEAN when nothing is found", () => {
    expect(formatReport(buildReport([], new Set()))).toMatch(/CLEAN/);
  });
  it("names the orphan stack and each resource line", () => {
    const r = buildReport([{ kind: "network", names: ["rhema-pr-385-net-dc2f0f1"] }], new Set());
    const out = formatReport(r);
    expect(out).toMatch(/ORPHAN pr-385/);
    expect(out).toMatch(/rhema-pr-385-net-dc2f0f1/);
  });
});

describe("scansFor — coverage of every billable preview class", () => {
  it("includes the classes a leaked stack leaves behind", () => {
    const kinds = scansFor("us-central1").map((s) => s.kind);
    for (const k of [
      "gke-cluster",
      "cloudsql-instance",
      "alloydb-cluster",
      "redis-instance",
      "gce-instance",
      "network",
      "forwarding-rule",
      "router-nat",
      "cloudrun-service",
      "cloudrun-job",
      "gcs-bucket",
      "artifact-repo",
    ]) {
      expect(kinds, k).toContain(k);
    }
  });
});
