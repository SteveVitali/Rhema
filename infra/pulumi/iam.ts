// IAM as code (D-P0.01-5): one least-privilege Workload-Identity service account per service, and the
// EXPLICIT secret-accessor bindings that make the proxy the sole reader of the provider key (REQ-ARCH-30).
//
// The rule this file encodes: `web`/`collab` hold NO secrets; `api` reads the auth secrets; the
// `egress-proxy` — and ONLY it — reads the Anthropic key; the billing `worker` reads Stripe. Every grant
// is a discrete resource so a review diff shows exactly who can read what.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import type { Secrets } from "./secrets";

export interface IamArgs {
  stack: string;
  project: pulumi.Input<string>;
  secrets: Secrets;
  buckets: Record<string, gcp.storage.Bucket>;
}

export const SERVICES = [
  "web",
  "api",
  "worker",
  "collab",
  "fetcher",
  "convert",
  "export",
  "egress-proxy",
  "run-task",
] as const;
export type ServiceName = (typeof SERVICES)[number];

export interface Iam {
  serviceAccounts: Record<ServiceName, gcp.serviceaccount.Account>;
}

export function createIam(args: IamArgs): Iam {
  const { stack, project, secrets, buckets } = args;

  const serviceAccounts = {} as Record<ServiceName, gcp.serviceaccount.Account>;
  for (const svc of SERVICES) {
    serviceAccounts[svc] = new gcp.serviceaccount.Account(`rhema-${stack}-${svc}-sa`, {
      accountId: `rhema-${stack}-${svc}`,
      displayName: `Rhema ${stack} ${svc}`,
    });
  }

  const secretAccessor = "roles/secretmanager.secretAccessor";
  const grantSecret = (id: string, secret: gcp.secretmanager.Secret, sa: gcp.serviceaccount.Account) =>
    new gcp.secretmanager.SecretIamMember(`rhema-${stack}-${id}`, {
      secretId: secret.id,
      role: secretAccessor,
      member: pulumi.interpolate`serviceAccount:${sa.email}`,
    });

  // The egress-proxy is the SOLE reader of the provider key (REQ-ARCH-31).
  grantSecret("proxy-reads-anthropic", secrets.anthropicApiKey, serviceAccounts["egress-proxy"]);
  // The proxy also verifies run tokens — it needs the signing key's PUBLIC half. We store the keypair in
  // one secret and let the proxy read it (it uses only the JWK public component); the api signs with it.
  grantSecret("proxy-reads-runtoken", secrets.runTokenSigningKey, serviceAccounts["egress-proxy"]);
  grantSecret("api-signs-runtoken", secrets.runTokenSigningKey, serviceAccounts["api"]);
  // The worker MINTS run tokens at provision (Rs256RunTokenService over the signing key) — it needs the
  // same keypair the api verifies with (D-P0.08-1).
  grantSecret("worker-signs-runtoken", secrets.runTokenSigningKey, serviceAccounts["worker"]);
  // api reads the auth secrets; web/collab read NONE (no binding = no access under uniform IAM).
  grantSecret("api-reads-betterauth", secrets.betterAuthSecret, serviceAccounts["api"]);
  grantSecret("api-reads-google-oauth", secrets.googleOauthClientSecret, serviceAccounts["api"]);
  // The api VERIFIES the Stripe webhook signature (STRIPE_WEBHOOK_SECRET_NAME → SM at boot; PRB.08) and
  // the one-click email-action HMAC (EMAIL_ACTION_SECRET_NAME; PRB.09). Both are secret NAMES in env —
  // the values live only in Secret Manager.
  grantSecret("api-verifies-stripe-webhook", secrets.stripeWebhookSecret, serviceAccounts["api"]);
  grantSecret("api-verifies-email-action", secrets.emailActionSecret, serviceAccounts["api"]);
  // The api signs the CDN download URLs the private `*.usercontent.rhema.tools` origin verifies (the same
  // key is `add-signed-url-key`'d onto the backend bucket out-of-band — the runbook's post-up step).
  grantSecret("api-signs-usercontent", secrets.userContentSigningKey, serviceAccounts["api"]);
  // The billing worker reads Stripe (PRB.08), mints the same one-click HMAC (PRB.09), reads the Resend
  // transport key + the provider admin key for usage.reconcile, and publishes to the ops alert sink.
  grantSecret("worker-reads-stripe", secrets.stripeSecret, serviceAccounts["worker"]);
  grantSecret("worker-mints-email-action", secrets.emailActionSecret, serviceAccounts["worker"]);
  grantSecret("worker-reads-resend", secrets.resendApiKey, serviceAccounts["worker"]);
  grantSecret("worker-reads-anthropic-admin", secrets.anthropicAdminKey, serviceAccounts["worker"]);
  // P1.15 — `ingest.reconstruct` (and P1.05's walkthrough) resolve the provider key from Secret
  // Manager at boot; the operator-gated reconstruction spend is metered per job (§9.5).
  grantSecret("worker-reads-anthropic", secrets.anthropicApiKey, serviceAccounts["worker"]);
  grantSecret("worker-reads-ops-webhook", secrets.opsAlertWebhookUrl, serviceAccounts["worker"]);

  // Bucket access: the api/worker read+write artifacts + user-content; the run-task harness reads
  // artifacts (to materialize /work); the benchmark-enclave bucket is granted to NO product SA here — it
  // is read only by the `rhema_benchmark` principal out-of-band (REQ-EVAL-3 / D-P0.13-1).
  const grantBucket = (id: string, bucket: gcp.storage.Bucket, sa: gcp.serviceaccount.Account, role: string) =>
    new gcp.storage.BucketIAMMember(`rhema-${stack}-${id}`, {
      bucket: bucket.name,
      role,
      member: pulumi.interpolate`serviceAccount:${sa.email}`,
    });
  grantBucket("api-rw-artifacts", buckets["artifacts"], serviceAccounts["api"], "roles/storage.objectAdmin");
  grantBucket("api-rw-usercontent", buckets["user-content"], serviceAccounts["api"], "roles/storage.objectAdmin");
  grantBucket("worker-rw-artifacts", buckets["artifacts"], serviceAccounts["worker"], "roles/storage.objectAdmin");
  // P1.15 — `ingest.sync` writes fetched bodies to quarantine + reads export zips, and `voice.purge`
  // deletes retained bytes — all in user-content.
  grantBucket("worker-rw-usercontent", buckets["user-content"], serviceAccounts["worker"], "roles/storage.objectAdmin");
  // P1.03 — collab writes the materialized markdown's content-addressed bytes + the `restore/<ydoc>/<ts>`
  // point blobs into artifacts (and reads the seeded version's bytes on first load).
  grantBucket("collab-rw-artifacts", buckets["artifacts"], serviceAccounts["collab"], "roles/storage.objectAdmin");
  // run-task's harness uid materializes /work from artifact bytes — read-only.
  grantBucket("runtask-ro-artifacts", buckets["artifacts"], serviceAccounts["run-task"], "roles/storage.objectViewer");

  // §13.3 ingest path (PRB.15): uploads land on the `quarantine/` prefix of the user-content bucket via
  // an api-presigned PUT (presignQuarantinePut); the FETCHER's SA is objectCreator CONDITIONED to that
  // prefix only ("a service account limited to the quarantine prefix" — §12.1), and the convert Job's SA
  // is read-only over the bucket so it can fetch the quarantined bytes before writing the canonical doc.
  new gcp.storage.BucketIAMMember(`rhema-${stack}-fetcher-quarantine-creator`, {
    bucket: buckets["user-content"].name,
    role: "roles/storage.objectCreator",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["fetcher"].email}`,
    condition: {
      title: "quarantine-prefix-only",
      description: "The fetcher may create objects only under quarantine/ (§13.3 upload quarantine).",
      expression: pulumi.interpolate`resource.name.startsWith("projects/_/buckets/${buckets["user-content"].name}/objects/quarantine/")`,
    },
  });
  grantBucket(
    "convert-ro-usercontent",
    buckets["user-content"],
    serviceAccounts["convert"],
    "roles/storage.objectViewer",
  );
  // PRB.20 — the convert Job's ONLY write grant: the `converted/` prefix it drops the ConversionResult JSON
  // into through its mounted bucket volume (the api reads the object back — stdout is not the transport).
  // `objectUser` (create+delete+get, prefix-conditioned) rather than bare objectCreator because the gcsfuse
  // write path needs more than a single create call (mkdir placeholders, close/rename).
  new gcp.storage.BucketIAMMember(`rhema-${stack}-convert-converted-writer`, {
    bucket: buckets["user-content"].name,
    role: "roles/storage.objectUser",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["convert"].email}`,
    condition: {
      title: "converted-prefix-only",
      description:
        "The convert Job writes only under converted/ — its read stays bucket-wide, its write is the one prefix (§13.3).",
      expression: pulumi.interpolate`resource.name.startsWith("projects/_/buckets/${buckets["user-content"].name}/objects/converted/")`,
    },
  });

  // PRB.20 — the api mints GCS v4 signed PUTs for `quarantine/`; on Cloud Run the storage client signs via
  // IAM Credentials `signBlob`, which needs `serviceAccountTokenCreator` on the CALLING service account.
  // The self-grant is the minimum surface (no key material on the service — REQ-ARCH-30).
  new gcp.serviceaccount.IAMMember(`rhema-${stack}-api-signs-own-blobs`, {
    serviceAccountId: serviceAccounts["api"].name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["api"].email}`,
  });

  // The egress-proxy MIG VM pulls its digest-pinned image from Artifact Registry with its instance SA (the COS
  // startup-script `docker pull`). Without this the pull is denied ("Unauthenticated request") — surfaced live
  // P0.15e. Project-level reader is the minimum (mirrors the run-task node grant below).
  new gcp.projects.IAMMember(`rhema-${stack}-proxy-artifactregistry-reader`, {
    project,
    role: "roles/artifactregistry.reader",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["egress-proxy"].email}`,
  });

  // The run-task GKE nodes pull the digest-pinned image from Artifact Registry over Private Google Access
  // (the sandbox subnet has no NAT / no internet). Without this the nodes fail to pull and never register
  // (P0.15c symptom: 0/1 nodes). A project-level reader on the node/pod GSA is the minimum (D-P0.15c-8).
  new gcp.projects.IAMMember(`rhema-${stack}-runtask-artifactregistry-reader`, {
    project,
    role: "roles/artifactregistry.reader",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["run-task"].email}`,
  });

  // The worker launches the two-uid run-task Jobs on the GKE cluster (createGkeJobLauncher → k8s Job create).
  // `container.developer` grants the k8s-API access to create/read Jobs in the cluster (D-P0.08-1); a tighter
  // per-namespace RBAC role is a later hardening (P1.22 / ops).
  new gcp.projects.IAMMember(`rhema-${stack}-worker-gke-job-launcher`, {
    project,
    role: "roles/container.developer",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["worker"].email}`,
  });

  return { serviceAccounts };
}
