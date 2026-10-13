// @rhema/engine — the §12.2 `query()` options object, built verbatim from the spec.
//
// `AgentSdkEngine` calls `query({ prompt: "/<skill> …inputs…", options })`. This module is the single place
// those options are assembled, so the conformance test can assert the security-critical ones are present and
// correct: the SCRUBBED env (REQ-SPEC-10 — no token/credential), `permissionMode: "dontAsk"`, the COSMETIC
// `disallowedTools` (the real enforcement is the VPC + proxy credential + uid split — §12.2 review 13 F18),
// per-phase `maxBudgetUsd`/`maxTurns`, subagent depth 1 / ≤5 concurrent, 1-h prompt caching, OTel with
// content flags off, and the injected `PreToolUse` hook. The options TYPE is ours (the SDK is vendored and
// DI'd); the vendored SDK's own options are a superset.

import {
  COGS_FANOUT_BASELINE,
  COGS_FANOUT_TUNED,
  COGS_PHASE_COMPACT_WINDOWS,
} from "@rhema/contracts";
import type { PhaseRequest } from "./engine.js";
import { buildAgentEnv } from "./scrubbed-env.js";
import { buildOtelConfig } from "./otel.js";
import { buildAgentRoster, mainModelForTier, routeModelForPhaseClass } from "./roster.js";
import type { AgentDef } from "./roster.js";

/** A `PreToolUse` hook callback shape (the SDK's; kept structural — the callback is injected by run-task). */
export type PreToolUseHook = (input: unknown) => unknown | Promise<unknown>;

/** A minimal session-store handle (GCS-backed in prod; injected). The SDK persists/resumes session state here. */
export interface SessionStore {
  readonly kind: string;
}

/** The fixed tool set the model may call (cosmetic list is separate). Kept small and Read/Write-centric.
 *  BOTH client web tools are DROPPED (P0.15i AC1, confirmed live 2026-09-09): the sandbox's egress is
 *  proxy-only, so a CLIENT `WebFetch`/`WebSearch` cannot function — and worse, leaving `WebSearch` enabled made
 *  the model call the CLI's CLIENT web-search tool instead of the proxy-injected SERVER `web_search`, so no
 *  server-side search ever executed (`usage_records.searches = 0`, no `web_search_tool_result` blocks, hence no
 *  `fetch_log` rows and a `cited_not_fetched` delivery failure). With no competing client tool, the model uses
 *  the proxy-guaranteed server-side `web_search` (see `@rhema/egress-proxy` `ensureServerWebTools`), which
 *  Anthropic executes and meters. Server tools are invoked as `server_tool_use` and are NOT gated by this
 *  client-tool allowlist, so dropping the name here does not disable real research — it forces it onto the
 *  metered, proxy-logged path. */
export const ALLOWED_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "MultiEdit",
  "Glob",
  "Grep",
  "Bash",
  "Task",
] as const;

/**
 * The BASE tool set the CLI advertises to the provider (PRB.23). A REAL SDK field
 * (`Options.tools` — "the base set of available built-in tools"), distinct from
 * `allowedTools`: the allowlist is only a PERMISSION gate — every built-in tool's schema is
 * still serialized into every Messages request. Measured on the vendored CLI against a
 * loopback mock (zero-credit probe): the default set sends 24 tool schemas ≈ 77.8 KB
 * (~19K tokens) per request — Cron*, DesignSync, EnterWorktree/ExitWorktree, ListAgents,
 * NotebookEdit, ReportFindings, ScheduleWakeup, SendMessage, Skill, TaskOutput, TaskStop,
 * WebFetch, WebSearch, Workflow — none of which a phase seat can or should call. This list is
 * the seven real built-ins the seats use (subagent fan-out is `Agent`; `Task`/`MultiEdit` in
 * ALLOWED_TOOLS are legacy/alias names that are not standalone tools in this CLI build).
 * Measured effect: the whole fixed request envelope drops 119.3 KB → 65.1 KB (~45%), and the
 * WebFetch/WebSearch schemas stop shipping entirely (P0.15i AC1 enforced at the payload layer,
 * not just the permission layer).
 */
export const BASE_TOOLS = ["Agent", "Bash", "Edit", "Glob", "Grep", "Read", "Write"] as const;

/**
 * The intra-phase transcript bound (PRB.24). Phases already get fresh `query()` sessions (no
 * `resume` is ever forwarded), so the accumulation is INTRA-phase: a research-class phase seat
 * (verification, discourse) runs one long loop — per claim it searches, fetches (≤8K-token
 * pages), verifies, writes ledger rows — and EVERY Messages request resends the entire session
 * transcript. Run `01M35Y9BH…` measured ~40 verification requests averaging ~60K cache-read
 * tokens each (≈2.4M in the phase, ≈347 credits of uncommitted burn) before the run died
 * `cap_reached` at 506 against a 432 cap — with 2 `context.compacted` events, proving the CLI's
 * auto-compaction ran but only at its DEFAULT window (~the model's believed ~200K limit), i.e.
 * the transcript grew to ~an order of magnitude above the observed per-request average before
 * the bound moved.
 *
 * `autoCompactWindow` is a REAL vendored-SDK `Settings` key ("Auto-compact window size"), applied
 * through `Options.settings` (the flag-settings layer — the highest-priority user-controlled
 * settings tier), so the CLI's own auto-compaction now fires when a phase session's context
 * approaches ~80K tokens instead of ~200K — a HARD per-request ceiling on transcript resend that
 * applies session-wide (main context AND subagent sessions). The value is sized above one
 * bounded claim-batch working set (~16K envelope + ≤5×8K fetched pages + ~15K notes ≈ 71K) so a
 * seat honoring the `research_fanout` contract never thrashes; a non-compliant monolithic loop
 * is capped near 80K/request + compaction overhead instead of growing unboundedly. This is the
 * enforcement layer — the `research_fanout` prompt contract (runspec) is the shape instruction.
 */
export const TRANSCRIPT_COMPACTION_WINDOW_TOKENS = 80_000;

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

/** The §12.2 options object (our contract for what the adapter passes to the vendored SDK `query()`). Some
 *  fields are REAL vendored-SDK `Options` fields the adapter forwards; others (`skillsDir`, `cacheControlTtl`,
 *  `maxSubagentDepth`, `maxConcurrentSubagents`, `sessionStore`) are our §12.2 INTENT but are NOT real SDK
 *  fields — `sdk-adapter.toSdkOptions` drops them and records that those caps are advisory (F5). */
export interface AgentSdkQueryOptions {
  cwd: string;
  /** the main-context model (§12.3). A REAL SDK field: set explicitly so the CLI does not fall back to a
   *  default off the run's proxy allowlist (F4). Exactly one of `MODELS_BY_TIER[tier]`, and priceable. */
  model: string;
  /** where the baked, verbatim-ported skills live (§12.2). NOT a real SDK field — the HARNESS stages these
   *  into a CLI-discoverable dir (`skills-staging.ts`); `skills` below enables them. Kept for provenance. */
  skillsDir: string;
  /** REAL SDK field: enable the staged skills so `/editorial-review` resolves (F2). `"all"` = every discovered. */
  skills: "all" | string[];
  /** REAL SDK field (optional): pin the native `claude` CLI binary so the SDK does not resolve a missing one
   *  (F1). Set to the vendored binary path in the image; unset in placeholder builds (SDK default applies). */
  pathToClaudeCodeExecutable?: string;
  /** the subagent roster from the model profile (§12.2). */
  agents: Record<string, AgentDef>;
  hooks: { PreToolUse: PreToolUseHook[] };
  /** spec-literal (§12.2): non-interactive, never prompts. A REAL SDK `PermissionMode`. */
  permissionMode: "dontAsk";
  allowedTools: string[];
  /** cosmetic only (§12.2). */
  disallowedTools: string[];
  /** REAL SDK field (PRB.23): the base set of built-in tools the CLI advertises — the request's
   *  tool-schema payload is built from THIS list, not from `allowedTools`. */
  tools: string[];
  /** REAL SDK field (PRB.24): `Options.settings` — a flag-tier `Settings` object carrying
   *  `autoCompactWindow`, the intra-phase transcript bound (see TRANSCRIPT_COMPACTION_WINDOW_TOKENS). */
  settings: { autoCompactWindow: number };
  /** the per-phase inner budget brake (§12.4). */
  maxBudgetUsd: number;
  maxTurns: number;
  /** the SCRUBBED env for the model's processes, merged with OTel (content flags off). */
  env: Record<string, string>;
  /** subagent fan-out limits (§12.2). NOT real SDK fields — advisory only (F5); un-enforced by the wrapper. */
  maxSubagentDepth: 1;
  maxConcurrentSubagents: number;
  /** the prompt-cache TTL intent (§12.2's 1-h; ECON.2 L4's ON arm is the ≈5-min CLI default). NOT a real SDK field — advisory only (F5); the env carries the real effect. */
  cacheControlTtl: "1h" | "5m";
  /** the GCS session store (§12.2). NOT a real SDK field — advisory only (F5); not applied by the wrapper. */
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
  /** the vendored native `claude` binary path (image-specific; run-task supplies it — F1). Unset ⇒ SDK default. */
  claudeCodeExecutablePath?: string;
}

/** Build the §12.2 options object for one phase. */
export function buildQueryOptions(req: PhaseRequest, deps: BuildOptionsDeps): AgentSdkQueryOptions {
  const tier = deps.tier ?? "base";
  // ECON.2 (ADR-087) — the run's frozen lever set resolves the four phase-level knobs; absent flags
  // ⇒ the pre-ECON.2 shape bit for bit. L1: per-`phaseClass` autoCompactWindow (research holds the
  // batch working-set floor — subagent sessions share the setting). L2: the fan-out cap realized
  // through the CLI env (the `research_fanout` prompt contract carries the batch size; runspec
  // interpolates the same COGS_FANOUT_* constants). L3: §12.3 per-class routing within the tier's
  // allowlist. L4: the cache-TTL choice realized by omitting ENABLE_PROMPT_CACHING_1H.
  const levers = req.levers;
  const fanout = levers?.l2FanoutShape ? COGS_FANOUT_TUNED : COGS_FANOUT_BASELINE;
  const model = levers?.l3PhaseRouting
    ? (routeModelForPhaseClass(tier, req.phase.phaseClass) ?? mainModelForTier(tier))
    : mainModelForTier(tier);
  const autoCompactWindow = levers?.l1PerPhaseWindow
    ? (COGS_PHASE_COMPACT_WINDOWS[req.phase.phaseClass] ?? TRANSCRIPT_COMPACTION_WINDOW_TOKENS)
    : TRANSCRIPT_COMPACTION_WINDOW_TOKENS;
  const env = {
    ...buildAgentEnv({
      runId: req.runId,
      proxyBaseUrl: deps.proxyBaseUrl,
      configDir: deps.configDir,
      maxConcurrentSubagents: fanout.maxConcurrent,
      ...(levers?.l4CacheTtl5m ? { promptCaching1h: false } : {}),
    }),
    ...buildOtelConfig(),
  };
  return {
    cwd: req.cwd,
    model, // explicit + allowlisted + priceable (F4) — never the CLI's off-list default
    skillsDir: deps.skillsDir,
    skills: "all", // enable the harness-staged skills so `/editorial-review` resolves (F2)
    ...(deps.claudeCodeExecutablePath ? { pathToClaudeCodeExecutable: deps.claudeCodeExecutablePath } : {}),
    agents: buildAgentRoster({ tier }),
    hooks: { PreToolUse: [deps.hook] },
    permissionMode: "dontAsk",
    allowedTools: [...ALLOWED_TOOLS],
    disallowedTools: [...COSMETIC_DISALLOWED_TOOLS],
    tools: [...BASE_TOOLS], // the advertised schema set — PRB.23 measured −54 KB/request
    // the intra-phase transcript bound (PRB.24) — flag-tier settings, session-wide; per-phase when L1 is on
    settings: { autoCompactWindow },
    maxBudgetUsd: req.maxBudgetUsd,
    maxTurns: req.maxTurns,
    env,
    maxSubagentDepth: 1,
    maxConcurrentSubagents: fanout.maxConcurrent,
    cacheControlTtl: levers?.l4CacheTtl5m ? "5m" : "1h",
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
