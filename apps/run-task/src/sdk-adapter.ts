// @rhema/run-task — the LIVE Agent SDK adapter (D-P0.06-4).
//
// `AgentSdkEngine` (in @rhema/engine) is DI'd over a `QueryFn` so the whole engine + mapper suite runs
// under Node with recorded fixtures and NO SDK install (REQ-ARCH-4/7). This module is the one place that
// binds that seam to the real, vendored `@anthropic-ai/claude-agent-sdk` `query()` — it lives in run-task
// (the image the SDK is vendored into), NOT in @rhema/engine, so the package stays SDK-free.
//
// The SDK is proprietary and absent from the build env; `@anthropic-ai/claude-agent-sdk` is declared as an
// ambient module (see `sdk-ambient.d.ts`) and loaded by a DYNAMIC import, so this file compiles and
// run-task's own tests run without it. In the run-task image the real vendored module resolves at runtime.

import { createRequire } from "node:module";
import type { QueryFn } from "@rhema/engine";
import type { AgentSdkQueryOptions, SdkMessage } from "@rhema/engine";

/** The narrow shape we need from the vendored SDK: `query({prompt, options})` → an SDK message stream. */
export type SdkQueryLike = (args: { prompt: string; options: unknown }) => AsyncIterable<unknown>;

/**
 * The SINGLE field-mapping point between our §12.2 `AgentSdkQueryOptions` and the vendored SDK's own `Options`.
 *
 * It emits ONLY fields the vendored SDK (`sdk.d.ts` v0.3.x) actually reads — the audit (F5) found several of
 * our §12.2 contract fields are silently ignored by the wrapper, so passing them is a no-op that misrepresents
 * what is enforced. Concretely:
 *   • Forwarded (real `Options` fields): cwd, model, agents, hooks, permissionMode (`'dontAsk'` is a real
 *     PermissionMode), allowedTools, disallowedTools, tools (PRB.23 — the advertised schema set, NOT a
 *     permission list), settings (PRB.24 — flag-tier `Settings` carrying `autoCompactWindow`, the
 *     intra-phase transcript bound), maxTurns, maxBudgetUsd, env, skills, abortController, and
 *     pathToClaudeCodeExecutable when set.
 *   • DROPPED (NOT real SDK fields — recorded as un-enforced by the wrapper, F5): `skillsDir` (skills are staged
 *     to a discoverable dir + enabled via `skills`), `cacheControlTtl` (1-h caching not applied), and the
 *     subagent caps `maxSubagentDepth`/`maxConcurrentSubagents` and the `sessionStore`. The boundary defense is
 *     the egress-proxy + the uid split (REQ-SPEC-10/11), NOT these advisory fields.
 * If a vendored SDK version renames/adds a field, adjust it HERE — one place — and the conformance fixtures
 * (recorded from real SDK messages) keep the mapper honest.
 */
export function toSdkOptions(options: AgentSdkQueryOptions): Record<string, unknown> {
  const out: Record<string, unknown> = {
    cwd: options.cwd,
    model: options.model,
    agents: toSdkAgents(options.agents),
    hooks: toSdkHooks(options.hooks),
    permissionMode: options.permissionMode,
    allowedTools: options.allowedTools,
    disallowedTools: options.disallowedTools,
    tools: options.tools,
    settings: options.settings, // PRB.24 — flag-tier Settings: autoCompactWindow bounds the intra-phase transcript
    maxTurns: options.maxTurns,
    maxBudgetUsd: options.maxBudgetUsd,
    env: options.env,
    skills: options.skills,
    abortController: options.abortController,
  };
  if (options.pathToClaudeCodeExecutable) out.pathToClaudeCodeExecutable = options.pathToClaudeCodeExecutable;
  return out;
}

/**
 * Map our `{ PreToolUse: [callback] }` to the vendored SDK's `Partial<Record<HookEvent, HookCallbackMatcher[]>>`:
 * each event's callbacks become ONE matcher `{ hooks: [...] }` with no `matcher` (so it applies to every tool).
 * Our engine holds the flat `{event: callback[]}` shape (its §12.2 contract); the SDK-specific matcher wrapping
 * lives HERE, the single mapping point. Passing the flat array directly left the SDK unable to invoke the hook
 * (a function where it expects a matcher object) → the §12.6 PreToolUse boundary never ran (D-P0.06-1).
 */
function toSdkHooks(hooks: AgentSdkQueryOptions["hooks"]): Record<string, { hooks: unknown[] }[]> {
  const out: Record<string, { hooks: unknown[] }[]> = {};
  for (const [event, callbacks] of Object.entries(hooks)) {
    if (Array.isArray(callbacks) && callbacks.length > 0) out[event] = [{ hooks: callbacks }];
  }
  return out;
}

/**
 * Map our roster `AgentDef`s to the vendored SDK's `AgentDefinition`: the SDK REQUIRES `prompt: string` (the
 * agent's system prompt) + `description`, and reads `tools`/`model`; our roster carries `description`/`tools`/
 * `model` plus the non-SDK `effort`/`inputScoped` (dropped). We synthesize `prompt` from the description (a
 * faithful minimal system prompt — the input-scoped subagents are launched by the orchestrator as separate
 * scoped queries anyway; only `researcher` fans out in-query). Without a `prompt` the `agents` option is
 * malformed and the SDK rejects it at `query()` construction (D-P0.06-1).
 */
function toSdkAgents(agents: AgentSdkQueryOptions["agents"]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(agents)) {
    out[name] = { description: def.description, prompt: def.description, tools: def.tools, model: def.model };
  }
  return out;
}

/** The path the operator vendors the platform native `claude` binary at (mirrors the SDK's platform
 *  optionalDependency package name so the operator's drop under `apps/run-task/vendor/` is intuitive). The
 *  Dockerfile COPYs `vendor/` to `/app/vendor/` and asserts this binary is executable by uid `agent`. */
export const VENDORED_CLAUDE_BINARY = "/app/vendor/claude-agent-sdk-linux-x64/claude";

/**
 * Resolve the native `claude` CLI binary path to pin via `options.pathToClaudeCodeExecutable` (F1). Prefers the
 * platform optionalDependency package the SDK itself resolves (`@anthropic-ai/claude-agent-sdk-<plat>/claude`)
 * so a musl/arm image resolves correctly; falls back to the fixed vendored path. Returns `undefined` when
 * neither is present (a placeholder build) so the SDK's own default applies — `loadSdkQuery` still guards the
 * missing-SDK case with a clear error.
 */
export function resolveClaudeCodeExecutable(existsSync: (p: string) => boolean): string | undefined {
  const plat = `${process.platform}-${process.arch}`;
  try {
    const require = createRequire(import.meta.url);
    const resolved = require.resolve(`@anthropic-ai/claude-agent-sdk-${plat}/claude`);
    if (existsSync(resolved)) return resolved;
  } catch {
    /* the platform package is not installed — try the fixed vendored path below */
  }
  return existsSync(VENDORED_CLAUDE_BINARY) ? VENDORED_CLAUDE_BINARY : undefined;
}

/**
 * Adapt a vendored SDK `query()` into the engine's `QueryFn`. Pure: no import, no I/O — the SDK-loading is
 * `loadSdkQuery` below, so this bridging (options mapping + message-stream typing) is unit-tested with a
 * fake `sdkQuery`. The SDK's message types are a structural SUPERSET of `SdkMessage`; the mapper reads only
 * the fields `SdkMessage` names, so yielding them as `SdkMessage` is sound (the conformance suite proves it).
 */
export function adaptSdkQuery(sdkQuery: SdkQueryLike): QueryFn {
  return ({ prompt, options }) => {
    const stream = sdkQuery({ prompt, options: toSdkOptions(options) });
    async function* typed(): AsyncIterable<SdkMessage> {
      for await (const message of stream) {
        yield message as SdkMessage;
      }
    }
    return typed();
  };
}

/**
 * Load the vendored SDK and return the bound `QueryFn`. Called once, inside the `agent` process in the
 * run-task image (the SDK runs as uid `agent`, never `harness`). The dynamic import fails fast with a clear
 * error if the SDK was not vendored into the image — never a silent fallback that would run the model with
 * no engine.
 */
export async function loadSdkQuery(): Promise<QueryFn> {
  let mod: { query: SdkQueryLike };
  try {
    mod = await import("@anthropic-ai/claude-agent-sdk");
  } catch (cause) {
    throw new Error(
      "run-task: the vendored @anthropic-ai/claude-agent-sdk is not present in this image — " +
        "it must be vendored at build time (see apps/run-task/Dockerfile). Refusing to run without an engine.",
      { cause },
    );
  }
  if (typeof mod.query !== "function") {
    throw new Error("run-task: vendored @anthropic-ai/claude-agent-sdk has no `query` export.");
  }
  return adaptSdkQuery(mod.query);
}
