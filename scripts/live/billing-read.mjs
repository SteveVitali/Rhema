#!/usr/bin/env node
// OPS.2 — the measured-bill tool (REQ-ARCH-28 / the ticket's BL-8 leg). There is no public API for
// billed ACTUALS (the `sig_billing_export` BigQuery dataset exists but is EMPTY — the console-only
// export flip is D-OPS.2-1), so this recomputes the prod monthly bill bottom-up from TWO live
// sources:
//
//   1. LIVE INVENTORY — `gcloud` reads of the deployed prod shapes (tiers, sizes, counts, scaling).
//   2. LIST PRICES — the Cloud Billing Catalog API (`cloudbilling.googleapis.com/v1`), the same
//      price book the invoice is built from. Every line prints its matched SKU description so the
//      mapping is auditable and no number is hand-typed.
//
// Caveats, honestly named: usage-priced tails (egress GB, request counts, build minutes, backup
// GB) are ESTIMATED at documented volumes — the always-on floor lines are exact list math.
//
// Usage:  node scripts/live/billing-read.mjs [--json]
// Auth:   `gcloud auth application-default` (a billing READ — $0; REQ-SPEC-32 unaffected).

import { execSync } from "node:child_process";

const PROJECT = "rhema-507501";
const REGION = "us-central1";
const HOURS = 730; // the GCP month's conventional hour count
const SEC = 2592000; // 30d in seconds
const jsonMode = process.argv.includes("--json");

const g = (cmd) => JSON.parse(execSync(`gcloud ${cmd} --project=${PROJECT} --format=json`, { encoding: "utf8" }));
const TOKEN = execSync("gcloud auth application-default print-access-token", { encoding: "utf8" }).trim();

async function apiJson(url) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function allSkus(serviceName) {
  const out = [];
  let token = "";
  do {
    const page = await apiJson(
      `https://cloudbilling.googleapis.com/v1/${serviceName}/skus?pageSize=5000${token ? `&pageToken=${token}` : ""}`,
    );
    out.push(...(page.skus ?? []));
    token = page.nextPageToken ?? "";
  } while (token);
  return out;
}

/**
 * Display-unit USD price of the first SKU matching every needle and no `excludes`, in
 * us-central1 or global scope. `usd` is per the SKU's usageUnit (h | GiBy.h | GiBy.mo | GiBy | s | mo).
 */
function priceOf(skus, { needles, excludes = [], label }) {
  const inScope = (s) =>
    (s.serviceRegions ?? []).some((r) => r === REGION || r === "global" || s.serviceRegions.length === 0);
  const sku = skus.find((s) => {
    const d = s.description.toLowerCase();
    return inScope(s) && needles.every((n) => d.includes(n.toLowerCase())) &&
      !excludes.some((x) => d.includes(x.toLowerCase()));
  });
  if (!sku) return { label, usd: null, unit: "?", sku: `NO MATCH: ${needles.join(" + ")}` };
  // The MARGINAL rate — tieredRates[0] is frequently a free tier (e.g. Secret Manager's first 6
  // versions); the last tier is the always-on/always-billed price. Free-quantity allowances are
  // subtracted at the line, not inside the rate.
  const r = (sku.pricingInfo?.[0]?.pricingExpression?.tieredRates ?? []).at(-1)?.unitPrice;
  const usd = Number(r?.units ?? 0) + Number(r?.nanos ?? 0) / 1e9;
  return {
    label,
    usd,
    unit: sku.pricingInfo?.[0]?.pricingExpression?.usageUnit ?? "?",
    sku: `${sku.description} ($${usd.toFixed(usd < 0.001 ? 6 : 4)}/${sku.pricingInfo?.[0]?.pricingExpression?.usageUnit ?? "?"})`,
  };
}

const services = (await apiJson("https://cloudbilling.googleapis.com/v1/services?pageSize=5000")).services;
const svcId = (display) => services.find((s) => s.displayName === display)?.name;
const catalog = {};
for (const d of ["Compute Engine", "Cloud SQL", "Cloud Memorystore for Redis", "Cloud Run",
  "Secret Manager", "Cloud Storage", "Networking", "Artifact Registry"]) {
  catalog[d] = await allSkus(svcId(d));
}
const [computeSkus, sqlSkus, redisSkus, runSkus, smSkus, gcsSkus, netSkus, arSkus] =
  ["Compute Engine", "Cloud SQL", "Cloud Memorystore for Redis", "Cloud Run",
   "Secret Manager", "Cloud Storage", "Networking", "Artifact Registry"].map((d) => catalog[d]);

// ---- live inventory -----------------------------------------------------------
const sql = g(`sql instances list`)[0];
const sqlTier = sql.settings.tier;
const sqlDisk = Number(sql.settings.dataDiskSizeGb);
const redis = g(`redis instances list --region=${REGION}`)[0];
const redisGb = Number(redis.memorySizeGb);
const gkePools = g(`container node-pools list --cluster=rhema-prod-run-task-gke-c13cb80 --zone=us-central1-a`);
const migTemplate = g(`compute instance-templates list`)[0];
const migSize = g(`compute instance-groups managed list`)[0]?.size ?? 1;
const fwdRulesAll = g(`compute forwarding-rules list`);
const fwdRules = fwdRulesAll.length;
// R6INF.2 (ADR-122) — internal passthrough NLB rules bill under the GENERIC Cloud Load
// Balancer forwarding-rule minimum ($0.025/h Americas multi-region, covers ≤5) + internal
// inbound data processing; counting them inside the external "HTTPS LB" line hid the delta.
const intFwdRules = fwdRulesAll.filter((r) => r.loadBalancingScheme === "INTERNAL").length;
const extIps = g(`compute addresses list`).filter((a) => a.addressType === "EXTERNAL").length;
const nats = g(`compute routers nats list --router=rhema-prod-router-2d3edc8 --region=${REGION}`).length;
const secretsCount = g(`secrets list`).length;
const runSvc = g(`run services list --region=${REGION}`);

const shared = (mt) => (mt === "e2-medium" ? { c: 1, r: 4 } : mt === "e2-small" ? { c: 0.5, r: 2 } : { c: 2, r: 8 });

// ---- line items ---------------------------------------------------------------
const lines = [];
const X = ["committed", "discount", "spot", "custom", "sole", "premium", "cud", "free tier"];

// R6INF.1 — the SKU needle follows the LIVE availability type: ZONAL prices
// `Zonal - Small instance` ($0.035/h) + `Zonal - Standard storage` ($0.17/GiBy·mo);
// REGIONAL (HA standby, GD-HA.R6) prices `Regional - Small instance` ($0.070/h) +
// `Regional - Standard storage` ($0.34/GiBy·mo) — both at 2× (catalog audited
// 2026-10-22). Backups price the same on either posture.
const sqlAvail = String(sql.settings.availabilityType ?? "ZONAL").toUpperCase();
const sqlAvailNeedle = sqlAvail === "REGIONAL" ? "regional" : "zonal";
const sqlCore = priceOf(sqlSkus, { label: `Cloud SQL ${sqlTier} (${sqlAvail})`, needles: ["postgresql", sqlAvailNeedle, "small instance in americas"], excludes: ["fdc"] });
const sqlDiskP = priceOf(sqlSkus, { label: `Cloud SQL SSD ${sqlDisk}GB (${sqlAvail})`, needles: ["postgresql", sqlAvailNeedle, "standard storage in americas"], excludes: ["enterprise", "fdc", "sql server", "mysql"] });
const sqlBak = priceOf(sqlSkus, { label: "Cloud SQL backups", needles: ["backups in americas"] });
lines.push({
  service: `Cloud SQL ${sqlTier} ${sqlAvail} + ${sqlDisk}GB SSD + backups`,
  usdMonth: (sqlCore.usd ?? 0) * HOURS + (sqlDiskP.usd ?? 0) * sqlDisk + (sqlBak.usd ?? 0) * sqlDisk,
  src: [sqlCore.sku, sqlDiskP.sku, `${sqlBak.sku} (×${sqlDisk}GB kept ≤ instance size)`],
});

const redisP = priceOf(redisSkus, { label: "Memorystore BASIC", needles: ["redis capacity basic m1", "iowa"], });
lines.push({ service: `Memorystore BASIC ${redisGb}GB`, usdMonth: (redisP.usd ?? 0) * redisGb * HOURS, src: [redisP.sku] });

const e2c = priceOf(computeSkus, { label: "e2 core", needles: ["e2 instance core running in americas"], excludes: X });
const e2r = priceOf(computeSkus, { label: "e2 ram", needles: ["e2 instance ram running in americas"], excludes: X });
const pdStd = priceOf(computeSkus, { label: "pd-standard", needles: ["storage pd capacity"], excludes: ["regional", "snapshot", "iowa regional", ...X] });
for (const pool of gkePools) {
  const mt = pool.config.machineType;
  const n = pool.initialNodeCount ?? 1;
  const sh = shared(mt);
  const gb = Number(pool.config.diskSizeGb ?? 100);
  lines.push({
    service: `GKE node ${mt} ×${n} (+${gb}GB pd)`,
    usdMonth: (e2c.usd * sh.c + e2r.usd * sh.r) * HOURS * n + (pdStd.usd ?? 0) * gb * n,
    src: [e2c.sku, e2r.sku, `${pdStd.sku} ×${gb}GB`],
  });
}
lines.push({ service: "GKE cluster management fee", usdMonth: 0,
  src: ["$0.10/hr/cluster — EXEMPT: GKE free tier covers the first zonal Standard cluster per billing account"] });

const migMt = migTemplate.properties.machineType;
const msh = shared(migMt);
const mgb = Number(migTemplate.properties.disks?.[0]?.initializeParams?.diskSizeGb ?? 10);
lines.push({
  service: `Proxy MIG ${migMt} ×${migSize} (+${mgb}GB pd)`,
  usdMonth: (e2c.usd * msh.c + e2r.usd * msh.r) * HOURS * migSize + (pdStd.usd ?? 0) * mgb * migSize,
  src: [e2c.sku, e2r.sku, `${pdStd.sku} ×${mgb}GB`],
});

const natUp = priceOf(netSkus, { label: "NAT uptime", needles: ["cloud nat gateway uptime"] });
const natData = priceOf(netSkus, { label: "NAT data", needles: ["cloud nat data processing"] });
lines.push({ service: `Cloud NAT ×${nats} (gateway + ~5GB/mo)`, usdMonth: (natUp.usd ?? 0) * HOURS * nats + (natData.usd ?? 0) * 5,
  src: [natUp.sku, `${natData.sku} (est. 5GB — proxy/provider egress)`] });

const lbRule = priceOf(netSkus, { label: "LB rule", needles: ["cloud load balancer forwarding rule minimum global"] });
const lbData = priceOf(netSkus, { label: "LB inbound", needles: ["global external application load balancer inbound data processing"] });
lines.push({ service: `HTTPS LB (${fwdRules - intFwdRules} rules + ~20GB)`, usdMonth: (lbRule.usd ?? 0) * HOURS + (lbData.usd ?? 0) * 20,
  src: [lbRule.sku, `${lbData.sku} (est. 20GB — web/api traffic)`] });

// R6INF.2 (ADR-122) — the egress-proxy ILB: generic LB forwarding-rule minimum is charged
// per LB family (external rules already bill under `lbRule` above — the minimum covers
// ≤5 rules EACH family), plus internal inbound data processing (~10GB/mo proxy traffic).
if (intFwdRules > 0) {
  const ilbRule = priceOf(netSkus, { label: "internal LB rule", needles: ["cloud load balancer forwarding rule minimum for americas"] });
  const ilbData = priceOf(netSkus, { label: "internal LB inbound", needles: ["regional internal passthrough network load balancer inbound data processing", "iowa"] });
  lines.push({ service: `Internal passthrough NLB (${intFwdRules} rules + ~10GB)`, usdMonth: (ilbRule.usd ?? 0) * HOURS + (ilbData.usd ?? 0) * 10,
    src: [ilbRule.sku, `${ilbData.sku} (est. 10GB — proxy consumer traffic)`] });
}

const smVer = priceOf(smSkus, { label: "SM versions", needles: ["secret version replica storage"] });
lines.push({ service: `Secret Manager (${secretsCount} versions, 6 free)`, usdMonth: (smVer.usd ?? 0) * Math.max(0, secretsCount - 6), src: [smVer.sku] });

const runMinCpu = priceOf(runSkus, { label: "min CPU", needles: ["services min instance cpu (request-based billing)"] });
const runMinMem = priceOf(runSkus, { label: "min mem", needles: ["services min instance memory (request-based billing)"] });
const runCpu = priceOf(runSkus, { label: "inst CPU", needles: ["services cpu (instance-based billing)"] });
const runMem = priceOf(runSkus, { label: "inst mem", needles: ["services memory (instance-based billing)"] });
let runTotal = 0;
const runDetail = [];
for (const s of runSvc) {
  const tpl = s.spec?.template ?? {};
  const ann = tpl.metadata?.annotations ?? {};
  const min = Number(ann["autoscaling.knative.dev/minScale"] ?? 0);
  const c = tpl.spec?.containers?.[0]?.resources?.limits ?? {};
  const cpuStr = String(c.cpu ?? "1");
  const vcpu = cpuStr.endsWith("m") ? Number(cpuStr.slice(0, -1)) / 1000 : Number(cpuStr);
  const memStr = String(c.memory ?? "512Mi");
  const gib = memStr.endsWith("Gi") ? Number(memStr.slice(0, -2)) : Number(memStr.replace(/Mi|M$/, "")) / (memStr.endsWith("Gi") ? 1 : 1024);
  const alwaysOn = ann["run.googleapis.com/cpu-throttling"] === "false";
  const cpuP = alwaysOn ? runCpu.usd : runMinCpu.usd;
  const memP = alwaysOn ? runMem.usd : runMinMem.usd;
  const usd = ((cpuP ?? 0) * vcpu + (memP ?? 0) * gib) * SEC * min;
  runTotal += usd;
  runDetail.push(`${s.metadata.name}: min=${min} ${vcpu}vCPU ${gib.toFixed(1)}GiB${alwaysOn ? " cpuIdle=false" : ""} → $${usd.toFixed(2)}`);
}
lines.push({ service: `Cloud Run warm floor (${runSvc.length} svc)`, usdMonth: runTotal,
  src: [runMinCpu.sku, runCpu.sku, ...runDetail] });

const gcsStd = priceOf(gcsSkus, { label: "GCS std", needles: ["standard storage"], excludes: ["autoclass", "dual", "archive", "nearline", "coldline", "turbo", "snapshot"] });
lines.push({ service: "GCS (~15GB std)", usdMonth: (gcsStd.usd ?? 0) * 15, src: [`${gcsStd.sku} (est. 15GB — artifacts/user-content/cloudbuild)`] });

const arP = priceOf(arSkus, { label: "AR storage", needles: ["artifact registry storage"] });
lines.push({ service: "Artifact Registry (~8GB)", usdMonth: Math.max(0, 8 - 0.5) * (arP.usd ?? 0), src: [`${arP.sku} (est. 8GB images − 0.5GB free)`] });

lines.push({ service: `External IPv4 (${extIps} in-use)`, usdMonth: 3.65 * extIps,
  src: [`est. $0.005/hr in-use — the in-use IPv4 SKU is not description-matchable in the catalog`] });

// ---- report -------------------------------------------------------------------
const total = lines.reduce((a, l) => a + l.usdMonth, 0);
lines.sort((a, b) => b.usdMonth - a.usdMonth);

if (jsonMode) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), totalUsdMonth: +total.toFixed(2), lines }, null, 2));
} else {
  console.log(`# OPS.2 prod bill recomputation — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`# sources: Cloud Billing Catalog API list prices + gcloud inventory of ${PROJECT}`);
  console.log(`# usage-priced tails (egress/requests/backups/builds) are documented estimates\n`);
  for (const l of lines) {
    console.log(`${l.usdMonth.toFixed(2).padStart(9)}  ${l.service}`);
    for (const s of l.src) console.log(`            ↳ ${s}`);
  }
  console.log(`\n  TOTAL ≈ $${total.toFixed(2)}/mo   (target ~$50 · documented always-on floor ~$95)`);
}
