// OPS.2 (D-P0.01-4; BL-6/BL-27; the OPS.2 cache-server ADR) — the self-hosted Turborepo remote
// cache, owned entirely by this file: a scale-to-zero Cloud Run service running the MIT-licensed
// `turborepo-remote-cache` server (wrapped, lockfile-pinned, by apps/turbo-cache) in front of a
// project-private GCS bucket with lifecycle expiry.
//
// Shape decisions (all in the ADR):
//   * STORAGE_PROVIDER=google-cloud-storage + the service account's ADC identity — no credentials
//     in the container beyond the Bearer token; the bucket's SA-scoped objectAdmin is the whole
//     data-plane grant.
//   * The service is UNAUTHENTICATED at the Cloud Run layer (allUsers invoker): GitHub-hosted CI
//     runners carry no GCP identity, so the turborepo-remote-cache `static` auth mode — the
//     TURBO_TOKEN Bearer — is the authz boundary. The token is program-minted (index.ts), stored
//     ONLY in Secret Manager + encrypted state, and mounts via secretKeyRef (REQ-ARCH-30).
//   * Artifacts (incl. @rhema/protocols build outputs) land in a bucket with public-access
//     prevention + uniform bucket-level access inside the project — nothing protocol-bearing is
//     cached to a store outside the project (the manifest-3 invariant the ticket names).
//   * Scale-to-zero + a 30-day lifecycle rule keep the posture inside the ≤$15/mo delta cap.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import type { Secrets } from "./secrets.js";

export interface TurboCacheArgs {
  stack: string;
  project: string;
  region: string;
  /** `prod` carries deletionProtection; every stage shape is otherwise identical. */
  isProd: boolean;
  secrets: Secrets;
  /** `rhema:serviceImages["turbo-cache"]` when pinned, else the placeholder for a clean preview. */
  image: pulumi.Input<string>;
  /** Every version the program writes — the service mounts `versions/latest`, so it must depend
   *  on the token version existing (the same live-finding fix as the other secretKeyRef mounts). */
  secretVersionDeps: pulumi.Resource[];
}

export interface TurboCache {
  service: gcp.cloudrunv2.Service;
  bucket: gcp.storage.Bucket;
  /** The cache endpoint (`https://…run.app`) — exported for the CI TURBO_API wiring. */
  url: pulumi.Output<string>;
}

export function createTurboCache(args: TurboCacheArgs): TurboCache {
  const { stack, project, region, isProd, secrets } = args;
  const name = (id: string) => `rhema-${stack}-${id}`;

  // Runtime SA — bucket objectAdmin (scoped to the ONE bucket) + secretAccessor on the token is
  // the whole grant surface; no VPC, no DB, no other secret.
  const sa = new gcp.serviceaccount.Account(name("turbo-cache-sa"), {
    accountId: `rhema-${stack}-turbocache`,
    displayName: `rhema ${stack} turbo remote cache`,
  });

  const bucket = new gcp.storage.Bucket(name("turbo-cache"), {
    // Globally-unique: project+stack scoped (`rhema-507501-turbo-cache-prod` etc.).
    name: `${project}-turbo-cache-${stack}`,
    location: region.toUpperCase(),
    uniformBucketLevelAccess: true,
    publicAccessPrevention: "enforced",
    lifecycleRules: [
      {
        // Cache entries are content-addressed + reproducible — expiry is free invalidation.
        action: { type: "Delete" },
        condition: { age: 30 },
      },
    ],
    forceDestroy: !isProd,
  });

  new gcp.storage.BucketIAMMember(name("turbo-cache-sa-objects"), {
    bucket: bucket.name,
    role: "roles/storage.objectAdmin",
    member: pulumi.interpolate`serviceAccount:${sa.email}`,
  });
  new gcp.secretmanager.SecretIamMember(name("turbo-cache-token-reader"), {
    secretId: secrets.byId["turbo-cache-token"].secretId,
    role: "roles/secretmanager.secretAccessor",
    member: pulumi.interpolate`serviceAccount:${sa.email}`,
  });

  const service = new gcp.cloudrunv2.Service(
    name("turbo-cache"),
    {
      location: region,
      deletionProtection: isProd,
      ingress: "INGRESS_TRAFFIC_ALL", // GitHub-hosted runners carry no GCP identity (ADR).
      template: {
        serviceAccount: sa.email,
        // Scale-to-zero is the cost contract (≤$15/mo delta); the cap stays low — the cache is a
        // best-effort accelerator, never a correctness path.
        scaling: { minInstanceCount: 0, maxInstanceCount: 2 },
        containers: [
          {
            image: args.image,
            envs: [
              { name: "STORAGE_PROVIDER", value: "google-cloud-storage" },
              { name: "STORAGE_PATH", value: bucket.name },
              // static auth (the default) — TURBO_TOKEN is the Bearer every client presents.
              { name: "AUTH_MODE", value: "static" },
              {
                name: "TURBO_TOKEN",
                valueSource: {
                  secretKeyRef: {
                    secret: secrets.byId["turbo-cache-token"].secretId,
                    version: "latest",
                  },
                },
              },
            ],
          },
        ],
      },
    },
    {
      dependsOn: args.secretVersionDeps,
      // OPS.2 — the same service-level `scaling` readback drift compute.ts names on convert-svc:
      // the v2 API reads back `{manualInstanceCount:0, minInstanceCount:0, scalingMode:""}` the
      // program does not manage (template.scaling is the managed surface) — unmanaged here.
      ignoreChanges: ["scaling"],
    },
  );

  // Deliberately unauthenticated invoker (see header + ADR): the Bearer token is the authz.
  new gcp.cloudrunv2.ServiceIamMember(name("turbo-cache-invoker"), {
    name: service.name,
    location: region,
    role: "roles/run.invoker",
    member: "allUsers",
  });

  return { service, bucket, url: service.uri };
}
