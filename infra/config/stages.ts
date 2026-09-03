// Stage configuration (spec §13.2), as PURE data so the invariants are unit-testable without an AWS
// deploy. `sst.config.ts` consumes this to build the real resources. The security-critical facts —
// the sandbox subnet has no IGW/NAT route (REQ-ARCH-2), prod Aurora holds a >=4 ACU floor, previews
// are 0-ACU auto-pause with isolated buckets and a per-run spend guard — live here and are asserted
// by tests, standing in for the live route-table/deploy checks that need H0 AWS credentials.

export type StageKind = "dev" | "preview" | "prod";

export interface AuroraConfig {
  /** Minimum Aurora Serverless v2 capacity units. Prod floors at >=4 (review 13 F32). */
  minAcu: number;
  /** Maximum ACU ceiling. */
  maxAcu: number;
  /** Whether the cluster auto-pauses to 0 ACU when idle (previews only). */
  autoPause: boolean;
  /** Continuous backup retention in days (REQ-ARCH-28). */
  backupRetentionDays: number;
}

export interface VpcSubnet {
  name: string;
  /** CIDR mask size; spec sizes subnets at /20. */
  cidrMask: number;
  /** A route to an internet/NAT gateway. The sandbox subnet MUST be false (REQ-ARCH-2). */
  hasInternetRoute: boolean;
  /** Security-group ids this subnet's egress is allowed to reach. Sandbox: proxy SG only. */
  egressTargets: string[];
}

export interface VpcConfig {
  subnets: VpcSubnet[];
}

export interface StageConfig {
  kind: StageKind;
  aurora: AuroraConfig;
  vpc: VpcConfig;
  /** S3 buckets isolated per stage (never shared across stages). */
  isolatedBuckets: boolean;
  /** S3 object versioning on (REQ-ARCH-28). */
  s3Versioning: boolean;
  /** Per-run spend guard in USD; previews are capped hard (Base tier only, $3/run — REQ-ARCH-38). */
  maxUsdPerRun: number;
  /** Previews never receive production secrets or user-text fixtures (REQ-ARCH-38). */
  allowsProductionSecrets: boolean;
}

/** The sandbox subnet is identical across stages: no internet route, egress only to the proxy SG. */
function sandboxSubnet(): VpcSubnet {
  return {
    name: "sandbox",
    cidrMask: 20,
    hasInternetRoute: false, // REQ-ARCH-2 — no IGW/NAT route
    egressTargets: ["sg:egress-proxy"], // the only egress target (the future proxy's SG)
  };
}

function baseVpc(): VpcConfig {
  return {
    subnets: [
      { name: "public", cidrMask: 20, hasInternetRoute: true, egressTargets: ["*"] },
      { name: "private-app", cidrMask: 20, hasInternetRoute: true, egressTargets: ["*"] },
      sandboxSubnet(),
    ],
  };
}

export const STAGES: Record<StageKind, StageConfig> = {
  dev: {
    kind: "dev",
    aurora: { minAcu: 0.5, maxAcu: 4, autoPause: false, backupRetentionDays: 35 },
    vpc: baseVpc(),
    isolatedBuckets: true,
    s3Versioning: true,
    maxUsdPerRun: 10,
    allowsProductionSecrets: false,
  },
  preview: {
    kind: "preview",
    aurora: { minAcu: 0, maxAcu: 2, autoPause: true, backupRetentionDays: 1 },
    vpc: baseVpc(),
    isolatedBuckets: true,
    s3Versioning: true,
    maxUsdPerRun: 3, // REQ-ARCH-38
    allowsProductionSecrets: false, // REQ-ARCH-38
  },
  prod: {
    kind: "prod",
    aurora: { minAcu: 4, maxAcu: 64, autoPause: false, backupRetentionDays: 35 }, // >=4 ACU floor
    vpc: baseVpc(),
    isolatedBuckets: true,
    s3Versioning: true,
    maxUsdPerRun: 100,
    allowsProductionSecrets: true,
  },
};

/** Map a concrete SST stage name (dev | pr-<n> | prod) to its stage kind. */
export function stageKindFor(stageName: string): StageKind {
  if (stageName === "prod") return "prod";
  if (stageName === "dev") return "dev";
  if (/^pr-/.test(stageName)) return "preview";
  // Unknown personal/ephemeral stages inherit the safest (preview) posture.
  return "preview";
}

export function stageConfigFor(stageName: string): StageConfig {
  return STAGES[stageKindFor(stageName)];
}

/** The sandbox subnet of a stage — the one that must never reach the internet directly. */
export function sandboxSubnetOf(cfg: StageConfig): VpcSubnet | undefined {
  return cfg.vpc.subnets.find((s) => s.name === "sandbox");
}
