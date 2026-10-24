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

describe("cloudRun posture stage facts (COST.1; REQ-COST-1/2/3; H9 ruling-(a) class A)", () => {
  const ALL_SERVICES = ["export", "fetcher", "api", "web", "worker", "collab"] as const;

  it("prod: every request-billed service scales to ZERO — the authorized cold floor (−$48.60/mo)", () => {
    const s = STAGES.prod.cloudRun.services;
    for (const svc of ["export", "fetcher", "api", "web", "collab"] as const) {
      expect(s[svc].minInstances, svc).toBe(0);
      expect(s[svc].cpuBilling, svc).toBe("request");
    }
    // collab stays single-writer at every stage (§5.10 — no Redis sync tier yet).
    expect(s.collab.maxInstances).toBe(1);
    // prod's burst ceiling is 10 for the standard services.
    for (const svc of ["export", "fetcher", "api", "web"] as const) {
      expect(s[svc].maxInstances, svc).toBe(10);
    }
  });

  it("prod: the worker is min=1 INSTANCE-billed — forbidden to scale to zero (pg-boss + all crons)", () => {
    const w = STAGES.prod.cloudRun.services.worker;
    expect(w.minInstances).toBe(1);
    expect(w.cpuBilling).toBe("instance"); // cpuIdle:false — CPU outside requests
    expect(w.maxInstances).toBe(3);
    // the D-P0.15h-3 cold-import shape is pinned in the fact, not a program ternary.
    expect(w.resources).toEqual({ cpu: "1", memory: "1Gi", startupCpuBoost: true });
  });

  it("prod: convert-svc keeps ONLY its min=1 SLO floor, REQUEST-billed — the codified drift revert (−$42.12/mo)", () => {
    const c = STAGES.prod.cloudRun.convertSvc;
    // REQ-COST-2: the live `cpu-throttling:"false"` divergence is reverted — the fact pins
    // request billing explicitly so the `up` converges live to IaC intent.
    expect(c.cpuBilling).toBe("request");
    // the warm floor stays: it exists FOR import_preview_p95_s ≤ 20 s (ONB.1/ADR-044).
    expect(c.minInstances).toBe(1);
    expect(c.maxInstances).toBe(4);
    expect(c.resources).toEqual({ cpu: "1", memory: "1Gi", startupCpuBoost: true });
  });

  it("preview: the worker runs the D-P0.15h-3-pinned shape — the 0.5/512Mi candidate is NOT adopted (R6SOAK.1 RED)", () => {
    // REQ-ENG-7's soak on pr-206 (2026-10-22) returned RED — 6/6 cold-import iterations failed
    // on the 0.5 vCPU/512Mi request-billed candidate. R6DEP.1 reverts the preview pin to the
    // same 1 vCPU/1Gi instance-billed shape dev/prod carry: a verification preview needs a
    // worker that consumes its queues (auth.mail, sweeps). A redesigned candidate + fresh
    // green soak re-opens the question on R6INF.1's terms.
    const w = STAGES.preview.cloudRun.services.worker;
    expect(w.minInstances).toBe(1);
    expect(w.cpuBilling).toBe("instance");
    expect(w.maxInstances).toBe(1);
    expect(w.resources).toEqual({ cpu: "1", memory: "1Gi", startupCpuBoost: true });
    // dev is NOT the soak target — it keeps the D-P0.15h-3-pinned shape.
    expect(STAGES.dev.cloudRun.services.worker.resources).toEqual({
      cpu: "1",
      memory: "1Gi",
      startupCpuBoost: true,
    });
    expect(STAGES.dev.cloudRun.services.worker.cpuBilling).toBe("instance");
  });

  it("every stage: the worker can never be scaled to zero or request-billed", () => {
    // R6SOAK.1's `preview` exception (the request-billed 0.5 vCPU soak candidate) is RETIRED
    // on the RED verdict — all three stages now pin the D-P0.15h-3 instance-billed fix.
    for (const name of ["dev", "prod", "preview"] as const) {
      const w = STAGES[name].cloudRun.services.worker;
      expect(w.minInstances, name).toBeGreaterThanOrEqual(1);
      expect(w.cpuBilling, name).toBe("instance");
    }
    // the preview worker still never scales to zero — min=1 survives the candidate shape.
    expect(STAGES.preview.cloudRun.services.worker.minInstances).toBeGreaterThanOrEqual(1);
  });

  it("non-prod stages keep their cold floor + smaller ceilings (shape preserved)", () => {
    for (const stage of ["dev", "preview"] as const) {
      const s = STAGES[stage].cloudRun;
      for (const svc of ALL_SERVICES) {
        if (svc === "worker") continue;
        expect(s.services[svc].minInstances, `${stage}/${svc}`).toBe(0);
        expect(s.services[svc].cpuBilling, `${stage}/${svc}`).toBe("request");
      }
      expect(s.services.export.maxInstances).toBe(2);
      expect(s.services.worker.maxInstances).toBe(1);
      expect(s.convertSvc.minInstances).toBe(0);
      expect(s.convertSvc.maxInstances).toBe(2);
      expect(s.convertSvc.cpuBilling).toBe("request");
    }
  });

  it("posture covers exactly the six services-loop names + convert-svc", () => {
    for (const cfg of Object.values(STAGES)) {
      expect(Object.keys(cfg.cloudRun.services).sort()).toEqual([...ALL_SERVICES].sort());
      expect(cfg.cloudRun.convertSvc).toBeDefined();
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

describe("spa.surfaces stage flag — RETIRED (SPA.28; REQ-SEQ-4's removal leg)", () => {
  it("no StageConfig carries `spaSurfaces` — the flag can no longer be set, let alone consulted", () => {
    // SPA.28 — REMOVAL-DETECTING: the strangler flag is gone (all 14 flips landed, SPA.27 deleted
    // the SSR documents, the consult + override channels are removed). A stage flag that can no
    // longer change any serving behavior is dead machinery, not a safety knob — post-removal
    // rollback is revert+redeploy only (D-SPA.27-1). If `spaSurfaces` ever reappears on a stage it
    // would silently be dead config; this pin refuses that.
    for (const [name, cfg] of Object.entries(STAGES)) {
      expect(Object.prototype.hasOwnProperty.call(cfg, "spaSurfaces"), `stage ${name}`).toBe(false);
    }
    // The surface vocabulary itself survives — as the always-on fact in @rhema/contracts
    // (`SPA_SURFACES`) the journey markers + the SPA route map enumerate — never as a stage flag.
    expect(SPA_SURFACES.length).toBeGreaterThan(0);
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
