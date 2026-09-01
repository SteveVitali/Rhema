import { describe, it, expect } from "vitest";
import { STAGES, stageConfigFor, stageKindFor, sandboxSubnetOf } from "./stages.js";

describe("stage kinds (§13.2)", () => {
  it("maps concrete stage names to kinds", () => {
    expect(stageKindFor("dev")).toBe("dev");
    expect(stageKindFor("prod")).toBe("prod");
    expect(stageKindFor("pr-123")).toBe("preview");
    expect(stageKindFor("someones-branch")).toBe("preview"); // safest default
  });
});

describe("sandbox subnet has no internet route (REQ-ARCH-2, AC3)", () => {
  for (const stage of ["dev", "pr-7", "prod"]) {
    it(`stage ${stage}`, () => {
      const cfg = stageConfigFor(stage);
      const sandbox = sandboxSubnetOf(cfg);
      expect(sandbox).toBeDefined();
      expect(sandbox!.hasInternetRoute).toBe(false);
      // Its only egress target is the egress-proxy security group.
      expect(sandbox!.egressTargets).toEqual(["sg:egress-proxy"]);
      expect(sandbox!.cidrMask).toBe(20); // subnets sized /20
    });
  }
});

describe("Aurora + preview guards (AC2)", () => {
  it("prod Aurora floors at >= 4 ACU and does not auto-pause", () => {
    expect(STAGES.prod.aurora.minAcu).toBeGreaterThanOrEqual(4);
    expect(STAGES.prod.aurora.autoPause).toBe(false);
    expect(STAGES.prod.aurora.backupRetentionDays).toBe(35);
  });

  it("preview Aurora is 0-ACU auto-pause with isolated buckets and a $3/run guard (REQ-ARCH-38)", () => {
    const p = STAGES.preview;
    expect(p.aurora.minAcu).toBe(0);
    expect(p.aurora.autoPause).toBe(true);
    expect(p.isolatedBuckets).toBe(true);
    expect(p.maxUsdPerRun).toBe(3);
    expect(p.allowsProductionSecrets).toBe(false); // never production secrets in previews
  });

  it("every stage versions its S3 buckets (REQ-ARCH-28)", () => {
    for (const cfg of Object.values(STAGES)) {
      expect(cfg.s3Versioning).toBe(true);
      expect(cfg.isolatedBuckets).toBe(true);
    }
  });
});
