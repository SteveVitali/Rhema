// @rhema/run-task — the harness→agent bootstrap (REQ-SPEC-10; §12.4 step 4).
//
// The task starts as uid `harness` (holds the token, the proxy credential, the hook daemon, the audit
// writer). It then launches the SDK process as uid `agent` with a SCRUBBED env and drops privileges
// irreversibly. `buildAgentLaunch` produces that launch spec as data: the drop-privileges argv
// (`setpriv --reuid agent --regid agent --clear-groups`), the scrubbed env (via @rhema/engine, asserted
// secret-free), and the cwd. run-task executes it; the deterministic test asserts the spec (uid drop, scrubbed
// env). The in-image proof that the RUNNING agent uid cannot read the secrets file / socket is the integration
// test recorded in DEFERRALS.

import { buildAgentEnv, assertScrubbed, buildOtelConfig } from "@rhema/engine";

export interface AgentLaunchInput {
  readonly runId: string;
  /** `ANTHROPIC_BASE_URL` → the proxy (the only route out). */
  readonly proxyBaseUrl: string;
  /** per-run writable config dir (tmpfs). */
  readonly configDir: string;
  /** the numeric uid/gid of the unprivileged `agent` user (distinct from `harness`). */
  readonly agentUid: number;
  readonly agentGid: number;
  /** the seat mount the SDK runs in (`/work/project`). */
  readonly cwd: string;
  /** the SDK entry command (e.g. `["node","/app/dist/agent-entry.js"]`). */
  readonly command: readonly string[];
}

export interface AgentLaunch {
  readonly uid: number;
  readonly gid: number;
  readonly cwd: string;
  readonly env: Record<string, string>;
  /** the full argv: drop to uid `agent`, clear supplementary groups, then exec the SDK. */
  readonly argv: readonly string[];
}

/**
 * Build the launch spec for the SDK process as uid `agent`. The env is the scrubbed set ONLY (no token, no
 * credential — REQ-SPEC-10); `setpriv --clear-groups` drops the harness group so the agent cannot reach the
 * harness-only secrets file or socket by group membership. Asserts the env is secret-free before returning.
 */
export function buildAgentLaunch(input: AgentLaunchInput): AgentLaunch {
  const scrubbed = buildAgentEnv({ runId: input.runId, proxyBaseUrl: input.proxyBaseUrl, configDir: input.configDir });
  assertScrubbed(scrubbed); // belt to buildAgentEnv's braces — never launch with a secret in scope.
  // OTel config (ids + counts only; content flags off — §13.5) is non-secret and rides in the process env so
  // the SDK's telemetry inherits it. It is added AFTER the scrub assertion (OTel keys are not secrets).
  const env = { ...scrubbed, ...buildOtelConfig() };
  const argv = [
    "setpriv",
    "--reuid",
    String(input.agentUid),
    "--regid",
    String(input.agentGid),
    "--clear-groups",
    "--",
    ...input.command,
  ];
  return { uid: input.agentUid, gid: input.agentGid, cwd: input.cwd, env, argv };
}
