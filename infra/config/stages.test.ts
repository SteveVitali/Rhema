import { describe, it, expect } from "vitest";
import { STAGES, stageConfigFor, stageKindFor, sandboxSubnetOf } from "./stages.js";

describe("stage kinds (§13.2)", () => {
  it("maps concrete stack names to kinds", () => {
    expect(stageKindFor("dev")).toBe("dev");
    expect(stageKindFor("prod")).toBe("prod");
    expect(stageKindFor("pr-123")).toBe("preview");
    expect(stageKindFor("someones-branch")).toBe("preview"); // safest default
  });
});

describe("sandbox subnet has no internet reachability (REQ-ARCH-2, AC3 — GCP)", () => {
  for (const stage of ["dev", "pr-7", "prod"]) {
    it(`stage ${stage}`, () => {
      const cfg = stageConfigFor(stage);
      const sandbox = sandboxSubnetOf(cfg);
      expect(sandbox).toBeDefined();
      // No 0.0.0.0/0 default route AND no Cloud NAT — the two independent ways out, both closed.
      expect(sandbox!.hasDefaultInternetRoute).toBe(false);
      expect(sandbox!.hasCloudNat).toBe(false);
      // Its only egress target is the egress-proxy firewall tag.
      expect(sandbox!.egressTargets).toEqual(["fw:egress-proxy"]);
      expect(sandbox!.cidrMask).toBe(20); // subnets sized /20
    });
  }
});

describe("no other subnet accidentally opens the sandbox posture", () => {
  it("only the sandbox lacks both a default route and Cloud NAT", () => {
    for (const cfg of Object.values(STAGES)) {
      for (const subnet of cfg.vpc.subnets) {
        const isolated = !subnet.hasDefaultInternetRoute && !subnet.hasCloudNat;
        // The sandbox is the ONLY fully-isolated subnet; every other subnet has exactly one egress path.
        expect(isolated).toBe(subnet.name === "sandbox");
      }
    }
  });
});

describe("AlloyDB + preview guards (AC2 — GCP)", () => {
  it("prod AlloyDB keeps a warm primary at >= 4 vCPU and does not pause", () => {
    expect(STAGES.prod.alloydb.primaryCpuCount).toBeGreaterThanOrEqual(4);
    expect(STAGES.prod.alloydb.paused).toBe(false);
    expect(STAGES.prod.alloydb.backupRetentionDays).toBe(35);
  });

  it("preview AlloyDB is small + paused with isolated buckets and a $3/run guard (REQ-ARCH-38)", () => {
    const p = STAGES.preview;
    expect(p.alloydb.paused).toBe(true);
    expect(p.alloydb.primaryCpuCount).toBeLessThanOrEqual(2); // smallest AlloyDB shape
    expect(p.isolatedBuckets).toBe(true);
    expect(p.maxUsdPerRun).toBe(3);
    expect(p.allowsProductionSecrets).toBe(false); // never production secrets in previews
  });

  it("every stage versions its GCS buckets and isolates them (REQ-ARCH-28)", () => {
    for (const cfg of Object.values(STAGES)) {
      expect(cfg.gcsVersioning).toBe(true);
      expect(cfg.isolatedBuckets).toBe(true);
    }
  });
});
