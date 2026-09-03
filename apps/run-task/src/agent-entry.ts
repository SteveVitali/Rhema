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

/** Adapt the harness hook daemon's Unix-socket decision to the SDK `PreToolUse` hook the engine wires. */
export function buildPreToolUseHook(socketPath: string): PreToolUseHook {
  return async (input: unknown) => {
    const res = await hookClientDecision(socketPath, input as ToolUse);
    return res.hookSpecificOutput;
  };
}

// -------------------------------------------------------------------- the deploy entrypoint (main) -----------

/** The phase spec the harness writes for the agent process to run (a serialized PhaseRequest + engine config). */
interface AgentPhaseSpec {
  readonly request: PhaseRequest;
  readonly proxyBaseUrl: string;
  readonly configDir: string;
  readonly skillsDir: string;
  readonly hookSocketPath: string;
  readonly tier?: "base" | "balanced" | "frontier";
  readonly api: { readonly baseUrl: string; readonly runToken: string };
  readonly bufferPath: string;
}

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`agent-entry: missing required env ${name}`);
  return v;
}

/** Read the harness-written phase spec + the run token (from the harness-only mounted file). */
async function readAgentSpec(): Promise<AgentPhaseSpec> {
  const { readFile } = await import("node:fs/promises");
  const specPath = reqEnv("PHASE_SPEC_FILE");
  const spec = JSON.parse(await readFile(specPath, "utf8")) as Omit<AgentPhaseSpec, "api"> & { api: { baseUrl: string; runTokenFile: string } };
  const runToken = (await readFile(spec.api.runTokenFile, "utf8")).trim();
  return { ...spec, api: { baseUrl: spec.api.baseUrl, runToken } };
}

/** Construct the live `EventTransport` (fetch → the internal events endpoint with the run token). */
async function buildLiveTransport(spec: AgentPhaseSpec): Promise<EventTransport> {
  const { createFetchEventTransport } = await import("./event-transport.js");
  return createFetchEventTransport({ baseUrl: spec.api.baseUrl, runId: spec.request.runId, runToken: spec.api.runToken });
}

/** Run the phase as uid `agent`: load the vendored SDK, build the engine, stream events, exit by subtype. */
export async function main(): Promise<void> {
  const { loadSdkQuery } = await import("./sdk-adapter.js");
  const { AgentSdkEngine } = await import("@rhema/engine");
  const { FileBufferStore } = await import("./event-buffer.js");

  const spec = await readAgentSpec();
  const query = await loadSdkQuery(); // fails fast if the SDK was not vendored into the image
  const sessionStore: SessionStore = { kind: "gcs" };
  const engine = new AgentSdkEngine({
    query,
    proxyBaseUrl: spec.proxyBaseUrl,
    configDir: spec.configDir,
    skillsDir: spec.skillsDir,
    hook: buildPreToolUseHook(spec.hookSocketPath),
    sessionStore,
    ...(spec.tier ? { tier: spec.tier } : {}),
  });

  const transport = await buildLiveTransport(spec);
  const events = new EventBufferClient(transport, new FileBufferStore(spec.bufferPath), {
    onPause: (reason, buffered) => engine.abort(`event backpressure: ${reason} (${buffered} buffered)`),
  });

  const result = await runAgentPhase(engine, spec.request, events);
  console.log(`[agent-entry] phase ${spec.request.phase.key} → ${result.subtype} (${result.eventsPosted} events)`);
  // a non-success SDK subtype is a phase-level outcome the oracle judges server-side; exit 0 either way (the
  // agent ran) — the harness reads .rhema/phase-result.json + the result subtype to decide.
}

// Run when invoked as the container's agent command (`node dist/agent-entry.js`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    console.error("[agent-entry] phase failed:", err);
    process.exit(1);
  });
}
