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
  };
  return process.env.RUN_TOKEN_KEY_ID ? { ...base, runTokenKeyId: process.env.RUN_TOKEN_KEY_ID } : base;
}
