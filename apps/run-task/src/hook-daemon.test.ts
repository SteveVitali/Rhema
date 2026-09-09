import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compileSeatPolicy,
  newDenialState,
  lexicalRealpath,
  createBufferedAuditWriter,
  type AuditTransport,
  type AccessLogRow,
  type FetchLogRow,
} from "@rhema/hooks";
import { createHookDaemon, type HookDaemon } from "./hook-daemon.js";
import { hookClientDecision } from "./hook-client.js";

// The daemon is the harness-side of the §12.6 tool layer over a Unix socket: the agent asks, the harness (via
// @rhema/hooks) decides, and ONLY the decision crosses the socket — the token and audit rows never do. The
// audit sink lives harness-side (it ships rows with the token to the internal API); the socket reply contains
// the PreToolUse decision and nothing else.

const dirs: string[] = [];
let daemon: HookDaemon | undefined;
function sockPath(): string {
  const d = mkdtempSync(join(tmpdir(), "rhema-hookd-"));
  dirs.push(d);
  return join(d, "hook.sock");
}
afterEach(async () => {
  await daemon?.close();
  daemon = undefined;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function editorPolicy() {
  return compileSeatPolicy({
    seat: "editor",
    personaId: "p1",
    roots: { project: "/work/project", persona: "/work/personas/p1" },
    tools: ["read", "write"],
    phase: { key: "craft", phaseClass: "judge", allowsSubagents: false },
    runId: "run_1",
  });
}

describe("hook daemon ⇄ client (§12.4 step 4; §12.6)", () => {
  it("allows an in-namespace read and denies the Editor reading the Drafter's notebook", async () => {
    const socketPath = sockPath();
    daemon = await createHookDaemon({
      socketPath,
      policy: editorPolicy(),
      state: newDenialState(),
      resolveRealpath: lexicalRealpath,
    });

    const allow = await hookClientDecision(socketPath, { tool: "Read", input: { file_path: "/work/project/drafts/v1.md" } });
    expect(allow.hookSpecificOutput.permissionDecision).toBe("allow");

    const deny = await hookClientDecision(socketPath, { tool: "Read", input: { file_path: "/work/project/agents/author/notebook.md" } }, 2);
    expect(deny.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(deny.hookSpecificOutput.permissionDecisionReason).toMatch(/outside the seat namespace/);
  });

  it("rejects an Agent call in a judge-class phase (the parent cannot spawn its own second read)", async () => {
    const socketPath = sockPath();
    // give the seat the `subagent` token so the token-set gate passes; the judge-class phase is what denies.
    const policy = compileSeatPolicy({
      seat: "editor",
      personaId: "p1",
      roots: { project: "/work/project", persona: "/work/personas/p1" },
      tools: ["read", "write", "subagent"],
      phase: { key: "second_read", phaseClass: "judge", allowsSubagents: false },
      runId: "run_1",
    });
    daemon = await createHookDaemon({ socketPath, policy, state: newDenialState(), resolveRealpath: lexicalRealpath });
    const r = await hookClientDecision(socketPath, { tool: "Agent", input: { subagent_type: "second-reader" } });
    expect(r.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(r.hookSpecificOutput.permissionDecisionReason).toMatch(/judge-class/);
  });

  it("NEVER leaks the token or audit rows over the socket (only the decision crosses)", async () => {
    const socketPath = sockPath();
    const rows: (AccessLogRow | FetchLogRow)[] = [];
    const transport: AuditTransport = {
      sendAccess: async (rs) => void rows.push(...rs),
      sendFetch: async (rs) => void rows.push(...rs),
    };
    const audit = createBufferedAuditWriter(transport);
    daemon = await createHookDaemon({ socketPath, policy: editorPolicy(), state: newDenialState(), audit, resolveRealpath: lexicalRealpath });

    const resp = await hookClientDecision(socketPath, { tool: "Read", input: { file_path: "/work/project/agents/author/secret.md" } });
    const serialized = JSON.stringify(resp);
    expect(serialized).not.toContain("jwt"); // no token
    expect(Object.keys(resp)).toEqual(expect.arrayContaining(["id", "hookSpecificOutput"]));
    // the audit row WAS written harness-side (via the sink), not returned to the agent:
    await audit.flush();
    expect(rows.length).toBeGreaterThan(0);
  });

  it("surfaces the control signal to the daemon's callback, not the socket, on the 3rd denial of a path", async () => {
    const socketPath = sockPath();
    const signals: string[] = [];
    const state = newDenialState();
    daemon = await createHookDaemon({
      socketPath,
      policy: editorPolicy(),
      state,
      resolveRealpath: lexicalRealpath,
      onControl: (s) => signals.push(s),
    });
    const target = { tool: "Read", input: { file_path: "/work/project/agents/author/x.md" } } as const;
    await hookClientDecision(socketPath, target, 1);
    await hookClientDecision(socketPath, target, 2);
    const third = await hookClientDecision(socketPath, target, 3);
    expect(third.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(signals).toContain("abort_failed_boundary");
    expect(JSON.stringify(third)).not.toContain("abort_failed_boundary"); // control stays harness-side
  });
});
