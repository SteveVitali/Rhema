// Data plane: the stage's managed Postgres (AlloyDB on dev/previews; Cloud SQL on prod — amended
// 2026-09-17), the isolated + versioned GCS buckets with the §13.3 retention lifecycle, and
// Memorystore Redis. All sized from the pure stage config so the deployed shape matches
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
   * the operator's environment). ENGINE-AGNOSTIC despite the name: AlloyDB binds it as the cluster's
   * `initialUser`, Cloud SQL as the `postgres` built-in user — either way the operator logs in as
   * `postgres` with the same value they seed into `rhema-<stack>-alloydb-password` (HUMAN-H6). Unset ⇒
   * the provider generates one (a dev/preview posture; prod sets it).
   */
  alloydbPassword?: pulumi.Input<string>;
}

export interface Data {
  /** AlloyDB resources — only present on `database.engine === "alloydb"` stages (dev, preview). */
  alloydbCluster?: gcp.alloydb.Cluster;
  alloydbPrimary?: gcp.alloydb.Instance;
  /** Cloud SQL resources — only present on `database.engine === "cloudsql"` stages (prod). */
  cloudSqlInstance?: gcp.sql.DatabaseInstance;
  cloudSqlDatabase?: gcp.sql.Database;
  cloudSqlUser?: gcp.sql.User;
  buckets: Record<string, gcp.storage.Bucket>;
  redis: gcp.redis.Instance;
  /** The Postgres private IP — what the operator's DATABASE_URLs + the migrate/seed runner point at. */
  databaseHost: pulumi.Output<string>;
}

// The isolated, versioned buckets each stage owns (REQ-ARCH-28/38). `user-content` is served from a
// separate cookieless domain (§13.3); `benchmark-enclave` is the access-logged eval keyspace, in its
// OWN bucket distinct from the tenant object layout (REQ-EVAL-3 / D-P0.13-1).
const BUCKET_NAMES = ["artifacts", "user-content", "benchmark-enclave"] as const;

export function createData(args: DataArgs): Data {
  const { stack, cfg, region, network } = args;
  const name = (suffix: string) => `rhema-${stack}-${suffix}`;

  // --- Managed Postgres: engine-gated on cfg.database.engine (PRB.15 amended 2026-09-17). Both
  // engines ride the SAME Private Services Access peering (`network.psaConnection`) — Cloud SQL's
  // private IP allocates from the reserved psaRange, so no second range/connection, no collision.
  // Cloud Run services reach either engine's private IP over the existing Direct-VPC egress
  // (PRIVATE_RANGES_ONLY) — the identical path AlloyDB used. ---
  let alloydbCluster: Data["alloydbCluster"];
  let alloydbPrimary: Data["alloydbPrimary"];
  let cloudSqlInstance: Data["cloudSqlInstance"];
  let cloudSqlDatabase: Data["cloudSqlDatabase"];
  let cloudSqlUser: Data["cloudSqlUser"];
  let databaseHost: pulumi.Output<string>;

  if (cfg.database.engine === "alloydb") {
    // --- AlloyDB: a private-IP cluster peered to the VPC. Preview clusters are the small/paused shape. ---
    alloydbCluster = new gcp.alloydb.Cluster(name("alloydb"), {
    clusterId: name("alloydb"),
    location: region,
    networkConfig: { network: network.network.id },
    continuousBackupConfig: {
      enabled: true,
      recoveryWindowDays: cfg.database.backupRetentionDays, // PITR window (REQ-ARCH-28)
    },
    // PRB.15 — bind the bootstrap `postgres` password to the operator-held Pulumi secret config so the
    // runbook's `applyMigrations`/`seedProtocols` psql step and the DATABASE_URL builds use ONE value
    // (never generated-and-lost). The value is Pulumi-state-encrypted, never committed.
    ...(args.alloydbPassword
      ? { initialUser: { user: "postgres", password: args.alloydbPassword } }
      : {}),
    // dev/previews are deletable so a `pulumi destroy` tears down cleanly (AC2); DEFAULT still
    // blocks an accidental destroy on any future AlloyDB-backed prod.
    deletionPolicy: cfg.kind === "prod" ? "DEFAULT" : "FORCE",
    // The PSA peering must exist before AlloyDB allocates its private IP.
  }, { dependsOn: [network.psaConnection] });

    alloydbPrimary = new gcp.alloydb.Instance(name("alloydb-primary"), {
      cluster: alloydbCluster.name,
      instanceId: name("primary"),
      instanceType: "PRIMARY",
      machineConfig: { cpuCount: cfg.database.primaryCpuCount ?? 2 },
      // A preview instance is created stopped/paused to avoid idle spend; dev/prod stay warm.
      activationPolicy: cfg.database.paused ? "NEVER" : "ALWAYS",
    });
    databaseHost = alloydbPrimary.ipAddress;
  } else {
    // --- Cloud SQL for PostgreSQL (prod — the ~$50/mo budget can't carry AlloyDB's ~$270/mo minimum).
    // db-g1-small = the minimal prod-ready shared-core tier (db-f1-micro's ~0.6 GiB is too thin to call
    // prod-ready); ZONAL availability (REGIONAL is ~2x — the lever if prod outgrows the budget);
    // 35 daily automated backups + PITR capped at Cloud SQL's 7-day transaction-log window; ALWAYS
    // activation — prod's database is never paused (the F32 cold-start concern is moot: it stays up). ---
    cloudSqlInstance = new gcp.sql.DatabaseInstance(name("postgres"), {
      name: name("postgres"),
      databaseVersion: "POSTGRES_16",
      region,
      settings: {
        tier: cfg.database.cloudSqlTier ?? "db-g1-small",
        // Shared-core tiers (db-g1-small/db-f1-micro) are ENTERPRISE-edition only — Cloud SQL now
        // defaults new instances to ENTERPRISE_PLUS (Stage B live, 2026-09-17: 400 "Invalid Tier
        // (db-g1-small) for (ENTERPRISE_PLUS) Edition"). ENTERPRISE is also the budget-right edition.
        edition: "ENTERPRISE",
        availabilityType: "ZONAL",
        diskSize: 10, // smallest SSD Cloud SQL provisions; autoresize covers growth
        diskType: "PD_SSD",
        diskAutoresize: true,
        activationPolicy: "ALWAYS", // warm — never paused
        ipConfiguration: {
          ipv4Enabled: false, // private-IP only — no public endpoint (REQ-ARCH-6 posture)
          privateNetwork: network.network.id, // same VPC + PSA peering as AlloyDB
        },
        backupConfiguration: {
          enabled: true,
          pointInTimeRecoveryEnabled: true,
          transactionLogRetentionDays: 7, // Cloud SQL's hard cap on the PITR window
          startTime: "04:00", // daily backup window (off-peak UTC)
          backupRetentionSettings: {
            // The 35-day spirit lands as the retained-backup horizon (Cloud SQL Standard caps
            // automated-backup retention at 365 — no truncation).
            retainedBackups: cfg.database.backupRetentionDays,
          },
        },
        insightsConfig: { queryInsightsEnabled: true }, // free query-performance telemetry
        maintenanceWindow: { day: 7, hour: 4 }, // Sunday 04:00 UTC — a predictable prod window
      },
      // Prod blocks accidental `pulumi destroy` of the database.
      deletionProtection: cfg.kind === "prod",
    }, { dependsOn: [network.psaConnection] });

    cloudSqlDatabase = new gcp.sql.Database(name("db"), {
      instance: cloudSqlInstance.name,
      name: "rhema", // the app database (SYSTEM_DATABASE_URL points at the `postgres` database)
    });
    cloudSqlUser = new gcp.sql.User(name("postgres-user"), {
      instance: cloudSqlInstance.name,
      name: "postgres",
      type: "BUILT_IN",
      ...(args.alloydbPassword ? { password: args.alloydbPassword } : {}),
    });
    databaseHost = cloudSqlInstance.privateIpAddress;
  }

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

  // --- Memorystore Redis: pub/sub fan-out for run events + Yjs presence scaling. Prod uses the
  // smallest BASIC tier (amended 2026-09-17 — the ~$50/mo budget; Redis is fan-out/presence, not the
  // system of record, so a single-node tier is an acceptable HA trade. STANDARD_HA is the lever if
  // prod outgrows it.) ---
  const redis = new gcp.redis.Instance(name("redis"), {
    tier: "BASIC",
    memorySizeGb: 1,
    region,
    authorizedNetwork: network.network.id,
    connectMode: "PRIVATE_SERVICE_ACCESS",
    redisVersion: "REDIS_7_0",
  }, { dependsOn: [network.psaConnection] });

  return {
    alloydbCluster,
    alloydbPrimary,
    cloudSqlInstance,
    cloudSqlDatabase,
    cloudSqlUser,
    buckets,
    redis,
    databaseHost,
  };
}
