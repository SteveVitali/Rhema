import { describe, it, expect } from "vitest";
import {
  ALL_SECRET_IDS,
  PROD_DOMAINS,
  PROD_REQUIRED_SECRETS,
  STAGES,
  stageConfigFor,
  stageKindFor,
  sandboxSubnetOf,
} from "./stages.js";

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

describe("sandbox node bootstrap egress is scoped, pod egress stays proxy-only (D-P0.15c-8)", () => {
  for (const stage of ["dev", "pr-7", "prod"]) {
    it(`stage ${stage}`, () => {
      const sandbox = sandboxSubnetOf(stageConfigFor(stage))!;
      // The POD guarantee is unchanged — the NetworkPolicy confines pods to the proxy (REQ-ARCH-2).
      expect(sandbox.egressTargets).toEqual(["fw:egress-proxy"]);
      // The NODE firewall additionally permits exactly the two bootstrap targets — Google APIs via the PGA
      // VIP and the GKE control plane — and nothing else. No default route / NAT (asserted above) means this
      // is still not arbitrary-internet egress.
      expect(sandbox.nodeEgressTargets).toEqual(["fw:egress-proxy", "pga:private-googleapis", "fw:gke-master"]);
      // the node egress is a strict SUPERSET of the pod egress (the pod layer only ever tightens).
      for (const t of sandbox.egressTargets) expect(sandbox.nodeEgressTargets).toContain(t);
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

describe("signup.mode stage flag (PRB.13; REQ-BETA-19 amended 2026-09-16)", () => {
  it("prod is open (PRB.15's deliberate flip); every non-prod stage stays invite — the flag fails closed", () => {
    expect(STAGES.prod.signupMode).toBe("open");
    for (const [name, cfg] of Object.entries(STAGES)) {
      if (name === "prod") continue;
      expect(cfg.signupMode, `stage ${name}`).toBe("invite");
    }
  });
});

describe("prod serving surface (PRB.15 — §13.1 / D-PRB.02-1 IaC leg)", () => {
  it("prod carries the real domains: rhema.app + api.rhema.app + the cookieless rhemausercontent.com", () => {
    expect(STAGES.prod.domains).toEqual(PROD_DOMAINS);
    expect(STAGES.prod.domains!.app).toBe("rhema.app");
    expect(STAGES.prod.domains!.api).toBe("api.rhema.app");
    // The user-content origin is a SEPARATE registrable domain — the XSS blast-radius cut (§12.3):
    // neither domain is a subdomain of the other, so session cookies on rhema.app can never reach it.
    expect(STAGES.prod.domains!.userContent).toBe("rhemausercontent.com");
    expect(STAGES.prod.domains!.userContent.endsWith(`.${STAGES.prod.domains!.app}`)).toBe(false);
    expect(STAGES.prod.domains!.app.endsWith(`.${STAGES.prod.domains!.userContent}`)).toBe(false);
  });

  it("non-prod stages carry no domains block (the placeholder `${stack}.rhema.dev` cert suffices)", () => {
    expect(STAGES.dev.domains).toBeUndefined();
    expect(STAGES.preview.domains).toBeUndefined();
  });
});

describe("stage secret requirements (PRB.15 — HUMAN-H6's seeding checklist; REQ-ARCH-30)", () => {
  it("prod requires the full production secret set — every id the program provisions", () => {
    for (const id of ALL_SECRET_IDS) {
      expect(PROD_REQUIRED_SECRETS, `missing ${id}`).toContain(id);
    }
    // The H6-named prod credentials are all present.
    for (const id of [
      "alloydb-password",
      "anthropic-api-key",
      "anthropic-admin-key",
      "resend-api-key",
      "stripe-secret",
      "stripe-webhook-secret",
      "google-oauth-client-secret",
      "ops-alert-webhook-url",
    ]) {
      expect(STAGES.prod.requiredSecrets, `missing ${id}`).toContain(id);
    }
  });

  it("previews require only the non-production keys; prod is the only allowsProductionSecrets stage", () => {
    expect(STAGES.preview.requiredSecrets).not.toContain("stripe-secret");
    expect(STAGES.preview.requiredSecrets).not.toContain("resend-api-key");
    expect(STAGES.preview.allowsProductionSecrets).toBe(false);
    expect(STAGES.dev.allowsProductionSecrets).toBe(false);
    expect(STAGES.prod.allowsProductionSecrets).toBe(true);
  });
});
