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
// unit-tested; `main()` is the deploy wiring (needs the live image + api/proxy).

import { compileSeatPolicy, newDenialState, type CompileInput } from "@rhema/hooks";
import type { OutboundEvent, EventTransport } from "./event-buffer.js";
import { EventBufferClient, FileBufferStore } from "./event-buffer.js";
import { buildAgentLaunch } from "./bootstrap.js";
import { PHASE_SPEC_FILENAME, type AgentPhaseSpec } from "./agent-entry.js";

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
 * The server-authored run spec the harness executes (D-P0.15c-6). Structurally the api's `@rhema/orchestrator`
 * `HarnessRunSpec` — the harness fetches it as JSON and NEVER constructs it (§12.6 "attestation derives only
 * from server-side facts"). It carries the §12.6 boundary policy as JSON-safe `hookPolicyInput` (a `CompileInput`
 * with `tools` as an array): the compiled `SeatPolicy` holds a `Set` and the `DenialState` a `Map`, neither of
 * which survives JSON, so the harness compiles the live policy locally with the same `@rhema/hooks` code + a
 * fresh `newDenialState()`. No secret is ever in the spec (REQ-SPEC-10/11).
 */
interface HarnessRunSpec {
  readonly request: AgentPhaseSpec["request"];
  readonly skillsDir: string;
  readonly tier?: AgentPhaseSpec["tier"];
  /** the server-generated hydration manifest + any derived server files (obligations.json, manifest.md). */
  readonly manifest: import("@rhema/mirror").MirrorManifest;
  readonly serverFiles?: Record<string, string>; // path -> utf8 bytes
  /** the §12.6 boundary policy inputs (JSON-safe); the harness compiles the live `SeatPolicy` from these. */
  readonly hookPolicyInput: CompileInput;
}

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

  const runId = reqEnv("RUN_ID");
  const workspaceId = reqEnv("WORKSPACE_ID");
  const apiBaseUrl = reqEnv("API_INTERNAL_URL");
  const proxyBaseUrl = reqEnv("ANTHROPIC_BASE_URL");
  const objectsBucket = reqEnv("OBJECTS_BUCKET");
  const configDir = reqEnv("CLAUDE_CONFIG_DIR");
  const workDir = process.env.WORK_DIR ?? "/work";
  const cwd = process.env.AGENT_CWD ?? `${workDir}/project`;
  const hookSocketPath = process.env.HOOK_SOCKET_PATH ?? `${configDir}/hook.sock`;
  const agentUid = Number(process.env.AGENT_UID ?? 10002);
  const agentGid = Number(process.env.AGENT_GID ?? 10002);

  // 1. the token (harness-only 0400 file) + the run spec. The spec is server-authored: fetch it token-authed
  //    from the api (the live path), or read a mounted RUN_SPEC_FILE if one was provided (offline/fallback).
  const runToken = (await readFile(reqEnv("RUN_TOKEN_FILE"), "utf8")).trim();
  const specFile = process.env.RUN_SPEC_FILE;
  const runSpec = specFile
    ? (JSON.parse(await readFile(specFile, "utf8")) as HarnessRunSpec)
    : await fetchRunSpec({ apiBaseUrl, runId, runToken });

  // 2. materialize /work from the server-generated manifest (read-only paths chmod 0444).
  const contentStore = await createGcsContentStore({ bucketName: objectsBucket, workspaceId });
  const serverFiles = new Map(Object.entries(runSpec.serverFiles ?? {}).map(([p, s]) => [p, Buffer.from(s, "utf8")]));
  await materializeWork({ workDir, manifest: runSpec.manifest, contentStore, serverFiles, fs: nodeWorkFs });

  // 3. write the agent's phase spec (no secrets) + start the hook daemon.
  await mkdir(configDir, { recursive: true });
  const agentSpec: AgentPhaseSpec = {
    request: runSpec.request,
    skillsDir: runSpec.skillsDir,
    hookSocketPath,
    ...(runSpec.tier ? { tier: runSpec.tier } : {}),
  };
  await writeFile(`${configDir}/${PHASE_SPEC_FILENAME}`, JSON.stringify(agentSpec), "utf8");
  // the daemon holds the token + audit writer; the agent asks it for allow/deny and learns nothing else (§12.6).
  // Policy is server-authored per-run data (REQ-ARCH-17): the api ships JSON-safe compile inputs; the harness
  // compiles the live SeatPolicy here with the SAME @rhema/hooks code + a fresh per-phase DenialState.
  const policy = compileSeatPolicy(runSpec.hookPolicyInput);
  const state = newDenialState();
  const hookDaemon = await createHookDaemon({ socketPath: hookSocketPath, policy, state });

  // 4. launch the SDK as uid `agent` (setpriv, scrubbed env). fd 3 is the event pipe back to the harness.
  const launch = buildAgentLaunch({
    runId,
    proxyBaseUrl,
    configDir,
    agentUid,
    agentGid,
    cwd,
    command: ["node", "/app/dist/agent-entry.js"],
  });
  const child = spawn(launch.argv[0]!, launch.argv.slice(1), {
    cwd: launch.cwd,
    env: launch.env,
    stdio: ["ignore", "inherit", "inherit", "pipe"], // fd 3 = the agent's event channel
  });

  // 5. forward the agent's events to the api WITH the token (the agent never held it).
  const transport: EventTransport = createFetchEventTransport({ baseUrl: apiBaseUrl, runId, runToken });
  const events = new EventBufferClient(transport, new FileBufferStore(`${configDir}/events.spool`));
  const eventFd = child.stdio[3] as AsyncIterable<Buffer> | null;
  const forwarding = eventFd ? forwardAgentEvents(toLines(eventFd), events) : Promise.resolve();

  const code: number = await new Promise((resolve) => child.on("exit", (c) => resolve(c ?? 0)));
  await forwarding;
  await hookDaemon.close();
  console.log(`[harness] agent exited ${code} for run ${runId}`);
  process.exit(code === 0 ? 0 : 1);
}

// Run when invoked as the image entrypoint's harness supervisor (`node dist/harness-main.js`), not on import.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err: unknown) => {
    console.error("[harness] failed:", err);
    process.exit(1);
  });
}
