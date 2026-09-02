// @rhema/engine — the scrubbed environment for the model's processes (REQ-SPEC-10; §12.2, §12.4 step 4).
//
// The single most load-bearing secret boundary in the run model: the SDK process (uid `agent`) and every
// tool the model runs receive ONLY the scrubbed set — `RUN_ID`, `ANTHROPIC_BASE_URL` (the proxy),
// `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a per-run `CLAUDE_CONFIG_DIR` — and NEVER `RUN_TOKEN`,
// `API_INTERNAL_URL` or the proxy credential (those stay with uid `harness`). A shell escape (`node -e`,
// curl, python3) from the model therefore has no token for the internal API and no credential for the proxy
// (REQ-SPEC-11). `buildAgentEnv` is the sole constructor of that env, and it is total: it starts from {} and
// adds only the allowed keys, so nothing leaks in by inheritance.

/** Keys the model's process must NEVER see (they authenticate the harness to the internal API / proxy). */
export const FORBIDDEN_AGENT_ENV_KEYS = [
  "RUN_TOKEN",
  "API_INTERNAL_URL",
  "PROXY_CREDENTIAL",
  "PROXY_CREDENTIAL_FILE",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
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
}

/**
 * Build the scrubbed env for the model's process. Total by construction — starts from an empty object and
 * adds only the four allowed keys — so no ambient secret can ride in. The result is asserted secret-free.
 */
export function buildAgentEnv(input: AgentEnvInput): Record<string, string> {
  const env: Record<string, string> = {
    RUN_ID: input.runId,
    ANTHROPIC_BASE_URL: input.proxyBaseUrl,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    CLAUDE_CONFIG_DIR: input.configDir,
  };
  assertScrubbed(env);
  return env;
}

/** The exact key set a scrubbed agent env is allowed to carry (used by the env-scrub assertion + tests). */
export const ALLOWED_AGENT_ENV_KEYS = [
  "RUN_ID",
  "ANTHROPIC_BASE_URL",
  "CLAUDE_CODE_DISABLE_AUTO_MEMORY",
  "CLAUDE_CONFIG_DIR",
] as const;

/**
 * Throw if an env object carries any forbidden key or any key outside the allowed set. Called by
 * `buildAgentEnv` and reusable by run-task's launcher as a last-line guard before `execve` (REQ-SPEC-10).
 */
export function assertScrubbed(env: Record<string, string>): void {
  for (const k of FORBIDDEN_AGENT_ENV_KEYS) {
    if (k in env) throw new Error(`agent env must not contain the secret key ${k} (REQ-SPEC-10)`);
  }
  const allowed = new Set<string>(ALLOWED_AGENT_ENV_KEYS);
  for (const k of Object.keys(env)) {
    if (!allowed.has(k)) throw new Error(`agent env carries a non-scrubbed key ${k} (REQ-SPEC-10)`);
  }
}
