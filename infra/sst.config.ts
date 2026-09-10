/// <reference path="./.sst/platform/config.d.ts" />

// ⚑ SUPERSEDED (2026-09-02): the platform moved AWS → GCP (00_MANIFEST § Spec amendments applied; §12
// amendment banner). This SST/AWS skeleton is kept only so the repo builds/tests green while the
// **Pulumi (TypeScript) + GCP** rewrite is pending — it lands on a P0.01 re-run once the GCP project
// exists (DEFERRALS D-P0.01-7). Do NOT extend this file; the amended `docs/tickets/01_P0.01` specifies
// the GCP/Pulumi target (Cloud Run + GKE for run-task, AlloyDB, GCS, Memorystore, Secret Manager,
// Workload Identity, Cloud CDN, no-egress sandbox subnet).
//
// SST v3 (ion) config — the deployable skeleton (spec §13.2). Executed and bundled by the SST CLI
// (`sst deploy --stage <dev|pr-<n>|prod>`), NOT by tsc (it is excluded from the TS build). The
// security- and cost-critical numbers come from ./config/stages so the same values that tests assert
// are the values that deploy. Requires `sst` (v3) installed and AWS credentials (H0) to run.
//
// P0.01 provisions the SUBSTRATE only; service business logic lands in later tickets. Deliberately
// ships placeholder service containers so `images` + deploy provenance (REQ-ARCH-39) are exercised
// before any service has real logic.

import { stageConfigFor } from "./config/stages";
import { RETENTION_SCHEDULE } from "./config/retention";

export default $config({
  app(input) {
    return {
      name: "rhema",
      // prod is retained; dev + previews are fully removed on teardown (AC2 clean teardown).
      removal: input?.stage === "prod" ? "retain" : "remove",
      home: "aws",
      providers: { aws: { region: "us-east-1" } },
    };
  },

  async run() {
    const stage = $app.stage;
    const cfg = stageConfigFor(stage);

    // --- Network: VPC with the no-egress sandbox subnet (REQ-ARCH-2) -------------------------------
    // SST manages the public/private subnets; the sandbox subnet is created explicitly with NO route
    // to an IGW/NAT. Its only egress target is the (future) egress-proxy security group.
    const vpc = new sst.aws.Vpc("Vpc", { nat: "managed" });

    const sandbox = new aws.ec2.Subnet("SandboxSubnet", {
      vpcId: vpc.id,
      cidrBlock: "10.0.240.0/20", // /20 per §13.2
      tags: { Name: `rhema-${stage}-sandbox`, "req-arch-2": "no-igw-nat" },
    });
    // A dedicated route table with NO 0.0.0.0/0 route — the sandbox cannot reach the internet.
    const sandboxRt = new aws.ec2.RouteTable("SandboxRouteTable", { vpcId: vpc.id });
    new aws.ec2.RouteTableAssociation("SandboxRtAssoc", {
      subnetId: sandbox.id,
      routeTableId: sandboxRt.id,
    });

    // --- Data: Aurora Serverless v2 (prod >=4 ACU floor; previews 0-ACU auto-pause) ---------------
    const database = new sst.aws.Aurora("Database", {
      engine: "postgres",
      vpc,
      scaling: {
        min: `${cfg.aurora.minAcu} ACU`,
        max: `${cfg.aurora.maxAcu} ACU`,
        // previews pause to 0 ACU when idle; dev/prod stay warm.
        pauseAfter: cfg.aurora.autoPause ? "5 minutes" : undefined,
      },
      transform: {
        // Continuous backups (REQ-ARCH-28): apply the stage's retention to the underlying cluster.
        cluster: (args) => {
          args.backupRetentionPeriod = cfg.aurora.backupRetentionDays;
        },
      },
    });

    // --- Cache: ElastiCache Redis (pub/sub + Yjs scaling) -----------------------------------------
    const redis = new sst.aws.Redis("Redis", { vpc });

    // --- Storage: isolated, versioned buckets per stage (REQ-ARCH-28/38) --------------------------
    const artifacts = new sst.aws.Bucket("Artifacts", { versioning: cfg.s3Versioning });
    // User uploads are served from a SEPARATE registrable domain that sets no cookies (§13.3).
    const userContent = new sst.aws.Bucket("UserContent", { versioning: cfg.s3Versioning });

    // S3 lifecycle rules materialize the §13.3 retention schedule (REQ-ARCH-29). A bucket has exactly
    // ONE lifecycle configuration resource, so all class rules go into a single resource's `rules`
    // array (declaring one resource per class would conflict — last-writer-wins).
    const retentionRules = Object.values(RETENTION_SCHEDULE)
      .filter((rule) => rule.days != null) // restore points are per-plan, applied at write time
      .map((rule) => ({
        id: rule.class,
        status: "Enabled",
        filter: { prefix: `${rule.class}/` },
        expiration: { days: rule.days as number },
      }));
    new aws.s3.BucketLifecycleConfigurationV2("ArtifactsRetention", {
      bucket: artifacts.name,
      rules: retentionRules,
    });

    // --- Compute: ECS cluster + placeholder service containers ------------------------------------
    const cluster = new sst.aws.Cluster("Cluster", { vpc });

    // Services that hold no provider keys and speak to the world only through the app subnets.
    const publicServices = ["web", "api", "collab", "worker", "fetcher"] as const;
    for (const name of publicServices) {
      new sst.aws.Service(name, {
        cluster,
        // Secrets are injected via Secrets Manager/SSM at runtime, never as plaintext env on
        // web/collab (REQ-ARCH-30); linked resources below grant scoped access.
        link: [database, redis, artifacts, userContent],
        // Placeholder image until each service ships real logic (later tickets).
        image: { context: "..", dockerfile: `apps/${name}/Dockerfile` },
        scaling: { min: stage === "prod" ? 2 : 1, max: stage === "prod" ? 4 : 1 },
      });
    }

    // egress-proxy: the ONLY route out of the sandbox; the sole holder of provider keys and the
    // usage meter of record (REQ-ARCH-2/31). run-task is launched per-run into the sandbox subnet by
    // the worker (ecs:RunTask) and lands in later tickets; here we pin its network placement.
    const proxy = new sst.aws.Service("egress-proxy", {
      cluster,
      link: [database],
      image: { context: "..", dockerfile: "apps/egress-proxy/Dockerfile" },
      scaling: { min: stage === "prod" ? 2 : 1, max: stage === "prod" ? 4 : 1 },
    });

    return {
      vpc: vpc.id,
      sandboxSubnet: sandbox.id,
      database: database.host,
      redis: redis.host,
      artifactsBucket: artifacts.name,
      userContentBucket: userContent.name,
      proxy: proxy.url,
      maxUsdPerRun: cfg.maxUsdPerRun,
    };
  },
});
