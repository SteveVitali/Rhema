// Secret Manager: the provider key (read ONLY by the egress-proxy — REQ-ARCH-30/31) plus the app auth,
// billing, and notification secrets. Pulumi creates the secret *containers* and IAM; the secret
// *versions* (the actual key material) are added out-of-band by the operator
// (`gcloud secrets versions add`) so no secret value ever lands in the repo or in Pulumi state
// (gitleaks-scanned; REQ-ARCH-30). PRB.15: the provisioned set is `ALL_SECRET_IDS` from the stage
// facts — the same list `stages.test.ts` asserts — so the containers cannot drift from the checklist
// the operator seeds (each stage's `requiredSecrets`).

import * as gcp from "@pulumi/gcp";
import { ALL_SECRET_IDS } from "../config/stages";

export interface SecretsArgs {
  stack: string;
  region: string;
  /**
   * OPS.1 — extra secret containers provisioned on top of ALL_SECRET_IDS (the non-prod-only
   * `system-database-url`, whose absence from ALL_SECRET_IDS keeps prod's provisioned set
   * byte-identical). Values are written by the program (index.ts) — never operator-seeded.
   */
  extraIds?: readonly string[];
}

export interface Secrets {
  /** The Anthropic provider key — the sole secret the egress-proxy may read. */
  anthropicApiKey: gcp.secretmanager.Secret;
  /** Better-Auth signing secret + Google OAuth client secret (api reads these; never web/collab). */
  betterAuthSecret: gcp.secretmanager.Secret;
  googleOauthClientSecret: gcp.secretmanager.Secret;
  /** Stripe secret (api Checkout/Portal + billing worker — P1.16) + the webhook signing secret (api only — PRB.08). */
  stripeSecret: gcp.secretmanager.Secret;
  stripeWebhookSecret: gcp.secretmanager.Secret;
  /** The RS256 private key the api mints run tokens with (RunTokenService); the proxy holds the public JWK. */
  runTokenSigningKey: gcp.secretmanager.Secret;
  /** The postgres bootstrap password (HUMAN-H6) — the operator builds the DATABASE_URLs from it. */
  alloydbPassword: gcp.secretmanager.Secret;
  /** The one-click email-action HMAC (worker mints, api verifies — PRB.09). */
  emailActionSecret: gcp.secretmanager.Secret;
  /** The Resend key (worker's mail.send transport — PRB.09). */
  resendApiKey: gcp.secretmanager.Secret;
  /** The provider admin key (worker's usage.reconcile Usage & Cost report — PRB.08). */
  anthropicAdminKey: gcp.secretmanager.Secret;
  /** The ops alert sink (worker's >2%-drift / balance-divergence webhook — PRB.08). */
  opsAlertWebhookUrl: gcp.secretmanager.Secret;
  /** The CDN signed-url key for the private user-content origin (api signs; the backend bucket verifies). */
  userContentSigningKey: gcp.secretmanager.Secret;
  /** Every provisioned secret keyed by its unprefixed id (`anthropic-api-key` → `rhema-<stack>-…`). */
  byId: Record<string, gcp.secretmanager.Secret>;
  all: gcp.secretmanager.Secret[];
}

export function createSecrets(args: SecretsArgs): Secrets {
  const { stack, region } = args;
  const replication = { userManaged: { replicas: [{ location: region }] } };
  const mk = (id: string) =>
    new gcp.secretmanager.Secret(`rhema-${stack}-${id}`, {
      secretId: `rhema-${stack}-${id}`,
      replication,
    });

  const byId: Record<string, gcp.secretmanager.Secret> = {};
  for (const id of ALL_SECRET_IDS) byId[id] = mk(id);
  for (const id of args.extraIds ?? []) byId[id] = mk(id);

  return {
    anthropicApiKey: byId["anthropic-api-key"],
    betterAuthSecret: byId["better-auth-secret"],
    googleOauthClientSecret: byId["google-oauth-client-secret"],
    stripeSecret: byId["stripe-secret"],
    stripeWebhookSecret: byId["stripe-webhook-secret"],
    runTokenSigningKey: byId["run-token-signing-key"],
    alloydbPassword: byId["alloydb-password"],
    emailActionSecret: byId["email-action-secret"],
    resendApiKey: byId["resend-api-key"],
    anthropicAdminKey: byId["anthropic-admin-key"],
    opsAlertWebhookUrl: byId["ops-alert-webhook-url"],
    userContentSigningKey: byId["user-content-signing-key"],
    byId,
    all: Object.values(byId),
  };
}
