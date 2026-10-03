// @rhema/run-task — the input-scoped subagent runner (SEC.3 TypeScript port of docker/scoped-runner.sh;
// §12.6; REQ-DATA-17/18). Executed inside a NEW private mount namespace at REAL uid 0 as the tail of the
// engine's `unshareArgv`:
//
//   unshare --mount --propagation private -- setpriv --reuid 0 --regid 0 --clear-groups --
//     <node> /app/dist/scoped-runner.js <spec.json>
//
// The ruid-0 wrap is load-bearing (F-StageB-6): util-linux `mount` gates on `getuid()` before mount(2), so
// the harness's ambient CAP_SYS_ADMIN is invisible to it. This runner still drops to the distinct scoped
// uid with --no-new-privs before the model's process execs — only this trusted setup code carries ruid 0.
//
// The plan (the serialized `ScopedLaunchSpec` + query block, written by runScopedPhase) is applied EXACTLY
// as the shell runner did — the same sequence the privsep self-test exercises:
//   1. stashBinds: ro-bind each enumerated file OUTSIDE the overmount target so it survives the overmount;
//   2. tmpfsArgv: overmount the seat tree (/work) with a FRESH tmpfs — every other-seat file now does not
//      exist in this namespace at the kernel (review 13 F13);
//   3. binds: ro-bind each stashed file into the scoped root — nothing else exists to read;
//   4. drop to the distinct scoped uid + exec the scoped query with cwd = rootDir and tools:["Read"]
//      (scoped-query.js); the query has no Write tool — its answer comes back on stdout.
//
// Shell-era notes that still hold:
//   • The spec file lives under the harness config dir (gid harness — the scoped uid may not traverse it),
//     so a COPY is staged inside the scoped root (0777 — the namespace's fresh tmpfs — the scoped uid's
//     ONLY writable area, doubling as its CLAUDE_CONFIG_DIR for SDK scratch).
//   • The model's process gets EXACTLY the scrubbed env allowlist (the `env -i` equivalent — spawnSync env
//     replaces the process env wholesale). `node` is invoked by absolute path (`process.execPath` — there
//     is no PATH in the scrubbed set; same convention as bootstrap.ts). HOME is the ONE addition vs the
//     seat allowlist: it points at the scoped root so os.homedir() resolves for the scoped uid and SDK
//     user-level writes land inside the jail (F-StageB-7).

import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { ALLOWED_AGENT_ENV_KEYS, PROXY_PLACEHOLDER_ANTHROPIC_API_KEY } from "@rhema/engine";

/** Absolute applet paths — the distroless image has no PATH to resolve a bare name once env is replaced. */
export const MOUNT_BIN = "/usr/bin/mount";
export const SETPRIV_BIN = "/usr/bin/setpriv";
export const SCOPED_QUERY = "/app/dist/scoped-query.js";
export const SCOPED_SPEC_BASENAME = ".scoped-spec.json";

/** The serialized spec file `runScopedPhase` writes and `scoped-query.js` also consumes. */
export interface ScopedRunnerSpecFile {
  readonly uid: number;
  readonly mountPlan: {
    readonly rootDir: string;
    readonly stashDir: string;
    readonly tmpfsArgv: readonly string[];
    readonly stashBinds: readonly { readonly dest: string; readonly argv: readonly string[] }[];
    readonly binds: readonly { readonly dest: string; readonly argv: readonly string[] }[];
  };
}

/**
 * The keys the scoped query's env may carry: the REQ-SPEC-10 allowlist verbatim, plus `HOME` scoped to the
 * writable root (F-StageB-7 — the vendored CLI's `uv_os_homedir` must resolve, and user-level writes must
 * land inside the jail). Anything outside this set throws before exec — the `env -i` equivalent, asserted.
 */
export const SCOPED_CHILD_ENV_KEYS: readonly string[] = [...ALLOWED_AGENT_ENV_KEYS, "HOME"];

/**
 * Build the model-side env — the shell runner's `env -i HOME=… RUN_ID=… ANTHROPIC_BASE_URL=…
 * ANTHROPIC_API_KEY=… CLAUDE_CONFIG_DIR=… CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 ENABLE_PROMPT_CACHING_1H=1
 * CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION=0` set, verbatim. Sources: the runner's own (harness-side,
 * already scrubbed) env for RUN_ID / ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY; `rootDir` for HOME +
 * CLAUDE_CONFIG_DIR. No token, no credential — assertScrubbed-level discipline, plus the HOME pin.
 */
export function scopedChildEnv(args: {
  readonly rootDir: string;
  readonly env: Record<string, string | undefined>;
}): Record<string, string> {
  const env: Record<string, string> = {
    HOME: args.rootDir,
    RUN_ID: required(args.env, "RUN_ID"),
    ANTHROPIC_BASE_URL: required(args.env, "ANTHROPIC_BASE_URL"),
    ANTHROPIC_API_KEY: required(args.env, "ANTHROPIC_API_KEY"),
    CLAUDE_CONFIG_DIR: args.rootDir,
    CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    ENABLE_PROMPT_CACHING_1H: "1",
    CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: "0",
  };
  assertScopedEnv(env);
  return env;
}

/** Belt to scopedChildEnv's braces: refuse to exec if the child env ever widens past the allowlist. */
export function assertScopedEnv(env: Record<string, string>): void {
  const allowed = new Set(SCOPED_CHILD_ENV_KEYS);
  for (const k of Object.keys(env)) {
    if (!allowed.has(k)) {
      throw new Error(`scoped child env carries a non-allowlisted key ${k} (REQ-SPEC-10)`);
    }
  }
  if (env.ANTHROPIC_API_KEY !== PROXY_PLACEHOLDER_ANTHROPIC_API_KEY) {
    throw new Error("scoped child env ANTHROPIC_API_KEY must be the proxy placeholder, never a real key");
  }
}

function required(env: Record<string, string | undefined>, key: string): string {
  const v = env[key];
  if (!v) throw new Error(`scoped-runner: missing env ${key} (the harness-side scopedRunnerEnv provides it)`);
  return v;
}

/**
 * The argv the runner execs at step 4 — the uid drop + the scoped query. `node` is the runner's own
 * executable (process.execPath): absolute, no PATH needed, and guaranteed present (the runner IS running
 * under it). Returns the argv WITHOUT the env — the env is the `scopedChildEnv` spawn option.
 */
export function scopedChildArgv(spec: ScopedRunnerSpecFile, nodeBin: string): readonly string[] {
  const { rootDir } = spec.mountPlan;
  return [
    SETPRIV_BIN,
    "--reuid",
    String(spec.uid),
    "--regid",
    String(spec.uid),
    "--clear-groups",
    // F-SEC3-2 — ambient caps survive execve of unmarked binaries, so without the explicit clear the
    // scoped model process would inherit whatever ambient/inheritable set arrived down the
    // unshare → ruid-0 wrap chain (including CAP_SETUID — a kernel path back to the harness uid).
    // The scoped query needs NO capability vector; nnp makes the empty set unregainable.
    "--inh-caps",
    "-all",
    "--ambient-caps",
    "-all",
    "--no-new-privs",
    "--",
    nodeBin,
    SCOPED_QUERY,
    `${rootDir}/${SCOPED_SPEC_BASENAME}`,
    "--cwd",
    rootDir,
  ];
}

/** The I/O seam — prod: node:fs + child_process; tests: a recording fake. */
export interface ScopedRunnerIo {
  /** read the serialized spec file (the test keeps the spec in-memory — no real fs touch). */
  readFile(path: string): string;
  mkdir(path: string): void;
  writeFile(path: string, data: string): void;
  chmod(path: string, mode: number): void;
  copyFile(from: string, to: string): void;
  /** exec a mount step verbatim (mount(8) from the spec argv); throws non-zero on failure. */
  execFile(file: string, args: readonly string[]): void;
  /** spawn the scoped query with the scrubbed env; returns its exit code. */
  spawn(file: string, args: readonly string[], env: Record<string, string>): number;
  /** the runner's own (harness-side, scrubbed) env the child values are read from. */
  env: Record<string, string | undefined>;
  /** the node binary the child execs (prod: process.execPath). */
  nodeBin: string;
}

const nodeIo = (): ScopedRunnerIo => ({
  readFile: (p) => readFileSync(p, "utf8"),
  mkdir: (p) => mkdirSync(p, { recursive: true }),
  writeFile: (p, d) => writeFileSync(p, d),
  chmod: (p, m) => chmodSync(p, m),
  copyFile: (a, b) => copyFileSync(a, b),
  execFile: (f, a) => void execFileSync(f, [...a], { stdio: ["ignore", "inherit", "inherit"] }),
  spawn: (f, a, env) => spawnSync(f, [...a], { env, stdio: "inherit" }).status ?? 1,
  env: process.env,
  nodeBin: process.execPath,
});

/**
 * Steps 1–3 of the runner — the mount-plan application, shared verbatim with the production-image
 * privsep self-test's namespace body (privsep-ns-body.ts): the kernel legs exercise THIS code path,
 * not a re-typed copy. Stash (outside the overmount target) → tmpfs overmount → scoped root → ro-bind
 * the enumerated files only.
 */
export function applyMountPlan(spec: ScopedRunnerSpecFile, io: ScopedRunnerIo): void {
  const { rootDir, stashDir } = spec.mountPlan;

  io.mkdir(stashDir); // the stash lives OUTSIDE the overmount target (default /tmp/scoped-stash/<role>)
  // 1) stash the enumerated files (ro binds) — they survive the /work overmount below.
  for (const b of spec.mountPlan.stashBinds) {
    io.mkdir(dirname(b.dest));
    io.writeFile(b.dest, ""); // bind-mount targets must exist
    io.execFile(b.argv[0]!, b.argv.slice(1));
  }
  // 2) overmount the seat tree with a fresh tmpfs — every other-seat file vanishes at the kernel.
  io.execFile(spec.mountPlan.tmpfsArgv[0]!, spec.mountPlan.tmpfsArgv.slice(1));
  io.mkdir(rootDir);
  io.chmod(rootDir, 0o777); // the scoped uid's one writable area (its CLAUDE_CONFIG_DIR)
  // 3) ro-bind ONLY the enumerated files into the scoped root — nothing else exists to read.
  for (const b of spec.mountPlan.binds) {
    io.mkdir(dirname(b.dest));
    io.writeFile(b.dest, "");
    io.execFile(b.argv[0]!, b.argv.slice(1));
  }
}

/**
 * Apply the mount plan inside the private namespace and exec the scoped query. Steps 1–3 are a faithful
 * port of the shell runner's sequence — stash (outside the overmount target) → tmpfs overmount → ro-bind
 * into the scoped root → stage the spec copy — then step 4 drops to the distinct scoped uid.
 */
export function runScopedRunner(specPath: string, io: ScopedRunnerIo): number {
  const spec = JSON.parse(io.readFile(specPath)) as ScopedRunnerSpecFile;
  const { rootDir } = spec.mountPlan;

  applyMountPlan(spec, io);

  // 3b) the scoped uid reads the spec HERE (/config is gid-harness; it may not traverse it).
  const specInRoot = `${rootDir}/${SCOPED_SPEC_BASENAME}`;
  io.copyFile(specPath, specInRoot);
  io.chmod(specInRoot, 0o644); // world-readable — the scoped uid is not the owner

  // 4) drop to the DISTINCT scoped uid and exec the scoped query, rooted at the scoped read tree, with
  //    EXACTLY the scrubbed env (spawnSync env replaces the process env wholesale — the `env -i`
  //    equivalent). The child's stdout/stderr inherit ours — the result JSON is the only channel back.
  const argv = scopedChildArgv(spec, io.nodeBin);
  const env = scopedChildEnv({ rootDir, env: io.env });
  return io.spawn(argv[0]!, argv.slice(1), env);
}

/** Entry — argv: `scoped-runner.js <spec.json>`; exit code = the scoped query's. */
export function main(): void {
  const specPath = process.argv[2];
  if (!specPath) {
    console.error("scoped-runner: usage: scoped-runner.js <spec.json>");
    process.exit(2);
  }
  process.exit(runScopedRunner(specPath, nodeIo()));
}

// entrypoint guard — run main() only when executed directly (the test imports the pieces).
const invokedAs = process.argv[1] ?? "";
if (invokedAs.endsWith("scoped-runner.js") || invokedAs.endsWith("scoped-runner.ts")) {
  main();
}
