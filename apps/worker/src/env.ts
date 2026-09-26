// Deploy configuration for the live worker entrypoint (main.ts). Reads the Pulumi/GCP-injected environment
// (Cloud Run env + Secret Manager refs + the GKE launcher config) into a typed config; fail-fast on a missing
// required var.

export interface WorkerEnv {
  /** a RESTRICTED, RLS-ENFORCED role for the worker's tenant-scoped transactions. */
  readonly databaseUrl: string;
  /**
   * Optional elevated connection for the worker's SYSTEM-scoped reads (the parked-run sweep + run-event
   * maintenance scan across tenants / system tables). Set it so `databaseUrl` can stay a restricted RLS-enforced
   * role; unset ⇒ those reads fall back to the main pool (whose role must then be able to read across tenants).
   */
  readonly systemDatabaseUrl?: string;
  readonly redisUrl: string;
  /** RS256 run-token key secret-version resource names (the worker MINTS at provision → needs both). */
  readonly runTokenPrivateKeySecret: string;
  readonly runTokenPublicKeySecret: string;
  readonly runTokenKeyId?: string;
  /** the digest-pinned run-task image + its Workload-Identity run service account + the provider. */
  readonly runTaskImageDigest: string;
  readonly runTaskImageRepo: string;
  readonly runServiceAccount: string;
  /** the GCS bucket the run-task harness materializes `/work` from (passed to the Job as OBJECTS_BUCKET). */
  readonly objectsBucket: string;
  readonly provider: string;
  /** the GKE launcher config. */
  readonly k8sNamespace: string;
  readonly sandboxNodePool: string;
  readonly kubeServiceAccount: string;
  readonly internalApiUrl: string;
  readonly proxyBaseUrl: string;
  /**
   * Cloud Run → GKE auth (D-P0.15e-3): the GKE public endpoint + base64 cluster CA. When both are set the
   * launcher builds its KubeConfig from them + a per-launch metadata OAuth token (the Cloud Run worker has no
   * in-cluster kubeconfig); unset ⇒ the ambient kubeconfig (`loadFromDefault`, for an in-cluster/local run).
   */
  readonly gkeEndpoint?: string;
  readonly gkeCaData?: string;
  /** default plan concurrency (the real per-account lookup is the subscription tier — PRB.8/P1.16). */
  readonly defaultConcurrency: number;
  /**
   * PRB.08 — the provider admin key's secret-version NAME (Secret Manager) for the nightly `usage.reconcile`
   * Usage & Cost report fetch. Unset ⇒ the reconcile leg skips the report pull (the balance assertion still
   * runs) — a preview deploy without the admin key stays green.
   */
  readonly anthropicAdminKeySecret?: string;
  /** PRB.08 — the ops alert sink for >2% usage drift / a balance divergence (a webhook URL; console when unset). */
  readonly opsAlertWebhookUrl?: string;
  /**
   * PRB.09 — the Resend API key's secret-version NAME (Secret Manager) for `mail.send`. Unset ⇒ the mail
   * transport no-ops (the delivery row stays 'claimed' for a later re-drive; a preview deploy stays green).
   */
  readonly resendApiKeySecret?: string;
  /** PRB.09 — the From address for beta mail (deploy config, not a secret). */
  readonly emailFrom?: string;
  /**
   * PRB.09 — the HMAC secret-version NAME signing one-click email actions (the api holds the same secret to
   * verify). Unset ⇒ the `notify` handler no-ops `unconfigured` — no emails are minted.
   */
  readonly emailActionSecretName?: string;
  /**
   * P1.16 — the Stripe Billing API key's secret-version NAME (Secret Manager at boot) for the auto-reload
   * sweep's off-session charge — the ONLY unattended charge path (REQ-BILL-17). Unset ⇒ the sweep logs a
   * `no_stripe_port` skip — it must never fabricate a charge.
   */
  readonly stripeSecretKeyName?: string;
  /**
   * STB.4 — the Stripe API base the REST port calls (`STRIPE_API_BASE_URL`, default
   * `https://api.stripe.com`). The test-mode vehicle (a Stripe-compatible edge). Never set on prod.
   */
  readonly stripeApiBaseUrl?: string;
  /** PRB.09 — the api origin one-click links point at (`<apiPublicUrl>/api/action/<token>`). */
  readonly apiPublicUrl?: string;
  /** PRB.09 — the web app origin for email deep links (`<appBaseUrl>/p/<project>/review/<run>`). */
  readonly appBaseUrl?: string;
  /**
   * P1.05 — the provider API key's secret-version NAME for the `run.walkthrough` package-class call (a
   * deploy may point it at the same `anthropic-api-key` version the proxy holds). Unset ⇒ the consumer
   * marks attempts `failed` and the card's Retry stays live.
   */
  readonly walkthroughModelKeySecret?: string;
  /**
   * P1.15 — the user-content bucket holding `ingest/<conn>/<item>` bodies + `export/<conn>/<file>`
   * zips; `voice.purge` also deletes retained bytes under it. Unset ⇒ `ingest.sync` reports
   * `blob_store_unconfigured` (review metadata still flows through the api).
   */
  readonly userContentBucket?: string;
  /**
   * P1.15 — the invoker-gated fetcher service URL. Set ⇒ `ingest.sync` rides the real egress guard
   * (SSRF/robots/rate/content-type). Unset ⇒ the sync job fails closed with `live fetcher not wired`.
   */
  readonly fetcherServiceUrl?: string;
  /**
   * P1.15 — the provider API key's secret-version NAME `ingest.reconstruct` spends through (a deploy
   * may point it at the same `anthropic-api-key` version; falls back to WALKTHROUGH_MODEL_KEY_SECRET).
   * Unset ⇒ reconstruction reports `reconstructor_unconfigured`.
   */
  readonly ingestModelKeySecret?: string;
  /**
   * P1.15 — the convert Job's full v2 resource name + the bucket mount root (the same pair the api
   * carries for import/preview). BOTH set ⇒ `ingest.sync` re-converts fetched bodies through the
   * real Job; unset ⇒ samples keep raw content as markdown (`convert_unconfigured` note).
   */
  readonly convertJob?: string;
  readonly convertJobRoot?: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`worker: missing required env ${name}`);
  return v;
}

export function readWorkerEnv(): WorkerEnv {
  const base: WorkerEnv = {
    databaseUrl: required("DATABASE_URL"),
    redisUrl: required("REDIS_URL"),
    runTokenPrivateKeySecret: required("RUN_TOKEN_PRIVATE_KEY_SECRET"),
    runTokenPublicKeySecret: required("RUN_TOKEN_PUBLIC_KEY_SECRET"),
    runTaskImageDigest: required("RUN_TASK_IMAGE_DIGEST"),
    runTaskImageRepo: required("RUN_TASK_IMAGE_REPO"),
    runServiceAccount: required("RUN_SERVICE_ACCOUNT"),
    objectsBucket: required("OBJECTS_BUCKET"),
    provider: process.env.PROVIDER ?? "anthropic",
    k8sNamespace: process.env.K8S_NAMESPACE ?? "runs",
    sandboxNodePool: required("SANDBOX_NODE_POOL"),
    kubeServiceAccount: required("KUBE_SERVICE_ACCOUNT"),
    internalApiUrl: required("API_INTERNAL_URL"),
    proxyBaseUrl: required("ANTHROPIC_BASE_URL"),
    defaultConcurrency: Number(process.env.DEFAULT_CONCURRENCY ?? 2),
    ...(process.env.SYSTEM_DATABASE_URL ? { systemDatabaseUrl: process.env.SYSTEM_DATABASE_URL } : {}),
    ...(process.env.GKE_ENDPOINT ? { gkeEndpoint: process.env.GKE_ENDPOINT } : {}),
    ...(process.env.GKE_CA_DATA ? { gkeCaData: process.env.GKE_CA_DATA } : {}),
    ...(process.env.ANTHROPIC_ADMIN_KEY_SECRET
      ? { anthropicAdminKeySecret: process.env.ANTHROPIC_ADMIN_KEY_SECRET }
      : {}),
    ...(process.env.OPS_ALERT_WEBHOOK_URL ? { opsAlertWebhookUrl: process.env.OPS_ALERT_WEBHOOK_URL } : {}),
    // PRB.09 notifications: the Resend key + the action-signing secret are secret-NAMES (Secret Manager at
    // boot); the From/api/app origins are plain deploy config.
    ...(process.env.RESEND_API_KEY_SECRET ? { resendApiKeySecret: process.env.RESEND_API_KEY_SECRET } : {}),
    ...(process.env.EMAIL_FROM ? { emailFrom: process.env.EMAIL_FROM } : {}),
    ...(process.env.EMAIL_ACTION_SECRET_NAME
      ? { emailActionSecretName: process.env.EMAIL_ACTION_SECRET_NAME }
      : {}),
    // P1.16 — the Stripe Billing key is a secret-NAME (Secret Manager at boot) for auto-reload.
    ...(process.env.STRIPE_SECRET_KEY_NAME
      ? { stripeSecretKeyName: process.env.STRIPE_SECRET_KEY_NAME }
      : {}),
    // STB.4 — the test-mode vehicle's Stripe API base override (never on prod).
    ...(process.env.STRIPE_API_BASE_URL
      ? { stripeApiBaseUrl: process.env.STRIPE_API_BASE_URL }
      : {}),
    ...(process.env.API_PUBLIC_URL ? { apiPublicUrl: process.env.API_PUBLIC_URL } : {}),
    ...(process.env.APP_BASE_URL ? { appBaseUrl: process.env.APP_BASE_URL } : {}),
    ...(process.env.WALKTHROUGH_MODEL_KEY_SECRET
      ? { walkthroughModelKeySecret: process.env.WALKTHROUGH_MODEL_KEY_SECRET }
      : {}),
    // P1.15 ingestion wiring — all optional; each unset seam fails closed with a named reason.
    ...(process.env.USER_CONTENT_BUCKET ? { userContentBucket: process.env.USER_CONTENT_BUCKET } : {}),
    ...(process.env.FETCHER_SERVICE_URL ? { fetcherServiceUrl: process.env.FETCHER_SERVICE_URL } : {}),
    ...((process.env.INGEST_MODEL_KEY_SECRET ?? process.env.WALKTHROUGH_MODEL_KEY_SECRET)
      ? { ingestModelKeySecret: process.env.INGEST_MODEL_KEY_SECRET ?? process.env.WALKTHROUGH_MODEL_KEY_SECRET }
      : {}),
    ...(process.env.CONVERT_JOB ? { convertJob: process.env.CONVERT_JOB } : {}),
    ...(process.env.CONVERT_JOB_ROOT ? { convertJobRoot: process.env.CONVERT_JOB_ROOT } : {}),
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
