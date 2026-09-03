// IAM as code (D-P0.01-5): one least-privilege Workload-Identity service account per service, and the
// EXPLICIT secret-accessor bindings that make the proxy the sole reader of the provider key (REQ-ARCH-30).
//
// The rule this file encodes: `web`/`collab` hold NO secrets; `api` reads the auth secrets; the
// `egress-proxy` — and ONLY it — reads the Anthropic key; the billing `worker` reads Stripe. Every grant
// is a discrete resource so a review diff shows exactly who can read what.

import * as gcp from "@pulumi/gcp";
import * as pulumi from "@pulumi/pulumi";
import type { Secrets } from "./secrets.js";

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
  // api reads the auth secrets; web/collab read NONE (no binding = no access under uniform IAM).
  grantSecret("api-reads-betterauth", secrets.betterAuthSecret, serviceAccounts["api"]);
  grantSecret("api-reads-google-oauth", secrets.googleOauthClientSecret, serviceAccounts["api"]);
  // The billing worker reads Stripe.
  grantSecret("worker-reads-stripe", secrets.stripeSecret, serviceAccounts["worker"]);

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
  // run-task's harness uid materializes /work from artifact bytes — read-only.
  grantBucket("runtask-ro-artifacts", buckets["artifacts"], serviceAccounts["run-task"], "roles/storage.objectViewer");

  return { serviceAccounts };
}
