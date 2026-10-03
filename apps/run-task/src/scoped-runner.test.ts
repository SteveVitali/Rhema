import { describe, it, expect } from "vitest";
import { ALLOWED_AGENT_ENV_KEYS, FORBIDDEN_AGENT_ENV_KEYS, PROXY_PLACEHOLDER_ANTHROPIC_API_KEY } from "@rhema/engine";
import {
  assertScopedEnv,
  runScopedRunner,
  scopedChildArgv,
  scopedChildEnv,
  SCOPED_QUERY,
  SETPRIV_BIN,
  type ScopedRunnerIo,
  type ScopedRunnerSpecFile,
} from "./scoped-runner.js";

// SEC.3 — the TypeScript scoped runner (REQ-DATA-17/18; §12.6). The deterministic golden: the mount plan
// executes in the shell runner's exact order (stash → tmpfs overmount → ro binds → spec copy), and the
// model's process gets the `env -i`-equivalent scrubbed set — no token, no credential, only the
// ALLOWED_AGENT_ENV_KEYS set plus the F-StageB-7 HOME pin.

const SPEC: ScopedRunnerSpecFile = {
  uid: 10003,
  mountPlan: {
    rootDir: "/work/scoped/second-reader",
    stashDir: "/tmp/scoped-stash/second-reader",
    tmpfsArgv: ["mount", "-t", "tmpfs", "-o", "nosuid,nodev,size=64m", "tmpfs", "/work"],
    stashBinds: [
      { dest: "/tmp/scoped-stash/second-reader/v1.md", argv: ["mount", "--bind", "-o", "ro", "/work/project/drafts/v1.md", "/tmp/scoped-stash/second-reader/v1.md"] },
    ],
    binds: [
      { dest: "/work/scoped/second-reader/v1.md", argv: ["mount", "--bind", "-o", "ro", "/tmp/scoped-stash/second-reader/v1.md", "/work/scoped/second-reader/v1.md"] },
    ],
  },
};

/** A recording ScopedRunnerIo — captures the ordered op stream + the spawned child argv/env. */
function fakeIo(env: Record<string, string | undefined>) {
  const ops: string[] = [];
  let spawned: { file: string; args: readonly string[]; env: Record<string, string> } | null = null;
  const io: ScopedRunnerIo = {
    readFile: (p) => {
      ops.push(`readFile ${p}`);
      return JSON.stringify(SPEC);
    },
    mkdir: (p) => ops.push(`mkdir ${p}`),
    writeFile: (p) => ops.push(`writeFile ${p}`),
    chmod: (p, m) => ops.push(`chmod ${p} 0${m.toString(8)}`),
    copyFile: (a, b) => ops.push(`copy ${a} ${b}`),
    execFile: (f, a) => ops.push(`exec ${f} ${a.join(" ")}`),
    spawn: (f, a, e) => {
      spawned = { file: f, args: a, env: e };
      ops.push(`spawn ${f} ${a.join(" ")}`);
      return 0;
    },
    env,
    nodeBin: "/nodejs/bin/node",
  };
  return { io, ops, spawned: () => spawned };
}

const RUNNER_ENV = {
  RUN_ID: "run_1",
  ANTHROPIC_BASE_URL: "http://127.0.0.1:8443",
  ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
  PATH: "/usr/local/bin:/usr/bin:/bin",
  // these must NEVER reach the child — planted to prove the allowlist is total:
  RUN_TOKEN: "rt_secret",
  PROXY_CREDENTIAL: "pc_secret",
  API_INTERNAL_URL: "https://api.internal",
};

describe("runScopedRunner — the mount-plan sequence (§12.6)", () => {
  it("applies stash → tmpfs overmount → ro binds → spec copy in the shell runner's exact order", () => {
    const { io, ops } = fakeIo(RUNNER_ENV);
    const code = runScopedRunner("/config/scoped-spec.json", io);
    expect(code).toBe(0);
    expect(ops).toEqual([
      "readFile /config/scoped-spec.json",
      "mkdir /tmp/scoped-stash/second-reader",
      // 1) stash: mountpoint created (parent mkdir + empty file), then the verbatim ro bind argv
      "mkdir /tmp/scoped-stash/second-reader",
      "writeFile /tmp/scoped-stash/second-reader/v1.md",
      "exec mount --bind -o ro /work/project/drafts/v1.md /tmp/scoped-stash/second-reader/v1.md",
      // 2) the /work overmount — every other-seat file vanishes at the kernel
      "exec mount -t tmpfs -o nosuid,nodev,size=64m tmpfs /work",
      "mkdir /work/scoped/second-reader",
      "chmod /work/scoped/second-reader 0777",
      // 3) ro-bind the stash into the scoped root
      "mkdir /work/scoped/second-reader",
      "writeFile /work/scoped/second-reader/v1.md",
      "exec mount --bind -o ro /tmp/scoped-stash/second-reader/v1.md /work/scoped/second-reader/v1.md",
      // 3b) the spec copy the scoped uid reads (/config is gid-harness)
      "copy /config/scoped-spec.json /work/scoped/second-reader/.scoped-spec.json",
      "chmod /work/scoped/second-reader/.scoped-spec.json 0644",
      // 4) the uid drop + scoped query
      `spawn ${SETPRIV_BIN} --reuid 10003 --regid 10003 --clear-groups --no-new-privs -- /nodejs/bin/node ${SCOPED_QUERY} /work/scoped/second-reader/.scoped-spec.json --cwd /work/scoped/second-reader`,
    ]);
  });
});

describe("scopedChildArgv — the uid drop (golden)", () => {
  it("is setpriv --reuid <scoped> --regid <scoped> --clear-groups --no-new-privs -- <node> <query> <spec> --cwd <root>", () => {
    expect(scopedChildArgv(SPEC, "/nodejs/bin/node")).toEqual([
      SETPRIV_BIN,
      "--reuid",
      "10003",
      "--regid",
      "10003",
      "--clear-groups",
      "--no-new-privs",
      "--",
      "/nodejs/bin/node",
      SCOPED_QUERY,
      "/work/scoped/second-reader/.scoped-spec.json",
      "--cwd",
      "/work/scoped/second-reader",
    ]);
  });
});

describe("scopedChildEnv — the env -i equivalent (golden; REQ-SPEC-10)", () => {
  const env = scopedChildEnv({ rootDir: "/work/scoped/second-reader", env: RUNNER_ENV });

  it("carries exactly the allowlist + the HOME pin — nothing else", () => {
    expect(Object.keys(env).sort()).toEqual([...ALLOWED_AGENT_ENV_KEYS, "HOME"].sort());
  });

  it("maps each key to the shell runner's env -i value (HOME + CLAUDE_CONFIG_DIR scoped to the jail)", () => {
    expect(env).toEqual({
      HOME: "/work/scoped/second-reader",
      RUN_ID: "run_1",
      ANTHROPIC_BASE_URL: "http://127.0.0.1:8443",
      ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
      CLAUDE_CONFIG_DIR: "/work/scoped/second-reader",
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
      ENABLE_PROMPT_CACHING_1H: "1",
      CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION: "0",
    });
  });

  it("carries no token, no credential — forbidden keys are absent even when the runner env has them", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in env).toBe(false);
    expect(JSON.stringify(env)).not.toContain("rt_secret");
    expect(JSON.stringify(env)).not.toContain("pc_secret");
    expect("PATH" in env).toBe(false);
  });
});

describe("assertScopedEnv — the allowlist guard", () => {
  it("refuses a widened env or a real provider key", () => {
    const base = scopedChildEnv({ rootDir: "/r", env: RUNNER_ENV });
    expect(() => assertScopedEnv({ ...base, EXTRA: "x" })).toThrow(/non-allowlisted key EXTRA/);
    expect(() => assertScopedEnv({ ...base, ANTHROPIC_API_KEY: "sk-ant-real" })).toThrow(/placeholder/);
  });

  it("throws when the harness-side env lacks a required forwarded key", () => {
    expect(() =>
      scopedChildEnv({ rootDir: "/r", env: { ANTHROPIC_BASE_URL: "x", ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY } }),
    ).toThrow(/missing env RUN_ID/);
  });
});
