import { describe, it, expect } from "vitest";
import {
  ALL_SECRET_IDS,
  NONPROD_GENERATED_SECRET_IDS,
  PROD_DOMAINS,
  PROD_REQUIRED_SECRETS,
  STAGES,
  stageConfigFor,
  stageKindFor,
  sandboxSubnetOf,
} from "./stages.js";
import { SPA_SURFACES } from "@rhema/contracts";

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

describe("managed Postgres engine + preview guards (AC2 — GCP; prod→Cloud SQL amended 2026-09-17)", () => {
  it("prod runs Cloud SQL — db-g1-small (minimal prod-ready shared-core), warm, 35-day backups", () => {
    const d = STAGES.prod.database;
    expect(d.engine).toBe("cloudsql");
    expect(d.cloudSqlTier).toBe("db-g1-small");
    expect(d.paused).toBe(false); // warm — never paused
    expect(d.backupRetentionDays).toBe(35); // daily automated backups; PITR caps at 7d (Cloud SQL)
  });

  it("dev + preview stay on AlloyDB (dev is the already-live substrate; preview is small/paused)", () => {
    expect(STAGES.dev.database.engine).toBe("alloydb");
    expect(STAGES.dev.database.paused).toBe(false);
    const p = STAGES.preview;
    expect(p.database.engine).toBe("alloydb");
    expect(p.database.paused).toBe(true);
    expect(p.database.primaryCpuCount).toBeLessThanOrEqual(2); // smallest AlloyDB shape
    expect(p.isolatedBuckets).toBe(true);
    expect(p.maxUsdPerRun).toBe(3);
    expect(p.allowsProductionSecrets).toBe(false); // never production secrets in previews
  });

  it("the engine descriptor is internally consistent (tier only on cloudsql, vCPU only on alloydb)", () => {
    for (const [name, cfg] of Object.entries(STAGES)) {
      if (cfg.database.engine === "cloudsql") {
        expect(cfg.database.cloudSqlTier, name).toMatch(/^db-/);
      } else {
        expect(cfg.database.primaryCpuCount, name).toBeGreaterThanOrEqual(1);
      }
    }
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

describe("spa.surfaces stage flag (SPA.2; REQ-SEQ-3/5 — the strangler flag)", () => {
  it("every stage ships [] — no flag is set anywhere until the foundation set lands (REQ-SEQ-5)", () => {
    for (const [name, cfg] of Object.entries(STAGES)) {
      expect(cfg.spaSurfaces, `stage ${name}`).toEqual([]);
    }
  });

  it("the fact is typed over the contracts vocabulary — every listed key is a SpaSurface", () => {
    // The flip tickets append keys here; this pins that only known keys can ever land.
    for (const cfg of Object.values(STAGES)) {
      for (const key of cfg.spaSurfaces) {
        expect((SPA_SURFACES as readonly string[]).includes(key)).toBe(true);
      }
    }
  });
});

describe("purchase.mode stage flag (BILL.3; REQ-BILL-16)", () => {
  it("every stage ships closed — only an auditable operator flip re-opens real-user purchase", () => {
    for (const [name, cfg] of Object.entries(STAGES)) {
      expect(cfg.purchaseMode, `stage ${name}`).toBe("closed");
    }
  });
});

describe("refundWindow.mode stage flag (DEF.4; REQ-SPEC-29; ADR-071)", () => {
  it("every stage ships test_tenants — closed for every real user; `open` is the operator's commit", () => {
    for (const [name, cfg] of Object.entries(STAGES)) {
      expect(cfg.refundWindowMode, `stage ${name}`).toBe("test_tenants");
    }
  });
});

describe("debit.mode stage flag (ECON.1; REQ-SPEC-32(a); ADR-031)", () => {
  it("every stage ships committed — the metered flip is the operator's, after notice + calibrated caps", () => {
    for (const [name, cfg] of Object.entries(STAGES)) {
      expect(cfg.debitMode, `stage ${name}`).toBe("committed");
    }
  });
});

describe("prod serving surface (PRB.15 — §13.1 / D-PRB.02-1 IaC leg)", () => {
  it("prod carries the real domains: rhema.tools apex + api.rhema.tools + the cookieless usercontent.rhema.tools (amended 2026-09-17)", () => {
    expect(STAGES.prod.domains).toEqual(PROD_DOMAINS);
    expect(STAGES.prod.domains!.app).toBe("rhema.tools");
    expect(STAGES.prod.domains!.api).toBe("api.rhema.tools");
    expect(STAGES.prod.domains!.userContent).toBe("usercontent.rhema.tools");
    // Amended 2026-09-17: the operator controls ONE zone (rhema.tools), so the user-content origin is a
    // SIBLING subdomain on the app's own registrable domain — the earlier separate-registrable-domain
    // isolation (rhemausercontent.com) is superseded. The origin is still a distinct host + a distinct
    // origin (different port of entry on the LB, a different backend, zero Set-Cookie), and the session
    // side of the boundary is enforced by host-only `__Host-` cookies (asserted in
    // apps/api/src/auth.test.ts): a `Domain=rhema.tools` plant from usercontent.* can neither shadow the
    // `__Host-`-named session cookie nor receive it.
    expect(STAGES.prod.domains!.userContent.endsWith(`.${STAGES.prod.domains!.app}`)).toBe(true); // same zone
    expect(STAGES.prod.domains!.userContent).not.toBe(STAGES.prod.domains!.app); // a distinct host/origin
    expect(STAGES.prod.domains!.api.endsWith(`.${STAGES.prod.domains!.app}`)).toBe(true);
  });

  it("non-prod stages carry no domains block (the placeholder `${stack}.rhema.dev` cert suffices)", () => {
    expect(STAGES.dev.domains).toBeUndefined();
    expect(STAGES.preview.domains).toBeUndefined();
  });
});

describe("stage secret requirements (PRB.15 — HUMAN-H6's seeding checklist; REQ-ARCH-30)", () => {
  it("prod requires the full production secret set (ops webhook re-added 2026-09-18 for PRB.17)", () => {
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
    ]) {
      expect(STAGES.prod.requiredSecrets, `missing ${id}`).toContain(id);
    }
    // The ops-alert sink is required on prod again (PRB.17's gate answer made the webhook catcher the
    // prod alert destination — the drift/balance-divergence alert path must not be inert).
    expect(ALL_SECRET_IDS).toContain("ops-alert-webhook-url");
    expect(PROD_REQUIRED_SECRETS).toContain("ops-alert-webhook-url");
  });

  it("previews require only the non-production keys; prod is the only allowsProductionSecrets stage", () => {
    expect(STAGES.preview.requiredSecrets).not.toContain("stripe-secret");
    expect(STAGES.preview.requiredSecrets).not.toContain("resend-api-key");
    expect(STAGES.preview.allowsProductionSecrets).toBe(false);
    expect(STAGES.dev.allowsProductionSecrets).toBe(false);
    expect(STAGES.prod.allowsProductionSecrets).toBe(true);
  });

  it("OPS.1 — non-prod stages require ONLY the provider key + the IaC-generated set (REQ-ARCH-38)", () => {
    const expected = ["anthropic-api-key", ...NONPROD_GENERATED_SECRET_IDS];
    for (const stage of ["dev", "preview"] as const) {
      expect([...STAGES[stage].requiredSecrets].sort(), stage).toEqual([...expected].sort());
      // no third-party credential id is ever REQUIRED on a non-prod stack — each consumer fails
      // closed with a named reason when its secret name is unwired.
      for (const thirdParty of [
        "stripe-secret",
        "stripe-webhook-secret",
        "resend-api-key",
        "google-oauth-client-secret",
        "anthropic-admin-key",
        "ops-alert-webhook-url",
        "user-content-signing-key",
      ]) {
        expect(STAGES[stage].requiredSecrets, `${stage}/${thirdParty}`).not.toContain(thirdParty);
      }
    }
    // The generated set + the shared ALL_SECRET_IDS cover every required non-prod id — a required
    // id with no provisioned container would hang the wiring (the `system-database-url` container
    // is provisioned by the program's extraIds path, asserted in compute.test.ts).
    for (const id of STAGES.dev.requiredSecrets) {
      expect(
        id === "system-database-url" || (ALL_SECRET_IDS as readonly string[]).includes(id),
        `${id} must have a provisioned container`,
      ).toBe(true);
    }
    // Prod is untouched: system-database-url never enters prod's provisioned or required set.
    expect(ALL_SECRET_IDS).not.toContain("system-database-url");
    expect(PROD_REQUIRED_SECRETS).not.toContain("system-database-url");
  });
});
