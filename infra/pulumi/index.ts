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
import { stageConfigFor, withPostureOverrides } from "../config/stages";
import type { StageDomains } from "../config/stages";
import { createNetwork } from "./network";
import { createData } from "./data";
import { createSecrets } from "./secrets";
import { createIam } from "./iam";
import { createCompute } from "./compute";
import { createMonitoring } from "./monitoring";
import { createJourneys } from "./journeys";
import { createTurboCache } from "./turbo-cache";
import { createBilling } from "./billing";
import {
  NONPROD_OPERATOR_PLACEHOLDER_IDS,
  NONPROD_RESEND_SECRET_NAME,
  NONPROD_RESEND_SENDER,
  NONPROD_STRIPE_SECRET_NAME,
  PROD_RESEND_SENDER,
  resendVersionPlan,
} from "./resend-key";

// The Pulumi stack name IS the Rhema stage name (dev | pr-<n> | prod); config resolves the stage kind.
const stack = pulumi.getStack();
const stageCfg = stageConfigFor(stack);

const gcpConfig = new pulumi.Config("gcp");
const project = gcpConfig.get("project") ?? "rhema-507501";
const region = gcpConfig.get("region") ?? "us-central1";

const rhemaConfig = new pulumi.Config("rhema");
// A placeholder container image until each service ships real logic; overridden per-deploy with the
// digest-pinned image from the `images` job (REQ-ARCH-39).
const placeholderImage = rhemaConfig.get("placeholderImage") ?? "gcr.io/google-containers/pause:3.9";
// The digest-pinned egress-proxy image + its DATABASE_URL (a Pulumi SECRET config — encrypted, not
// committed). R6HRD.1: the config now seeds ONLY the `proxy-database-url` SM container (below) —
// the proxy resolves `versions/latest` at boot via its instance SA, the same path the provider key
// already took (only secret NAMES reach the InstanceTemplate metadata). D-P0.15c-7.
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
// VERIF.2 — preview public origins (plain deploy config, the stage's own *.run.app URLs): prod
// derives app/api origins from `domains`; previews set these after the first `up` so the api's
// auth mount (APP_BASE_URL is an authSecretsReady gate) + trusted origins can resolve.
const appBaseUrl = rhemaConfig.get("appBaseUrl");
const apiPublicUrl = rhemaConfig.get("apiPublicUrl");
// PRB.17 — the Stripe Payment Link URL (plain deploy config — the exhaustion panel + billing surface
// 302 to it; the whsec_… + sk_… stay Secret-Manager values, never config).
const stripePaymentLinkUrl = rhemaConfig.get("stripePaymentLinkUrl");
// P1.22 W9 — the ops-alert webhook URL as a Pulumi SECRET config (the same value the worker reads from
// the `ops-alert-webhook-url` Secret Manager container as OPS_ALERT_WEBHOOK_URL). Unset ⇒ the §13.5 alert
// policies still record incidents; they just don't page.
const opsAlertWebhookUrl = rhemaConfig.getSecret("opsAlertWebhookUrl");
// RH-27 (273_R6OPS.5) — the on-call EMAIL notification channel. The address is the operator's
// config act (`pulumi config set --secret rhema:opsAlertEmail`) — never a committed address;
// secret-config keeps it encrypted in stack state. Unset ⇒ the email leg isn't attached.
const opsAlertEmail = rhemaConfig.getSecret("opsAlertEmail");
// RH-27 — the GCP mobile-app push channel. GCP's API cannot mint `mobile_app` channels (console
// pairing is the only path, the operator's act — HUMAN row 274); after pairing they set this plain
// config to the paired channel's `projects/<p>/notificationChannels/<id>` resource name and the
// next `up` binds it to every alert policy.
const opsMobileChannelName = rhemaConfig.get("opsMobileChannelName");
// PRB.15 — the real digest-pinned service images as a JSON `{service: ref}` map (the images CI publishes
// it; REQ-ARCH-39). Missing entries fall back to the placeholder so `preview` stays plannable.
const serviceImages = rhemaConfig.getObject<Record<string, string>>("serviceImages");
// SPA.28 — the `rhema:spaSurfaces` preview flag path is retired with the machinery it fed
// (REQ-SEQ-4's removal leg): no stage-fact or stack-config value can change a document's
// renderer any more — the shell serves every authenticated SPA-space GET unconditionally.
// SPA.13 (REQ-BFF-16) — extra app origins the user-content bucket's CORS block admits for the
// browser's presign→direct-PUT upload leg. A CSV of https origins set via the same
// `preview-stack.mjs config` path — non-prod app origins are deploy-generated hosts, so they ride
// config, never a committed wildcard. Prod's domains.app is admitted unconditionally in data.ts.
const uploadCorsOrigins = rhemaConfig.get("uploadCorsOrigins");
// OPS.1 — deploy-provenance inputs for the non-prod migrate Job's `deployments` row (REQ-ARCH-39):
// the chain-tip SHA the images were built at + the computed protocols version; unset ⇒ the migrate
// Job skips the record leg (a bare `pulumi preview` stays clean).
const gitSha = rhemaConfig.get("gitSha");
const protocolsVersion = rhemaConfig.get("protocolsVersion");
// MAINT.6 (D-OPS.1-1) — a REAL Resend key for non-prod session minting (the magic-link leg every
// signed-in preview journey needs). RH-29 (271_R6SEC.3): `preview-stack.mjs resend-pull` pins the
// shared operator-seeded `rhema-nonprod-resend-api-key`'s newest ENABLED VERSION into this PLAIN
// config (a version number is not a secret) — the program mounts
// `projects/…/versions/<n>` on the worker and the key VALUE never enters stack state. The legacy
// `rhema:resendApiKey` value-carrying config is refused on every stage (below).
const resendApiKey = rhemaConfig.getSecret("resendApiKey");
const nonprodResendVersion = rhemaConfig.get("nonprodResendVersion");
// R6POST.2 (REQ-POST-6) — the Stripe TEST-MODE key for the Stripe-bearing posture stage, same
// RH-29 reference shape via `preview-stack.mjs stripe-pull` → `rhema:nonprodStripeVersion`.
const stripeSecretConfig = rhemaConfig.getSecret("stripeSecret");
const nonprodStripeVersion = rhemaConfig.get("nonprodStripeVersion");
// A pinned version is digits only — `latest`, a resource name, or garbage fails closed.
for (const [key, value] of [
  ["rhema:nonprodResendVersion", nonprodResendVersion],
  ["rhema:nonprodStripeVersion", nonprodStripeVersion],
] as const) {
  if (value !== undefined && !/^\d+$/.test(value)) {
    throw new pulumi.RunError(
      `${key} must be a Secret Manager version NUMBER (the pull pins the newest ENABLED version) — got '${value}'`,
    );
  }
}
// R6POST.2 — the two ruled posture stages' per-stack overrides (non-prod only; prod refuses
// inside `withPostureOverrides`):
//   `rhema:postureDomains`    — {"app","api","userContent"} hosts for a domains-bearing pr-<n>
//   `rhema:extraRequiredSecrets` — CSV of ALL_SECRET_IDS ids the one stack wires (stripe-secret)
//   `rhema:postureLbAddress`  — the NAME of a pre-created `gcloud compute addresses` global IPv4
//                             the LB binds, so the wildcard-DNS names (which embed the IP) are
//                             minted before `up` — one up, no forwarding-rule replacement. The
//                             address is NOT Pulumi-managed (deleted out of band at teardown).
const postureDomains = rhemaConfig.getObject<StageDomains>("postureDomains");
const extraRequiredSecrets = (rhemaConfig.get("extraRequiredSecrets") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const postureLbAddress = rhemaConfig.get("postureLbAddress");
const cfg = withPostureOverrides(stageCfg, {
  ...(postureDomains !== undefined ? { domains: postureDomains } : {}),
  extraRequiredSecrets,
});
if (postureLbAddress !== undefined && cfg.kind === "prod") {
  throw new pulumi.RunError(
    "rhema:postureLbAddress is refused on prod — prod's LB address is program-reserved",
  );
}
const stripePlan = resendVersionPlan(cfg.kind, {
  valueSet: stripeSecretConfig !== undefined,
  versionSet: nonprodStripeVersion !== undefined,
});
if (stripePlan === "refused") {
  throw new pulumi.RunError(
    "rhema:stripeSecret / rhema:nonprodStripeVersion are refused on prod — prod's stripe-secret " +
      "version stays operator-seeded out of band (REQ-ARCH-30/REQ-ARCH-38); the reference path " +
      "exists only so a ruled non-prod posture stage can bind the shared nonprod sk_test",
  );
}
if (stripePlan === "copied") {
  // RH-29 — the value-carrying config path is gone everywhere: it moved key material into
  // encrypted stack state, which the shared-secret reference makes unnecessary.
  throw new pulumi.RunError(
    "rhema:stripeSecret is refused — a secret VALUE in stack state is what the pinned-version " +
      "reference replaced (RH-29); run `scripts/live/preview-stack.mjs stripe-pull` to bind " +
      "rhema:nonprodStripeVersion instead",
  );
}

const isProd = cfg.kind === "prod";
// MAINT.6 — fail-closed: a prod stack carrying either resend config refuses the entire program
// before a single resource is created (prod's resend key stays operator-seeded); the value-
// carrying config is refused on EVERY stage (RH-29).
const resendPlan = resendVersionPlan(cfg.kind, {
  valueSet: resendApiKey !== undefined,
  versionSet: nonprodResendVersion !== undefined,
});
if (resendPlan === "refused") {
  throw new pulumi.RunError(
    "rhema:resendApiKey / rhema:nonprodResendVersion are refused on prod — prod's resend-api-key " +
      "version stays operator-seeded out of band (REQ-ARCH-30/REQ-ARCH-38); the reference path " +
      "exists only so pr-<n>/dev can mint test sessions",
  );
}
if (resendPlan === "copied") {
  throw new pulumi.RunError(
    "rhema:resendApiKey is refused — a secret VALUE in stack state is what the pinned-version " +
      "reference replaced (RH-29); run `scripts/live/preview-stack.mjs resend-pull` to bind " +
      "rhema:nonprodResendVersion instead",
  );
}
// RH-29 — non-prod never sends as prod's sender identity: `hello@rhema.tools` is prod's committed
// From (Pulumi.prod.yaml); previews carry `previews@rhema.tools` (preview-stack resend-pull).
// (Residual: the shared send-only key is account-scoped, so the refusal governs the declared
// posture — full sender-domain separation needs a distinct verified nonprod domain, an operator act.)
if (!isProd && emailFrom === PROD_RESEND_SENDER) {
  throw new pulumi.RunError(
    `rhema:emailFrom '${PROD_RESEND_SENDER}' is refused on non-prod — previews send as ` +
      `${NONPROD_RESEND_SENDER} (RH-29: no preview mail impersonates the prod sender)`,
  );
}
const network = createNetwork({ stack, cfg, region });
// OPS.1 — `system-database-url` is a non-prod-only container: it carries the program-generated
// `postgres`-role DSN and is kept OUT of ALL_SECRET_IDS so prod's provisioned set is byte-identical.
// R6HRD.1 — prod instead gains `proxy-database-url` (the mirror-image prod-only container): the
// egress-proxy's resolver DSN leaves the plaintext `database-url` InstanceTemplate metadata for a
// Secret Manager NAME the proxy resolves at boot (readable by `compute.instances.get` no more).
const secrets = createSecrets({
  stack,
  region,
  // RH-10 — `identity-headers-key` joins `system-database-url` in the non-prod-only container set
  // (the api's keyed identity-header shim resolves it at boot; prod never provisions it).
  extraIds: isProd ? ["proxy-database-url"] : ["system-database-url", "identity-headers-key"],
});
// OPS.1 — non-prod postgres bootstrap: the operator's `rhema:alloydbPassword` config still wins when
// set (prod + any operator-seeded dev); otherwise a @pulumi/random value lives ONLY in encrypted
// state + the `alloydb-password` secret — no hand step, nothing in the repo.
const generatedPostgresPassword =
  !isProd && alloydbPassword === undefined
    ? new random.RandomPassword("rhema-postgres-password", { length: 32, special: false })
    : undefined;
const postgresPassword = alloydbPassword ?? generatedPostgresPassword?.result;
const data = createData({
  stack,
  cfg,
  region,
  network,
  alloydbPassword: postgresPassword,
  ...(uploadCorsOrigins
    ? {
        uploadCorsOrigins: uploadCorsOrigins
          .split(",")
          .map((o) => o.trim())
          .filter((o) => /^https:\/\//.test(o)), // SPA.13 — https origins only; anything else is dropped
      }
    : {}),
});

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
// R6HRD.1 — the proxy's resolver DSN leaves the InstanceTemplate `database-url` metadata (a
// plaintext value readable by anyone with `compute.instances.get`) for a Secret Manager
// reference: the `rhema:proxyDatabaseUrl` SECRET config stays the source of truth, but its
// value now lands ONLY in `rhema-prod-proxy-database-url` — the template metadata carries the
// secret NAME and the proxy fetches the value at boot via the instance SA (the
// `ANTHROPIC_KEY_SECRET` precedent; R6DEP.4's flagged posture finding F-R6DEP4-2). Same
// prod immutable-version posture as app-database-url: a `pulumi refresh` can't read
// `secretData` back, so without `ignoreChanges` every preview would plan a byte-identical
// replace — drift noise + a rotation footgun. Rotation goes through
// `gcloud secrets versions add` (versions/latest is read live at boot).
if (isProd && proxyDatabaseUrl && secrets.byId["proxy-database-url"]) {
  secretVersions.push(
    new gcp.secretmanager.SecretVersion(
      `rhema-${stack}-proxy-database-url-v1`,
      {
        secret: secrets.byId["proxy-database-url"].id,
        secretData: proxyDatabaseUrl,
      },
      { ignoreChanges: ["secretData"] },
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
    // RH-10 (267_R6SEC.2) — the identity-header shim's per-stage shared key. The api mounts only
    // the NAME (`IDENTITY_HEADERS_SECRET_NAME`); the caller-facing value lives here + in encrypted
    // stack state, unguessable to a public caller of the allUsers-invoker non-prod api.
    new gcp.secretmanager.SecretVersion(`rhema-${stack}-identity-headers-key-v1`, {
      secret: secrets.byId["identity-headers-key"].id,
      secretData: new random.RandomPassword("rhema-identity-headers-key", {
        length: 48,
        special: false,
      }).result,
    }),
  );
  // OPS.1 (F-OPS.1-9 — live finding: the pr-102 worker crash-looped on `anthropic-api-key` "no
  // versions") — the operator-only secrets get explicit NON-PROD PLACEHOLDER versions so a guarded
  // preview boots every service with zero out-of-band seeding. The value is deliberately invalid
  // (any real provider/billing call 401s — which is what $0-inference previews WANT); prod still
  // refuses to run this block and keeps hand-seeded values only.
  for (const id of NONPROD_OPERATOR_PLACEHOLDER_IDS) {
    secretVersions.push(
      new gcp.secretmanager.SecretVersion(`rhema-${stack}-${id}-placeholder-v1`, {
        secret: secrets.byId[id].id,
        secretData: `ops1-nonprod-placeholder-${stack}-not-a-real-key`,
      }),
    );
  }
  // RH-29 — the "real" copy-into-state SecretVersion writes are gone: resend/stripe consumers on
  // shared-plan stacks mount the shared nonprod secret's pinned version directly (below), so the
  // placeholders stay on the stack-local containers unread — and no key value ever transits state.
}
const iam = createIam({ stack, project, secrets, buckets: data.buckets });
// RH-29 — the shared-secret mounts: the consuming SAs get `secretAccessor` on the SHARED
// operator-seeded containers (same project, referenced by literal name — never stack-managed
// resources) so the worker/api can resolve the pinned versions at boot. Pushed onto iam.members
// BEFORE createCompute so the consumers' containerPrereqs order the revision after the grant.
if (resendPlan === "shared" && nonprodResendVersion) {
  iam.members.push(
    new gcp.secretmanager.SecretIamMember(`rhema-${stack}-worker-reads-shared-resend`, {
      secretId: `projects/${project}/secrets/${NONPROD_RESEND_SECRET_NAME}`,
      role: "roles/secretmanager.secretAccessor",
      member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts["worker"].email}`,
    }),
  );
}
if (stripePlan === "shared" && nonprodStripeVersion) {
  for (const svc of ["api", "worker"] as const) {
    iam.members.push(
      new gcp.secretmanager.SecretIamMember(`rhema-${stack}-${svc}-reads-shared-stripe`, {
        secretId: `projects/${project}/secrets/${NONPROD_STRIPE_SECRET_NAME}`,
        role: "roles/secretmanager.secretAccessor",
        member: pulumi.interpolate`serviceAccount:${iam.serviceAccounts[svc].email}`,
      }),
    );
  }
}
// RH-29 — the pinned shared-secret version resources the consumers mount (undefined unless the
// pull bound a version — the "shared" plan guarantees the config is set here).
const sharedResendRef =
  resendPlan === "shared" && nonprodResendVersion
    ? `projects/${project}/secrets/${NONPROD_RESEND_SECRET_NAME}/versions/${nonprodResendVersion}`
    : undefined;
const sharedStripeRef =
  stripePlan === "shared" && nonprodStripeVersion
    ? `projects/${project}/secrets/${NONPROD_STRIPE_SECRET_NAME}/versions/${nonprodStripeVersion}`
    : undefined;
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
  // R6HRD.1 — the template metadata carries the DSN secret's NAME, never the value: prod's
  // dedicated `proxy-database-url` container (program-seeded from `rhema:proxyDatabaseUrl`
  // above), non-prod's generated `system-database-url` (its proxy DSN IS the composed system
  // DSN — the same value the old config fallback supplied).
  ...(secrets.byId["proxy-database-url"] ?? secrets.byId["system-database-url"]
    ? {
        proxyDatabaseSecret: pulumi.interpolate`${
          (secrets.byId["proxy-database-url"] ?? secrets.byId["system-database-url"])!.id
        }/versions/latest`,
      }
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
  // MAINT.6 — mount the resend secret NAME on the worker ONLY when the real key was seeded
  // (the placeholder version is never mounted: the env stays absent and mail.send no-ops exactly
  // as an unkeyed preview does today).
  // RH-29 — the shared-plan mounts (undefined otherwise; compute.ts falls back to the stack-local
  // container on stages whose requiredSecrets wire it, i.e. prod).
  ...(sharedResendRef ? { resendSecretVersion: sharedResendRef } : {}),
  ...(sharedStripeRef ? { stripeSecretVersion: sharedStripeRef } : {}),
  ...(googleOauthClientId ? { googleOauthClientId } : {}),
  ...(appBaseUrl ? { appBaseUrl } : {}),
  ...(apiPublicUrl ? { apiPublicUrl } : {}),
  ...(stripePaymentLinkUrl ? { stripePaymentLinkUrl } : {}),
  // R6POST.2 — a ruled domains-stage adopts its pre-created global address (the wildcard-DNS
  // names embed the reserved IP); unset = today's shape (program-reserved address).
  ...(postureLbAddress ? { lbAddressName: postureLbAddress } : {}),
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
  ...(opsAlertEmail ? { opsAlertEmail } : {}),
  ...(opsMobileChannelName ? { opsMobileChannelName } : {}),
  // RH-22 — the public-domain uptime checks (apex/app + api `/healthz`); domain-less stages get none.
  ...(cfg.domains ? { domains: cfg.domains } : {}),
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
// R6INF.2 (ADR-122) — the proxy ILB frontend VIP; the literal `rhema:proxyBaseUrl` repoints to at `up` B.
export const proxyVipAddress = compute.proxyVipAddress;
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
