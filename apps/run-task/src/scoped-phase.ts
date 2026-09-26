// @rhema/run-task — the §12.6 INPUT-SCOPED producer phase runner (DEF.1 / D-P0.15h-5).
//
// A phase whose manifest declares `second_read_producer_checked` is produced by an orchestrator-
// launched scoped query, never by the seat agent (the hook denies `Agent` in the judge-class phase —
// that deny is the correct boundary, kept). This module is the harness half of the launch order the
// server ships on `HarnessRunSpec.scopedLaunch`:
//
//   1. `buildScopedPhasePlan` assembles the `unshare`/`scoped-runner.sh` launch spec
//      (`@rhema/engine` `buildScopedLaunchSpec`) + the query block the runner hands `scoped-query.js`;
//   2. `runScopedPhase` spawns the unshared runner (injected for tests), captures the scoped query's
//      result JSON on stdout, and writes the produced artifact + the `.rhema/second-read.json` marker
//      + `.rhema/agent-result.json` + `.rhema/phase-result.json` into `/work` itself — the scoped query
//      has NO Write tool (it returns text), so the HARNESS (uid `harness`, not the seat) persists the
//      output. The marker's `producerQueryId`/`expectedProducerQueryId` are therefore honest: both are
//      the server-minted id of the launch this process actually executed, matching the
//      `subagent_launches` row the delivery producer check reads.
//
// No run token / proxy credential crosses into the spawned env — the scoped process gets the same
// scrubbed key set as a seat agent (REQ-SPEC-10/11), pointed at the harness's loopback injector.

import { buildScopedLaunchSpec, PROXY_PLACEHOLDER_ANTHROPIC_API_KEY } from "@rhema/engine";
import type { HarnessRunSpec, ScopedPhaseLaunch } from "@rhema/orchestrator";

/** The runner script baked into the run-task image (`apps/run-task/Dockerfile` COPYs it to /app). */
export const SCOPED_RUNNER = "/app/scoped-runner.sh";

/** The result JSON `scoped-query.js` prints on stdout (the only channel that crosses the namespace). */
export interface ScopedQueryResult {
  readonly text: string;
  readonly subtype: string;
  readonly usage?: Record<string, number>;
}

/** The spawn seam — prod: `child_process.spawn`; tests inject a fake returning a canned result. */
export type ScopedSpawn = (
  argv: readonly string[],
  env: Record<string, string>,
) => Promise<{ readonly code: number; readonly stdout: string; readonly stderr: string }>;

export interface ScopedPhaseDeps {
  readonly spawnCollect: ScopedSpawn;
  readonly writeFile: (path: string, data: string | Uint8Array) => Promise<void>;
  readonly mkdir: (path: string) => Promise<void>;
  readonly log?: (line: string) => void;
}

export interface ScopedPhaseArgs {
  /** the server's launch order (`HarnessRunSpec.scopedLaunch`). */
  readonly launch: ScopedPhaseLaunch;
  /** the project root (`/work/project`) — the path every relative output resolves against. */
  readonly projectDir: string;
  /** the harness config dir (tmpfs) the spec JSON is written under. */
  readonly configDir: string;
  /** the harness's loopback credential-injector URL (the ONLY egress the scoped query gets). */
  readonly proxyBaseUrl: string;
  readonly runId: string;
  /** the seat `agent` uid — the scoped query runs at `agentUid + roleOffset` (§12.6 distinct uid). */
  readonly agentUid: number;
  /** where the runner script lives in the image (default `/app/scoped-runner.sh`). */
  readonly runnerScript?: string;
}

export interface ScopedPhaseOutcome {
  readonly subtype: string;
  readonly produced: boolean;
}

/** The serialized spec file `scoped-runner.sh` + `scoped-query.js` consume. */
export interface ScopedQueryFile {
  readonly query: {
    readonly prompt: string;
    readonly model: string;
    readonly maxBudgetUsd: number;
    readonly maxTurns: number;
  };
}

/**
 * Assemble the launch spec + the spec-file payload for the launch order. `files` are already absolute
 * (the server resolved them against the seat roots); `buildScopedLaunchSpec` builds the private-mount
 * plan + the `unshare` argv; `runnerArgv` binds the spec file path the runner applies the plan to.
 */
export function buildScopedPhasePlan(
  launch: ScopedPhaseLaunch,
  args: { agentUid: number; specPath: string; runnerScript?: string },
): { readonly unshareArgv: readonly string[]; readonly specJson: string } {
  const scoped = buildScopedLaunchSpec({
    role: launch.role,
    // the enumerated files ARE the launch order's file set — the engine's per-role enumeration is
    // re-run here so the spec records `inputs.draft` against exactly the file it mounts.
    inputs: launch.role === "second-reader" ? { draft: launch.files[0] } : {},
    agentUid: args.agentUid,
    producerQueryId: launch.producerQueryId,
    runnerArgv: [args.runnerScript ?? SCOPED_RUNNER, args.specPath],
    // the pod rootfs is read-only and `/run` holds only the read-only secrets mount — the default
    // `/run/scoped-stash` would EROFS. `/tmp` is the fsGroup-writable emptyDir and sits OUTSIDE the
    // `/work` overmount, so the stashed binds survive it (they are what the scoped root re-binds).
    stashDir: `/tmp/scoped-stash/${launch.role}`,
  });
  const specJson = JSON.stringify({
    ...scoped,
    query: {
      prompt: launch.prompt,
      model: launch.model,
      maxBudgetUsd: launch.maxBudgetUsd,
      maxTurns: launch.maxTurns,
    },
  } satisfies ScopedQueryFile & typeof scoped);
  return { unshareArgv: scoped.unshareArgv, specJson };
}

/**
 * The env the unshared RUNNER starts with (harness-side machinery — `unshare`/`scoped-runner.sh` run as
 * the harness uid and need PATH to resolve `node`/`mount`/`env`). The MODEL's process gets a strictly
 * scrubbed subset: `scoped-runner.sh` re-derives it with `env -i` at the uid drop, forwarding only the
 * REQ-SPEC-10 allowlist keys below (`ANTHROPIC_API_KEY` is the NON-SECRET placeholder the proxy strips —
 * never a real credential). No run token / api URL / credential is ever in scope.
 */
export function scopedRunnerEnv(args: { runId: string; proxyBaseUrl: string }): Record<string, string> {
  return {
    RUN_ID: args.runId,
    ANTHROPIC_BASE_URL: args.proxyBaseUrl,
    ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
    PATH: "/usr/local/bin:/usr/bin:/bin",
  };
}

/**
 * Execute one input-scoped phase: write the spec file, run the unshared scoped query, persist its
 * outputs into `/work` (the produced artifact, the producer marker, and the two control files the
 * oracle reads). On any launch/query failure the agent-result + a `blocked` phase-result still land,
 * so the commit loop reports the phase honestly instead of dying on a missing file.
 */
export async function runScopedPhase(
  spec: HarnessRunSpec,
  args: ScopedPhaseArgs,
  deps: ScopedPhaseDeps,
): Promise<ScopedPhaseOutcome> {
  const { launch } = args;
  const specPath = `${args.configDir}/scoped-spec.json`;
  const { unshareArgv, specJson } = buildScopedPhasePlan(launch, {
    agentUid: args.agentUid,
    specPath,
    runnerScript: args.runnerScript,
  });
  await deps.mkdir(args.configDir);
  await deps.writeFile(specPath, specJson);

  const env = scopedRunnerEnv({ runId: args.runId, proxyBaseUrl: args.proxyBaseUrl });
  const res = await deps.spawnCollect(unshareArgv, env);
  if (res.stderr.trim()) deps.log?.(`[scoped] stderr: ${res.stderr.trim().slice(0, 500)}`);

  let parsed: ScopedQueryResult | null = null;
  try {
    parsed = JSON.parse(res.stdout.trim()) as ScopedQueryResult;
  } catch {
    parsed = null;
  }
  const subtype = parsed?.subtype ?? "error_during_execution";
  const text = parsed?.text?.trim() ?? "";
  const produced = res.code === 0 && subtype === "success" && text.length > 0;

  // the agent-result fact (oracle leg a + provisional usage) — same shape agent-entry writes.
  await deps.mkdir(`${args.projectDir}/.rhema`);
  await deps.writeFile(
    `${args.projectDir}/.rhema/agent-result.json`,
    JSON.stringify({ subtype, usage: parsed?.usage ?? {} }),
  );

  if (produced) {
    const artifactAbs = `${args.projectDir}/${launch.outputPath}`;
    await deps.mkdir(artifactAbs.slice(0, artifactAbs.lastIndexOf("/")));
    await deps.writeFile(artifactAbs, text);
    const markerAbs = `${args.projectDir}/${launch.markerPath}`;
    await deps.mkdir(markerAbs.slice(0, markerAbs.lastIndexOf("/")));
    // the marker the `second_read_producer_checked` fact reader + the delivery dossier read —
    // producerQueryId === expectedProducerQueryId === the orchestrator-minted launch id.
    await deps.writeFile(
      markerAbs,
      JSON.stringify({
        producerQueryId: launch.producerQueryId,
        expectedProducerQueryId: launch.producerQueryId,
      }),
    );
  }
  await deps.writeFile(
    `${args.projectDir}/.rhema/phase-result.json`,
    JSON.stringify({
      status: produced ? "done" : "blocked",
      phase: spec.request.phase.skillPhase,
      ...(produced ? { output: launch.outputPath } : {}),
      ...(produced ? {} : { note: `input-scoped ${launch.role} query failed (subtype=${subtype}, exit=${res.code})` }),
    }),
  );
  deps.log?.(
    `[scoped] ${launch.role} → ${subtype} (exit ${res.code}); ` +
      `${produced ? `produced ${launch.outputPath} (${text.length} chars)` : "no output — phase-result blocked"}`,
  );
  return { subtype, produced };
}
