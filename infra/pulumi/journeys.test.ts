import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Preview-cost hygiene (2026-11-17) — the nightly preview-orphan-sweep workflow lists every
// resource class a leaked `pr-<n>` stack leaves behind. journeys.ts is a Pulumi program, not a
// pure function, so these are structural assertions over the source — the data.test.ts style.

const SRC = readFileSync(fileURLToPath(new URL("./journeys.ts", import.meta.url)), "utf8");

describe("preview-orphan sweep — CI principal read grants", () => {
  it("grants a viewer role for every billable class the sweep lists", () => {
    for (const role of [
      "roles/container.viewer", // GKE
      "roles/cloudsql.viewer", // Cloud SQL
      "roles/alloydb.viewer", // AlloyDB
      "roles/redis.viewer", // Memorystore
      "roles/run.viewer", // Cloud Run services + jobs
      "roles/artifactregistry.reader", // Artifact Registry repos
    ]) {
      expect(SRC, role).toContain(`"${role}"`);
    }
  });

  it("grants storage.buckets.list as a one-permission custom role, not a predefined role", () => {
    // 313_R6FIX.42 — no predefined viewer role carries `storage.buckets.list`
    // (roles/storage.objectViewer grants object reads, not the project-level list; only
    // roles/storage.admin carries it and it is far too broad). The sweep's gcs-bucket arm
    // must ride a dedicated custom role.
    expect(SRC).toContain("gcp.projects.IAMCustomRole");
    expect(SRC).toContain('"ciPreviewSweepBucketsList"');
    expect(SRC).toContain('permissions: ["storage.buckets.list"]');
    expect(SRC).not.toContain("roles/storage.objectViewer");
    expect(SRC).not.toContain("roles/storage.admin");
  });

  it("binds the same github-pool repo principalSet the journeys suite uses", () => {
    expect(SRC).toContain(
      "workloadIdentityPools/github-pool/attribute.repository/${args.ciRepository}",
    );
  });

  it("keeps the grants read-only and member-scoped (never authoritative)", () => {
    expect(SRC).toContain("gcp.projects.IAMMember");
    // The sweep loop emits viewer/reader roles only — no editor/owner anywhere.
    expect(SRC).not.toContain("roles/editor");
    expect(SRC).not.toContain("roles/owner");
  });
});
