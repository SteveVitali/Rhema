// @rhema/engine — the §12.2 `query()` options object, built verbatim from the spec.
//
// `AgentSdkEngine` calls `query({ prompt: "/<skill> …inputs…", options })`. This module is the single place
// those options are assembled, so the conformance test can assert the security-critical ones are present and
// correct: the SCRUBBED env (REQ-SPEC-10 — no token/credential), `permissionMode: "dontAsk"`, the COSMETIC
// `disallowedTools` (the real enforcement is the VPC + proxy credential + uid split — §12.2 review 13 F18),
// per-phase `maxBudgetUsd`/`maxTurns`, subagent depth 1 / ≤5 concurrent, 1-h prompt caching, OTel with
// content flags off, and the injected `PreToolUse` hook. The options TYPE is ours (the SDK is vendored and
// DI'd); the vendored SDK's own options are a superset.

import type { PhaseRequest } from "./engine.js";
import { buildAgentEnv } from "./scrubbed-env.js";
import { buildOtelConfig } from "./otel.js";
import { buildAgentRoster } from "./roster.js";
import type { AgentDef } from "./roster.js";

/** A `PreToolUse` hook callback shape (the SDK's; kept structural — the callback is injected by run-task). */
export type PreToolUseHook = (input: unknown) => unknown | Promise<unknown>;

/** A minimal session-store handle (S3-backed in prod; injected). The SDK persists/resumes session state here. */
export interface SessionStore {
  readonly kind: string;
}

/** The fixed tool set the model may call (cosmetic list is separate). Kept small and Read/Write-centric. */
export const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Bash",
  "WebFetch",
  "WebSearch",
  "Task",
] as const;

/**
 * Cosmetic `disallowedTools` (§12.2, review 13 F18): they cut accidental attempts and audit noise, NOTHING
 * more — the VPC (no route), the per-run proxy credential (REQ-SPEC-11) and the uid split (REQ-SPEC-10) are
 * the enforcement. Verbatim from the spec.
 */
export const COSMETIC_DISALLOWED_TOOLS = [
  "Bash(curl *)",
  "Bash(wget *)",
  "Bash(find *)",
  "Bash(grep -r*)",
] as const;

/** The §12.2 options object (our contract for what the adapter passes to the vendored SDK `query()`). */
export interface AgentSdkQueryOptions {
  cwd: string;
  /** where the baked, verbatim-ported skills live (§12.2; loaded read-only). */
  skillsDir: string;
  /** the subagent roster from the model profile (§12.2). */
  agents: Record<string, AgentDef>;
  hooks: { PreToolUse: PreToolUseHook[] };
  /** spec-literal (§12.2): non-interactive, never prompts. */
  permissionMode: "dontAsk";
  allowedTools: string[];
  /** cosmetic only (§12.2). */
  disallowedTools: string[];
  /** the per-phase inner budget brake (§12.4). */
  maxBudgetUsd: number;
  maxTurns: number;
  /** the SCRUBBED env for the model's processes, merged with OTel (content flags off). */
  env: Record<string, string>;
  /** subagent fan-out limits (§12.2). */
  maxSubagentDepth: 1;
  maxConcurrentSubagents: number;
  /** 1-hour prompt caching (§12.2). */
  cacheControlTtl: "1h";
  /** the S3 session store (§12.2). */
  sessionStore: SessionStore;
  abortController: AbortController;
}

/** The ≤5 concurrent-subagents cap (§12.2). */
export const MAX_CONCURRENT_SUBAGENTS = 5;

export interface BuildOptionsDeps {
  /** the run's proxy base URL (`ANTHROPIC_BASE_URL`). */
  proxyBaseUrl: string;
  /** per-run writable config dir (tmpfs). */
  configDir: string;
  /** baked skills directory. */
  skillsDir: string;
  /** the model profile tier for the roster (§12.3). */
  tier?: "base" | "balanced" | "frontier";
  /** the injected PreToolUse hook (run-task wires @rhema/hooks). */
  hook: PreToolUseHook;
  sessionStore: SessionStore;
  abortController: AbortController;
}

/** Build the §12.2 options object for one phase. */
export function buildQueryOptions(req: PhaseRequest, deps: BuildOptionsDeps): AgentSdkQueryOptions {
  const env = {
    ...buildAgentEnv({ runId: req.runId, proxyBaseUrl: deps.proxyBaseUrl, configDir: deps.configDir }),
    ...buildOtelConfig(),
  };
  return {
    cwd: req.cwd,
    skillsDir: deps.skillsDir,
    agents: buildAgentRoster({ tier: deps.tier ?? "base" }),
    hooks: { PreToolUse: [deps.hook] },
    permissionMode: "dontAsk",
    allowedTools: [...ALLOWED_TOOLS],
    disallowedTools: [...COSMETIC_DISALLOWED_TOOLS],
    maxBudgetUsd: req.maxBudgetUsd,
    maxTurns: req.maxTurns,
    env,
    maxSubagentDepth: 1,
    maxConcurrentSubagents: MAX_CONCURRENT_SUBAGENTS,
    cacheControlTtl: "1h",
    sessionStore: deps.sessionStore,
    abortController: deps.abortController,
  };
}

/** Build the `query()` prompt: `/<skill>` plus the harness inputs as `key=value` lines (§12.2). */
export function buildPrompt(skill: string, inputs: Readonly<Record<string, unknown>>): string {
  const lines = Object.entries(inputs)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`);
  return [`/${skill}`, ...lines].join("\n");
}
