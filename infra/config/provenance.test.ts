import { describe, it, expect } from "vitest";
import { buildDeploymentProvenance } from "./provenance.js";

const goodSha = "a".repeat(40);
const goodDigest = "sha256:" + "b".repeat(64);

describe("buildDeploymentProvenance (REQ-ARCH-39)", () => {
  it("builds a full, validated provenance record", () => {
    const rec = buildDeploymentProvenance({
      gitSha: goodSha,
      imageDigests: { "run-task": goodDigest, "egress-proxy": goodDigest },
      protocolsVersion: "stub-0.0.0",
      rateTableVersion: "2026-09-01",
      stage: "prod",
      now: new Date("2026-09-01T00:00:00.000Z"),
    });
    expect(rec.git_sha).toBe(goodSha);
    expect(rec.image_digests["run-task"]).toBe(goodDigest);
    expect(rec.protocols_version).toBe("stub-0.0.0");
    expect(rec.rate_table_version).toBe("2026-09-01");
    expect(rec.stage).toBe("prod");
    expect(rec.deployed_at).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects a short git sha", () => {
    expect(() =>
      buildDeploymentProvenance({
        gitSha: "abc123",
        imageDigests: { web: goodDigest },
        protocolsVersion: "v1",
        rateTableVersion: "v1",
        stage: "dev",
      }),
    ).toThrow();
  });

  it("rejects an un-pinned image tag (not a sha256 digest)", () => {
    expect(() =>
      buildDeploymentProvenance({
        gitSha: goodSha,
        imageDigests: { web: "latest" },
        protocolsVersion: "v1",
        rateTableVersion: "v1",
        stage: "dev",
      }),
    ).toThrow();
  });
});
