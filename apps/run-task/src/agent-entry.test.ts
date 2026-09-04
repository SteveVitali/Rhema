import { describe, it, expect } from "vitest";
import type { Engine, EngineEvent, PhaseRequest, UsageSnapshot } from "@rhema/engine";
import { runAgentPhase, sanitizeAgentError } from "./agent-entry.js";
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
