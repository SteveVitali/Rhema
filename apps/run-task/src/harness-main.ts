// @rhema/run-task — the HARNESS supervisor (uid `harness`; §12.4 step 4, REQ-SPEC-10/11). This is the process
// the image entrypoint runs (entrypoint.sh → this, as uid harness with only CAP_SETUID+CAP_SYS_ADMIN). It is the
// ONLY holder of the run token + proxy credential. In order it:
//   1. reads the run token (0400, owner harness — the agent uid cannot) + the run spec (phase + manifest);
//   2. materializes /work from the server-generated hydration manifest (GcsContentStore → materializeWork),
//      chmodding read-only paths 0444 (D-P0.09-1);
//   3. writes the agent's phase spec to CLAUDE_CONFIG_DIR (no secrets) + starts the hook daemon;
//   4. launches the SDK as uid `agent` via bootstrap.buildAgentLaunch (setpriv, scrubbed env), with a dedicated
//      fd 3 pipe for the agent's §12.5 event stream;
//   5. forwards each agent event to POST /internal/runs/:id/events WITH the run token (createFetchEventTransport
//      + EventBufferClient — batch/spill/back-pressure). The token NEVER crosses into the agent process.
//
// The event-forwarding parse (`parseAgentEventLine`) + the forward loop (`forwardAgentEvents`) are pure and
// unit-tested; `main()` is the deploy wiring (needs the live image + api/proxy). It drives the pod→server
// commit/deliver loop (`runCommitLoop`, P0.15e): per phase it materializes `/work`, runs the agent, reads the
// `/work` outputs, and calls the token-authed internal routes to harvest/commit/deliver — advancing the run
// phase-by-phase until a gate, a pinned-phase stop, delivery, or a failure.

import { compileSeatPolicy, newDenialState, type CompileInput } from "@rhema/hooks";
import type { AgentTypeKey } from "@rhema/contracts";
import type { OutboundEvent, EventTransport } from "./event-buffer.js";
import { EventBufferClient, FileBufferStore } from "./event-buffer.js";
import { buildAgentLaunch } from "./bootstrap.js";
import { PHASE_SPEC_FILENAME, type AgentPhaseSpec } from "./agent-entry.js";
import { runCommitLoop, type PhaseRunOutputs } from "./harness-loop.js";
import { createHarnessApiClient } from "./internal-client.js";
import { buildPhaseOutputs } from "./work-reader.js";
import type { HarnessRunSpec as ServerRunSpec } from "@rhema/orchestrator";

/** Parse one NDJSON line the agent wrote to fd 3 (a serialized `OutboundEvent[]`), or null when it is not one. */
export function parseAgentEventLine(line: string): OutboundEvent[] | null {
  const trimmed = line.trim();
  if (trimmed === "") return null;
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as OutboundEvent[];
  } catch {
    return null; // a stray SDK log line on the event fd is ignored (best-effort — never crash the run)
  }
}

/**
 * Read the agent's fd-3 event stream line by line and forward each batch through `events` (the token'd
 * transport buffer). Non-event lines are ignored. Resolves when the stream ends (the agent exited).
 */
export async function forwardAgentEvents(lines: AsyncIterable<string>, events: EventBufferClient): Promise<void> {
  for await (const line of lines) {
    const batch = parseAgentEventLine(line);
    if (!batch) continue;
    for (const ev of batch) await events.enqueue(ev);
  }
  await events.flush();
}

/** Split a byte stream into text lines (NDJSON framing for the fd-3 event channel). */
export async function* toLines(stream: AsyncIterable<Buffer | string>): AsyncIterable<string> {
  let buf = "";
  for await (const chunk of stream) {
    buf += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      yield buf.slice(0, nl);
      buf = buf.slice(nl + 1);
    }
  }
  if (buf.length > 0) yield buf;
}

// -------------------------------------------------------------------- the deploy entrypoint (main) -----------

/**
 * The server-authored run spec the harness executes (D-P0.15c-6). It IS the api's `@rhema/orchestrator`
 * `HarnessRunSpec` — the harness fetches it as JSON and NEVER constructs it (§12.6 "attestation derives only
 * from server-side facts"). It carries the §12.6 boundary policy as JSON-safe `hookPolicyInput`: the compiled
 * `SeatPolicy` holds a `Set` and the `DenialState` a `Map`, neither of which survives JSON, so the harness
 * compiles the live policy locally with the same `@rhema/hooks` code + a fresh `newDenialState()`. No secret is
 * ever in the spec (REQ-SPEC-10/11).
 */
export type HarnessRunSpec = ServerRunSpec;

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`harness: missing required env ${name}`);
  return v;
}

/**
 * Obtain the run spec (D-P0.15c-6). Preferred: a token-authed fetch of `GET /internal/runs/:id/runspec` (the
 * api authors it from server-side facts — the harness already holds `API_INTERNAL_URL` + the run token, and no
 * large spec is mounted as a Secret). A `RUN_SPEC_FILE` env, if set, is the offline/fallback path (a mounted
 * file). Exactly one applies; the fetch is the live path.
 */
export async function fetchRunSpec(args: { apiBaseUrl: string; runId: string; runToken: string }): Promise<HarnessRunSpec> {
  const url = `${args.apiBaseUrl.replace(/\/$/, "")}/internal/runs/${args.runId}/runspec`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${args.runToken}` } });
  if (!res.ok) throw new Error(`harness: run spec fetch failed ${res.status} for run ${args.runId}`);
  return (await res.json()) as HarnessRunSpec;
}

export async function main(): Promise<void> {
  const { readFile, writeFile, mkdir } = await import("node:fs/promises");
  const { spawn } = await import("node:child_process");
  const { createFetchEventTransport } = await import("./event-transport.js");
  const { createHookDaemon } = await import("./hook-daemon.js");
  const { createGcsContentStore } = await import("@rhema/mirror");
  const { materializeWork, nodeWorkFs } = await import("./materialize-work.js");
  const { readWorkDir } = await import("./work-reader.js");

  const runId = reqEnv("RUN_ID");
  const workspaceId = reqEnv("WORKSPACE_ID");
  const apiBaseUrl = reqEnv("API_INTERNAL_URL");
  const proxyBaseUrl = reqEnv("ANTHROPIC_BASE_URL");
  const objectsBucket = reqEnv("OBJECTS_BUCKET");
  const configDir = reqEnv("CLAUDE_CONFIG_DIR");
  const workDir = process.env.WORK_DIR ?? "/work";
  // The agent's cwd is the materialized work root: `materializeWork` writes the manifest's paths at `<workDir>/…`
  // (e.g. /work/drafts/v1.md, /work/manifest.md) — there is NO `project` subdir, so the old `<workDir>/project`
  // default did not exist and `spawn` failed ENOENT (Node reports a missing cwd as an ENOENT on the command —
  // the D-P0.15e-2 blocker surfaced live in P0.15f). The loop harvests the agent's output from this same cwd.
  const cwd = process.env.AGENT_CWD ?? workDir;
  const hookSocketPath = process.env.HOOK_SOCKET_PATH ?? `${configDir}/hook.sock`;
  const agentUid = Number(process.env.AGENT_UID ?? 10002);
  const agentGid = Number(process.env.AGENT_GID ?? 10002);

  // the token (harness-only 0400 file) — the ONLY holder of it is this uid `harness` process (the api client
  // below + the event transport). It never crosses into the agent process (REQ-SPEC-10/11).
  const runToken = (await readFile(reqEnv("RUN_TOKEN_FILE"), "utf8")).trim();
  const contentStore = await createGcsContentStore({ bucketName: objectsBucket, workspaceId });
  const client = createHarnessApiClient({ apiBaseUrl, runId, runToken });

  /**
   * Run ONE phase in the pod (the loop's `runPhase` seam): materialize `/work` from the spec's manifest, write
   * the agent's phase spec (folding any guided-retry guidance into its inputs), start the hook daemon, launch
   * the SDK as uid `agent` (forwarding its fd-3 events to the api with the token), wait for it to exit, then
   * read `/work` into the `PhaseRunOutputs` the loop judges + commits. The workDir/cwd/manifest path convention
   * is reconciled against real agent output in the live re-run (Stage B).
   */
  const runOnePhaseInPod = async (spec: HarnessRunSpec, opts: { guidance?: string }): Promise<PhaseRunOutputs> => {
    const serverFiles = new Map(Object.entries(spec.serverFiles ?? {}).map(([p, s]) => [p, Buffer.from(s, "utf8")]));
    await materializeWork({ workDir, manifest: spec.manifest, contentStore, serverFiles, fs: nodeWorkFs });

    await mkdir(cwd, { recursive: true }); // the agent's cwd must exist or `spawn` fails ENOENT (see cwd note above)
    await mkdir(configDir, { recursive: true });
    const request = opts.guidance
      ? { ...spec.request, inputs: { ...spec.request.inputs, guidance: opts.guidance } }
      : spec.request;
    const agentSpec: AgentPhaseSpec = {
      request,
      skillsDir: spec.skillsDir,
      hookSocketPath,
      ...(spec.tier ? { tier: spec.tier } : {}),
    };
    await writeFile(`${configDir}/${PHASE_SPEC_FILENAME}`, JSON.stringify(agentSpec), "utf8");

    // the daemon holds the audit writer; the agent asks it for allow/deny and learns nothing else (§12.6). The
    // policy is server-authored (REQ-ARCH-17): the api ships JSON-safe compile inputs; the harness compiles the
    // live SeatPolicy here with the SAME @rhema/hooks code + a fresh per-phase DenialState.
    const policy = compileSeatPolicy(spec.hookPolicyInput as unknown as CompileInput);
    const hookDaemon = await createHookDaemon({ socketPath: hookSocketPath, policy, state: newDenialState() });

    try {
      // ABSOLUTE node path (process.execPath) — the scrubbed agent env has no PATH, so setpriv cannot resolve a
      // bare `node` after the uid drop (bare `node`/`setpriv` → `spawn … ENOENT`, the D-P0.15e-2 root cause).
      const launch = buildAgentLaunch({ runId, proxyBaseUrl, configDir, agentUid, agentGid, cwd, command: [process.execPath, "/app/dist/agent-entry.js"] });
      const child = spawn(launch.argv[0]!, launch.argv.slice(1), {
        cwd: launch.cwd,
        env: launch.env,
        stdio: ["ignore", "inherit", "inherit", "pipe"], // fd 3 = the agent's event channel
      });
      // forward the agent's events to the api WITH the token (the agent never held it).
      const transport: EventTransport = createFetchEventTransport({ baseUrl: apiBaseUrl, runId, runToken });
      const events = new EventBufferClient(transport, new FileBufferStore(`${configDir}/events.spool`));
      const eventFd = child.stdio[3] as AsyncIterable<Buffer> | null;
      const forwarding = eventFd ? forwardAgentEvents(toLines(eventFd), events) : Promise.resolve();
      const code: number = await new Promise((resolve) => child.on("exit", (c) => resolve(c ?? 0)));
      await forwarding;
      console.log(`[harness] phase ${spec.request.phase.key} agent exited ${code} for run ${runId}`);
    } finally {
      await hookDaemon.close();
    }

    const files = await readWorkDir(cwd);
    return buildPhaseOutputs(files, spec, spec.request.seat as AgentTypeKey);
  };

  // drive the run phase-by-phase to a terminal outcome (§12.4 steps 6–8).
  const result = await runCommitLoop({ client, runPhase: runOnePhaseInPod, workspaceId });
  console.log(`[harness] run ${runId} loop finished: ${result.kind} (${result.phasesCommitted} phase(s) committed)`);
  process.exit(result.kind === "failed" ? 1 : 0);
}

// Run when invoked as the image entrypoint's harness supervisor (`node dist/harness-main.js`), not on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    console.error("[harness] failed:", err);
    process.exit(1);
  });
}
