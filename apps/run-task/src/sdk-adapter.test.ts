import { describe, it, expect } from "vitest";
import type { AgentSdkQueryOptions, SdkMessage } from "@rhema/engine";
import { adaptSdkQuery, toSdkOptions, resolveClaudeCodeExecutable, VENDORED_CLAUDE_BINARY, type SdkQueryLike } from "./sdk-adapter.js";

// A representative AgentSdkQueryOptions carrying both REAL SDK fields and the §12.2 fields the SDK ignores.
const OPTIONS = {
  cwd: "/work/project",
  model: "claude-opus-5",
  skillsDir: "/app/skills",
  skills: "all",
  agents: {},
  hooks: { PreToolUse: [] },
  permissionMode: "dontAsk",
  allowedTools: ["Read"],
  disallowedTools: ["Bash(curl *)"],
  maxBudgetUsd: 4.2,
  maxTurns: 10,
  env: { RUN_ID: "run_1" },
  maxSubagentDepth: 1,
  maxConcurrentSubagents: 5,
  cacheControlTtl: "1h",
  sessionStore: { kind: "gcs" },
  abortController: new AbortController(),
} as unknown as AgentSdkQueryOptions;

describe("adaptSdkQuery (D-P0.06-4 — the QueryFn↔SDK bridge)", () => {
  it("passes prompt + mapped options to the SDK query and streams its messages back as SdkMessage", async () => {
    const seen: Array<{ prompt: string; options: unknown }> = [];
    const messages: SdkMessage[] = [
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
      { type: "result", subtype: "success", total_cost_usd: 0.01 },
    ];
    const fakeSdkQuery: SdkQueryLike = (args) => {
      seen.push(args);
      return (async function* () {
        for (const m of messages) yield m;
      })();
    };

    const queryFn = adaptSdkQuery(fakeSdkQuery);
    const out: SdkMessage[] = [];
    for await (const m of queryFn({ prompt: "/editorial-review", options: OPTIONS })) out.push(m);

    // The adapter forwards prompt + the mapped options exactly once.
    expect(seen).toHaveLength(1);
    expect(seen[0].prompt).toBe("/editorial-review");
    expect(seen[0].options).toEqual(toSdkOptions(OPTIONS));
    // Every SDK message is yielded, in order, unchanged.
    expect(out).toEqual(messages);
    // The terminal result (completion-oracle leg a) survives the bridge.
    expect(out.at(-1)).toMatchObject({ type: "result", subtype: "success" });
  });

  it("toSdkOptions forwards ONLY real SDK Options fields (F5) and drops the ignored §12.2 fields", () => {
    const mapped = toSdkOptions(OPTIONS) as Record<string, unknown>;
    // real vendored-SDK fields survive, verbatim:
    expect(mapped.cwd).toBe("/work/project");
    expect(mapped.model).toBe("claude-opus-5");
    expect(mapped.skills).toBe("all");
    expect(mapped.permissionMode).toBe("dontAsk");
    expect(mapped.maxTurns).toBe(10);
    expect(mapped.maxBudgetUsd).toBe(4.2);
    expect(mapped.allowedTools).toEqual(["Read"]);
    // fields the vendored SDK does NOT read are dropped (they were silently ignored — the audit's F5):
    for (const dropped of ["skillsDir", "cacheControlTtl", "maxSubagentDepth", "maxConcurrentSubagents", "sessionStore"]) {
      expect(dropped in mapped).toBe(false);
    }
  });

  it("toSdkOptions pins pathToClaudeCodeExecutable only when set (F1)", () => {
    expect("pathToClaudeCodeExecutable" in toSdkOptions(OPTIONS)).toBe(false);
    const withBin = { ...OPTIONS, pathToClaudeCodeExecutable: "/app/vendor/claude-agent-sdk-linux-x64/claude" };
    expect(toSdkOptions(withBin).pathToClaudeCodeExecutable).toBe("/app/vendor/claude-agent-sdk-linux-x64/claude");
  });

  it("resolveClaudeCodeExecutable falls back to the fixed vendored path, else undefined (F1)", () => {
    // no platform package + no vendored binary present → undefined (placeholder build; SDK default applies).
    expect(resolveClaudeCodeExecutable(() => false)).toBeUndefined();
    // the fixed vendored path is present → pin it.
    expect(resolveClaudeCodeExecutable((p) => p === VENDORED_CLAUDE_BINARY)).toBe(VENDORED_CLAUDE_BINARY);
  });

  it("propagates an SDK stream error rather than swallowing it", async () => {
    const boom: SdkQueryLike = () =>
      (async function* () {
        yield { type: "system", subtype: "init" } as SdkMessage;
        throw new Error("sdk exploded");
      })();
    const queryFn = adaptSdkQuery(boom);
    await expect(async () => {
      for await (const _ of queryFn({ prompt: "/x", options: OPTIONS })) void _;
    }).rejects.toThrow("sdk exploded");
  });
});
