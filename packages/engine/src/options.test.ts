import { describe, it, expect } from "vitest";
import type { PhaseManifest } from "@rhema/protocols";
import { buildQueryOptions, buildPrompt, COSMETIC_DISALLOWED_TOOLS, MAX_CONCURRENT_SUBAGENTS } from "./options.js";
import { OTEL_CONTENT_FLAGS } from "./otel.js";
import { FORBIDDEN_AGENT_ENV_KEYS } from "./scrubbed-env.js";
import type { PhaseRequest } from "./engine.js";

// §12.2 engine options, verbatim. The security-critical ones are asserted here: the scrubbed env (REQ-SPEC-10),
// dontAsk, the COSMETIC disallowedTools (review 13 F18), per-phase budget/turns, subagent depth 1 / ≤5, 1-h
// caching, OTel content-flags-off, and the injected PreToolUse hook.

function req(): PhaseRequest {
  const phase = { key: "verification", skillPhase: "1", seat: "editor" } as unknown as PhaseManifest;
  return {
    runId: "run_1",
    attempt: 2,
    cwd: "/work/project",
    phase,
    ordinal: 3,
    of: 7,
    skill: "editorial-review",
    inputs: { scope: "all" },
    seat: "editor",
    maxBudgetUsd: 4.2,
    maxTurns: 40,
  };
}

function build() {
  return buildQueryOptions(req(), {
    proxyBaseUrl: "http://proxy.internal",
    configDir: "/work/.config",
    skillsDir: "/opt/skills",
    tier: "base",
    hook: () => ({}),
    sessionStore: { kind: "s3" },
    abortController: new AbortController(),
  });
}

describe("buildQueryOptions (§12.2)", () => {
  const o = build();

  it("runs cwd = the seat mount and loads the baked skills", () => {
    expect(o.cwd).toBe("/work/project");
    expect(o.skillsDir).toBe("/opt/skills");
  });

  it("is non-interactive (permissionMode dontAsk)", () => {
    expect(o.permissionMode).toBe("dontAsk");
  });

  it("carries the COSMETIC disallowedTools verbatim", () => {
    expect(o.disallowedTools).toEqual([...COSMETIC_DISALLOWED_TOOLS]);
  });

  it("passes the per-phase budget and turn ceilings", () => {
    expect(o.maxBudgetUsd).toBe(4.2);
    expect(o.maxTurns).toBe(40);
  });

  it("caps subagent fan-out at depth 1 and ≤5 concurrent", () => {
    expect(o.maxSubagentDepth).toBe(1);
    expect(o.maxConcurrentSubagents).toBe(MAX_CONCURRENT_SUBAGENTS);
    expect(MAX_CONCURRENT_SUBAGENTS).toBe(5);
  });

  it("enables 1-hour prompt caching", () => {
    expect(o.cacheControlTtl).toBe("1h");
  });

  it("wires the injected PreToolUse hook", () => {
    expect(o.hooks.PreToolUse).toHaveLength(1);
    expect(typeof o.hooks.PreToolUse[0]).toBe("function");
  });

  it("carries the five-subagent roster with input-scoped ones marked", () => {
    expect(Object.keys(o.agents).sort()).toEqual(
      ["fidelity-auditor", "gap-analyst", "holdout-calibrator", "researcher", "second-reader"].sort(),
    );
    expect(o.agents["second-reader"].inputScoped).toBe(true);
    expect(o.agents["researcher"].inputScoped).toBe(false);
  });

  it("gives the model a SCRUBBED env with OTel content flags off and NO secret (REQ-SPEC-10; §13.5)", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in o.env).toBe(false);
    expect(o.env.ANTHROPIC_BASE_URL).toBe("http://proxy.internal");
    for (const flag of OTEL_CONTENT_FLAGS) expect(o.env[flag]).toBe("0");
  });
});

describe("buildPrompt (§12.2)", () => {
  it("is /<skill> plus key=value input lines", () => {
    const p = buildPrompt("editorial-review", { phase: "1", scope: "all", sidecar: true });
    expect(p.split("\n")[0]).toBe("/editorial-review");
    expect(p).toContain("phase=1");
    expect(p).toContain("scope=all");
    expect(p).toContain("sidecar=true");
  });
});
