// Stage configuration (spec §13.2), as PURE data so the invariants are unit-testable without a live
// GCP deploy. The Pulumi program (`infra/pulumi/`) consumes this to build the real GCP resources, so
// the same numbers the tests assert are the numbers that deploy. The security-critical facts — the
// sandbox subnet has NO Cloud NAT and NO default internet route (REQ-ARCH-2), prod AlloyDB keeps a
// warm primary, previews are paused/small with isolated buckets and a per-run spend guard — live here
// and are asserted by tests, standing in for the live route/firewall checks that need H0 (the deployed
// VPC) to read directly (DEFERRALS D-P0.01-2).
//
// AWS→GCP amendment (2026-09-02): Aurora→AlloyDB, S3→GCS, IGW/NAT→Cloud NAT + default-route, security
// group→egress firewall. The abstract facts (no internet reachability for the sandbox; per-run caps;
// versioned isolated buckets) are provider-independent and carry over verbatim.

export type StageKind = "dev" | "preview" | "prod";

export interface AlloyDbConfig {
  /** Primary instance vCPU count. AlloyDB sizes by CPU; prod keeps a warm primary (>=4). */
  primaryCpuCount: number;
  /**
   * Whether the cluster is stopped/paused when idle (previews only, to avoid idle spend). Dev and
   * prod keep the primary warm; a preview's AlloyDB is the small/paused stand-in (REQ-ARCH-38).
   */
  paused: boolean;
  /** Continuous backup / point-in-time-recovery retention in days (REQ-ARCH-28). */
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
  alloydb: AlloyDbConfig;
  vpc: VpcConfig;
  /** GCS buckets isolated per stage (never shared across stages). */
  isolatedBuckets: boolean;
  /** GCS object versioning on (REQ-ARCH-28). */
  gcsVersioning: boolean;
  /** Per-run spend guard in USD; previews are capped hard (Base tier only, $3/run — REQ-ARCH-38). */
  maxUsdPerRun: number;
  /** Previews never receive production secrets or user-text fixtures (REQ-ARCH-38). */
  allowsProductionSecrets: boolean;
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
    alloydb: { primaryCpuCount: 2, paused: false, backupRetentionDays: 35 },
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 10,
    allowsProductionSecrets: false,
  },
  preview: {
    kind: "preview",
    alloydb: { primaryCpuCount: 2, paused: true, backupRetentionDays: 1 }, // small + paused
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 3, // REQ-ARCH-38
    allowsProductionSecrets: false, // REQ-ARCH-38
  },
  prod: {
    kind: "prod",
    alloydb: { primaryCpuCount: 4, paused: false, backupRetentionDays: 35 }, // warm primary, >=4 vCPU
    vpc: baseVpc(),
    isolatedBuckets: true,
    gcsVersioning: true,
    maxUsdPerRun: 100,
    allowsProductionSecrets: true,
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
