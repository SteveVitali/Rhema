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
  /** default plan concurrency (the real per-account lookup is the subscription tier — PRB.8/P1.16). */
  readonly defaultConcurrency: number;
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
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
