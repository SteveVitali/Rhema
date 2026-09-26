import { describe, expect, it } from "vitest";
import { evaluateToolUse, toPreToolUseResult } from "./hook.js";
import { compileSeatPolicy } from "./seat-tables.js";
import { newDenialState } from "./denials.js";
import { lexicalRealpath } from "./realpath.js";
import type { PhasePolicy, SeatPolicy, ToolUse, UrlPolicy } from "./types.js";

const CTX = { resolveRealpath: lexicalRealpath, now: () => "2026-09-01T00:00:00.000Z" };
const JUDGE: PhasePolicy = { key: "second_read", phaseClass: "judge", allowsSubagents: false };
const RESEARCH: PhasePolicy = { key: "verification", phaseClass: "research", allowsSubagents: true };

function editorPolicy(phase: PhasePolicy, url?: UrlPolicy): SeatPolicy {
  return compileSeatPolicy({
    seat: "editor",
    personaId: "p1",
    tools: ["read", "write", "web_search", "web_fetch", "subagent"],
    phase,
    runId: "run_1",
    agentLabel: "editor",
    ...(url ? { urlPolicy: url } : {}),
  });
}

describe("Agent rejection in judge-class phases (AC4 / §12.2)", () => {
  it("rejects an Agent call when the phase is judge-class", () => {
    const d = evaluateToolUse(
      { tool: "Agent", input: { subagent_type: "second-reader" } },
      editorPolicy(JUDGE),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("judge-class");
    expect(d.accessRows).toHaveLength(1);
    expect(d.accessRows[0]).toMatchObject({ tool: "Agent", decision: "deny", namespace: null });
  });

  it("treats Task as an alias for Agent", () => {
    const d = evaluateToolUse({ tool: "Task", input: {} }, editorPolicy(JUDGE), newDenialState(), CTX);
    expect(d.decision).toBe("deny");
  });

  it("allows an Agent call in a non-judge phase that permits subagents", () => {
    const d = evaluateToolUse(
      { tool: "Agent", input: { subagent_type: "researcher" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("allow");
    expect(d.accessRows[0]).toMatchObject({ tool: "Agent", decision: "allow" });
  });
});

describe("denial thresholds (AC5 / §12.6)", () => {
  it("aborts the step on the third denial of one path", () => {
    const policy = editorPolicy(RESEARCH);
    const state = newDenialState();
    const use: ToolUse = { tool: "Read", input: { file_path: "/work/project/agents/author/notebook.md" } };
    const d1 = evaluateToolUse(use, policy, state, CTX);
    const d2 = evaluateToolUse(use, policy, state, CTX);
    const d3 = evaluateToolUse(use, policy, state, CTX);
    expect(d1.control).toBeUndefined();
    expect(d2.control).toBeUndefined();
    expect(d3.control).toBe("abort_failed_boundary");
  });

  it("raises a hiccup on the twenty-first denial in a phase (distinct paths)", () => {
    const policy = editorPolicy(RESEARCH);
    const state = newDenialState();
    let last;
    for (let i = 0; i < 21; i++) {
      last = evaluateToolUse(
        { tool: "Read", input: { file_path: `/work/project/agents/author/n${i}.md` } },
        policy,
        state,
        CTX,
      );
    }
    // Each distinct path was denied once (never reaching the 3-per-path abort), so the 21st trips the hiccup.
    expect(state.phaseTotal).toBe(21);
    expect(last?.control).toBe("hiccup_retry");
  });

  it("does not fire a control signal on allows", () => {
    const d = evaluateToolUse(
      { tool: "Read", input: { file_path: "/work/project/drafts/v1.md" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("allow");
    expect(d.control).toBeUndefined();
  });
});

describe("every decision produces an audit row (AC6 / REQ-ARCH-18)", () => {
  it("logs an allow with tool, path, namespace, decision", () => {
    const d = evaluateToolUse(
      { tool: "Read", input: { file_path: "/work/project/drafts/v1.md" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.accessRows).toHaveLength(1);
    expect(d.accessRows[0]).toEqual({
      runId: "run_1",
      ts: "2026-09-01T00:00:00.000Z",
      agentLabel: "editor",
      tool: "Read",
      path: "/work/project/drafts/v1.md",
      namespace: "shared",
      decision: "allow",
    });
  });

  it("logs a deny with a null namespace for an out-of-namespace read", () => {
    const d = evaluateToolUse(
      { tool: "Read", input: { file_path: "/work/project/agents/author/notebook.md" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.accessRows[0]).toMatchObject({ tool: "Read", decision: "deny", namespace: null });
  });

  it("logs a fetch_log row for WebFetch (allow) and a hold-out deny", () => {
    const url: UrlPolicy = {
      holdouts: ["https://holdout.example.com/x"],
      userExclusions: [],
      calibratorAllow: [],
      predictionFileWritten: false,
      serverFetchDisabled: false,
    };
    const allow = evaluateToolUse(
      { tool: "WebFetch", input: { url: "https://ok.example.com/a" } },
      editorPolicy(RESEARCH, url),
      newDenialState(),
      CTX,
    );
    expect(allow.decision).toBe("allow");
    expect(allow.fetchRows[0]).toMatchObject({ kind: "fetch", decision: "allow", url: "https://ok.example.com/a" });

    const deny = evaluateToolUse(
      { tool: "WebFetch", input: { url: "https://holdout.example.com/x" } },
      editorPolicy(RESEARCH, url),
      newDenialState(),
      CTX,
    );
    expect(deny.decision).toBe("deny");
    expect(deny.fetchRows[0]).toMatchObject({ kind: "fetch", decision: "deny", denyReason: "holdout" });
  });

  it("logs a fetch_log search row for WebSearch", () => {
    const d = evaluateToolUse(
      { tool: "WebSearch", input: { query: "editorial standards" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.fetchRows[0]).toMatchObject({ kind: "search", decision: "allow", query: "editorial standards" });
  });
});

describe("write + recursive-over-root through the hook", () => {
  it("denies a write to a read-only shared path", () => {
    const d = evaluateToolUse(
      { tool: "Write", input: { file_path: "/work/project/drafts/v9.md", content: "x" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("write to a read-only path");
  });

  it("denies a Glob over the project root", () => {
    const d = evaluateToolUse(
      { tool: "Glob", input: { pattern: "**/*.md" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("recursive operation over the root");
  });

  it("allows a Grep scoped within the seat namespace", () => {
    const d = evaluateToolUse(
      { tool: "Grep", input: { pattern: "TODO", path: "/work/project/agents/editor" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("allow");
  });
});

describe("tool-set enforcement (Finding 5 / REQ-ARCH-17)", () => {
  it("denies a matched tool whose capability token the seat lacks", () => {
    // A seat with no tools (e.g. system) may not WebSearch even though WebSearch has no URL restriction.
    const bare = compileSeatPolicy({
      seat: "system",
      tools: [],
      phase: RESEARCH,
      runId: "run_1",
    });
    const d = evaluateToolUse({ tool: "WebSearch", input: { query: "x" } }, bare, newDenialState(), CTX);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("may not use WebSearch");
  });

  it("denies WebFetch when the seat's tools omit web_fetch", () => {
    const noFetch = compileSeatPolicy({
      seat: "editor",
      personaId: "p1",
      tools: ["read", "write", "web_search"], // no web_fetch
      phase: RESEARCH,
      runId: "run_1",
    });
    const d = evaluateToolUse({ tool: "WebFetch", input: { url: "https://ok.example.com" } }, noFetch, newDenialState(), CTX);
    expect(d.decision).toBe("deny");
    expect(d.reason).toContain("may not use WebFetch");
  });

  it("does not gate Bash by the token set (governed by path + kernel mount)", () => {
    const d = evaluateToolUse(
      { tool: "Bash", input: { command: "cat /work/project/drafts/v1.md" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("allow");
  });
});

describe("Glob/Grep pattern escape (Finding 8)", () => {
  it("denies a glob pattern that climbs out of the search base with ..", () => {
    const d = evaluateToolUse(
      { tool: "Glob", input: { path: "/work/project/agents/editor", pattern: "../author/**" } },
      editorPolicy(RESEARCH),
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("search pattern escapes the search base");
  });
});

describe("baked skill tree reads (DEF.1 Stage-B)", () => {
  const SKILLS_REF = "/app/skills/draft-from-outline/references/draft-ledger.md";

  it("allows a Read of a skill reference under /app/skills", () => {
    const policy = compileSeatPolicy({
      seat: "author",
      personaId: "p1",
      tools: ["read", "write"],
      phase: RESEARCH,
      runId: "run_1",
      agentLabel: "author",
    });
    const d = evaluateToolUse({ tool: "Read", input: { file_path: SKILLS_REF } }, policy, newDenialState(), CTX);
    expect(d.decision).toBe("allow");
    expect(d.accessRows[0]).toMatchObject({ tool: "Read", decision: "allow", namespace: "shared" });
  });

  it("denies a Write under /app/skills (read-only grant)", () => {
    const policy = compileSeatPolicy({
      seat: "author",
      personaId: "p1",
      tools: ["read", "write"],
      phase: RESEARCH,
      runId: "run_1",
      agentLabel: "author",
    });
    const d = evaluateToolUse({ tool: "Write", input: { file_path: SKILLS_REF } }, policy, newDenialState(), CTX);
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("write to a read-only path");
  });

  it("still denies reads elsewhere under /app (no blanket /app grant)", () => {
    const policy = editorPolicy(RESEARCH);
    const d = evaluateToolUse(
      { tool: "Read", input: { file_path: "/app/dist/hook-daemon.js" } },
      policy,
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
    expect(d.reason).toBe("path escapes the sandbox root");
  });

  it("allows reads at the staged <configDir>/skills path when the harness supplies the config root", () => {
    const policy = compileSeatPolicy({
      seat: "author",
      personaId: "p1",
      tools: ["read", "write"],
      phase: RESEARCH,
      runId: "run_1",
      agentLabel: "author",
      roots: { config: "/config/skills" },
    });
    // The staged dir itself (a plain `ls` / Glob target that needs no symlink resolution).
    const ls = evaluateToolUse(
      { tool: "Glob", input: { path: "/config/skills/draft-from-outline", pattern: "*" } },
      policy,
      newDenialState(),
      { ...CTX, resolveRealpath: (p: string) => p },
    );
    expect(ls.decision).toBe("allow");
    // A Read THROUGH the staged symlink realpaths to /app/skills — classified under the skills root.
    const throughSymlink = evaluateToolUse(
      { tool: "Read", input: { file_path: "/config/skills/draft-from-outline/references/draft-ledger.md" } },
      policy,
      newDenialState(),
      {
        ...CTX,
        resolveRealpath: (p: string) =>
          p.startsWith("/config/skills/") ? p.replace("/config/skills", "/app/skills") : p,
      },
    );
    expect(throughSymlink.decision).toBe("allow");
    expect(throughSymlink.accessRows[0]?.path).toBe("/app/skills/draft-from-outline/references/draft-ledger.md");
  });

  it("does not grant the config root when the harness does not supply it", () => {
    const policy = editorPolicy(RESEARCH);
    const d = evaluateToolUse(
      { tool: "Glob", input: { path: "/config/skills", pattern: "*" } },
      policy,
      newDenialState(),
      CTX,
    );
    expect(d.decision).toBe("deny");
  });
});

describe("toPreToolUseResult adapter", () => {
  it("maps a deny with a reason and carries the control signal", () => {
    const state = newDenialState();
    const policy = editorPolicy(RESEARCH);
    const use: ToolUse = { tool: "Read", input: { file_path: "/work/project/agents/author/x.md" } };
    evaluateToolUse(use, policy, state, CTX);
    evaluateToolUse(use, policy, state, CTX);
    const d3 = evaluateToolUse(use, policy, state, CTX);
    const out = toPreToolUseResult(d3);
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(out.hookSpecificOutput.permissionDecisionReason).toBeDefined();
    expect(out.rhemaControl).toBe("abort_failed_boundary");
  });
});
