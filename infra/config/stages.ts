// Stage configuration (spec §13.2), as PURE data so the invariants are unit-testable without a live
// GCP deploy. The Pulumi program (`infra/pulumi/`) consumes this to build the real GCP resources, so
// the same numbers the tests assert are the numbers that deploy. The security-critical facts — the
// sandbox subnet has NO Cloud NAT and NO default internet route (REQ-ARCH-2), prod's managed Postgres
// stays warm (Cloud SQL, amended 2026-09-17 — dev/previews keep AlloyDB), previews are paused/small
// with isolated buckets and a per-run spend guard — live here
// and are asserted by tests, standing in for the live route/firewall checks that need H0 (the deployed
// VPC) to read directly (DEFERRALS D-P0.01-2).
//
// AWS→GCP amendment (2026-09-02): Aurora→AlloyDB, S3→GCS, IGW/NAT→Cloud NAT + default-route, security
// group→egress firewall. The abstract facts (no internet reachability for the sandbox; per-run caps;
// versioned isolated buckets) are provider-independent and carry over verbatim.

import type { SignupMode } from "@rhema/contracts";

export type StageKind = "dev" | "preview" | "prod";

/**
 * PRB.15 — the production serving surface (§13.1; `D-PRB.02-1`'s IaC leg). **Amended 2026-09-17:** the
 * operator controls the single `rhema.tools` zone (the earlier `rhema.app` + `rhemausercontent.com`
 * scheme is superseded). The app rides the apex, the api the `api.` subdomain, and user-uploaded
 * content serves from the cookieless `usercontent.rhema.tools` origin (the `*.` wildcard for
 * per-workspace content hosts was dropped at Stage B 2026-09-17 — Google managed certs reject
 * wildcard SANs; reviving it needs Certificate Manager + DNS authorization). The
 * separate-registrable-domain split is gone, so cookie isolation
 * now rests on the `usercontent` origin setting NO cookies and every auth cookie being host-only
 * `__Host-`-prefixed — a `Domain=rhema.tools` cookie planted from a sibling subdomain can neither
 * shadow the session nor leak it back (see `apps/api/src/auth.ts`, asserted by `auth.test.ts`).
 * Non-prod stages keep the `${stack}.rhema.dev` placeholder and carry no `domains` block.
 */
export interface StageDomains {
  /** The web app's public origin (`rhema.tools` apex on prod). */
  readonly app: string;
  /** The api service's public origin (`api.rhema.tools` on prod — same LB, host-routed). */
  readonly api: string;
  /** The cookieless user-content origin host (bare host only — no `*.` wildcard; see above). */
  readonly userContent: string;
}

/** Every domain the prod managed certificate + URL map must cover (apex, api, user-content host). */
export const PROD_DOMAINS: StageDomains = {
  app: "rhema.tools",
  api: "api.rhema.tools",
  userContent: "usercontent.rhema.tools",
} as const;

/**
 * Every Secret Manager secret-id suffix the program provisions (stack-prefixed `rhema-<stack>-<id>`);
 * each stage's `requiredSecrets` names the subset that must carry a *version* before its services
 * serve. Values are always operator-set out of band — never in repo, Pulumi config, or any ledger
 * (HUMAN-H6; REQ-ARCH-30). `anthropic-api-key` stays reachable ONLY from the egress-proxy
 * (REQ-ARCH-31).
 */
export const ALL_SECRET_IDS = [
  "anthropic-api-key", // provider key — egress-proxy only (REQ-ARCH-31)
  "run-token-signing-key", // RS256 run-token keypair — api/worker mint+verify, proxy verifies
  "alloydb-password", // the postgres bootstrap password (H6) — engine-agnostic (AlloyDB on dev,
  //   Cloud SQL on prod); the operator builds DATABASE_URLs from it. Id kept for stack continuity.
  "better-auth-secret", // api — session/signing secret (PRB.12)
  "google-oauth-client-secret", // api — Google sign-in (PRB.12; the client id is deploy config)
  "stripe-secret", // api + worker — Checkout/Portal + auto-reload off-session charges (P1.16; was worker-only PRB.08)
  "stripe-webhook-secret", // api — the whsec_… verifying POST /stripe/webhook (PRB.08)
  "email-action-secret", // api verifies + worker mints the one-click HMAC (PRB.09)
  "resend-api-key", // worker — the mail.send transport (PRB.09)
  "anthropic-admin-key", // worker — the Usage & Cost report for usage.reconcile (PRB.08)
  "ops-alert-webhook-url", // worker — the >2%-drift / balance-divergence alert sink (PRB.08).
  //   REQUIRED on prod again (amended 2026-09-18 — PRB.17's gate answer chose the "tiny webhook
  //   catcher" alert path, so the worker's OPS_ALERT_WEBHOOK_URL env must exist before prod serves)
  "user-content-signing-key", // api — signs the CDN download URLs for the PRIVATE user-content bucket
  //   (the *.usercontent.rhema.tools origin serves only signed requests; the same key is added to the
  //   backend bucket by the operator — `gcloud compute backend-buckets add-signed-url-key`, runbook)
] as const;

/**
 * The prod secret set — every name HUMAN-H6 must seed a version of before `pulumi up prod` serves.
 * `ops-alert-webhook-url` is back IN (amended 2026-09-18 — the PRB.17 gate answer named the webhook
 * catcher the prod alert destination; the drift/balance-divergence alert path fails closed without it).
 */
export const PROD_REQUIRED_SECRETS: readonly string[] = ALL_SECRET_IDS;

/** The dev secret set — the shared-integration stack serves the full auth/billing/mail surface
 *  (PRB.08/09 live legs run there); only the prod-ops alert sink is prod-only. */
export const DEV_REQUIRED_SECRETS: readonly string[] = [
  "anthropic-api-key",
  "run-token-signing-key",
  "alloydb-password",
  "better-auth-secret",
  "google-oauth-client-secret",
  "stripe-secret",
  "stripe-webhook-secret",
  "email-action-secret",
  "resend-api-key",
  "anthropic-admin-key",
];

/** The preview secret set — previews never carry production secrets (REQ-ARCH-38). */
export const PREVIEW_REQUIRED_SECRETS: readonly string[] = [
  "anthropic-api-key",
  "run-token-signing-key",
];

/**
 * The managed Postgres engine for the stage (PRB.15 amended 2026-09-17 — prod moved to Cloud SQL for
 * cost: the operator's ~$50/mo prod infra budget cannot carry AlloyDB's ~$270/mo minimum primary;
 * §12's provider table already called Cloud SQL "the simpler swap"). Dev stays on AlloyDB (it is the
 * already-live dev substrate); previews keep the small/paused AlloyDB shape.
 */
export type DatabaseEngine = "alloydb" | "cloudsql";

export interface DatabaseConfig {
  engine: DatabaseEngine;
  /**
   * AlloyDB only: primary instance vCPU count (AlloyDB sizes by CPU). Ignored on Cloud SQL — the
   * `cloudSqlTier` drives the shape.
   */
  primaryCpuCount?: number;
  /**
   * Cloud SQL only: the machine tier. `db-g1-small` (1 shared vCPU / 1.7 GiB) is the minimal
   * prod-ready shared-core tier — `db-f1-micro` is the absolute floor (~0.6 GiB) but too thin to
   * call prod-ready. Ignored on AlloyDB.
   */
  cloudSqlTier?: string;
  /**
   * Whether the database is stopped/paused when idle (previews only, to avoid idle spend). Dev and
   * prod keep the primary warm; a preview's database is the small/paused stand-in (REQ-ARCH-38).
   */
  paused: boolean;
  /**
   * Backup + point-in-time-recovery retention in days (REQ-ARCH-28). AlloyDB: the continuous-backup
   * recovery window (35d). Cloud SQL: that many DAILY automated backups retained — its PITR
   * transaction-log window hard-caps at 7 days, so the PITR half lands at 7 regardless (the honest
   * ceiling; the 35-day spirit survives as the backup horizon, not the recovery granularity).
   */
  backupRetentionDays: number;
}

export interface VpcSubnet {
  name: string;
  /** CIDR mask size; spec sizes subnets at /20. */
  cidrMask: number;
  /**
   * A `0.0.0.0/0` default route to the default internet gateway. The sandbox subnet MUST be false —
   * with no default route, packets to the internet have nowhere to go (REQ-ARCH-2).
   */
  hasDefaultInternetRoute: boolean;
  /**
   * Cloud NAT egress. The sandbox subnet MUST be false — not even NATed egress is permitted; the ONLY
   * way out is the egress-proxy (which itself sits on a NATed subnet). (REQ-ARCH-2)
   */
  hasCloudNat: boolean;
  /**
   * The POD-level egress guarantee for this subnet. For the sandbox this stays the egress-proxy ONLY
   * (REQ-ARCH-2) — enforced at the pod layer by the `runs`-namespace NetworkPolicy (dataplane-v2), which is
   * strictly tighter than the node firewall. This is the security-critical fact the boundary rests on.
   */
  egressTargets: string[];
  /**
   * The NODE-level egress the subnet's firewall permits, which is broader than `egressTargets` by design: a
   * private GKE node with no NAT still must reach the Private-Google-APIs VIP (image pull, GCS, Secret Manager)
   * and the GKE control plane to bootstrap (D-P0.15c-8). This is NOT arbitrary-internet egress and does NOT
   * loosen the pod guarantee above — the NetworkPolicy still confines the pods to the proxy + kube-dns.
   */
  nodeEgressTargets?: string[];
}

export interface VpcConfig {
  subnets: VpcSubnet[];
}

export interface StageConfig {
  kind: StageKind;
  /** The stage's managed Postgres (AlloyDB on dev/preview; Cloud SQL on prod — amended 2026-09-17). */
  database: DatabaseConfig;
  vpc: VpcConfig;
  /** GCS buckets isolated per stage (never shared across stages). */
  isolatedBuckets: boolean;
  /** GCS object versioning on (REQ-ARCH-28). */
  gcsVersioning: boolean;
  /** Per-run spend guard in USD; previews are capped hard (Base tier only, $3/run — REQ-ARCH-38). */
  maxUsdPerRun: number;
  /** Previews never receive production secrets or user-text fixtures (REQ-ARCH-38). */
  allowsProductionSecrets: boolean;
  /**
   * PRB.13 — `signup.mode` (REQ-BETA-19 amended 2026-09-16), deployed to BOTH consumers as `SIGNUP_MODE`
   * (the api's `POST /signup` admission gate + the web `/login` pre-gate — one source of truth, never a
   * secret). `invite` keeps the PRB.01 private-beta gate; `open` is the self-serve paid beta. Every stage
   * stays `invite` until the prod bring-up (PRB.15) deliberately flips prod — the flag fails closed.
   */
  signupMode: SignupMode;
  /**
   * PRB.15 — the stage's public serving surface (undefined off prod: previews keep the
   * `${stack}.rhema.dev` placeholder and never need real DNS). The Pulumi program builds the managed
   * cert's SAN list + the URL map's host rules from this block — the numbers the tests assert are the
   * numbers that deploy.
   */
  readonly domains?: StageDomains;
  /**
   * PRB.15 — the Secret Manager ids (unprefixed — the program prefixes `rhema-<stack>-`) that must
   * carry a version before this stage serves. `requiredSecrets` is the operator's seeding checklist
   * (HUMAN-H6); provisioning stays versionless, values never enter the program or any ledger.
   */
  readonly requiredSecrets: readonly string[];
}

/**
 * The sandbox subnet is identical across stages: no default internet route, no Cloud NAT, egress only
 * to the egress-proxy firewall target. This is the network half of REQ-ARCH-2 (the process half is the
 * two-uid run-task image); a live deploy asserts these same facts against the real VPC (D-P0.01-2).
 */
function sandboxSubnet(): VpcSubnet {
  return {
    name: "sandbox",
    cidrMask: 20, // /20 per §13.2
    hasDefaultInternetRoute: false, // REQ-ARCH-2 — no 0.0.0.0/0 default route
    hasCloudNat: false, // REQ-ARCH-2 — no NATed egress either
    egressTargets: ["fw:egress-proxy"], // POD egress (NetworkPolicy): the proxy only — the security invariant
    // NODE egress (firewall): the proxy PLUS the PGA VIP + GKE master, so a no-NAT node can bootstrap +
    // pull images (D-P0.15c-8). Broader than the pod guarantee, never arbitrary-internet.
    nodeEgressTargets: ["fw:egress-proxy", "pga:private-googleapis", "fw:gke-master"],
  };
}

function baseVpc(): VpcConfig {
  return {
    subnets: [
      // Serverless/public tier: Cloud Run + the external HTTPS LB reach the internet directly.
      { name: "public", cidrMask: 20, hasDefaultInternetRoute: true, hasCloudNat: false, egressTargets: ["*"] },
      // Private app tier: no external IPs; egress to the internet is via Cloud NAT only.
      { name: "private-app", cidrMask: 20, hasDefaultInternetRoute: false, hasCloudNat: true, egressTargets: ["*"] },
      sandboxSubnet(),
    ],
  };
}

export const STAGES: Record<StageKind, StageConfig> = {
  dev: {
    kind: "dev",
    database: { engine: "alloydb", primaryCpuCount: 2, paused: false, backupRetentionDays: 35 },
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 10,
    allowsProductionSecrets: false,
    signupMode: "invite", // PRB.13 — dev keeps the private-beta invite gate (open is prod-only)
    requiredSecrets: DEV_REQUIRED_SECRETS,
  },
  preview: {
    kind: "preview",
    database: { engine: "alloydb", primaryCpuCount: 2, paused: true, backupRetentionDays: 1 }, // small + paused
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 3, // REQ-ARCH-38
    allowsProductionSecrets: false, // REQ-ARCH-38
    signupMode: "invite", // PRB.13 — previews never self-serve
    requiredSecrets: PREVIEW_REQUIRED_SECRETS,
  },
  prod: {
    kind: "prod",
    // Cloud SQL on prod (amended 2026-09-17): db-g1-small is the minimal prod-ready shared-core tier —
    // warm/ALWAYS (never paused; the F32 cold-start concern is moot at this size — it stays up), zonal
    // (REGIONAL HA roughly doubles cost — the lever if prod outgrows the budget), 35 daily backups +
    // 7-day PITR (Cloud SQL's cap).
    database: { engine: "cloudsql", cloudSqlTier: "db-g1-small", paused: false, backupRetentionDays: 35 },
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 100,
    allowsProductionSecrets: true,
    signupMode: "open", // PRB.15 — self-serve paid beta on prod (REQ-BETA-19 amended)
    domains: PROD_DOMAINS,
    requiredSecrets: PROD_REQUIRED_SECRETS,
  },
};

/** Map a concrete Pulumi stack name (dev | pr-<n> | prod) to its stage kind. */
export function stageKindFor(stageName: string): StageKind {
  if (stageName === "prod") return "prod";
  if (stageName === "dev") return "dev";
  if (/^pr-/.test(stageName)) return "preview";
  // Unknown personal/ephemeral stacks inherit the safest (preview) posture.
  return "preview";
}

export function stageConfigFor(stageName: string): StageConfig {
  return STAGES[stageKindFor(stageName)];
}

/** The sandbox subnet of a stage — the one that must never reach the internet directly. */
export function sandboxSubnetOf(cfg: StageConfig): VpcSubnet | undefined {
  return cfg.vpc.subnets.find((s) => s.name === "sandbox");
}
