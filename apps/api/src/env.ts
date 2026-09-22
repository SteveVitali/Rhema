// Deploy configuration for the live api entrypoint (server.ts). Reads the environment the Pulumi/GCP deploy
// injects (Cloud Run env + Secret Manager secret refs) into a typed config. Fail-fast on a missing required
// var — a half-configured api must not start and silently mis-route runs.

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
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`api: missing required env ${name}`);
  return v;
}

export function readApiEnv(): ApiEnv {
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
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
