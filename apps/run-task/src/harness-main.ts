// @rhema/run-task — the HARNESS supervisor (uid `harness`; §12.4 step 4, REQ-SPEC-10/11). This is the process
// the image's pure-argv ENTRYPOINT runs (dumb-init → setpriv → this, as uid harness with the ambient four-cap
// set — SEC.3; the shell entrypoint is gone). It is the
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

import { compileSeatPolicy, newDenialState, resolveSeatRoots, type CompileInput } from "@rhema/hooks";
import { stageSkills } from "./skills-staging.js";
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
  // SEC.3 — the direct identity line (D-P0.15f-1 / D-P1.22-2(a)): real uid/gid + the ambient capability
  // summary, printed before anything else so a pod log proves the two-uid split without inference. Ids +
  // cap names only — never a secret, env value, or path content.
  {
    const { identityLine } = await import("./identity.js");
    console.log(identityLine("harness"));
  }
/** Ship one buffered audit batch to the internal API (run-token auth). A non-2xx throws so the buffered
 *  writer restores its rows for the next flush — append-only, never silently dropped. */
async function postAudit(args: {
  apiBaseUrl: string;
  runId: string;
  runToken: string;
  rows: { access?: readonly unknown[]; fetch?: readonly unknown[] };
}): Promise<void> {
  const url = `${args.apiBaseUrl.replace(/\/$/, "")}/internal/runs/${args.runId}/audit`;
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${args.runToken}`, "content-type": "application/json" },
    body: JSON.stringify(args.rows),
  });
  if (!res.ok) throw new Error(`harness: audit ship failed ${res.status} for run ${args.runId}`);
}

  const { readFile, writeFile, mkdir, chmod } = await import("node:fs/promises");

  /**
   * Make the agent's writable work tree agent-writable (residue 1, diagnosed live P0.15h). materializeWork
   * (uid harness, 10001) creates the seat's namespace directories (`agents/<seat>/**`) 0755 and its readwrite
   * files 0644 — all harness-owned. The agent (uid 10002) therefore gets EACCES creating its declared artifacts
   * inside `agents/editor/` (the live symptom: the agent wrote a `_write_test` probe at the 0777 project ROOT,
   * then reported the phase `blocked` because `agents/editor/00-piece-brief.md` could not be written). chmod'ing
   * only the project root (below) is not enough — the NESTED writable dirs must be world-writable too. The walk
   * (`makeTreeAgentWritable`, work-perms.ts) sets every DIRECTORY → 0777, every non-0444 FILE → 0666 — and,
   * since the DEF.1 Stage-B live finding (persona root stayed 0755 → all persona_root writes EACCES'd despite
   * hook allows), the walked ROOT dir itself too. Read-only mounts (0444) are left untouched, so this widens
   * only the writable set — the boundary stays the proxy + uid split + §12.6 hook.
   */
  const { spawn } = await import("node:child_process");
  const { createFetchEventTransport } = await import("./event-transport.js");
  const { createHookDaemon } = await import("./hook-daemon.js");
  const { createGcsContentStore } = await import("@rhema/mirror");
  const { materializeWork, nodeWorkFs } = await import("./materialize-work.js");
  const { readWorkRoots } = await import("./work-reader.js");
  const { makeTreeAgentWritable, nodePermFs } = await import("./work-perms.js");
  const { startCredentialInjector } = await import("./credential-injector.js");
  const makeWritable = (dir: string) => makeTreeAgentWritable(dir, nodePermFs);

  const runId = reqEnv("RUN_ID");
  const workspaceId = reqEnv("WORKSPACE_ID");
  const apiBaseUrl = reqEnv("API_INTERNAL_URL");
  const egressProxyBaseUrl = reqEnv("ANTHROPIC_BASE_URL");
  const objectsBucket = reqEnv("OBJECTS_BUCKET");
  const configDir = reqEnv("CLAUDE_CONFIG_DIR");
  const hookSocketPath = process.env.HOOK_SOCKET_PATH ?? `${configDir}/hook.sock`;
  const agentUid = Number(process.env.AGENT_UID ?? 10002);
  const agentGid = Number(process.env.AGENT_GID ?? 10002);

  // the token + the proxy credential (harness-only 0400/0440 files) — the ONLY holder of them is this uid
  // `harness` process. Neither ever crosses into the agent process (REQ-SPEC-10/11): the token authenticates
  // the internal-API client + event transport; the credential is stamped by the injector below.
  const runToken = (await readFile(reqEnv("RUN_TOKEN_FILE"), "utf8")).trim();
  const proxyCredential = (await readFile(reqEnv("PROXY_CREDENTIAL_FILE"), "utf8")).trim();
  const contentStore = await createGcsContentStore({ bucketName: objectsBucket, workspaceId });
  const client = createHarnessApiClient({ apiBaseUrl, runId, runToken });

  // D-P0.15f-2: start the harness-side credential injector on loopback and point the AGENT at IT (not the
  // egress-proxy). The injector — running in THIS uid `harness` process — stamps `x-rhema-proxy-credential`
  // on every request and forwards to the egress-proxy; the agent's scrubbed env carries only this loopback URL
  // and never the credential, so a credential-less shell-escape request straight to the egress-proxy 403s.
  // RES.1 (REQ-SPEC-31(2)) — the research floor's phase stamp. The injector reads `currentPhaseClass` per
  // request; `runOnePhaseInPod` sets it from the server-authored manifest `phaseClass` at each phase start,
  // so a `research`-class phase's traffic (its seat AND all its subagents — everything egresses through the
  // injector) alone may draw the reserved floor share.
  // RPT.1 (§14.5 Level 4) — `currentStepKey` is the same per-phase stamp for usage attribution: the proxy
  // folds it into `usage_records.step_id`, so the report's per-request drill-down names the phase that
  // burned it (the seat AND its subagents all egress through this one injector).
  let currentPhaseClass: string | undefined;
  let currentStepKey: string | undefined;
  const injector = await startCredentialInjector({
    credential: proxyCredential,
    upstreamBaseUrl: egressProxyBaseUrl,
    phaseClass: () => currentPhaseClass,
    stepKey: () => currentStepKey,
  });
  const agentProxyBaseUrl = injector.url;
  console.log(`[harness] credential injector listening at ${agentProxyBaseUrl} → ${egressProxyBaseUrl} for run ${runId}`);

  /**
   * Run ONE phase in the pod (the loop's `runPhase` seam): materialize `/work` from the spec's manifest, write
   * the agent's phase spec (folding any guided-retry guidance into its inputs), start the hook daemon, launch
   * the SDK as uid `agent` (forwarding its fd-3 events to the api with the token), wait for it to exit, then
   * read `/work` into the `PhaseRunOutputs` the loop judges + commits. The `/work` layout is reconciled (F3):
   * entries materialize under their mount root and the agent runs in `request.cwd` = `roots.project`.
   */
  const runOnePhaseInPod = async (
    spec: HarnessRunSpec,
    opts: { guidance?: string; phaseClass?: string },
  ): Promise<PhaseRunOutputs> => {
    // RES.1 — stamp this phase's class on every egress request for the duration of the phase (the injector
    // reads `currentPhaseClass` live; the agent cannot forge it — see credential-injector).
    // RPT.1 — `currentStepKey` stamps `x-rhema-step: step:<key>` the same way (Level-4 attribution).
    // CITE.1 — `opts.phaseClass` overrides the stamp ("backfill" for the pre-delivery re-entry — ADR-085);
    // the step attribution stays the phase's own key.
    currentPhaseClass = opts.phaseClass ?? spec.request.phase.phaseClass;
    currentStepKey = spec.request.phase.key;
    const serverFiles = new Map(Object.entries(spec.serverFiles ?? {}).map(([p, s]) => [p, Buffer.from(s, "utf8")]));
    // Reconciled /work layout (F3): materialize each manifest entry under its mount root, using the SAME roots
    // the §12.6 hook compiles against (`resolveSeatRoots`) — so a `project` entry lands at `/work/project/…`
    // where the hook expects to find it (the draft read is ALLOWed, not denied) and where the SDK cwd points.
    const roots = resolveSeatRoots({ roots: spec.hookPolicyInput.roots, personaId: spec.hookPolicyInput.personaId });
    await materializeWork({ roots, manifest: spec.manifest, contentStore, serverFiles, fs: nodeWorkFs });

    const cwd = spec.request.cwd;
    await mkdir(cwd, { recursive: true });

    // DEF.1 / D-P0.15h-5 — an input-scoped producer phase (today: the review `second_read`): the server
    // minted + recorded the launch (`subagent_launches`); the phase IS the scoped query — a private mount
    // namespace holding `launch.files` only, `tools:["Read"]`, a distinct uid, no seat agent at all. The
    // harness persists the query's text answer as the phase artifact and stamps the producer marker, so
    // `second_read_producer_checked` can only pass against an executed launch order (never a model claim).
    if (spec.scopedLaunch) {
      const { runScopedPhase } = await import("./scoped-phase.js");
      const { spawn: spawnSync } = await import("node:child_process");
      // report the scoped launch on the §12.5 stream (user-visible; the `subagent_launches` attestation
      // row is recorded server-side when the runspec is built — the harness only emits the event pair).
      const transport: EventTransport = createFetchEventTransport({ baseUrl: apiBaseUrl, runId, runToken });
      const events = new EventBufferClient(transport, new FileBufferStore(`${configDir}/events.spool`));
      await events
        .enqueue({ type: "subagent.started", payload: { label: spec.scopedLaunch.role, inputs: "explicit_files", fileCount: spec.scopedLaunch.files.length, model: spec.scopedLaunch.model }, agentLabel: spec.scopedLaunch.role })
        .catch(() => undefined);
      await events.flush().catch(() => undefined);

      await runScopedPhase(
        spec,
        {
          launch: spec.scopedLaunch,
          projectDir: cwd,
          configDir,
          proxyBaseUrl: agentProxyBaseUrl,
          runId,
          agentUid,
          // DEF.4 (BL-11(b)) — a guided retry's predicate-failure text reaches the scoped query
          // appended to its prompt. The non-scoped merge below writes `inputs.guidance`; a scoped
          // launch has no inputs to merge into, and the mount set stays exactly `launch.files`.
          ...(opts.guidance !== undefined ? { guidance: opts.guidance } : {}),
        },
        {
          log: console.log,
          mkdir: (p) => mkdir(p, { recursive: true }).then(() => undefined),
          writeFile: (p, d) => writeFile(p, d),
          spawnCollect: (argv, env) =>
            new Promise((resolve, reject) => {
              const child = spawnSync(argv[0]!, argv.slice(1), { env });
              let stdout = "";
              let stderr = "";
              child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
              child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
              child.on("error", reject);
              child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
            }),
        },
      );
      await events
        .enqueue({ type: "subagent.finished", payload: { label: spec.scopedLaunch.role, fileCount: spec.scopedLaunch.files.length }, agentLabel: spec.scopedLaunch.role })
        .catch(() => undefined);
      await events.flush().catch(() => undefined);

      const files = await readWorkRoots(cwd, roots.persona);
      const outputs = buildPhaseOutputs(files, spec, spec.request.seat as AgentTypeKey);
      console.log(`[harness] phase ${spec.request.phase.key} /work files: ${[...files.keys()].sort().join(", ") || "(none)"}`);
      console.log(`[harness] phase ${spec.request.phase.key} outputs: subtype=${outputs.subtype} versions=${outputs.versions.length} facts=${JSON.stringify(outputs.facts)} phaseResult=${JSON.stringify(outputs.phaseResult)}`);
      return outputs;
    }

    // The agent runs (and the SDK CLI is spawned) in `request.cwd` = `roots.project` (`/work/project`): the
    // project files now live there, the agent writes its outputs + `.rhema/agent-result.json` there, and the
    // loop harvests from the same dir. It MUST exist or `spawn` fails ENOENT (the D-P0.15e-2 symptom). `cwd`
    // was mkdir'd above (the scoped-launch branch uses it too).
    // The agent (uid `agent`, 10002) runs in `cwd` and must create its OUTPUT tree there — `.rhema/agent-result.json`
    // + `.rhema/phase-result.json` + the seat's writable namespaces (`agents/<seat>/**`). `cwd` and its parents were
    // created by the harness (uid `harness`, 10001) during materialize, so they are harness-owned and the agent
    // cannot write into them (live: `EACCES mkdir /work/project/.rhema` AFTER a successful model phase). The harness
    // is non-root (no CAP_CHOWN) so it cannot chown to the agent uid; instead make the writable roots world-writable
    // (0777). The mounted INPUT files stay 0444 (materializeWork), so this widens only the dirs, not the read set —
    // the boundary remains the proxy + uid split + the §12.6 hook, never the /work perms.
    await chmod(cwd, 0o777);
    const workRoot = roots.project.replace(/\/[^/]+\/?$/, "") || "/work"; // e.g. /work (parent of /work/project)
    await chmod(workRoot, 0o777).catch(() => undefined); // best-effort: the agent must traverse+write scratch here too
    // Recurse into the writable tree so the NESTED seat namespace (`agents/<seat>/**`) is agent-writable too —
    // chmod'ing only the root left `agents/editor/` harness-owned 0755, so the agent could not create its
    // declared artifacts there (residue 1, live P0.15h). Read-only mounts stay 0444.
    await makeWritable(cwd);
    // PRB.16b F27 — the persona root needs the same treatment: a persona_builder's `profile/**` mount is
    // `readwrite` in §12.6 but the dir is harness-owned 0755, so the agent gets EACCES on its CANONICAL
    // mount and falls back to `/work/project` (live: Quick Voice 01M2T65W… att-5's committed phase-result
    // reported exactly this). DEF.1 Stage-B sharpened the fix live (profile_voice 01M3E42J…): the walk
    // chmod'ed only the root's CONTENTS, so `/work/personas/<id>` itself stayed harness-owned 0755 and the
    // agent's `.rhema/phase-result.json`/`profile/**` writes still EACCES'd despite hook allows — the
    // extracted walk now chmods the walked root too (work-perms.ts). It keeps 0444 mounts
    // (PERSONA.md, docs/**) read-only.
    if (roots.persona) await makeWritable(roots.persona);
    await mkdir(configDir, { recursive: true });
    // Stage the baked skills into a CLI-discoverable location so `/editorial-review` resolves (F2). The engine
    // then enables them with `skills: "all"`; the harness (not the agent) does the filesystem staging.
    await stageSkills({ skillsDir: spec.skillsDir, configDir });
    // PRB.16b F16 — MERGE the guided-retry text with any guidance the runspec already delivered
    // (standing / run-scope §6.5 records land in `inputs.guidance` server-side); overwriting it here
    // would silently drop the human's authoritative rows note exactly on the retry that needs it.
    const request = opts.guidance
      ? {
          ...spec.request,
          inputs: {
            ...spec.request.inputs,
            guidance:
              typeof spec.request.inputs.guidance === "string" && spec.request.inputs.guidance.length > 0
                ? `${spec.request.inputs.guidance}\n${opts.guidance}`
                : opts.guidance,
          },
        }
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
    // The staged skills dir (`<configDir>/skills`) is harness-side env state the server never sees, so
    // the `config` root is injected here at compile time — it grants read on the symlink dir itself
    // (reads through a link realpath to `/app/skills` and classify under the skills root either way).
    const policy = compileSeatPolicy({
      ...(spec.hookPolicyInput as unknown as CompileInput),
      roots: {
        ...spec.hookPolicyInput.roots,
        config: `${configDir}/skills`,
      },
    } as CompileInput);
    // REQ-ARCH-18 / REQ-DATA-16: the §12.6 audit sink — the daemon writes every allow/deny + fetch row into a
    // buffered writer that ships to `POST /internal/runs/:id/audit` (run-token auth, fenced, append-only). The
    // sink lives harness-side: nothing but the allow/deny decision crosses the agent socket. Rows ship on a
    // full buffer and at each phase's daemon close.
    const { createBufferedAuditWriter } = await import("@rhema/hooks");
    const auditTransport = {
      sendAccess: async (rows: readonly import("@rhema/hooks").AccessLogRow[]) =>
        postAudit({ apiBaseUrl, runId, runToken, rows: { access: rows } }),
      sendFetch: async (rows: readonly import("@rhema/hooks").FetchLogRow[]) =>
        postAudit({ apiBaseUrl, runId, runToken, rows: { fetch: rows } }),
    };
    const audit = createBufferedAuditWriter(auditTransport);
    const hookDaemon = await createHookDaemon({ socketPath: hookSocketPath, policy, state: newDenialState(), audit });

    try {
      // ABSOLUTE node path (process.execPath) — the scrubbed agent env has no PATH, so setpriv cannot resolve a
      // bare `node` after the uid drop (bare `node`/`setpriv` → `spawn … ENOENT`, the D-P0.15e-2 root cause).
      const launch = buildAgentLaunch({ runId, proxyBaseUrl: agentProxyBaseUrl, configDir, agentUid, agentGid, cwd, command: [process.execPath, "/app/dist/agent-entry.js"] });
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

    // PRB.16b F22 — read BOTH roots: a persona-builder phase's declared outputs live under
    // `roots.persona` (`/work/personas/<id>/profile/**`), which a cwd-only walk never saw.
    const files = await readWorkRoots(cwd, roots.persona);
    const outputs = buildPhaseOutputs(files, spec, spec.request.seat as AgentTypeKey);
    // DIAGNOSTIC (K5 / D-P0.06-1, the first live SDK exercise): dump what the agent actually produced in /work vs
    // what the completion oracle judged, so the intake predicate can be reconciled against real skill output.
    console.log(`[harness] phase ${spec.request.phase.key} /work files: ${[...files.keys()].sort().join(", ") || "(none)"}`);
    console.log(`[harness] phase ${spec.request.phase.key} outputs: subtype=${outputs.subtype} versions=${outputs.versions.length} facts=${JSON.stringify(outputs.facts)} phaseResult=${JSON.stringify(outputs.phaseResult)}`);
    return outputs;
  };

  // drive the run phase-by-phase to a terminal outcome (§12.4 steps 6–8); always tear the injector down after.
  // RES.1 — the preflight seam probes the run's OWN egress-proxy (not the injector loopback: the injector
  // is the agent's path; the harness's probe rides the real upstream with the credential it holds).
  const { runResearchPreflight } = await import("./research-preflight.js");
  let result;
  try {
    result = await runCommitLoop({
      client,
      runPhase: runOnePhaseInPod,
      workspaceId,
      preflight: (spec) =>
        runResearchPreflight({ baseUrl: egressProxyBaseUrl, credential: proxyCredential, spec }),
    });
  } finally {
    await injector.close();
  }
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
