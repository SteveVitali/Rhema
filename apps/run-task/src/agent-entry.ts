// @rhema/run-task — the agent-entry (D-P0.06-4; §12.4 step 4). Runs as uid `agent` (launched by the harness via
// setpriv with a SCRUBBED env). It constructs `AgentSdkEngine` bound to the vendored SDK (`loadSdkQuery()`) and
// drives ONE phase, streaming the mapped §12.5 events back through the `EventTransport` (the batching, disk-
// buffering `EventBufferClient` → `POST /internal/runs/:id/events`). The orchestration around the phase (the
// completion oracle, commit, gates, delivery) is the server's; this is the thin SDK driver the two-uid image runs.
//
// The phase-driving core (`runAgentPhase`) is engine- and transport-agnostic, so it is unit-tested with a
// `FakeEngine` + a fake transport; `main()` is the deploy wiring (needs the vendored SDK + a live api/proxy).

import type { Engine, EngineEvent, PhaseRequest, ResultSubtype, UsageSnapshot } from "@rhema/engine";
import { emptyUsage } from "@rhema/engine";
import type { PreToolUseHook, SessionStore } from "@rhema/engine";
import type { ToolUse } from "@rhema/hooks";
import { EventBufferClient, type EventTransport, type OutboundEvent } from "./event-buffer.js";
import { hookClientDecision } from "./hook-client.js";

export interface AgentPhaseResult {
  readonly subtype: ResultSubtype;
  readonly usage: UsageSnapshot;
  readonly eventsPosted: number;
}

/**
 * Drive one `Engine.startPhase` to its terminal result, enqueuing every mapped §12.5 event to the buffered
 * event client (which batches ≤250 / 2 s and spills to disk on an api outage — nothing is dropped or reordered).
 * Returns the SDK result subtype (the completion oracle's leg a) + the final usage + the event count. A thrown
 * engine error propagates after a best-effort flush so buffered events are not lost.
 */
export async function runAgentPhase(engine: Engine, request: PhaseRequest, events: EventBufferClient): Promise<AgentPhaseResult> {
  let subtype: ResultSubtype = "error_during_execution";
  let usage: UsageSnapshot = emptyUsage();
  let eventsPosted = 0;
  try {
    for await (const ev of engine.startPhase(request)) {
      if (ev.kind === "event") {
        const e = ev as Extract<EngineEvent, { kind: "event" }>;
        const out: OutboundEvent = { type: e.type, payload: e.payload, ...(e.agentLabel ? { agentLabel: e.agentLabel } : {}) };
        await events.enqueue(out);
        eventsPosted++;
      } else if (ev.kind === "usage") {
        usage = ev.snapshot;
      } else if (ev.kind === "result") {
        subtype = ev.subtype;
        usage = ev.usage;
      }
    }
  } finally {
    await events.flush(); // deliver (or spill) everything buffered before returning/throwing
  }
  return { subtype, usage, eventsPosted };
}

/** Adapt the harness hook daemon's Unix-socket decision to the SDK `PreToolUse` hook the engine wires. The
 *  vendored SDK's `HookCallback` must return a `HookJSONOutput` — i.e. the `{ hookSpecificOutput: {...} }`
 *  WRAPPER (sdk.d.ts `SyncHookJSONOutput`), not the bare inner object. Returning the inner object left the SDK
 *  with no `permissionDecision` to read, so a `deny` would not actually block the tool (the §12.6 boundary would
 *  silently not enforce → a false-green Review). Confirmed live at D-P0.06-1.
 *
 *  PRB.17 live finding: the SDK `HookCallback`'s `input` is the `PreToolUseHookInput` ENVELOPE —
 *  `{hook_event_name, tool_name, tool_input, tool_use_id, session_id, transcript_path, cwd}` — NOT our
 *  `ToolUse{tool, input}`. Forwarding it verbatim gave the daemon `use.tool === undefined`, which falls into
 *  evaluateToolUse's "not a matched tool — pass through, no audit" branch: every tool silently allowed, zero
 *  `[hook]` decisions, zero `access_log` rows on every production pod. Translate the envelope here — the single
 *  mapping point between the SDK's shape and the §12.6 `ToolUse` contract. */
export function buildPreToolUseHook(socketPath: string): PreToolUseHook {
  return async (input: unknown) => {
    const env = input as { tool_name?: unknown; tool_input?: unknown };
    const use: ToolUse = {
      tool: typeof env?.tool_name === "string" ? env.tool_name : "",
      input:
        env?.tool_input !== null && typeof env?.tool_input === "object" && !Array.isArray(env.tool_input)
          ? (env.tool_input as Readonly<Record<string, unknown>>)
          : {},
    };
    const res = await hookClientDecision(socketPath, use);
    return { hookSpecificOutput: res.hookSpecificOutput };
  };
}

// -------------------------------------------------------------------- the deploy entrypoint (main) -----------
//
// CRITICAL two-uid boundary (REQ-SPEC-10/11; the #1 riskiest bet): this process runs as uid `agent` with a
// SCRUBBED env (only RUN_ID / ANTHROPIC_BASE_URL / CLAUDE_CONFIG_DIR) and NO secret in scope. It therefore
// CANNOT read the run token or reach the internal API. Events flow to the HARNESS over a dedicated pipe
// (fd 3) with NO credential; the harness supervisor (harness-main.ts, uid `harness`) holds the token and
// forwards them to `POST /internal/runs/:id/events`. The agent reads its phase spec from a fixed path the
// harness wrote under CLAUDE_CONFIG_DIR — never from a secret file or a network call.

/** The fd the agent writes its §12.5 event stream to; the harness reads the other end (no token crosses it). */
export const HARNESS_EVENT_FD = 3;

/** The fixed filename (under CLAUDE_CONFIG_DIR) the harness writes the phase spec to for the agent to read. */
export const PHASE_SPEC_FILENAME = "phase-spec.json";

/** The file the agent writes under `<cwd>/.rhema/` with the SDK result subtype + usage — the harness (uid
 *  harness) reads it after the agent exits to feed the completion oracle (leg a) + provisional credits. It is
 *  a FACT the agent reports (like `.rhema/phase-result.json`); it carries no secret and no run token. */
export const AGENT_RESULT_FILENAME = ".rhema/agent-result.json";

/** The agent→harness result the harness reads from `<cwd>/.rhema/agent-result.json` (no secret, no token). */
export interface AgentResultFile {
  readonly subtype: ResultSubtype;
  readonly usage: UsageSnapshot;
  /**
   * A thrown SDK/engine error captured as a FACT (D-P0.15e-4 observability sink): when the agent's phase run
   * throws (the SDK failed to bring up, hung then errored, or the engine crashed), the process writes this so
   * the HARNESS can surface it (an `engine.error` run event + the `failStep` reason) even when the pod's logs
   * are unreachable (konnectivity down). It carries the error CLASS + a bounded message ONLY — never leaked
   * user content or the run token/key (the agent has none in scope; §12.6 / REQ-SPEC-10/11).
   */
  readonly error?: AgentErrorFact;
}

/** The error class + bounded message the agent reports when its phase throws (no secret, no user content). */
export interface AgentErrorFact {
  readonly class: string;
  readonly message: string;
}

/**
 * Reduce an unknown thrown value to a `{class, message}` fact safe to persist + surface. The agent process runs
 * with a SCRUBBED env (no run token / provider key in scope — REQ-SPEC-10/11), so the only leak risk is user
 * content embedded in a message; we keep the class + a single-line, length-bounded message and drop the stack /
 * cause chain (where prompt text could otherwise ride along).
 */
export function sanitizeAgentError(err: unknown): AgentErrorFact {
  const cls = err instanceof Error && err.name ? err.name : typeof err;
  const raw = err instanceof Error ? err.message : String(err);
  // Defense-in-depth for the "never leak the run token/key" invariant: the agent's env is scrubbed (no run
  // token / provider key), but redact auth-token-like substrings an SDK error might echo before bounding.
  const message = raw
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "sk-[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  return { class: String(cls).slice(0, 100), message };
}

/** The phase spec the harness writes for the agent process. No secrets — the agent has none in scope. */
export interface AgentPhaseSpec {
  readonly request: PhaseRequest;
  readonly skillsDir: string;
  readonly hookSocketPath: string;
  readonly tier?: "base" | "balanced" | "frontier";
}

/** An `EventTransport` that writes each batch as one NDJSON line to the harness event fd — no token, no network. */
export function createFdEventTransport(fd: number = HARNESS_EVENT_FD): EventTransport {
  return {
    async post(events: readonly OutboundEvent[]): Promise<void> {
      const { writeSync } = await import("node:fs");
      writeSync(fd, JSON.stringify(events) + "\n");
    },
  };
}

function agentEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`agent-entry: missing scrubbed env ${name}`);
  return v;
}

/** Read the harness-written phase spec from `${CLAUDE_CONFIG_DIR}/phase-spec.json` (no token, no api). */
async function readAgentSpec(): Promise<{ spec: AgentPhaseSpec; proxyBaseUrl: string; configDir: string }> {
  const { readFile } = await import("node:fs/promises");
  const configDir = agentEnv("CLAUDE_CONFIG_DIR");
  const proxyBaseUrl = agentEnv("ANTHROPIC_BASE_URL");
  const spec = JSON.parse(await readFile(`${configDir}/${PHASE_SPEC_FILENAME}`, "utf8")) as AgentPhaseSpec;
  return { spec, proxyBaseUrl, configDir };
}

/** Write `<cwd>/.rhema/agent-result.json` — the agent→harness fact file (no secret / token — REQ-SPEC-10/11). */
async function writeAgentResult(resultPath: string, agentResult: AgentResultFile): Promise<void> {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const path = await import("node:path");
  await mkdir(path.dirname(resultPath), { recursive: true });
  await writeFile(resultPath, JSON.stringify(agentResult), "utf8");
}

/** Run the phase as uid `agent`: load the vendored SDK, build the engine, stream events to fd 3, exit by subtype. */
export async function main(): Promise<void> {
  // umask 0 so files/dirs the agent (uid 10002) creates are world-writable (0666/0777). The harness (uid 10001)
  // is in a DISTINCT group (no shared group — Dockerfile), so when it re-materializes `/work` for the NEXT phase
  // in the same pod it must be able to OVERWRITE the agent-created outputs (e.g. `agents/<seat>/.rhema/*.json`).
  // Without this the agent's default umask (022 → 0755 dirs / 0644 files) left the harness unable to unlink/open
  // them → `EACCES open /work/project/agents/editor/.rhema/01-claim-ledger.json` AFTER a committed phase (P0.15h,
  // diagnosed live). The pod is single-run and single-tenant and the agent holds no secrets, so world-writable
  // work files leak nothing; `makeTreeAgentWritable` already pre-widens the harness-created tree to match.
  process.umask(0o000);
  const { InMemoryBufferStore } = await import("./event-buffer.js");
  const path = await import("node:path");

  const { spec, proxyBaseUrl, configDir } = await readAgentSpec();
  // resolve the result path once so the error sink can write it even if SDK bring-up throws before the engine.
  const resultPath = path.join(process.cwd(), AGENT_RESULT_FILENAME);
  let engineUsage: () => UsageSnapshot = () => emptyUsage();

  try {
    const { loadSdkQuery, resolveClaudeCodeExecutable } = await import("./sdk-adapter.js");
    const { existsSync } = await import("node:fs");
    const { AgentSdkEngine } = await import("@rhema/engine");
    const query = await loadSdkQuery(); // fails fast if the SDK was not vendored into the image
    // Pin the native `claude` binary the vendored SDK spawns (F1); unset in a placeholder build (SDK default).
    const claudeCodeExecutablePath = resolveClaudeCodeExecutable(existsSync);
    const sessionStore: SessionStore = { kind: "gcs" };
    const engine = new AgentSdkEngine({
      query,
      proxyBaseUrl,
      configDir,
      skillsDir: spec.skillsDir,
      hook: buildPreToolUseHook(spec.hookSocketPath),
      sessionStore,
      ...(spec.tier ? { tier: spec.tier } : {}),
      ...(claudeCodeExecutablePath ? { claudeCodeExecutablePath } : {}),
    });
    engineUsage = () => engine.usage(); // partial usage to report if the run throws mid-phase

    // events go to the harness over fd 3; if the harness stops reading, the pipe fills and this write blocks —
    // natural back-pressure, no token on this side. A memory buffer is enough (the fd write never "fails").
    const events = new EventBufferClient(createFdEventTransport(), new InMemoryBufferStore());
    const result = await runAgentPhase(engine, spec.request, events);
    console.log(`[agent-entry] phase ${spec.request.phase.key} → ${result.subtype} (${result.eventsPosted} events)`);

    // report the SDK result (subtype + usage) to the harness by writing `<cwd>/.rhema/agent-result.json`. The
    // harness (uid harness) reads it after this process exits to run the completion oracle (leg a) + price the
    // provisional credits. No secret / token is written — the agent has none in scope (REQ-SPEC-10/11).
    await writeAgentResult(resultPath, { subtype: result.subtype, usage: result.usage });
    // a non-success SDK subtype is a phase-level outcome the oracle judges server-side; exit 0 either way (the
    // agent ran) — the harness reads .rhema/phase-result.json + this result file to decide.
  } catch (err) {
    // OBSERVABILITY SINK (D-P0.15e-4): the SDK failed to bring up / hung then errored / the engine crashed.
    // Persist the error as a FACT so the harness surfaces it (an `engine.error` run event + the failStep
    // reason) even when the pod's logs are unreachable (konnectivity down) — the P0.15e blind spot. Then
    // re-throw so the process exits non-zero. A best-effort write: never mask the original error.
    await writeAgentResult(resultPath, {
      subtype: "error_during_execution",
      usage: engineUsage(),
      error: sanitizeAgentError(err),
    }).catch(() => undefined);
    throw err;
  }
}

// Run when invoked as the container's agent command (`node dist/agent-entry.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    console.error("[agent-entry] phase failed:", err);
    process.exit(1);
  });
}
