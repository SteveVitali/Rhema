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
      "roles/storage.objectViewer", // storage.buckets.list
      "roles/artifactregistry.reader", // Artifact Registry repos
    ]) {
      expect(SRC, role).toContain(`"${role}"`);
    }
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
