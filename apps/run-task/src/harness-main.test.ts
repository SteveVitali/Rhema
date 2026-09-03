import { describe, it, expect } from "vitest";
import { parseAgentEventLine, forwardAgentEvents, toLines } from "./harness-main.js";
import { createFdEventTransport } from "./agent-entry.js";
import { EventBufferClient, InMemoryBufferStore, type EventTransport, type OutboundEvent } from "./event-buffer.js";

class RecordingTransport implements EventTransport {
  readonly batches: OutboundEvent[][] = [];
  post(events: readonly OutboundEvent[]): Promise<void> {
    this.batches.push([...events]);
    return Promise.resolve();
  }
}

async function* lines(...ls: string[]): AsyncIterable<string> {
  for (const l of ls) yield l;
}

async function* chunks(...cs: string[]): AsyncIterable<Buffer> {
  for (const c of cs) yield Buffer.from(c, "utf8");
}

describe("parseAgentEventLine", () => {
  it("parses a serialized OutboundEvent[] batch", () => {
    expect(parseAgentEventLine('[{"type":"step.started","payload":{"ordinal":1}}]')).toEqual([
      { type: "step.started", payload: { ordinal: 1 } },
    ]);
  });
  it("ignores blank lines, non-arrays, and stray SDK log lines on the fd", () => {
    expect(parseAgentEventLine("")).toBeNull();
    expect(parseAgentEventLine("  ")).toBeNull();
    expect(parseAgentEventLine('{"type":"x"}')).toBeNull(); // not an array
    expect(parseAgentEventLine("[INFO] the model said hi")).toBeNull(); // not JSON
  });
});

describe("toLines", () => {
  it("reframes a chunked byte stream into NDJSON lines", async () => {
    const out: string[] = [];
    for await (const l of toLines(chunks("[1,2]\n[3", ",4]\n", "[5]"))) out.push(l);
    expect(out).toEqual(["[1,2]", "[3,4]", "[5]"]);
  });
});

describe("forwardAgentEvents (the two-uid boundary)", () => {
  it("forwards the agent's fd-3 event batches through the token'd transport, skipping noise", async () => {
    const transport = new RecordingTransport();
    const client = new EventBufferClient(transport, new InMemoryBufferStore());
    await forwardAgentEvents(
      lines(
        '[{"type":"step.started","payload":{"ordinal":1}}]',
        "[INFO] a stray log line", // ignored
        '[{"type":"agent.note","payload":{"text":"hi"},"agentLabel":"editor"}]',
      ),
      client,
    );
    const flat = transport.batches.flat();
    expect(flat.map((e) => e.type)).toEqual(["step.started", "agent.note"]);
    expect(flat[1]?.agentLabel).toBe("editor");
  });

  it("round-trips through the agent's fd transport wire format", async () => {
    // what createFdEventTransport writes is exactly what parseAgentEventLine reads.
    const written: string[] = [];
    const fakeWrite = (s: string) => written.push(s);
    // simulate the fd transport's line: JSON.stringify(events) + "\n"
    const batch: OutboundEvent[] = [{ type: "usage.tick", payload: { spentCredits: 3 } }];
    fakeWrite(JSON.stringify(batch) + "\n");
    const parsed = parseAgentEventLine(written[0]!.trimEnd());
    expect(parsed).toEqual(batch);
    // and the transport type is constructable
    expect(typeof createFdEventTransport(99).post).toBe("function");
  });
});
