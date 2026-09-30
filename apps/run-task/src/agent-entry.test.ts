import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer, type Server } from "node:net";
import type { Engine, EngineEvent, PhaseRequest, UsageSnapshot } from "@rhema/engine";
import { buildPreToolUseHook, runAgentPhase, sanitizeAgentError } from "./agent-entry.js";
import { EventBufferClient, InMemoryBufferStore, type EventTransport, type OutboundEvent } from "./event-buffer.js";

const usage: UsageSnapshot = {
  inputTokens: 10,
  outputTokens: 5,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
  costUsd: 0,
};

/** A fake engine that yields a scripted event stream then a result. */
function fakeEngine(events: EngineEvent[]): Engine {
  return {
    async *startPhase(): AsyncIterable<EngineEvent> {
      for (const ev of events) yield ev;
    },
    abort() {},
    usage: () => usage,
  };
}

/** A transport that records posted batches. */
class RecordingTransport implements EventTransport {
  readonly batches: OutboundEvent[][] = [];
  post(events: readonly OutboundEvent[]): Promise<void> {
    this.batches.push([...events]);
    return Promise.resolve();
  }
}

const req = { runId: "run_1", phase: { key: "brief" } } as unknown as PhaseRequest;

describe("runAgentPhase", () => {
  it("streams mapped events through the transport and returns the SDK subtype + usage", async () => {
    const transport = new RecordingTransport();
    const client = new EventBufferClient(transport, new InMemoryBufferStore());
    const engine = fakeEngine([
      { kind: "event", type: "step.started", payload: { ordinal: 1 }, visibility: "user", density: "normal", agentLabel: "editor" },
      { kind: "usage", snapshot: usage },
      { kind: "event", type: "agent.note", payload: { text: "thinking" }, visibility: "user", density: "normal" },
      { kind: "result", subtype: "success", usage },
    ] as EngineEvent[]);

    const res = await runAgentPhase(engine, req, client);
    expect(res.subtype).toBe("success");
    expect(res.eventsPosted).toBe(2);
    expect(res.usage.inputTokens).toBe(10);
    // both events delivered (flushed) in order.
    const flat = transport.batches.flat();
    expect(flat.map((e) => e.type)).toEqual(["step.started", "agent.note"]);
    expect(flat[0]?.agentLabel).toBe("editor");
  });

  it("flushes buffered events even when the engine throws mid-phase", async () => {
    const transport = new RecordingTransport();
    const client = new EventBufferClient(transport, new InMemoryBufferStore());
    const engine: Engine = {
      async *startPhase(): AsyncIterable<EngineEvent> {
        yield { kind: "event", type: "step.started", payload: { ordinal: 1 }, visibility: "user", density: "normal" } as EngineEvent;
        throw new Error("sdk crashed");
      },
      abort() {},
      usage: () => usage,
    };
    await expect(runAgentPhase(engine, req, client)).rejects.toThrow(/sdk crashed/);
    expect(transport.batches.flat().map((e) => e.type)).toEqual(["step.started"]); // not lost
  });
});

describe("sanitizeAgentError — the observability sink's error fact (D-P0.15e-4)", () => {
  it("captures the error class + message from an Error", () => {
    const fact = sanitizeAgentError(new TypeError("query() is not a function"));
    expect(fact).toEqual({ class: "TypeError", message: "query() is not a function" });
  });

  it("collapses whitespace/newlines and bounds the message length", () => {
    const long = "boom\n  at frame1\n    at frame2 " + "x".repeat(1000);
    const fact = sanitizeAgentError(new Error(long));
    expect(fact.class).toBe("Error");
    expect(fact.message).not.toContain("\n");
    expect(fact.message.length).toBeLessThanOrEqual(500);
    expect(fact.message.startsWith("boom at frame1 at frame2")).toBe(true);
  });

  it("handles a non-Error throw (string/unknown)", () => {
    expect(sanitizeAgentError("plain string")).toEqual({ class: "string", message: "plain string" });
    expect(sanitizeAgentError({ weird: true }).class).toBe("object");
  });

  it("redacts auth-token-like substrings (never leak the run token/key — REQ-SPEC-10/11)", () => {
    const fact = sanitizeAgentError(new Error("401 Unauthorized: Authorization: Bearer eyJhbGci.secret.sig and x-api-key sk-ant-abc123DEF"));
    expect(fact.message).not.toContain("eyJhbGci.secret.sig");
    expect(fact.message).not.toContain("sk-ant-abc123DEF");
    expect(fact.message).toContain("Bearer [redacted]");
    expect(fact.message).toContain("sk-[redacted]");
  });
});

describe("buildPreToolUseHook — SDK envelope → ToolUse translation (PRB.17 live finding)", () => {
  const dirs: string[] = [];
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) await new Promise<void>((r) => s.close(() => r()));
    for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it("translates the SDK PreToolUseHookInput {tool_name, tool_input} to ToolUse {tool, input} on the wire", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rhema-hookw-"));
    dirs.push(dir);
    const socketPath = join(dir, "hook.sock");
    const captured: unknown[] = [];
    const server = createServer((sock) => {
      let buf = "";
      sock.on("data", (chunk) => {
        buf += chunk.toString();
        const nl = buf.indexOf("\n");
        if (nl === -1) return;
        captured.push(JSON.parse(buf.slice(0, nl)));
        sock.write(
          JSON.stringify({
            id: 1,
            hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
          }) + "\n",
        );
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(socketPath, r));

    const hook = buildPreToolUseHook(socketPath);
    // The REAL SDK callback input (sdk.d.ts PreToolUseHookInput): the ENVELOPE, not ToolUse.
    const res = (await hook({
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: "/work/project/drafts/v1.md", content: "x" },
      tool_use_id: "toolu_1",
      session_id: "s1",
      transcript_path: "/tmp/t",
      cwd: "/work/project",
    })) as { hookSpecificOutput: { permissionDecision: string } };

    expect(res.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(captured).toHaveLength(1);
    const wire = captured[0] as { id: number; use: { tool: string; input: Record<string, unknown> } };
    expect(wire.use.tool).toBe("Write");
    expect(wire.use.input).toEqual({ file_path: "/work/project/drafts/v1.md", content: "x" });
  });

  it("maps a non-object tool_input to {} rather than crashing (defensive — malformed envelopes deny harness-side)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rhema-hookw-"));
    dirs.push(dir);
    const socketPath = join(dir, "hook.sock");
    const captured: unknown[] = [];
    const server = createServer((sock) => {
      sock.on("data", (chunk) => {
        captured.push(JSON.parse(chunk.toString().trim()));
        sock.write(
          JSON.stringify({
            id: 1,
            hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
          }) + "\n",
        );
      });
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(socketPath, r));

    const hook = buildPreToolUseHook(socketPath);
    await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: "ls -la", tool_use_id: "t", session_id: "s", transcript_path: "/t", cwd: "/w" });
    const wire = captured[0] as { use: { tool: string; input: Record<string, unknown> } };
    expect(wire.use.tool).toBe("Bash");
    expect(wire.use.input).toEqual({});
  });
});
