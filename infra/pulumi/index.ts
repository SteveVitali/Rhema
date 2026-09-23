// Rhema GCP infrastructure — the Pulumi (TypeScript) program that replaces the superseded SST/AWS
// skeleton (DEFERRALS D-P0.01-7; AWS→GCP amendment 2026-09-02). Run by the Pulumi CLI, NOT by tsc:
//
//   cd infra/pulumi && npm install      # installs @pulumi/pulumi + @pulumi/gcp (operator's env)
//   pulumi stack select pr-test         # or dev / prod
//   pulumi preview                      # clean plan (no spend)
//   pulumi up                           # [OPERATOR GATE] provisions billable infra
//
// The security- and cost-critical numbers come from `infra/config/stages.ts` (the same pure data the
// unit tests assert), so the deployed shape cannot drift from what the tests prove. This program
// provisions the SUBSTRATE only; service business logic ships in the app images later tickets build.

import * as pulumi from "@pulumi/pulumi";
import { stageConfigFor } from "../config/stages";
import { createNetwork } from "./network";
import { createData } from "./data";
import { createSecrets } from "./secrets";
import { createIam } from "./iam";
import { createCompute } from "./compute";

// The Pulumi stack name IS the Rhema stage name (dev | pr-<n> | prod); config resolves the stage kind.
const stack = pulumi.getStack();
const cfg = stageConfigFor(stack);

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.get("project") ?? "rhema-507501";
const region = gcpConfig.get("region") ?? "us-central1";

const rhemaConfig = new pulumi.Config("rhema");
// A placeholder container image until each service ships real logic; overridden per-deploy with the
// digest-pinned image from the `images` job (REQ-ARCH-39).
const placeholderImage = rhemaConfig.get("placeholderImage") ?? "gcr.io/google-containers/pause:3.9";
// The digest-pinned egress-proxy image + its DATABASE_URL (a Pulumi SECRET config — encrypted, not committed);
// the proxy reads the provider key from Secret Manager itself (only the secret NAME is passed). D-P0.15c-7.
const proxyImage = rhemaConfig.get("proxyImage") ?? placeholderImage;
const proxyDatabaseUrl = rhemaConfig.getSecret("proxyDatabaseUrl");

// The always-on worker's dynamic env (D-P0.08-1): secret configs for the connection strings, plain config for
// the URLs/digest. All optional — a preview with none set stays clean; the operator sets them before `dev`.
// OBJECTS_BUCKET defaults to the artifacts bucket (always provisioned) so it need not be configured by hand.
const workerDatabaseUrl = rhemaConfig.getSecret("workerDatabaseUrl");
const workerSystemDatabaseUrl = rhemaConfig.getSecret("workerSystemDatabaseUrl");
// PRB.15 — prod uses ONE shared `rhema:redisUrl` secret for api + worker (the dev stack predates it and
// keeps `workerRedisUrl`); `workerRedisUrl` wins when both are set.
const redisUrl = rhemaConfig.getSecret("redisUrl");
const workerRedisUrl = rhemaConfig.getSecret("workerRedisUrl") ?? redisUrl;
const apiRedisUrl = rhemaConfig.getSecret("apiRedisUrl") ?? redisUrl;
// The api's connections (PRB.15 prod). `rhema:appDatabaseUrl` is the canonical key (amended
// 2026-09-17); `apiDatabaseUrl` stays readable as a fallback for stacks seeded under the old name.
const apiDatabaseUrl = rhemaConfig.getSecret("appDatabaseUrl") ?? rhemaConfig.getSecret("apiDatabaseUrl");
const apiSystemDatabaseUrl = rhemaConfig.getSecret("apiSystemDatabaseUrl");
// P1.03 — the collab service's DATABASE_URL connects as the limited `rhema_collab` role (migration
// 0028's grants). Its own secret config — never the api/worker strings.
const collabDatabaseUrl = rhemaConfig.getSecret("collabDatabaseUrl");
// The postgres bootstrap password binding the engine's `postgres` user (HUMAN-H6 — the operator
// builds every DATABASE_URL from it). Engine-agnostic despite the name: AlloyDB initialUser on dev,
// Cloud SQL built-in user on prod.
const alloydbPassword = rhemaConfig.getSecret("alloydbPassword");
const emailFrom = rhemaConfig.get("emailFrom");
const runTaskImageDigest = rhemaConfig.get("runTaskImageDigest");
const internalApiUrl = rhemaConfig.get("internalApiUrl");
const proxyBaseUrl = rhemaConfig.get("proxyBaseUrl");
// PRB.16 — the Google OAuth client ID (plain deploy config — the SECRET is the `google-oauth-client-secret`
// SM container). Until the real client id lands the api's auth surface stays gated on authSecretsReady.
const googleOauthClientId = rhemaConfig.get("googleOauthClientId");
// PRB.17 — the Stripe Payment Link URL (plain deploy config — the exhaustion panel + billing surface
// 302 to it; the whsec_… + sk_… stay Secret-Manager values, never config).
const stripePaymentLinkUrl = rhemaConfig.get("stripePaymentLinkUrl");
// PRB.15 — the real digest-pinned service images as a JSON `{service: ref}` map (the images CI publishes
// it; REQ-ARCH-39). Missing entries fall back to the placeholder so `preview` stays plannable.
const serviceImages = rhemaConfig.getObject<Record<string, string>>("serviceImages");

const network = createNetwork({ stack, cfg, region });
const secrets = createSecrets({ stack, region });
const data = createData({ stack, cfg, region, network, alloydbPassword });
const iam = createIam({ stack, project, secrets, buckets: data.buckets });
const compute = createCompute({
  stack,
  cfg,
  project,
  region,
  network,
  iam,
  secrets,
  buckets: data.buckets,
  placeholderImage,
  ...(serviceImages ? { serviceImages } : {}),
  proxyImage,
  // the proxy's ReloadableAnthropicSecretProvider needs the FULL secret-version resource name
  // (`projects/<p>/secrets/<name>/versions/latest`); the bare secretId is parsed as the project id by the
  // Secret Manager client → CONSUMER_INVALID (surfaced live P0.15e).
  anthropicKeySecret: pulumi.interpolate`${secrets.anthropicApiKey.id}/versions/latest`,
  ...(proxyDatabaseUrl ? { proxyDatabaseUrl } : {}),
  // worker env (all optional; OBJECTS_BUCKET defaults to the artifacts bucket).
  ...(workerDatabaseUrl ? { workerDatabaseUrl } : {}),
  ...(workerSystemDatabaseUrl ? { workerSystemDatabaseUrl } : {}),
  ...(workerRedisUrl ? { workerRedisUrl } : {}),
  // api env (PRB.15 prod) + the Resend From address.
  ...(apiDatabaseUrl ? { apiDatabaseUrl } : {}),
  ...(apiSystemDatabaseUrl ? { apiSystemDatabaseUrl } : {}),
  ...(apiRedisUrl ? { apiRedisUrl } : {}),
  ...(collabDatabaseUrl ? { collabDatabaseUrl } : {}),
  ...(emailFrom ? { emailFrom } : {}),
  ...(runTaskImageDigest ? { runTaskImageDigest } : {}),
  ...(internalApiUrl ? { internalApiUrl } : {}),
  ...(proxyBaseUrl ? { proxyBaseUrl } : {}),
  ...(googleOauthClientId ? { googleOauthClientId } : {}),
  ...(stripePaymentLinkUrl ? { stripePaymentLinkUrl } : {}),
  objectsBucket: data.buckets["artifacts"].name,
});

// Stack outputs — consumed by the deploy step (to feed the app env) and by the post-deploy network
// assertion that reads the sandbox subnet's firewall/route facts back off the live VPC (D-P0.01-2).
export const projectId = project;
export const regionName = region;
export const stageKind = cfg.kind;
export const maxUsdPerRun = cfg.maxUsdPerRun;
export const vpcSelfLink = network.network.selfLink;
export const sandboxSubnet = network.sandboxSubnetSelfLink;
// The Postgres endpoint facts — engine-gated (PRB.15 amended 2026-09-17): `alloydbCluster` is set on
// AlloyDB stages (dev/preview), `cloudSqlInstance` on Cloud SQL stages (prod); `databaseHost` is the
// private IP either way — what the operator's DATABASE_URLs + the migrate/seed runner point at.
export const alloydbCluster = data.alloydbCluster?.name;
export const cloudSqlInstance = data.cloudSqlInstance?.name;
export const databaseHost = data.databaseHost;
export const redisHost = data.redis.host;
export const bucketNames = pulumi.all(Object.values(data.buckets).map((b) => b.name));
export const gkeCluster = compute.gke.name;
export const anthropicSecretId = secrets.anthropicApiKey.secretId;
// PRB.15 — the operator's prod hand-off surface: the reserved LB IPv4, the DNS records to apply at the
// registrar (cert authorization requires them live), and the secret CONTAINER ids whose versions the
// operator seeds (the stage facts' requiredSecrets — values never leave the operator's env).
export const lbIpAddress = compute.lbIpAddress;
export const dnsRecords = compute.dnsRecords;
export const requiredSecrets = cfg.requiredSecrets;
// A single machine-readable fact the post-deploy check asserts: the sandbox is fully isolated.
export const sandboxIsolated = {
  hasDefaultInternetRoute: false,
  hasCloudNat: false,
  egressTargets: ["fw:egress-proxy"],
} satisfies Record<string, unknown>;

// Guard: previews/dev must never carry production secrets (REQ-ARCH-38). This is enforced by the stack
// config (no prod secret versions are added to a preview stack), and asserted here as a tripwire.
if (!cfg.allowsProductionSecrets && stack === "prod") {
  throw new pulumi.RunError("stage-kind/stack mismatch: prod stack resolved to a non-prod config");
}
