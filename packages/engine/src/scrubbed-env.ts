// @rhema/engine — the scrubbed environment for the model's processes (REQ-SPEC-10; §12.2, §12.4 step 4).
//
// The single most load-bearing secret boundary in the run model: the SDK process (uid `agent`) and every
// tool the model runs receive ONLY the scrubbed set — `RUN_ID`, `ANTHROPIC_BASE_URL` (the proxy),
// `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a per-run `CLAUDE_CONFIG_DIR` — and NEVER `RUN_TOKEN`,
// `API_INTERNAL_URL` or the proxy credential (those stay with uid `harness`). A shell escape (`node -e`,
// curl, python3) from the model therefore has no token for the internal API and no credential for the proxy
// (REQ-SPEC-11). `buildAgentEnv` is the sole constructor of that env, and it is total: it starts from {} and
// adds only the allowed keys, so nothing leaks in by inheritance.

/**
 * A NON-SECRET placeholder `ANTHROPIC_API_KEY` the agent env carries (D-P0.06-1, diagnosed live): the vendored
 * Claude Code CLI refuses to run — "Not logged in · Please run /login" — when NO credential is in its env, so it
 * never even sends the request to `ANTHROPIC_BASE_URL` (the proxy). This fake key satisfies that pre-flight check
 * and makes the CLI issue the request in x-api-key mode; the egress-proxy STRIPS the inbound `x-api-key` (and
 * `authorization`) and injects the REAL provider key itself (credential.ts NEVER_FORWARD), so this value never
 * reaches Anthropic and the real key never enters the agent process. It is deliberately not a real key.
 */
export const PROXY_PLACEHOLDER_ANTHROPIC_API_KEY = "sk-ant-api03-rhema-proxy-injected-placeholder-not-a-real-key-do-not-use-000000000000000000000000000000AA";

/** Keys the model's process must NEVER see (they authenticate the harness to the internal API / proxy). */
export const FORBIDDEN_AGENT_ENV_KEYS = [
  "RUN_TOKEN",
  "API_INTERNAL_URL",
  "PROXY_CREDENTIAL",
  "PROXY_CREDENTIAL_FILE",
  // ANTHROPIC_API_KEY is NOT forbidden outright — the agent carries the NON-SECRET placeholder above so the CLI
  // will run; assertScrubbed enforces that if present it is EXACTLY that placeholder (never the real key).
  "ANTHROPIC_AUTH_TOKEN",
  // cloud credentials — GCP is the platform (from 2026-09-02); AWS keys stay forbidden as defense-in-depth.
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_API_KEY",
  "GCLOUD_PROJECT",
  "GCP_PROJECT",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
] as const;

export interface AgentEnvInput {
  runId: string;
  /** the proxy base URL (`ANTHROPIC_BASE_URL`); the ONLY route out of the sandbox (§12.1). */
  proxyBaseUrl: string;
  /** the per-run config dir (writable tmpfs), isolating SDK state (§12.4 step 4). */
  configDir: string;
  /** the §12.2 ≤5 concurrent-subagents cap, enforced through the CLI env (PRB.23 — see below). */
  maxConcurrentSubagents: number;
  /**
   * ECON.2 L4 (ADR-087) — the prompt-cache TTL choice. `true` (default) sets
   * `ENABLE_PROMPT_CACHING_1H` (the §12.2 1-h TTL); `false` OMITS the key so the CLI's default
   * (≈5-min TTL) applies. TTL-only by construction — the vendored CLI assembles the request
   * prefix's ORDER internally; the harness owns the inputs, not their serialization.
   */
  promptCaching1h?: boolean;
}

/**
 * Build the scrubbed env for the model's process. Total by construction — starts from an empty object and
 * adds only the allowed keys — so no ambient secret can ride in. The result is asserted secret-free.
 *
 * PRB.23 — two §12.2 contract fields the SDK does NOT read as options (`cacheControlTtl`, the
 * subagent caps — see `AgentSdkQueryOptions`) are realized through real CLI env vars instead
 * (both are in the vendored CLI's env allowlist; `options.env` REPLACES the subprocess env, so
 * they reach the CLI verbatim):
 *   · `ENABLE_PROMPT_CACHING_1H` — the §12.2 1-hour cache TTL intent (`cacheControlTtl:"1h"`).
 *   · `CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION` — the §12.2 ≤5 concurrent-subagents cap
 *     (`maxConcurrentSubagents`, which the SDK drops as advisory).
 * Both are non-secret configuration keys — safe inside the scrubbed boundary.
 */
export function buildAgentEnv(input: AgentEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    RUN_ID: input.runId,
    ANTHROPIC_BASE_URL: input.proxyBaseUrl,
    // the NON-SECRET placeholder so the CLI runs (D-P0.06-1); the proxy strips it + injects the real key.
    ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CONFIG_DIR: input.configDir,
    // §12.2's 1-h cache TTL — realized via env (PRB.23). ECON.2 L4's ON arm omits the key so the
    // CLI's shorter default applies; the measured TTL choice is a lever, not a constant.
    ...(input.promptCaching1h === false ? {} : { ENABLE_PROMPT_CACHING_1H: "1" }),
    CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: String(input.maxConcurrentSubagents),
  };
  assertScrubbed(env);
  return env;
}

/** The exact key set a scrubbed agent env is allowed to carry (used by the env-scrub assertion + tests). */
export const ALLOWED_AGENT_ENV_KEYS = [
  "RUN_ID",
  "ANTHROPIC_BASE_URL",
  "ANTHROPIC_API_KEY",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
  "CLAUDE_CONFIG_DIR",
  "ENABLE_PROMPT_CACHING_1H",
  "CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION",
] as const;

/**
 * Throw if an env object carries any forbidden key or any key outside the allowed set. Called by
 * `buildAgentEnv` and reusable by run-task's launcher as a last-line guard before `execve` (REQ-SPEC-10).
 */
export function assertScrubbed(env: Record<string, string>): void {
  for (const k of FORBIDDEN_AGENT_ENV_KEYS) {
    if (k in env) throw new Error(`agent env must not contain the secret key ${k} (REQ-SPEC-10)`);
  }
  // ANTHROPIC_API_KEY may be present ONLY as the known non-secret placeholder — never a real provider key
  // (the real key lives with the proxy). A value that is not exactly the placeholder is a leak (REQ-SPEC-10/11).
  if ("ANTHROPIC_API_KEY" in env && env.ANTHROPIC_API_KEY !== PROXY_PLACEHOLDER_ANTHROPIC_API_KEY) {
    throw new Error("agent env ANTHROPIC_API_KEY must be the proxy placeholder, not a real key (REQ-SPEC-10/11)");
  }
  const allowed = new Set<string>(ALLOWED_AGENT_ENV_KEYS);
  for (const k of Object.keys(env)) {
    if (!allowed.has(k)) throw new Error(`agent env carries a non-scrubbed key ${k} (REQ-SPEC-10)`);
  }
}
