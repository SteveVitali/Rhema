// Secret Manager: the provider key (read ONLY by the egress-proxy — REQ-ARCH-30/31) plus the app auth
// and billing secrets. Pulumi creates the secret *containers* and IAM; the secret *versions* (the actual
// key material) are added out-of-band by the operator (`gcloud secrets versions add`) so no secret value
// ever lands in the repo or in Pulumi state (gitleaks-scanned; REQ-ARCH-30).

import * as gcp from "@pulumi/gcp";

export interface SecretsArgs {
  stack: string;
  region: string;
}

export interface Secrets {
  /** The Anthropic provider key — the sole secret the egress-proxy may read. */
  anthropicApiKey: gcp.secretmanager.Secret;
  /** Better-Auth signing secret + Google OAuth client secret (api reads these; never web/collab). */
  betterAuthSecret: gcp.secretmanager.Secret;
  googleOauthClientSecret: gcp.secretmanager.Secret;
  /** Stripe secret (billing worker only). */
  stripeSecret: gcp.secretmanager.Secret;
  /** The RS256 private key the api mints run tokens with (RunTokenService); the proxy holds the public JWK. */
  runTokenSigningKey: gcp.secretmanager.Secret;
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

  const anthropicApiKey = mk("anthropic-api-key");
  const betterAuthSecret = mk("better-auth-secret");
  const googleOauthClientSecret = mk("google-oauth-client-secret");
  const stripeSecret = mk("stripe-secret");
  const runTokenSigningKey = mk("run-token-signing-key");

  return {
    anthropicApiKey,
    betterAuthSecret,
    googleOauthClientSecret,
    stripeSecret,
    runTokenSigningKey,
    all: [anthropicApiKey, betterAuthSecret, googleOauthClientSecret, stripeSecret, runTokenSigningKey],
  };
}
