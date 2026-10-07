// Deploy configuration for the live api entrypoint (server.ts). Reads the environment the Pulumi/GCP deploy
// injects (Cloud Run env + Secret Manager secret refs) into a typed config. Fail-fast on a missing required
// var — a half-configured api must not start and silently mis-route runs.

import {
  parseDebitMode,
  parsePurchaseMode,
  parseSignupMode,
  type DebitMode,
  type PurchaseMode,
  type SignupMode,
} from "@rhema/contracts";

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
   * P1.16 — the Stripe Billing API key's secret-version NAME (the `sk_…` value loads from Secret
   * Manager at boot into `FetchStripePort`; never a plaintext env var). Unset ⇒ `/billing/checkout`
   * + `/billing/portal` answer 503 `stripe_unconfigured` — never a fake session.
   */
  readonly stripeSecretKeyName?: string;
  /**
   * STB.4 — the Stripe API base the REST port calls (`STRIPE_API_BASE_URL`, default
   * `https://api.stripe.com`). The test-mode vehicle: a stage wired to `sk_test_…` + a
   * Stripe-compatible edge (Stripe CLI forwarder / a test harness) sets this so the deployed code
   * path is exercised byte-for-byte without touching a live endpoint. Never set on prod.
   */
  readonly stripeApiBaseUrl?: string;
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
   * BILL.3 — `purchase.mode` (ADR-028; `PURCHASE_MODE`): `closed` (default, and the value on every
   * stage until the operator re-opens) ⇒ `/billing/checkout` refuses `purchase_closed` for real users
   * and the web renders the paused note; JOURNEY.1 `is_test` workspaces are allowlisted so the N9
   * purchase journey still exercises the real Stripe pages. Unset/unknown ⇒ `closed` — fail-closed,
   * never fail open.
   */
  readonly purchaseMode: PurchaseMode;
  /**
   * ECON.1 — `debit.mode` (ADR-031; `DEBIT_MODE`): `committed` (default on every stage until the
   * operator flips post-calibration) keeps the launched charge semantics; `metered` charges exactly
   * the proxy meter. Unset/unknown ⇒ `committed` — fail-closed to the launched mode.
   */
  readonly debitMode: DebitMode;
  /**
   * BILL.3 — `STRIPE_AUTOMATIC_TAX=true` sends `automatic_tax[enabled]` on Checkout sessions; valid
   * only after the operator activates a Tax registration Stripe-side (paused under BL-33/HUMAN-H7).
   * Unset ⇒ sessions carry `enabled=false` — never a presuming request shape.
   */
  readonly stripeAutomaticTax?: boolean;
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
  /**
   * P1.15 — the invoker-gated `fetcher` service URL (`FETCHER_SERVICE_URL`): the only egress ingestion
   * rides (SSRF/robots/rate/content-type). Unset ⇒ ingestion's remote providers fail closed with
   * `live fetcher not wired` (upload/paste/export still work — they carry their own bytes).
   */
  readonly fetcherServiceUrl?: string;
  /**
   * DEF.2 (F6) — the egress-proxy internal base URL (`EGRESS_PROXY_URL`, the same `rhema:proxyBaseUrl`
   * the run-task pods get as `ANTHROPIC_BASE_URL`): the estimate claim pre-pass's ONLY provider route
   * (REQ-ARCH-30 — the api never holds a provider key; it presents a purpose-minted proxy credential).
   * The pre-pass also needs `SYSTEM_DATABASE_URL` (the proxy_* mint is elevated). Unset ⇒ every
   * estimate stays provisional — the §5.6 graceful posture, never a half-bound refine.
   */
  readonly egressProxyUrl?: string;
  /**
   * JOURNEY.1 (REQ-SPEC-29; ADR-020) — the configured test mailbox base address (`TEST_MAILBOX`,
   * e.g. `test@rhema.tools`). A workspace provisioned for `test@…` or `test+<tag>@…` on that domain is
   * flagged `is_test` at creation (SLO/trial exclusions + the auto-purge sweep). Plain deploy config —
   * an address pattern, not a secret. Unset ⇒ nothing is ever flagged.
   */
  readonly testMailbox?: string;
  /** JOURNEY.1 — the git SHA the image was built from (`RHEMA_BUILD_GIT_SHA`, baked by the Dockerfile
   *  `ARG GIT_SHA`); surfaced on `/healthz` as `build.gitSha` for the deploy-provenance check. */
  readonly buildGitSha?: string;
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
    // P1.16 — the Stripe Billing key is a secret-NAME too (Secret Manager at boot); unset ⇒ checkout 503s.
    ...(process.env.STRIPE_SECRET_KEY_NAME
      ? { stripeSecretKeyName: process.env.STRIPE_SECRET_KEY_NAME }
      : {}),
    // STB.4 — the test-mode vehicle's Stripe API base override (never on prod).
    ...(process.env.STRIPE_API_BASE_URL
      ? { stripeApiBaseUrl: process.env.STRIPE_API_BASE_URL }
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
    // BILL.3 — purchase mode; unknown/unset parses to `closed` (never fail open), and the
    // Checkout automatic-tax opt (off until the operator activates a Tax registration).
    purchaseMode: parsePurchaseMode(process.env.PURCHASE_MODE),
    debitMode: parseDebitMode(process.env.DEBIT_MODE),
    ...(process.env.STRIPE_AUTOMATIC_TAX === "true" ? { stripeAutomaticTax: true } : {}),
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
    // P1.15 — the fetcher service URL (the api's discovery/review fetches ride it).
    ...(process.env.FETCHER_SERVICE_URL ? { fetcherServiceUrl: process.env.FETCHER_SERVICE_URL } : {}),
    // DEF.2 (F6) — the egress-proxy base URL the estimate pre-pass's synthetic credential calls.
    ...(process.env.EGRESS_PROXY_URL ? { egressProxyUrl: process.env.EGRESS_PROXY_URL } : {}),
    // JOURNEY.1 — the test-mailbox flagging config + the image-baked build SHA (healthz provenance).
    ...(process.env.TEST_MAILBOX ? { testMailbox: process.env.TEST_MAILBOX } : {}),
    ...(process.env.RHEMA_BUILD_GIT_SHA ? { buildGitSha: process.env.RHEMA_BUILD_GIT_SHA } : {}),
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
