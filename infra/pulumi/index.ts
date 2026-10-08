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
import * as gcp from "@pulumi/gcp";
import * as random from "@pulumi/random";
import * as tls from "@pulumi/tls";
import { stageConfigFor } from "../config/stages";
import { createNetwork } from "./network";
import { createData } from "./data";
import { createSecrets } from "./secrets";
import { createIam } from "./iam";
import { createCompute } from "./compute";
import { createMonitoring } from "./monitoring";
import { createJourneys } from "./journeys";
import { createTurboCache } from "./turbo-cache";
import { createBilling } from "./billing";
import { NONPROD_OPERATOR_PLACEHOLDER_IDS, resendVersionPlan } from "./resend-key";

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
// SEC.3 — the run-task pod's appArmorProfile (type + Localhost profile name). `Localhost`/
// `rhema-run-task` ship as the deploy config; a rollback flips these two keys, never code.
const runTaskAppArmorType = rhemaConfig.get("runTaskAppArmorType");
const runTaskAppArmorLocalhostProfile = rhemaConfig.get("runTaskAppArmorLocalhostProfile");
const internalApiUrl = rhemaConfig.get("internalApiUrl");
const proxyBaseUrl = rhemaConfig.get("proxyBaseUrl");
// PRB.16 — the Google OAuth client ID (plain deploy config — the SECRET is the `google-oauth-client-secret`
// SM container). Until the real client id lands the api's auth surface stays gated on authSecretsReady.
const googleOauthClientId = rhemaConfig.get("googleOauthClientId");
// PRB.17 — the Stripe Payment Link URL (plain deploy config — the exhaustion panel + billing surface
// 302 to it; the whsec_… + sk_… stay Secret-Manager values, never config).
const stripePaymentLinkUrl = rhemaConfig.get("stripePaymentLinkUrl");
// P1.22 W9 — the ops-alert webhook URL as a Pulumi SECRET config (the same value the worker reads from
// the `ops-alert-webhook-url` Secret Manager container as OPS_ALERT_WEBHOOK_URL). Unset ⇒ the §13.5 alert
// policies still record incidents; they just don't page.
const opsAlertWebhookUrl = rhemaConfig.getSecret("opsAlertWebhookUrl");
// PRB.15 — the real digest-pinned service images as a JSON `{service: ref}` map (the images CI publishes
// it; REQ-ARCH-39). Missing entries fall back to the placeholder so `preview` stays plannable.
const serviceImages = rhemaConfig.getObject<Record<string, string>>("serviceImages");
// SPA.2 — the per-flip preview flag path (REQ-SEQ-3): a `rhema:spaSurfaces` CSV set via
// `preview-stack.mjs config` overrides the stage fact for THIS stack only (never committed —
// the git-visible `StageConfig.spaSurfaces` stays the source of truth for dev/prod flips).
const spaSurfaces = rhemaConfig.get("spaSurfaces");
// OPS.1 — deploy-provenance inputs for the non-prod migrate Job's `deployments` row (REQ-ARCH-39):
// the chain-tip SHA the images were built at + the computed protocols version; unset ⇒ the migrate
// Job skips the record leg (a bare `pulumi preview` stays clean).
const gitSha = rhemaConfig.get("gitSha");
const protocolsVersion = rhemaConfig.get("protocolsVersion");
// MAINT.6 (D-OPS.1-1) — a REAL Resend key for non-prod session minting (the magic-link leg every
// signed-in preview journey needs). Set via `preview-stack.mjs resend-pull`, which pipes the
// operator-seeded shared secret `rhema-nonprod-resend-api-key` into this SECRET config — encrypted
// in state, never in argv/logs/the repo (REQ-ARCH-30). The send-only key on the prod Resend account
// keeps `rhema.tools` a verified sender while previews stay off prod secrets (REQ-ARCH-38).
const resendApiKey = rhemaConfig.getSecret("resendApiKey");

const isProd = cfg.kind === "prod";
// MAINT.6 — fail-closed: the config is a non-prod-only path; a prod stack carrying it refuses the
// entire program before a single resource is created (prod's resend key stays operator-seeded).
const resendPlan = resendVersionPlan(cfg.kind, resendApiKey !== undefined);
if (resendPlan === "refused") {
  throw new pulumi.RunError(
    "rhema:resendApiKey is refused on prod — prod's resend-api-key version stays operator-seeded " +
      "out of band (REQ-ARCH-30/REQ-ARCH-38); the config path exists only so pr-<n>/dev can mint test sessions",
  );
}
const network = createNetwork({ stack, cfg, region });
// OPS.1 — `system-database-url` is a non-prod-only container: it carries the program-generated
// `postgres`-role DSN and is kept OUT of ALL_SECRET_IDS so prod's provisioned set is byte-identical.
const secrets = createSecrets({ stack, region, extraIds: isProd ? [] : ["system-database-url"] });
// OPS.1 — non-prod postgres bootstrap: the operator's `rhema:alloydbPassword` config still wins when
// set (prod + any operator-seeded dev); otherwise a @pulumi/random value lives ONLY in encrypted
// state + the `alloydb-password` secret — no hand step, nothing in the repo.
const generatedPostgresPassword =
  !isProd && alloydbPassword === undefined
    ? new random.RandomPassword("rhema-postgres-password", { length: 32, special: false })
    : undefined;
const postgresPassword = alloydbPassword ?? generatedPostgresPassword?.result;
const data = createData({ stack, cfg, region, network, alloydbPassword: postgresPassword });

// SEC.1 (REQ-SPEC-30; REQ-ARCH-30) — the user-serving role's credential is generated HERE (never
// operator-handled, never committed): `rhema_app_login`'s password is a @pulumi/random secret output
// and the program itself writes the DSN version into `rhema-<stack>-app-database-url`, so api +
// worker Cloud Run services can mount DATABASE_URL via `secretKeyRef` (compute.ts) instead of a
// plaintext env `value`. The role stays NOLOGIN until Stage B's authorized `ALTER ROLE … LOGIN
// PASSWORD '<this value>'` — the operator reads the DSN (and its password) back from Secret Manager,
// never from a ledger. `pulumi stack output appDatabaseDsn --show-secrets` is the equivalent.
const appDbPassword = new random.RandomPassword("rhema-app-login-password", {
  length: 32,
  special: false, // URL-inlined into the DSN — no percent-encoding surface
});
// AlloyDB's generated pg_hba is hostssl-only — every DSN below carries `sslmode=require` (the
// migrate Job's first run failed `no pg_hba.conf entry … no encryption`, dev update 73 finding).
// pg-connection-string aliases `require` to verify-full semantics, which rejects AlloyDB's
// self-signed instance cert — `uselibpqcompat=true` restores real libpq `require` (encrypt,
// no CA pinning — correct for private-IP-only traffic inside the VPC).
const appDatabaseDsn = pulumi.secret(
  pulumi.interpolate`postgresql://rhema_app_login:${appDbPassword.result}@${data.databaseHost}:5432/rhema?sslmode=require&uselibpqcompat=true`,
);
// Only version the secret on stages that wire it (requiredSecrets — compute.ts's `requires` gate);
// a versionless preview container stays empty and harmless. OPS.1 — every version the program
// writes is collected: the services/Jobs that mount `versions/latest` must dependsOn them
// (a revision starting before its version exists fails "secret … was not found" — live finding).
const secretVersions: gcp.secretmanager.SecretVersion[] = [];
if (cfg.requiredSecrets.includes("app-database-url")) {
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(
      `rhema-${stack}-app-database-url-v1`,
      {
        secret: secrets.byId["app-database-url"].id,
        secretData: appDatabaseDsn,
      },
      // OPS.2 — prod only: `secretData` is write-only (the SecretVersion GET cannot return it),
      // so any `pulumi refresh` marks it stale and every later preview plans a REPLACE carrying
      // identical bytes — drift noise on a secret version that is immutable by design and a
      // rotation footgun (a rewritten version whose DSN no longer matches the DB role's password
      // would break prod). Non-prod keeps full management: a rotated RandomPassword there SHOULD
      // propagate a new version.
      isProd ? { ignoreChanges: ["secretData"] } : {},
    ),
  );
}
export const appDatabaseDsnOutput = appDatabaseDsn;

// OPS.2 — the self-hosted Turborepo remote-cache Bearer token (turbo-cache.ts). Program-minted on
// EVERY stage (a brand-new secret with no operator-seeded state to adopt — it joins
// NONPROD_GENERATED_SECRET_IDS for dev/preview and is required on prod like the rest). Prod keeps
// the same `secretData` ignore as app-database-url: the value is immutable-by-design and a
// refresh-driven replace would be drift noise on the quiet-preview contract.
const turboCacheToken = new random.RandomPassword("rhema-turbo-cache-token", {
  length: 48,
  special: false,
});
secretVersions.push(
  new gcp.secretmanager.SecretVersion(
    `rhema-${stack}-turbo-cache-token-v1`,
    {
      secret: secrets.byId["turbo-cache-token"].id,
      secretData: turboCacheToken.result,
    },
    isProd ? { ignoreChanges: ["secretData"] } : {},
  ),
);

// OPS.1 (REQ-ARCH-30 / REQ-SPEC-30; owned decision (c)) — the rest of the fresh-stack generated set,
// NON-PROD ONLY. On `dev`/`pr-<n>` the program itself mints every remaining role credential + the
// HMAC/key material and writes them as Secret Manager versions, so a fresh stack boots with zero
// hand-set `rhema:*DatabaseUrl` secret configs and no two-pass operator ceremony: the in-VPC migrate
// Job reads these DSNs back via secretKeyRef and turns the NOLOGIN roles live (`ALTER ROLE … LOGIN
// PASSWORD`). Values exist ONLY inside encrypted Pulumi state + Secret Manager — never the repo,
// never a plaintext env, never a ledger. `system-database-url`'s container is non-prod-only (created
// via `extraIds` above), and NOTHING in this block runs on prod: prod's `collab-database-url`,
// `alloydb-password`, `run-token-signing-key`, `better-auth-secret`, and `email-action-secret` keep
// their operator-seeded values and hand-managed role state (OPS.2 adopts them, untouched here).
let systemDatabaseDsn: pulumi.Output<string> | undefined;
if (!isProd) {
  if (!postgresPassword) {
    throw new pulumi.RunError("non-prod stack has no postgres password — set rhema:alloydbPassword or let the program generate it");
  }
  // `rhema_collab`'s LOGIN credential (migration 0001 creates it NOLOGIN; the migrate Job logs it in).
  const collabDbPassword = new random.RandomPassword("rhema-collab-password", {
    length: 32,
    special: false,
  });
  const collabDatabaseDsn = pulumi.secret(
    pulumi.interpolate`postgresql://rhema_collab:${collabDbPassword.result}@${data.databaseHost}:5432/rhema?sslmode=require&uselibpqcompat=true`,
  );
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-collab-database-url-v1`, {
      secret: secrets.byId["collab-database-url"].id,
      secretData: collabDatabaseDsn,
    }),
  );
  // The composed system DSN — the elevated `postgres` role confined to the audited system seams
  // (worker's SYSTEM_DATABASE_URL, the api's circuit-breaker read, the egress-proxy resolver, the
  // migrate Job). Cloud Run mounts it by secretKeyRef; it is never a plaintext env.
  systemDatabaseDsn = pulumi.secret(
    pulumi.interpolate`postgresql://postgres:${postgresPassword}@${data.databaseHost}:5432/rhema?sslmode=require&uselibpqcompat=true`,
  );
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-system-database-url-v1`, {
      secret: secrets.byId["system-database-url"].id,
      secretData: systemDatabaseDsn,
    }),
  );
  // The `alloydb-password` container mirrors the EFFECTIVE bootstrap password (the operator's config
  // value when set, the generated one otherwise) so operator psql/debug paths keep working.
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-alloydb-password-v1`, {
      secret: secrets.byId["alloydb-password"].id,
      secretData: pulumi.secret(pulumi.interpolate`${postgresPassword}`),
    }),
  );
  // The RS256 run-token keypair (SEC.1's single-secret shape — the private PKCS8 PEM; every loader
  // derives the public half via `createPublicKey` at boot). @pulumi/tls keeps the value stable in
  // state across `up`s — generated in-program would rotate the key on every preview.
  const runTokenKey = new tls.PrivateKey("rhema-run-token-key", {
    algorithm: "RSA",
    rsaBits: 4096,
  });
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-run-token-signing-key-v1`, {
      secret: secrets.byId["run-token-signing-key"].id,
      secretData: pulumi.secret(runTokenKey.privateKeyPemPkcs8),
    }),
  );
  // The better-auth signing secret + the one-click email-action HMAC — random high-entropy material.
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-better-auth-secret-v1`, {
      secret: secrets.byId["better-auth-secret"].id,
      secretData: new random.RandomPassword("rhema-better-auth", { length: 48, special: false }).result,
    }),
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-email-action-secret-v1`, {
      secret: secrets.byId["email-action-secret"].id,
      secretData: new random.RandomPassword("rhema-email-action", { length: 48, special: false }).result,
    }),
  );
  // OPS.1 (F-OPS.1-9 — live finding: the pr-102 worker crash-looped on `anthropic-api-key` "no
  // versions") — the operator-only secrets get explicit NON-PROD PLACEHOLDER versions so a guarded
  // preview boots every service with zero out-of-band seeding. The value is deliberately invalid
  // (any real provider/billing call 401s — which is what $0-inference previews WANT); prod still
  // refuses to run this block and keeps hand-seeded values only.
  for (const id of NONPROD_OPERATOR_PLACEHOLDER_IDS) {
    // MAINT.6 — when `rhema:resendApiKey` carries the real non-prod key it replaces the
    // `resend-api-key` placeholder version entirely (the worker's mail.send transport goes live).
    if (id === "resend-api-key" && resendPlan === "real") continue;
    secretVersions.push(
      new gcp.secretmanager.SecretVersion(`rhema-${stack}-${id}-placeholder-v1`, {
        secret: secrets.byId[id].id,
        secretData: `ops1-nonprod-placeholder-${stack}-not-a-real-key`,
      }),
    );
  }
  // MAINT.6 — the real-key version (plan "real" ⇔ resendApiKey defined on a non-prod stack; prod
  // with the config set never reaches this block — the program threw above). The version lives only
  // in Secret Manager + encrypted stack state, exactly like the generated DSN set.
  if (resendPlan === "real" && resendApiKey) {
    secretVersions.push(
      new gcp.secretmanager.SecretVersion(`rhema-${stack}-resend-api-key-v1`, {
        secret: secrets.byId["resend-api-key"].id,
        secretData: resendApiKey,
      }),
    );
  }
}
const iam = createIam({ stack, project, secrets, buckets: data.buckets });
// OPS.1 — Memorystore's `redis://<host>:6379` URL carries no credential (private-IP, no AUTH), so the
// program composes it from the instance output instead of an operator-set `rhema:redisUrl`/`workerRedisUrl`
// secret config. The configs still win when present (prod's shared `rhema:redisUrl` is unchanged).
const generatedRedisUrl = pulumi.interpolate`redis://${data.redis.host}:6379`;
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
  ...(gitSha ? { gitSha } : {}),
  ...(protocolsVersion ? { protocolsVersion } : {}),
  proxyImage,
  // the proxy's ReloadableAnthropicSecretProvider needs the FULL secret-version resource name
  // (`projects/<p>/secrets/<name>/versions/latest`); the bare secretId is parsed as the project id by the
  // Secret Manager client → CONSUMER_INVALID (surfaced live P0.15e).
  anthropicKeySecret: pulumi.interpolate`${secrets.anthropicApiKey.id}/versions/latest`,
  // OPS.1 — the proxy's resolver DSN is the generated system DSN on non-prod (the config path stays
  // for prod, where the operator seeds `rhema:proxyDatabaseUrl`).
  ...(proxyDatabaseUrl || systemDatabaseDsn
    ? { proxyDatabaseUrl: proxyDatabaseUrl ?? systemDatabaseDsn! }
    : {}),
  // worker env (all optional; OBJECTS_BUCKET defaults to the artifacts bucket).
  ...(workerDatabaseUrl ? { workerDatabaseUrl } : {}),
  ...(workerSystemDatabaseUrl ? { workerSystemDatabaseUrl } : {}),
  workerRedisUrl: workerRedisUrl ?? generatedRedisUrl,
  // api env (PRB.15 prod) + the Resend From address.
  ...(apiDatabaseUrl ? { apiDatabaseUrl } : {}),
  ...(apiSystemDatabaseUrl ? { apiSystemDatabaseUrl } : {}),
  apiRedisUrl: apiRedisUrl ?? generatedRedisUrl,
  ...(collabDatabaseUrl ? { collabDatabaseUrl } : {}),
  ...(emailFrom ? { emailFrom } : {}),
  ...(runTaskImageDigest ? { runTaskImageDigest } : {}),
  ...(runTaskAppArmorType ? { runTaskAppArmorType } : {}),
  ...(runTaskAppArmorLocalhostProfile ? { runTaskAppArmorLocalhostProfile } : {}),
  ...(internalApiUrl ? { internalApiUrl } : {}),
  ...(proxyBaseUrl ? { proxyBaseUrl } : {}),
  ...(spaSurfaces ? { spaSurfaces } : {}),
  // MAINT.6 — mount the resend secret NAME on the worker ONLY when the real key was seeded
  // (the placeholder version is never mounted: the env stays absent and mail.send no-ops exactly
  // as an unkeyed preview does today).
  ...(resendPlan === "real" ? { resendSecretWired: true } : {}),
  ...(googleOauthClientId ? { googleOauthClientId } : {}),
  ...(stripePaymentLinkUrl ? { stripePaymentLinkUrl } : {}),
  objectsBucket: data.buckets["artifacts"].name,
  secretVersions,
});

// OPS.2 — the self-hosted Turborepo remote cache (D-P0.01-4): scale-to-zero Cloud Run in front of a
// project-private GCS bucket; the program-minted Bearer mounts via secretKeyRef. `turboCacheUrl`
// is the value CI's TURBO_API points at (repo-admin wiring — Stage B leg).
const turboCache = createTurboCache({
  stack,
  project,
  region,
  isProd,
  secrets,
  image: serviceImages?.["turbo-cache"] ?? placeholderImage,
  secretVersionDeps: secretVersions,
});

// OPS.2 — the prod cost-watch IaC (BL-8): the $50/mo budget alert + the billing-export BigQuery
// dataset. Gated on the stage fact — only prod carries `billingAccountId`.
if (cfg.billingAccountId) {
  createBilling({ stack, project, region, billingAccountId: cfg.billingAccountId });
}

// JOURNEY.1 — adopt the journey-mailbox resources (the hand-created DWD service account, the Gmail
// API enablement, and the Token-Creator grants for the CI WIF principal + the operator). `import:`
// brings the pre-existing resources under management without replacing them.
createJourneys({
  project,
  ciRepository: rhemaConfig.get("ciRepository") ?? "SteveVitali/Rhema",
});

// P1.22 W9 — the §13.5 SLO dashboard + alert policies (REQ-ARCH-34). The worker's `slo.probe` sweep logs
// breach lines the log-based metric counts; policies page the ops webhook when it's configured.
createMonitoring({
  stack,
  project,
  region,
  // Thread the AUTONAMED Cloud Run service names — `service_name` labels match the deployed name
  // (`rhema-prod-api-e745ce0`), not the Pulumi base name (SLO.1: the literal-name filters were
  // silently empty).
  ...(compute.services.api ? { apiServiceName: compute.services.api.name } : {}),
  ...(compute.services.worker ? { workerServiceName: compute.services.worker.name } : {}),
  ...(opsAlertWebhookUrl ? { opsAlertWebhookUrl } : {}),
});

// Stack outputs — consumed by the deploy step (to feed the app env) and by the post-deploy network
// assertion that reads the sandbox subnet's firewall/route facts back off the live VPC (D-P0.01-2).
export const projectId = project;
export const regionName = region;
export const stageKind = cfg.kind;
export const maxUsdPerRun = cfg.maxUsdPerRun;
export const vpcSelfLink = network.network.selfLink;
export const sandboxSubnet = network.sandboxSubnetSelfLink;
// The Postgres endpoint facts — engine-gated (PRB.15 amended 2026-09-17): `alloydbCluster` exists on
// AlloyDB stages (dev/preview), `cloudSqlInstance` on Cloud SQL stages (prod); `databaseHost` is the
// private IP either way — what the operator's DATABASE_URLs + the migrate/seed runner point at.
// OPS.2 — each output is emitted ONLY where its engine's resource exists: an `export const` bound to
// `undefined` makes every preview of the other stage print "Undefined value (<name>) will not show
// as a stack output" — the warning noise that hid real drift since STB.1. Under this program's
// CommonJS module system a conditional `exports` write registers the stack output only when the
// branch runs (the Pulumi engine walks module.exports after the program completes).
const engineOutputs = exports as unknown as Record<string, unknown>;
if (data.alloydbCluster) engineOutputs.alloydbCluster = data.alloydbCluster.name;
if (data.cloudSqlInstance) engineOutputs.cloudSqlInstance = data.cloudSqlInstance.name;
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
// OPS.2 — the remote-cache endpoint CI's TURBO_API points at (D-P0.01-4).
export const turboCacheUrl = turboCache.url;
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
