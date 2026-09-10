// @rhema/engine — `AgentSdkEngine`: the self-hosted Agent SDK engine (MVP; §12.2, §12.9 stage 1).
//
// Builds `query({ prompt: "/<skill> …inputs…", options })` with the §12.2 options (scrubbed env, dontAsk,
// cosmetic disallowedTools, per-phase budget/turns, ≤5 concurrent subagents at depth 1, 1-h caching, OTel
// content-flags-off, GCS sessionStore, the PreToolUse hook, an abortController) and streams the SDK messages
// through the mapper. The SDK is a VENDORED, proprietary dependency of run-task (REQ-ARCH-4); it is injected
// as a `QueryFn` so the engine is unit-testable with recorded fixtures and no SDK install.

import type { Engine, EngineEvent, PhaseRequest, UsageSnapshot } from "./engine.js";
import { emptyUsage } from "./engine.js";
import type { SdkMessage } from "./sdk-types.js";
import type { AgentSdkQueryOptions, PreToolUseHook, SessionStore } from "./options.js";
import { buildQueryOptions, buildPrompt } from "./options.js";
import { createMapper } from "./mapper/mapper.js";
import { driveMapper } from "./stream-runner.js";

/** The vendored SDK `query()` narrowed to what the engine needs: prompt + options → an SDK message stream. */
export type QueryFn = (args: { prompt: string; options: AgentSdkQueryOptions }) => AsyncIterable<SdkMessage>;

export interface AgentSdkEngineDeps {
  /** the vendored SDK `query()` (injected). */
  readonly query: QueryFn;
  /** the run's proxy base URL (`ANTHROPIC_BASE_URL`). */
  readonly proxyBaseUrl: string;
  /** per-run writable config dir (tmpfs). */
  readonly configDir: string;
  /** baked, verbatim-ported skills directory. */
  readonly skillsDir: string;
  /** the PreToolUse hook (run-task wires @rhema/hooks via the socket daemon). */
  readonly hook: PreToolUseHook;
  readonly sessionStore: SessionStore;
  readonly tier?: "base" | "balanced" | "frontier";
}

export class AgentSdkEngine implements Engine {
  private readonly deps: AgentSdkEngineDeps;
  private controller = new AbortController();
  private lastUsage: UsageSnapshot = emptyUsage();
  private currentMapperUsage: (() => UsageSnapshot) | undefined;
  /** the options built for the in-flight phase — exposed for the conformance/shape tests. */
  lastOptions: AgentSdkQueryOptions | undefined;
  lastPrompt: string | undefined;

  constructor(deps: AgentSdkEngineDeps) {
    this.deps = deps;
  }

  async *startPhase(req: PhaseRequest): AsyncIterable<EngineEvent> {
    this.controller = new AbortController();
    const options = buildQueryOptions(req, {
      proxyBaseUrl: this.deps.proxyBaseUrl,
      configDir: this.deps.configDir,
      skillsDir: this.deps.skillsDir,
      ...(this.deps.tier ? { tier: this.deps.tier } : {}),
      hook: this.deps.hook,
      sessionStore: this.deps.sessionStore,
      abortController: this.controller,
    });
    const prompt = buildPrompt(req.skill, { ...req.inputs, phase: req.phase.skillPhase });
    this.lastOptions = options;
    this.lastPrompt = prompt;

    const mapper = createMapper({
      phaseKey: req.phase.key,
      ordinal: req.ordinal,
      of: req.of,
      mainAgentLabel: req.seat,
    });
    this.currentMapperUsage = () => mapper.usage();

    const messages = this.deps.query({ prompt, options });
    for await (const ev of driveMapper(messages, mapper, this.controller)) {
      if (ev.kind === "result") this.lastUsage = ev.usage;
      yield ev;
    }
    this.lastUsage = mapper.usage();
  }

  abort(_reason: string): void {
    this.controller.abort();
  }

  usage(): UsageSnapshot {
    return this.currentMapperUsage?.() ?? this.lastUsage;
  }
}
