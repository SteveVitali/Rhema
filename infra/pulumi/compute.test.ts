import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// HOT.1 (BL-65) — every external-LB backend service must carry request logging
// (`logConfig { enable, sampleRate }`), the loadbalancing.googleapis.com/requests trail the 2026-09-30
// review found absent when the dossier 500s hit prod. compute.ts is a Pulumi program (not a pure
// function), so this is a structural assertion over the source — the same style as the launch-surface
// sweeps; it fails if a backend loses or never gains its logConfig block.

const SRC = readFileSync(fileURLToPath(new URL("./compute.ts", import.meta.url)), "utf8");

/** Extract the `{ … });` object literal of `new gcp.compute.BackendService(name("<n>"), {`. */
function backendBlock(name: string): string {
  const marker = `new gcp.compute.BackendService(name("${name}")`;
  const start = SRC.indexOf(marker);
  if (start < 0) return "";
  const brace = SRC.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < SRC.length; i++) {
    if (SRC[i] === "{") depth++;
    else if (SRC[i] === "}") {
      depth--;
      if (depth === 0) return SRC.slice(brace, i + 1);
    }
  }
  return "";
}

describe("HOT.1 — LB request logging on every external backend service (BL-65)", () => {
  for (const backend of ["web-backend", "api-backend", "collab-backend"]) {
    it(`${backend} logs requests to loadbalancing.googleapis.com/requests`, () => {
      const block = backendBlock(backend);
      expect(block, `${backend} definition found`).not.toBe("");
      expect(block).toContain("logConfig");
      expect(block).toMatch(/enable:\s*true/);
      expect(block).toMatch(/sampleRate:\s*1\.0?/);
    });
  }
});

describe("BILL.3 — the purchase switch is deploy config on the api", () => {
  it("injects PURCHASE_MODE from the stage fact (a mode string, never a secret)", () => {
    expect(SRC).toContain('{ name: "PURCHASE_MODE", value: cfg.purchaseMode }');
  });
});

describe("ECON.1 — the debit-mode flag is deploy config on BOTH consumers", () => {
  it("injects DEBIT_MODE from the stage fact on api + worker (a mode string, never a secret)", () => {
    // api's run paths and the worker's settle/cancel paths must read ONE stage fact — a divergent
    // pair would charge differently by which process happened to settle the run.
    expect(SRC.match(/\{ name: "DEBIT_MODE", value: cfg\.debitMode \}/g)).toHaveLength(2);
  });
});

describe("ONB.1 — the warm convert-svc keeps every §12.1/§13.3 isolation property (ADR-044)", () => {
  it("is a Cloud Run Service on the SAME convert image + SA + /usercontent mount as the Job, `--serve`d", () => {
    expect(SRC).toContain('new gcp.cloudrunv2.Service(name("convert-svc")');
    expect(SRC).toContain('serviceAccount: iam.serviceAccounts["convert"].email');
    expect(SRC).toContain('args: ["--serve"]');
    expect(SRC).toContain('{ name: "CONVERT_ROOT", value: "/usercontent" }');
    // the conditioned converted/-only write comes from iam.ts's convert SA — never re-granted here
    // (a second bucket grant would be a finding).
  });

  it("is invoker-gated + internal-ingress only, warm on prod, scale-to-zero off prod", () => {
    expect(SRC).toContain('new gcp.cloudrunv2.ServiceIamMember(name("api-invokes-convert-svc")');
    expect(SRC).toContain('name: convertSvc.name');
    expect(SRC).toContain('role: "roles/run.invoker"');
    // The service block must carry NO vpcAccess (the §12.1 posture the Job already runs under —
    // the extract covers the convertSvc literal through the services-loop marker).
    const svcStart = SRC.indexOf('new gcp.cloudrunv2.Service(name("convert-svc")');
    const svcEnd = SRC.indexOf("--- Cloud Run services", svcStart);
    const block = SRC.slice(svcStart, svcEnd);
    expect(block).toContain('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"');
    expect(block).not.toContain("vpcAccess:"); // the property — a comment may name the posture
    expect(block).toContain('minInstanceCount: cfg.kind === "prod" ? 1 : 0');
    // no DB credential, no secrets — the env is exactly CONVERT_ROOT (PORT is platform-reserved:
    // setting it 400s the revision — live finding on the first convert-svc create; serveConvert
    // defaults `PORT ?? 8080`)
    expect(block).not.toContain("DATABASE_URL");
    expect(block).not.toContain("secretKeyRef");
    expect(block).not.toContain("_SECRET");
    expect(block).not.toContain('"PORT"');
  });

  it("the api carries CONVERT_SERVICE_URL (service-first composite; the Job stays the fallback)", () => {
    expect(SRC).toContain('{ name: "CONVERT_SERVICE_URL", value: convertSvc.uri }');
    expect(SRC).toContain('name: "CONVERT_JOB"'); // the Job env is still mounted — the fallback leg
  });
});

describe("SEC.2 — the trusted client-IP channel is deploy config on BOTH ends (ADR-040)", () => {
  it("the web mints for INTERNAL_AUTH_AUDIENCE and the api verifies it + pins the caller SA", () => {
    // Both services must carry the SAME audience (the api origin) or the stamp never verifies; the
    // api additionally pins `INTERNAL_CALLER_SA` so only the web runtime SA's tokens authorize the
    // `x-rhema-client-ip` claim. All three are plain env strings — ambient OIDC, never a secret.
    expect(SRC.match(/\{ name: "INTERNAL_AUTH_AUDIENCE", value: apiOrigin \}/g)).toHaveLength(2);
    expect(SRC).toContain('{ name: "INTERNAL_CALLER_SA", value: iam.serviceAccounts["web"].email }');
  });

  it("prod web is LB-only ingress — the penultimate-XFF premise depends on it", () => {
    // `forwardedClientIp` reads the SECOND-to-last XFF hop as the LB-attested client; that premise is
    // true only when the LB is the sole entry path. A direct run.app hit appends just the client hop,
    // so "penultimate" would be caller-controlled — and the web would stamp it through the trusted
    // OIDC channel. Prod web therefore must NOT keep INGRESS_TRAFFIC_ALL; non-prod does (no public
    // DNS fronts those stages' LBs).
    expect(SRC).toContain('svc === "web" && cfg.kind !== "prod"');
    expect(SRC).toContain('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"');
  });
});
