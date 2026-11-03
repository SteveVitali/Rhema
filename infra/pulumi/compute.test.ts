import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const IAM_SRC = readFileSync(fileURLToPath(new URL("./iam.ts", import.meta.url)), "utf8");

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

describe("COST.1 — the Cloud Run posture is consumed from stage facts (REQ-COST-3)", () => {
  it("the services loop reads min/max instances from cfg.cloudRun.services — no ternary left", () => {
    expect(SRC).toContain("const posture = cfg.cloudRun.services[svc];");
    expect(SRC).toContain("minInstanceCount: posture.minInstances");
    expect(SRC).toContain("maxInstanceCount: posture.maxInstances");
    // the old kind-ternaries are gone — a lever is a data flip, never a program edit.
    expect(SRC).not.toContain('minInstanceCount: isWorker ? 1 : cfg.kind === "prod" ? 1 : 0');
    expect(SRC).not.toContain('maxInstanceCount: isCollab ? 1 : isWorker');
  });

  it("cpuIdle is declared on EVERY services-loop service from its stage fact (REQ-COST-2)", () => {
    // An implicit cpuIdle can't converge a live `cpu-throttling` drift — the +$42/mo
    // convert-svc finding. Every container now emits the field from `cpuBilling`.
    expect(SRC).toContain('cpuIdle: posture.cpuBilling === "request"');
  });
});

describe("R6INF.2 — the proxy ILB frontend (ADR-122; REQ-DEP-3; GD-REMAINING.R6)", () => {
  it("the MIG targetSize reads the stage fact — never a program ternary", () => {
    expect(SRC).toContain("targetSize: cfg.egressProxyTargetSize");
    // The old hardcoded floor is gone.
    expect(SRC).not.toContain("targetSize: 1,");
  });

  it("the frontend is a shared VIP + RegionBackendService + INTERNAL ForwardingRule, MIG-backed", () => {
    // ADR-122 items 1–3, verbatim: a NEW reserved internal `proxy-vip` Address on
    // private-app; a `proxy-be` RegionBackendService reusing `proxyHealth` with the MIG as
    // its backend; a `proxy-fr` INTERNAL ForwardingRule binding VIP:8443 to the backend.
    expect(SRC).toContain('new gcp.compute.Address(name("proxy-vip")');
    expect(SRC).toContain('new gcp.compute.RegionBackendService(name("proxy-be")');
    expect(SRC).toContain('new gcp.compute.ForwardingRule(name("proxy-fr")');
    const be = SRC.slice(
      SRC.indexOf('new gcp.compute.RegionBackendService(name("proxy-be")'),
      SRC.indexOf('new gcp.compute.ForwardingRule(name("proxy-fr")'),
    );
    expect(be).toContain('loadBalancingScheme: "INTERNAL"');
    expect(be).toContain('protocol: "TCP"');
    // NO `portName` — the INTERNAL scheme rejects it (live API 400; passthrough delivers to
    // the incoming destination port). The MIG still declares `namedPorts https:8443`.
    expect(be).not.toContain("portName:");
    expect(SRC).toContain('namedPorts: [{ name: "https", port: Number(proxyPort) }]');
    expect(be).toContain("healthChecks: proxyHealth.id"); // the same probe autoheal runs
    expect(be).toContain("group: proxyGroup.instanceGroup");
    expect(be).toContain('balancingMode: "CONNECTION"'); // INTERNAL requires CONNECTION (API 400 on UTILIZATION)
    expect(be).toContain('sessionAffinity: "NONE"'); // stateless CONNECT-style forwarder
    const fr = SRC.slice(SRC.indexOf('new gcp.compute.ForwardingRule(name("proxy-fr")'));
    expect(fr).toContain('loadBalancingScheme: "INTERNAL"');
    expect(fr).toContain('ipProtocol: "TCP"');
    expect(fr).toContain("ipAddress: proxyVip.address");
    expect(fr).toContain("ports: [proxyPort]");
    expect(fr).toContain("backendService: proxyBe.id");
    expect(fr).toContain("allowGlobalAccess: false"); // same-region consumers only
    // R6HRD.1 — the retained `proxy-ip` rollback reservation is DISCHARGED per ADR-122's own
    // cleanup step ("Cleanup `up` D deletes the reservation once the VIP path has soaked" —
    // VIP green since 2026-10-24, ~10 d): the Address is now created ONLY when
    // `egressProxyIpPin` needs a reservation to pin (a future transition), not parked on every
    // stage. An unconditional `new Address` would keep the surrendered-IP footgun alive.
    expect(SRC).toContain('cfg.egressProxyIpPin\n      ? new gcp.compute.Address(name("proxy-ip")');
  });

  it("the template pins networkIp ONLY through the transitional fact — never unconditionally", () => {
    // ADR-122 item 4: `networkIp` removal is gated behind the frontend presence — the pin
    // survives the `up` A/B window (`egressProxyIpPin: true`) so the direct 10.8.16.4 path
    // keeps serving in-flight pods, and is gone in the final posture (ephemeral NICs).
    // An unconditional `networkIp: proxyIp.address` literal would re-create F-R6INF.1-1's
    // one-holder trap on every size-2 stage; a missing conditional would kill the direct
    // path before consumers repoint. Both shapes fail here.
    expect(SRC).toContain("cfg.egressProxyIpPin && proxyIp ? { networkIp: proxyIp.address }");
    expect(SRC).not.toMatch(/\{\s*subnetwork: network\.subnets\["private-app"\]\.id, networkIp:/);
  });

  it("size >1 requires the ILB frontend AND the pin dropped — the frontend-presence guard", () => {
    // ADR-122 item 5: the `>1` throw becomes a frontend-presence assertion — size may
    // exceed 1 only when the program creates the backend service + forwarding rule
    // (`egressProxyFrontend === "ilb"`) AND the template does not pin `networkIp`
    // (`egressProxyIpPin === false`). The eval-time throw still sits inside the
    // deployProxyMig block BEFORE the RegionInstanceGroupManager; if it is removed,
    // weakened, or re-ordered, this pin fails and F-R6INF.1-1's trap re-opens.
    expect(SRC).toContain('cfg.egressProxyFrontend === "ilb"');
    const guard = SRC.indexOf(
      "if (cfg.egressProxyTargetSize > 1 && !(ilbFrontend && !cfg.egressProxyIpPin))",
    );
    const mig = SRC.indexOf('new gcp.compute.RegionInstanceGroupManager(name("proxy-mig")');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(mig);
  });

  it("the non-prod self-wire falls back to the VIP, not the reserved direct-path IP", () => {
    // ADR-122 item 6: `args.proxyBaseUrl ??` resolves to `proxyVip` (the LB frontend)
    // ahead of `proxyIp` on BOTH consumers — worker ANTHROPIC_BASE_URL + api
    // EGRESS_PROXY_URL — so previews self-wire the way prod consumes it.
    const workerBlock = SRC.slice(SRC.indexOf("ANTHROPIC_BASE_URL"));
    expect(workerBlock).toContain("args.proxyBaseUrl ??");
    expect(workerBlock).toContain("(proxyVip ?? proxyIp)!.address");
    const apiBlock = SRC.slice(SRC.indexOf("EGRESS_PROXY_URL"));
    expect(apiBlock).toContain("args.proxyBaseUrl ??");
    expect(apiBlock).toContain("(proxyVip ?? proxyIp)!.address");
  });
});

describe("R6HRD.1 — the proxy DSN leaves template metadata for a Secret Manager NAME (F-R6DEP4-2)", () => {
  const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

  it("the template metadata carries `database-url-secret` (a NAME) and never `database-url` (a value)", () => {
    // The plaintext `database-url` attribute was readable by anyone with
    // `compute.instances.get` — the whole finding. The new attribute names the SM secret
    // version the proxy resolves at boot via the instance SA (`anthropic-key-secret`
    // precedent); a value-bearing key returning would reopen it.
    expect(SRC).toContain('"database-url-secret": args.proxyDatabaseSecret ?? ""');
    expect(SRC).not.toContain('"database-url"');
    expect(SRC).not.toContain("args.proxyDatabaseUrl");
  });

  it("the template waits on the secret versions + IAM grants (boot reads versions/latest)", () => {
    const tmpl = SRC.indexOf('new gcp.compute.InstanceTemplate(name("proxy-tmpl")');
    const dep = SRC.indexOf("dependsOn: [...(args.secretVersions ?? []), ...iam.members]", tmpl);
    expect(dep, "template dependsOn secretVersions + iam.members").toBeGreaterThan(tmpl);
  });

  it("prod gains the dedicated `proxy-database-url` container + a program-managed version", () => {
    expect(INDEX_SRC).toContain('isProd ? ["proxy-database-url"] : ["system-database-url"]');
    expect(INDEX_SRC).toContain("rhema-${stack}-proxy-database-url-v1");
    expect(INDEX_SRC).toContain('secrets.byId["proxy-database-url"].id');
    // the config value lands ONLY in Secret Manager — the metadata arg is the version NAME.
    expect(INDEX_SRC).toContain("proxyDatabaseSecret: pulumi.interpolate");
  });

  it("the egress-proxy SA holds secretAccessor on the DSN container it resolves", () => {
    expect(IAM_SRC).toContain(
      'grantSecret("proxy-reads-proxydb", secrets.byId["proxy-database-url"], serviceAccounts["egress-proxy"])',
    );
    // non-prod: the generated system DSN container is the proxy's resolver source.
    expect(IAM_SRC).toContain(
      'grantSecret("proxy-reads-sysdb", secrets.byId["system-database-url"], serviceAccounts["egress-proxy"])',
    );
  });
});

describe("BILL.3 — the purchase switch is deploy config on the api", () => {
  it("injects PURCHASE_MODE from the stage fact (a mode string, never a secret)", () => {
    expect(SRC).toContain('{ name: "PURCHASE_MODE", value: cfg.purchaseMode }');
  });
});

describe("DEF.4 — the refund-window switch is deploy config on the api", () => {
  it("injects REFUND_WINDOW_MODE from the stage fact (a mode string, never a secret)", () => {
    expect(SRC).toContain('{ name: "REFUND_WINDOW_MODE", value: cfg.refundWindowMode }');
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
    // the extract covers the convertSvc literal through the OPS.1 migrate-Job marker, which sits
    // between convert-svc and the services loop).
    const svcStart = SRC.indexOf('new gcp.cloudrunv2.Service(name("convert-svc")');
    const svcEnd = SRC.indexOf("OPS.1 (owned decision (b))", svcStart);
    const block = SRC.slice(svcStart, svcEnd);
    expect(block).toContain('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"');
    expect(block).not.toContain("vpcAccess:"); // the property — a comment may name the posture
    // COST.1 (REQ-COST-3) — scaling is a stage fact now, not a program ternary.
    expect(block).toContain("minInstanceCount: cfg.cloudRun.convertSvc.minInstances");
    expect(block).toContain("maxInstanceCount: cfg.cloudRun.convertSvc.maxInstances");
    // COST.1 (REQ-COST-2) — cpuIdle is declared EXPLICITLY from the stage fact, never
    // implicit: an undeclared field can never converge a live `cpu-throttling` drift (the
    // codify-or-revert rule — the +$42/mo convert-svc drift was the live finding).
    expect(block).toContain('cpuIdle: cfg.cloudRun.convertSvc.cpuBilling === "request"');
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
    // OPS.1 (F-OPS.1-8) — the api joins web in the non-prod ALL set: no LB fronts those stages,
    // the program grants api-public-invoker on purpose, and run.app is the smoke/journey path.
    expect(SRC).toContain('(svc === "web" || svc === "api") && cfg.kind !== "prod"');
    expect(SRC).toContain('"INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"');
  });
});

describe("RUN.1 — the worker's walkthrough model key is deploy config (ADR-052)", () => {
  it("injects WALKTHROUGH_MODEL_KEY_SECRET as the anthropic-api-key secret VERSION on the worker", () => {
    // The deployed regression (2026-09-30: every prod run.walkthrough failed `walkthrough
    // unconfigured`) was an env var that existed only in env.ts/main.ts — the Pulumi program never
    // named it. The assertion binds the env to `secretVersion(secrets.anthropicApiKey)` (the secret
    // NAME's `/versions/latest` — never the value; REQ-ARCH-30) and inside the worker container's
    // `isWorker` envs block, so `loadWalkthroughGenerator` can never stub on a deployed stage.
    const workerBlock = SRC.slice(
      SRC.indexOf("...(isWorker"),
      SRC.indexOf('...(svc === "api"'),
    );
    expect(workerBlock).toContain(
      '{ name: "WALKTHROUGH_MODEL_KEY_SECRET", value: secretVersion(secrets.anthropicApiKey) }',
    );
    expect(workerBlock).toMatch(
      /requires\("anthropic-api-key"\)[^]*WALKTHROUGH_MODEL_KEY_SECRET/,
    );
  });

  it("the worker SA holds secretAccessor on anthropic-api-key — the operator-side exception", () => {
    // iam.ts documents egress-proxy as the sole reader FOR MODEL TRAFFIC; the worker grant is the
    // ADR-052 exception (ingest.reconstruct + walkthrough). If either side of that pair is deleted,
    // both legs silently fail at boot — keep them asserted together.
    expect(IAM_SRC).toContain('grantSecret("worker-reads-anthropic", secrets.anthropicApiKey');
    expect(IAM_SRC).toContain('grantSecret("proxy-reads-anthropic", secrets.anthropicApiKey');
    // and no other service ever reads the provider key (REQ-ARCH-31).
    const grants = IAM_SRC.match(/grantSecret\("[^"]+", secrets\.anthropicApiKey/g) ?? [];
    expect(grants).toHaveLength(2);
  });
});

describe("SPA.28 — the strangler deploy config is RETIRED (REQ-SEQ-4's removal leg)", () => {
  const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");

  /** The web-only envs block inside the Cloud Run services loop (`...(svc === "web" ? {`). */
  const webBlock = (() => {
    const start = SRC.indexOf('...(svc === "web"');
    return SRC.slice(start, SRC.indexOf("vpcAccess:", start));
  })();

  it("web env emits NEITHER SPA_SURFACES NOR SPA_OVERRIDES — nothing consults them anymore", () => {
    // Removal-detecting: all 14 flips landed and SPA.27 deleted the SSR documents, so an env
    // that could no longer change serving behavior is dead machinery — and a re-added emission
    // would silently be a lie. Pin the absence everywhere (not just the web block) so a stray
    // re-introduction on api/worker fails too.
    expect(SRC.match(/name: "SPA_SURFACES"/g) ?? []).toHaveLength(0);
    expect(SRC.match(/name: "SPA_OVERRIDES"/g) ?? []).toHaveLength(0);
    // The Pulumi config reader + the preview per-flip path retired with the env they fed —
    // scan the CODE only (retirement-note comments may name the retired key honestly).
    const indexCode = INDEX_SRC.split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
    expect(indexCode).not.toContain("spaSurfaces");
  });

  it("the web block still exists (SIGNUP_MODE & friends ride on) — only the flag envs left", () => {
    expect(webBlock).not.toBe("");
    expect(webBlock).toContain("SIGNUP_MODE");
  });
});
