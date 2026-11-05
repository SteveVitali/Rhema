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
  /**
   * OPS.1 (live finding — the first dev full-stack up): every IAM member this module creates.
   * Containers that consume a grant (Cloud Run services mounting secretKeyRefs, the convert
   * gcsfuse mount, the migrate Job) must `dependsOn` these — otherwise resource-graph ordering
   * lets a revision start before its SA's grant exists (gcsfuse mount PermissionDenied /
   * `versions/latest was not found`, surfaced live at update 68).
   */
  members: pulumi.Resource[];
}

export function createIam(args: IamArgs): Iam {
  const { stack, project, secrets, buckets } = args;
  const members: pulumi.Resource[] = [];

  const serviceAccounts = {} as Record<ServiceName, gcp.serviceaccount.Account>;
  for (const svc of SERVICES) {
    serviceAccounts[svc] = new gcp.serviceaccount.Account(`rhema-${stack}-${svc}-sa`, {
      accountId: `rhema-${stack}-${svc}`,
      displayName: `Rhema ${stack} ${svc}`,
    });
  }

  const secretAccessor = "roles/secretmanager.secretAccessor";
  const grantSecret = (id: string, secret: gcp.secretmanager.Secret, sa: gcp.serviceaccount.Account) => {
    const m = new gcp.secretmanager.SecretIamMember(`rhema-${stack}-${id}`, {
      secretId: secret.id,
      role: secretAccessor,
      member: pulumi.interpolate`serviceAccount:${sa.email}`,
    });
    members.push(m);
    return m;
  };

  // The egress-proxy is the sole reader of the provider key FOR MODEL TRAFFIC (REQ-ARCH-31): every
  // model call from a run pod egresses through the proxy's injection header. Two narrow operator-side
  // exceptions read the same key directly — the worker's `ingest.reconstruct` + walkthrough generator
  // (below; ADR-052) — never web/collab/run-task.
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
  // P1.16 — the api also reads the Billing key (Checkout/Portal session creation, STRIPE_SECRET_KEY_NAME).
  grantSecret("api-reads-stripe", secrets.stripeSecret, serviceAccounts["api"]);
  // INERT (ADR-113 / R6UCD.1, 2026-10-21): the edge-signed CDN contract is retired — the api mints
  // GCS V4 signed GETs on storage.googleapis.com via IAM signBlob instead (its objectAdmin grant on
  // the user-content bucket is what makes that possible). This grant stays deployed but unused;
  // removing it is part of the separate CDN-removal/cost decision.
  grantSecret("api-signs-usercontent", secrets.userContentSigningKey, serviceAccounts["api"]);
  // The billing worker reads Stripe (PRB.08), mints the same one-click HMAC (PRB.09), reads the Resend
  // transport key + the provider admin key for usage.reconcile, and publishes to the ops alert sink.
  grantSecret("worker-reads-stripe", secrets.stripeSecret, serviceAccounts["worker"]);
  grantSecret("worker-mints-email-action", secrets.emailActionSecret, serviceAccounts["worker"]);
  grantSecret("worker-reads-resend", secrets.resendApiKey, serviceAccounts["worker"]);
  grantSecret("worker-reads-anthropic-admin", secrets.anthropicAdminKey, serviceAccounts["worker"]);
  // P1.15 — `ingest.reconstruct` resolves the provider key from Secret Manager at boot (metered per
  // job, §9.5; the worker's `INGEST_MODEL_KEY_SECRET` env names the same version — compute.ts):
  // a bounded operator-side call outside the run-pod egress path. ADR-052's exception narrows to
  // this one use — R7DEP.1 removed the retired walkthrough binding (D-R7COPY.0-2).
  // REQ-ARCH-31's sole-reader rule still holds for model traffic.
  grantSecret("worker-reads-anthropic", secrets.anthropicApiKey, serviceAccounts["worker"]);
  grantSecret("worker-reads-ops-webhook", secrets.opsAlertWebhookUrl, serviceAccounts["worker"]);
  // SEC.1 — api + worker mount the `rhema_app_login` DATABASE_URL via Cloud Run secretKeyRef
  // (compute.ts); the runtime SA must hold secretAccessor on the container. Collab reads its own
  // `rhema_collab` DSN the same way (REQ-ARCH-30).
  grantSecret("api-reads-appdb", secrets.byId["app-database-url"], serviceAccounts["api"]);
  grantSecret("worker-reads-appdb", secrets.byId["app-database-url"], serviceAccounts["worker"]);
  grantSecret("collab-reads-collabdb", secrets.byId["collab-database-url"], serviceAccounts["collab"]);
  // OPS.1 — the generated non-prod DSN secrets: api + worker read `system-database-url` (the composed
  // postgres-role DSN) via secretKeyRef, and the in-VPC migrate Job — running under the worker SA —
  // reads all three DSNs to drive `ALTER ROLE … LOGIN`. Gated on the container's existence so prod's
  // IAM surface is untouched (`system-database-url` is a non-prod-only container).
  if (secrets.byId["system-database-url"]) {
    grantSecret("api-reads-sysdb", secrets.byId["system-database-url"], serviceAccounts["api"]);
    grantSecret("worker-reads-sysdb", secrets.byId["system-database-url"], serviceAccounts["worker"]);
    grantSecret("worker-reads-collabdb", secrets.byId["collab-database-url"], serviceAccounts["worker"]);
  }
  // R6HRD.1 — the proxy resolves its RunContextResolver DSN from Secret Manager at boot (the
  // `database-url-secret` metadata carries only the version NAME; the plaintext `database-url`
  // metadata attribute it replaced was readable by `compute.instances.get`). Prod reads the
  // dedicated `proxy-database-url` container; non-prod reads the generated `system-database-url`
  // (its proxy DSN IS the composed system DSN — the same value the config fallback supplied).
  if (secrets.byId["proxy-database-url"]) {
    grantSecret("proxy-reads-proxydb", secrets.byId["proxy-database-url"], serviceAccounts["egress-proxy"]);
  }
  if (secrets.byId["system-database-url"]) {
    grantSecret("proxy-reads-sysdb", secrets.byId["system-database-url"], serviceAccounts["egress-proxy"]);
  }

  // Bucket access: the api/worker read+write artifacts + user-content; the run-task harness reads
  // artifacts (to materialize /work); the benchmark-enclave bucket is granted to NO product SA here — it
  // is read only by the `rhema_benchmark` principal out-of-band (REQ-EVAL-3 / D-P0.13-1).
  const grantBucket = (id: string, bucket: gcp.storage.Bucket, sa: gcp.serviceaccount.Account, role: string) => {
    const m = new gcp.storage.BucketIAMMember(`rhema-${stack}-${id}`, {
      bucket: bucket.name,
      role,
      member: pulumi.interpolate`serviceAccount:${sa.email}`,
    });
    members.push(m);
    return m;
  };
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
  members.push(new gcp.storage.BucketIAMMember(`rhema-${stack}-fetcher-quarantine-creator`, {
    bucket: buckets["user-content"].name,
    role: "roles/storage.objectCreator",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["fetcher"].email}`,
    condition: {
      title: "quarantine-prefix-only",
      description: "The fetcher may create objects only under quarantine/ (§13.3 upload quarantine).",
      expression: pulumi.interpolate`resource.name.startsWith("projects/_/buckets/${buckets["user-content"].name}/objects/quarantine/")`,
    },
  }));
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
  members.push(new gcp.storage.BucketIAMMember(`rhema-${stack}-convert-converted-writer`, {
    bucket: buckets["user-content"].name,
    role: "roles/storage.objectUser",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["convert"].email}`,
    condition: {
      title: "converted-prefix-only",
      description:
        "The convert Job writes only under converted/ — its read stays bucket-wide, its write is the one prefix (§13.3).",
      expression: pulumi.interpolate`resource.name.startsWith("projects/_/buckets/${buckets["user-content"].name}/objects/converted/")`,
    },
  }));

  // PRB.20 — the api mints GCS v4 signed PUTs for `quarantine/`; on Cloud Run the storage client signs via
  // IAM Credentials `signBlob`, which needs `serviceAccountTokenCreator` on the CALLING service account.
  // The self-grant is the minimum surface (no key material on the service — REQ-ARCH-30).
  members.push(new gcp.serviceaccount.IAMMember(`rhema-${stack}-api-signs-own-blobs`, {
    serviceAccountId: serviceAccounts["api"].name,
    role: "roles/iam.serviceAccountTokenCreator",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["api"].email}`,
  }));

  // The egress-proxy MIG VM pulls its digest-pinned image from Artifact Registry with its instance SA (the COS
  // startup-script `docker pull`). Without this the pull is denied ("Unauthenticated request") — surfaced live
  // P0.15e. Project-level reader is the minimum (mirrors the run-task node grant below).
  members.push(new gcp.projects.IAMMember(`rhema-${stack}-proxy-artifactregistry-reader`, {
    project,
    role: "roles/artifactregistry.reader",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["egress-proxy"].email}`,
  }));

  // The run-task GKE nodes pull the digest-pinned image from Artifact Registry over Private Google Access
  // (the sandbox subnet has no NAT / no internet). Without this the nodes fail to pull and never register
  // (P0.15c symptom: 0/1 nodes). A project-level reader on the node/pod GSA is the minimum (D-P0.15c-8).
  members.push(new gcp.projects.IAMMember(`rhema-${stack}-runtask-artifactregistry-reader`, {
    project,
    role: "roles/artifactregistry.reader",
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["run-task"].email}`,
  }));

  // The worker launches the two-uid run-task Jobs on the GKE cluster (createGkeJobLauncher → k8s Job create).
  // P1.22 (D-P0.01-5 least-privilege close): `roles/container.developer` was the stand-in — it can create and
  // DELETE clusters and node pools, far beyond what the launcher does. The launcher's GCP-layer need is just
  // `container.clusters.get` (cluster discovery / the auth surface for its metadata token — the endpoint + CA
  // reach it as env, so even that is defensive); what the identity may DO inside the cluster is decided by
  // RBAC — the per-namespace Role/RoleBinding in infra/k8s/30-worker-job-rbac.yaml grants secrets create/get +
  // jobs create/get/list in `runs`, nothing else. The custom role below is the narrow IAM half.
  const gkeClusterAccess = new gcp.projects.IAMCustomRole(`rhema-${stack}-gke-cluster-access`, {
    project,
    roleId: `rhema${stack.replace(/-/g, "")}GkeClusterAccess`.slice(0, 64),
    title: `Rhema ${stack} — GKE cluster access (worker job launcher)`,
    description:
      "Least-privilege IAM half of the run-task Job launch path (P1.22; D-P0.01-5): cluster discovery only — " +
      "in-cluster powers come from the `runs`-namespace RBAC Role (infra/k8s/30-worker-job-rbac.yaml).",
    permissions: ["container.clusters.get", "container.clusters.list"],
  });
  members.push(new gcp.projects.IAMMember(`rhema-${stack}-worker-gke-job-launcher`, {
    project,
    role: gkeClusterAccess.name,
    member: pulumi.interpolate`serviceAccount:${serviceAccounts["worker"].email}`,
  }));

  return { serviceAccounts, members };
}
