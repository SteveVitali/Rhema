import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// OPS.2 (D-P0.01-4) — the self-hosted Turborepo remote cache's structural invariants. The service
// is a Pulumi program (not a pure function), so these are source-shape assertions in the same
// style as compute.test.ts: they fail if the cache loses its scale-to-zero contract, its
// project-private storage posture, its Bearer-token authz boundary, or its Secret Manager wiring.

const SRC = readFileSync(fileURLToPath(new URL("./turbo-cache.ts", import.meta.url)), "utf8");
const INDEX = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
const ROOT = fileURLToPath(new URL("../..", import.meta.url));

describe("OPS.2 — the self-hosted Turbo remote cache (D-P0.01-4)", () => {
  it("scales to zero with a bounded ceiling (the ≤$15/mo delta contract)", () => {
    expect(SRC).toMatch(/scaling:\s*\{\s*minInstanceCount:\s*0,\s*maxInstanceCount:\s*\d+\s*\}/);
  });

  it("stores artifacts in a project-private, lifecycle-expiring GCS bucket", () => {
    expect(SRC).toContain('publicAccessPrevention: "enforced"');
    expect(SRC).toContain("uniformBucketLevelAccess: true");
    expect(SRC).toMatch(/lifecycleRules:[\s\S]*?type:\s*"Delete"[\s\S]*?age:\s*\d+/);
    expect(SRC).toContain('"roles/storage.objectAdmin"');
    expect(SRC).toContain('value: "google-cloud-storage"');
  });

  it("is Bearer-gated: static auth + the token mounted via secretKeyRef, never plaintext", () => {
    expect(SRC).toContain('value: "static"');
    expect(SRC).toContain('name: "TURBO_TOKEN"');
    expect(SRC).toMatch(/TURBO_TOKEN[\s\S]{0,200}secretKeyRef/);
    expect(SRC).not.toMatch(/TURBO_TOKEN["']?\s*,?\s*value:/);
    // The unauthenticated invoker grant exists BECAUSE the token is the boundary — both or neither.
    expect(SRC).toContain('member: "allUsers"');
  });

  it("mints the token in-program and versions it into Secret Manager on every stage", () => {
    expect(INDEX).toContain('new random.RandomPassword("rhema-turbo-cache-token"');
    expect(INDEX).toMatch(/turbo-cache-token-v1[\s\S]{0,300}ignoreChanges: \["secretData"\]/);
    expect(INDEX).toContain("createTurboCache(");
    expect(INDEX).toContain("export const turboCacheUrl");
  });

  it("has its image in the committed image set + the workflow cache wiring", () => {
    const def = readFileSync(`${ROOT}/infra/cloudbuild/image-set.yaml`, "utf8");
    expect(def).toContain("turbo-cache");
    const ci = readFileSync(`${ROOT}/.github/workflows/ci.yml`, "utf8");
    expect(ci).toContain("TURBO_API");
    expect(ci).toContain("TURBO_TOKEN");
    const turbo = readFileSync(`${ROOT}/turbo.json`, "utf8");
    expect(turbo).toMatch(/"remoteCache"[\s\S]{0,80}"enabled":\s*true/);
    expect(JSON.parse(readFileSync(`${ROOT}/apps/turbo-cache/package.json`, "utf8")).dependencies[
      "turborepo-remote-cache"
    ]).toMatch(/^\d/); // exact-pinned (no range) — the lockfile carries the integrity hash
  });
});
