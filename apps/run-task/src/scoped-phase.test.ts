import { describe, it, expect } from "vitest";
import { FORBIDDEN_AGENT_ENV_KEYS, PROXY_PLACEHOLDER_ANTHROPIC_API_KEY } from "@rhema/engine";
import type { HarnessRunSpec, ScopedPhaseLaunch } from "@rhema/orchestrator";
import {
  buildScopedPhasePlan,
  runScopedPhase,
  scopedRunnerEnv,
  SCOPED_RUNNER,
  type ScopedPhaseDeps,
} from "./scoped-phase.js";

// DEF.1 / D-P0.15h-5 — the harness half of the orchestrator's input-scoped second-read launch (§12.6).
// The deterministic leg asserts the launch spec (unshare argv, one-file mount set, distinct uid,
// tools:["Read"], scrubbed env) and the output persistence contract (artifact + producer marker +
// .rhema/agent-result.json + .rhema/phase-result.json), success AND blocked.

const LAUNCH: ScopedPhaseLaunch = {
  role: "second-reader",
  producerQueryId: "qry_test_001",
  files: ["/work/project/drafts/v1.md"],
  prompt: "Read this draft as a senior editor…",
  outputPath: "agents/editor/05-second-read.md",
  markerPath: "agents/editor/.rhema/second-read.json",
  model: "claude-sonnet-5",
  maxBudgetUsd: 1.2,
  maxTurns: 10,
};

const SPEC = {
  request: { phase: { skillPhase: "5" } },
} as unknown as HarnessRunSpec;

function memDeps(spawnResult: { code: number; stdout: string; stderr: string }) {
  const written = new Map<string, string>();
  const deps: ScopedPhaseDeps = {
    spawnCollect: async () => spawnResult,
    writeFile: async (p, d) => void written.set(p, typeof d === "string" ? d : Buffer.from(d).toString("utf8")),
    mkdir: async () => undefined,
    log: () => undefined,
  };
  return { deps, written };
}

const ARGS = {
  launch: LAUNCH,
  projectDir: "/work/project",
  configDir: "/config",
  proxyBaseUrl: "http://127.0.0.1:9",
  runId: "run_1",
  agentUid: 10002,
};

describe("buildScopedPhasePlan (§12.6)", () => {
  const { unshareArgv, specJson } = buildScopedPhasePlan(LAUNCH, { agentUid: 10002, specPath: "/config/scoped-spec.json" });
  const spec = JSON.parse(specJson) as {
    role: string;
    uid: number;
    tools: string[];
    files: string[];
    producerQueryId: string;
    mountPlan: { rootDir: string; overmountDir: string; stashBinds: unknown[]; binds: unknown[] };
    query: { prompt: string; model: string; maxBudgetUsd: number; maxTurns: number };
  };

  it("wraps the runner in a private mount namespace (unshare --mount --propagation private)", () => {
    expect(unshareArgv.slice(0, 4)).toEqual(["unshare", "--mount", "--propagation", "private"]);
    expect(unshareArgv.slice(5)).toEqual([SCOPED_RUNNER, "/config/scoped-spec.json"]);
  });

  it("mounts exactly the enumerated draft, read-only, at a distinct uid, tools=[Read]", () => {
    expect(spec.role).toBe("second-reader");
    expect(spec.uid).toBe(10003); // agentUid + the second-reader role offset — never the agent's uid
    expect(spec.tools).toEqual(["Read"]);
    expect(spec.files).toEqual(["/work/project/drafts/v1.md"]);
    expect(spec.producerQueryId).toBe("qry_test_001");
    expect(spec.mountPlan.rootDir).toBe("/work/scoped/second-reader");
    expect(spec.mountPlan.overmountDir).toBe("/work");
    // one stash bind + one scoped bind, both `mount --bind -o ro`.
    for (const arr of [spec.mountPlan.stashBinds, spec.mountPlan.binds]) {
      expect(arr).toHaveLength(1);
      expect((arr[0] as { argv: string[] }).argv.slice(0, 4)).toEqual(["mount", "--bind", "-o", "ro"]);
    }
  });

  it("carries the query block the runner hands scoped-query.js", () => {
    expect(spec.query).toEqual({ prompt: LAUNCH.prompt, model: LAUNCH.model, maxBudgetUsd: 1.2, maxTurns: 10 });
  });

  it("refuses an empty file set (a scoped read over nothing is a bug, not a phase)", () => {
    expect(() =>
      buildScopedPhasePlan({ ...LAUNCH, files: [] }, { agentUid: 10002, specPath: "/c/s.json" }),
    ).toThrow(/no enumerated files/);
  });
});

describe("scopedRunnerEnv (REQ-SPEC-10/11)", () => {
  const env = scopedRunnerEnv({ runId: "run_9", proxyBaseUrl: "http://127.0.0.1:9" });
  it("carries no secret key and only the proxy placeholder", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in env).toBe(false);
    expect(env.ANTHROPIC_API_KEY).toBe(PROXY_PLACEHOLDER_ANTHROPIC_API_KEY);
    expect(env.ANTHROPIC_BASE_URL).toBe("http://127.0.0.1:9"); // the loopback injector, never the egress proxy
  });
  it("keeps PATH for the harness-side runner (the model's env is re-scrubbed by scoped-runner.sh)", () => {
    expect(env.PATH).toBeTypeOf("string");
  });
});

describe("runScopedPhase — output persistence (DEF.1 F2)", () => {
  it("success: writes the artifact, the producer marker, agent-result, phase-result=done", async () => {
    const { deps, written } = memDeps({
      code: 0,
      stdout: JSON.stringify({ text: "the second read", subtype: "success", usage: { inputTokens: 3 } }),
      stderr: "",
    });
    const out = await runScopedPhase(SPEC, ARGS, deps);
    expect(out).toEqual({ subtype: "success", produced: true });
    expect(written.get("/work/project/agents/editor/05-second-read.md")).toBe("the second read");
    // the producer marker — secondReadProducerQueryId === expectedProducerQueryId === the launch id.
    expect(JSON.parse(written.get("/work/project/agents/editor/.rhema/second-read.json")!)).toEqual({
      producerQueryId: "qry_test_001",
      expectedProducerQueryId: "qry_test_001",
    });
    expect(JSON.parse(written.get("/work/project/.rhema/agent-result.json")!)).toMatchObject({ subtype: "success" });
    expect(JSON.parse(written.get("/work/project/.rhema/phase-result.json")!)).toMatchObject({
      status: "done",
      output: "agents/editor/05-second-read.md",
    });
  });

  it("failure: a dying/unparseable scoped query still lands a blocked phase-result (F1's missing-file kill)", async () => {
    const { deps, written } = memDeps({ code: 1, stdout: "not-json", stderr: "boom" });
    const out = await runScopedPhase(SPEC, ARGS, deps);
    expect(out.produced).toBe(false);
    expect(written.get("/work/project/agents/editor/05-second-read.md")).toBeUndefined();
    expect(written.get("/work/project/agents/editor/.rhema/second-read.json")).toBeUndefined();
    expect(JSON.parse(written.get("/work/project/.rhema/phase-result.json")!)).toMatchObject({ status: "blocked" });
    expect(written.has("/work/project/.rhema/agent-result.json")).toBe(true);
  });

  it("empty text on a success subtype is NOT produced (no artifact, marker, or done)", async () => {
    const { deps, written } = memDeps({ code: 0, stdout: JSON.stringify({ text: "  ", subtype: "success" }), stderr: "" });
    const out = await runScopedPhase(SPEC, ARGS, deps);
    expect(out.produced).toBe(false);
    expect(JSON.parse(written.get("/work/project/.rhema/phase-result.json")!)).toMatchObject({ status: "blocked" });
  });
});
