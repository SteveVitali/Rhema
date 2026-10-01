// Deploy configuration for the live api entrypoint (server.ts). Reads the environment the Pulumi/GCP deploy
// injects (Cloud Run env + Secret Manager secret refs) into a typed config. Fail-fast on a missing required
// var — a half-configured api must not start and silently mis-route runs.

import { parseSignupMode, type SignupMode } from "@rhema/contracts";

export interface ApiEnv {
  readonly port: number;
  /** AlloyDB connection string (`postgresql://…`) — a RESTRICTED, RLS-ENFORCED role for user-facing reads. */
  readonly databaseUrl: string;
  /**
   * Optional elevated connection for the platform-wide circuit-breaker read (credit_ledger across accounts).
   * Set this to a role that can read it, so `databaseUrl` above can stay a restricted RLS-enforced role and
   * tenant isolation is never bypassed on user requests. Unset ⇒ the circuit breaker is disabled (caps unscaled).
   */
  readonly systemDatabaseUrl?: string;
  /** Memorystore Redis URL (`redis://…`). */
  readonly redisUrl: string;
  /** the versioned objects GCS bucket (gate write-back overlays — REQ-SPEC-9). */
  readonly objectsBucket: string;
  /** RS256 run-token key secret-version resource names (Secret Manager). The api MINTS, so it needs both. */
  readonly runTokenPrivateKeySecret: string;
  readonly runTokenPublicKeySecret: string;
  readonly runTokenKeyId?: string;
  /** SSE keep-alive: the server idle timeout must exceed the `: ping` cadence so the LB holds the connection. */
  readonly sseIdleTimeoutMs: number;
  /**
   * The per-run USD ceiling the SDK inner per-phase budget brake is taken against (`budgetShare × this`);
   * threaded into the harness run spec (`runSpecConfig.maxUsdPerRun`). Unset ⇒ the runspec default (dev
   * `max_usd`, $10). The outer `capCredits` hold remains the HARD ceiling regardless — this only sizes the
   * per-phase SDK brake so a frontier-tier phase is not cut off mid-work (residue 2, diagnosed live P0.15g:
   * opus craft hit `Reached maximum budget ($1.2)` at the default $10 run ceiling).
   */
  readonly maxUsdPerRun?: number;
  /** The image path the ported skills are baked at (`runSpecConfig.skillsDir`); unset ⇒ the runspec `/app/skills`. */
  readonly skillsDir?: string;
  /**
   * The Stripe webhook signing-secret VERSION name (`projects/…/secrets/…/versions/latest`) — the api loads
   * the `whsec_…` value from Secret Manager at boot like the run-token keys (never a plaintext env var; the
   * secret is api-only). Unset ⇒ the `/stripe/webhook` route is not mounted (PRB.08; §14.6).
   */
  readonly stripeWebhookSecretName?: string;
  /**
   * The beta's ONE real-money surface: the Stripe Payment Link the exhaustion panel links out to (deploy
   * config — a URL, not a secret). Unset ⇒ the panel renders no add-credits action.
   */
  readonly stripePaymentLinkUrl?: string;
  /** The final-month beta-plan offer's link (copy + link only — no subscription machinery; REQ-BETA-14). */
  readonly betaPlanOfferUrl?: string;
  /**
   * PRB.09 — the HMAC secret-version NAME signing one-click email actions (the worker holds the same secret
   * to mint; the api verifies at `/api/action/<token>`). Unset ⇒ the action route 404s.
   */
  readonly emailActionSecretName?: string;
  /** PRB.09 — the api origin one-click links point at (`<apiPublicUrl>/api/action/<token>`). */
  readonly apiPublicUrl?: string;
  /** PRB.09 — the web app origin for email deep links (`<appBaseUrl>/p/<project>/review/<run>`). */
  readonly appBaseUrl?: string;
  /**
   * PRB.11 — the isolated `export` service URL (Cloud Run; §12.1/§13.4). The api POSTs markdown+format there
   * and returns the bytes — pandoc never runs in this image. Unset ⇒ POST /export answers 503
   * `export_not_wired` (the dialog + statement reads still work).
   */
  readonly exportServiceUrl?: string;
  /**
   * PRB.13 — `signup.mode` (REQ-BETA-19 amended 2026-09-16; `SIGNUP_MODE`): `invite` keeps the PRB.01
   * gate, `open` permits self-serve account creation. The stage config sets it (PRB.15 flips prod);
   * unset/unknown ⇒ `invite` — the flag fails closed.
   */
  readonly signupMode: SignupMode;
  /**
   * PRB.16 — the Better Auth binding (D-P0.01-3): the signing secret's Secret-Manager NAME and the Google
   * OAuth client id + secret NAME (values loaded at boot; never plaintext env). All three must be present
   * to mount `/api/auth/*` — a partial config leaves auth unmounted rather than half-broken (the pre-PRB.16
   * posture). `APP_BASE_URL` doubles as the Better Auth baseURL (the app host proxies `/api/auth/*`).
   */
  readonly betterAuthSecretName?: string;
  readonly googleOauthClientId?: string;
  readonly googleOauthClientSecretName?: string;
  /**
   * PRB.16 — dev/preview ONLY: trust the client-forgeable `x-rhema-*` identity headers when no session
   * resolves (the PRB.15 deploy shim for stages without sign-in). NEVER set on prod.
   */
  readonly identityHeaders?: boolean;
  /**
   * PRB.20 — the user-content GCS bucket (`USER_CONTENT_BUCKET`): where quarantine presigned PUTs land and
   * the convert Job's converted-result objects are read back. Required (with `convertJob`) to mount the
   * import routes; unset ⇒ import stays unmounted rather than half-wired.
   */
  readonly userContentBucket?: string;
  /**
   * PRB.20 — the convert Cloud Run Job's full resource name (`CONVERT_JOB`,
   * `projects/<p>/locations/<r>/jobs/<name>`) — invoked via the Run Admin API `jobs:run`.
   */
  readonly convertJob?: string;
  /** PRB.20 — the Job's user-content volume mount path inside the container (`CONVERT_JOB_ROOT`, `/usercontent`). */
  readonly convertJobRoot?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`api: missing required env ${name}`);
  return v;
}

/** Parse a positive-number env var, ignoring an unset or non-finite value (so a typo never becomes NaN). */
function optionalPositiveNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function readApiEnv(): ApiEnv {
  const maxUsdPerRun = optionalPositiveNumber("MAX_USD_PER_RUN");
  const base: ApiEnv = {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    objectsBucket: required("OBJECTS_BUCKET"),
    runTokenPrivateKeySecret: required("RUN_TOKEN_PRIVATE_KEY_SECRET"),
    runTokenPublicKeySecret: required("RUN_TOKEN_PUBLIC_KEY_SECRET"),
    // the run-event SSE route pings every 25 s (§12.5); keep the idle timeout well above it (default 120 s).
    sseIdleTimeoutMs: Number(process.env.SSE_IDLE_TIMEOUT_MS ?? 120_000),
    ...(process.env.SYSTEM_DATABASE_URL ? { systemDatabaseUrl: process.env.SYSTEM_DATABASE_URL } : {}),
    // the harness run-spec sizing knobs (residue 2): the deploy sets these; unset ⇒ the runspec defaults.
    ...(maxUsdPerRun !== undefined ? { maxUsdPerRun } : {}),
    ...(process.env.SKILLS_DIR ? { skillsDir: process.env.SKILLS_DIR } : {}),
    // PRB.08 billing: the webhook secret is a secret-NAME (loaded via Secret Manager at boot); the Payment
    // Link + plan-offer URLs are plain deploy config.
    ...(process.env.STRIPE_WEBHOOK_SECRET_NAME
      ? { stripeWebhookSecretName: process.env.STRIPE_WEBHOOK_SECRET_NAME }
      : {}),
    ...(process.env.STRIPE_PAYMENT_LINK_URL ? { stripePaymentLinkUrl: process.env.STRIPE_PAYMENT_LINK_URL } : {}),
    ...(process.env.BETA_PLAN_OFFER_URL ? { betaPlanOfferUrl: process.env.BETA_PLAN_OFFER_URL } : {}),
    // PRB.09 notifications: the action-signing secret is a secret-NAME (Secret Manager at boot); the api/app
    // origins are plain deploy config.
    ...(process.env.EMAIL_ACTION_SECRET_NAME
      ? { emailActionSecretName: process.env.EMAIL_ACTION_SECRET_NAME }
      : {}),
    ...(process.env.API_PUBLIC_URL ? { apiPublicUrl: process.env.API_PUBLIC_URL } : {}),
    ...(process.env.APP_BASE_URL ? { appBaseUrl: process.env.APP_BASE_URL } : {}),
    // PRB.11 — the isolated export container's service URL (pandoc lives there, never here).
    ...(process.env.EXPORT_SERVICE_URL ? { exportServiceUrl: process.env.EXPORT_SERVICE_URL } : {}),
    // PRB.13 — signup mode; unknown/unset parses to `invite` (never fail open).
    signupMode: parseSignupMode(process.env.SIGNUP_MODE),
    // PRB.16 — Better Auth secret NAMES (values load from Secret Manager at boot). The Google OAuth
    // client id is public deploy config; its SECRET is a secret name like the rest.
    ...(process.env.BETTER_AUTH_SECRET_NAME
      ? { betterAuthSecretName: process.env.BETTER_AUTH_SECRET_NAME }
      : {}),
    ...(process.env.GOOGLE_OAUTH_CLIENT_ID
      ? { googleOauthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID }
      : {}),
    ...(process.env.GOOGLE_OAUTH_CLIENT_SECRET_NAME
      ? { googleOauthClientSecretName: process.env.GOOGLE_OAUTH_CLIENT_SECRET_NAME }
      : {}),
    // PRB.16 — the identity-header shim: NEVER on prod (client-forgeable); dev/preview only.
    ...(process.env.IDENTITY_HEADERS === "true" ? { identityHeaders: true } : {}),
    // PRB.20 — the live ingestion binding config (both must be set for the import routes to mount).
    ...(process.env.USER_CONTENT_BUCKET ? { userContentBucket: process.env.USER_CONTENT_BUCKET } : {}),
    ...(process.env.CONVERT_JOB ? { convertJob: process.env.CONVERT_JOB } : {}),
    ...(process.env.CONVERT_JOB_ROOT ? { convertJobRoot: process.env.CONVERT_JOB_ROOT } : {}),
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
