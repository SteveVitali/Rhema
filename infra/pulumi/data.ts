// Data plane: AlloyDB (Postgres), the isolated + versioned GCS buckets with the §13.3 retention
// lifecycle, and Memorystore Redis. All sized from the pure stage config so the deployed shape matches
// what `stages.test.ts` asserts.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import { type StageConfig } from "../config/stages";
import { RETENTION_SCHEDULE } from "../config/retention";
import type { Network } from "./network";

export interface DataArgs {
  stack: string;
  cfg: StageConfig;
  region: pulumi.Input<string>;
  network: Network;
  /**
   * PRB.15 — the postgres bootstrap password (a Pulumi SECRET config `rhema:alloydbPassword`, set only in
   * the operator's environment). The cluster's `initialUser` is bound to it so the operator can log in as
   * `postgres` with the same value they seed into `rhema-<stack>-alloydb-password` (HUMAN-H6). Unset ⇒ the
   * provider generates one (a dev/preview posture; prod sets it).
   */
  alloydbPassword?: pulumi.Input<string>;
}

export interface Data {
  alloydbCluster: gcp.alloydb.Cluster;
  alloydbPrimary: gcp.alloydb.Instance;
  buckets: Record<string, gcp.storage.Bucket>;
  redis: gcp.redis.Instance;
}

// The isolated, versioned buckets each stage owns (REQ-ARCH-28/38). `user-content` is served from a
// separate cookieless domain (§13.3); `benchmark-enclave` is the access-logged eval keyspace, in its
// OWN bucket distinct from the tenant object layout (REQ-EVAL-3 / D-P0.13-1).
const BUCKET_NAMES = ["artifacts", "user-content", "benchmark-enclave"] as const;

export function createData(args: DataArgs): Data {
  const { stack, cfg, region, network } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;

  // --- AlloyDB: a private-IP cluster peered to the VPC. Preview clusters are the small/paused shape. ---
  const cluster = new gcp.alloydb.Cluster(name("alloydb"), {
    clusterId: name("alloydb"),
    location: region,
    networkConfig: { network: network.network.id },
    continuousBackupConfig: {
      enabled: true,
      recoveryWindowDays: cfg.alloydb.backupRetentionDays, // PITR window (REQ-ARCH-28)
    },
    // PRB.15 — bind the bootstrap `postgres` password to the operator-held Pulumi secret config so the
    // runbook's `applyMigrations`/`seedProtocols` psql step and the DATABASE_URL builds use ONE value
    // (never generated-and-lost). The value is Pulumi-state-encrypted, never committed.
    ...(args.alloydbPassword
      ? { initialUser: { user: "postgres", password: args.alloydbPassword } }
      : {}),
    // prod is retained; dev/previews are deletable so a `pulumi destroy` tears down cleanly (AC2).
    deletionPolicy: cfg.kind === "prod" ? "DEFAULT" : "FORCE",
    // The PSA peering must exist before AlloyDB allocates its private IP.
  }, { dependsOn: [network.psaConnection] });

  const primary = new gcp.alloydb.Instance(name("alloydb-primary"), {
    cluster: cluster.name,
    instanceId: name("primary"),
    instanceType: "PRIMARY",
    machineConfig: { cpuCount: cfg.alloydb.primaryCpuCount },
    // A preview instance is created stopped/paused to avoid idle spend; dev/prod stay warm.
    activationPolicy: cfg.alloydb.paused ? "NEVER" : "ALWAYS",
  });

  // --- GCS buckets: versioned, isolated per stage, with the §13.3 retention lifecycle rules. ---
  const lifecycleRules = Object.values(RETENTION_SCHEDULE)
    .filter((r) => r.days != null) // restore points are per-plan, applied at write time
    .map((r) => ({
      condition: { age: r.days as number, matchesPrefixes: [`${r.class}/`] },
      action: { type: "Delete" },
    }));

  // A dedicated bucket for GCS access logs — the benchmark-enclave bucket logs every object read here
  // (REQ-EVAL-3): a corpus-draft or gold-annotation read leaves a bucket-access-log line, in a keyspace
  // distinct from the app tenant object layout.
  const accessLogs = new gcp.storage.Bucket(name("access-logs"), {
    name: `rhema-${stack}-access-logs`,
    location: pulumi.output(region).apply((r) => r.toUpperCase()),
    uniformBucketLevelAccess: true,
    publicAccessPrevention: "enforced",
    lifecycleRules: [{ condition: { age: RETENTION_SCHEDULE.audit.days as number }, action: { type: "Delete" } }],
    forceDestroy: cfg.kind !== "prod",
  });

  const buckets: Record<string, gcp.storage.Bucket> = {};
  for (const b of BUCKET_NAMES) {
    buckets[b] = new gcp.storage.Bucket(name(b), {
      // Bucket names are globally unique; the project + stack + purpose keeps them isolated per stage.
      name: `rhema-${stack}-${b}`,
      location: pulumi.output(region).apply((r) => r.toUpperCase()),
      uniformBucketLevelAccess: true, // IAM-only; no ACLs (least privilege)
      publicAccessPrevention: "enforced",
      versioning: { enabled: cfg.gcsVersioning },
      lifecycleRules,
      forceDestroy: cfg.kind !== "prod", // previews/dev tear down cleanly
      // Only the enclave bucket is access-logged (REQ-EVAL-3); the app buckets rely on Cloud Audit Logs.
      logging:
        b === "benchmark-enclave"
          ? { logBucket: accessLogs.name, logObjectPrefix: "benchmark-enclave-access/" }
          : undefined,
    });
  }

  // --- Memorystore Redis: pub/sub fan-out for run events + Yjs presence scaling. ---
  const redis = new gcp.redis.Instance(name("redis"), {
    tier: cfg.kind === "prod" ? "STANDARD_HA" : "BASIC",
    memorySizeGb: 1,
    region,
    authorizedNetwork: network.network.id,
    connectMode: "PRIVATE_SERVICE_ACCESS",
    redisVersion: "REDIS_7_0",
  }, { dependsOn: [network.psaConnection] });

  return { alloydbCluster: cluster, alloydbPrimary: primary, buckets, redis };
}
