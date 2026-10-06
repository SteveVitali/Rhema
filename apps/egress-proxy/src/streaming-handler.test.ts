import { describe, expect, it } from "vitest";
import { InMemoryCapAccountant } from "./cap.js";
import type { RunContext, RunContextResolver } from "./context.js";
import { PROXY_CREDENTIAL_HEADER } from "./credential.js";
import {
  streamProxyRequest,
  type ProxyRequest,
  type ResponseSink,
  type StreamingForwarder,
  type StreamingHandlerDeps,
} from "./handler.js";
import { NovelDomainTracker } from "./outbound-limits.js";
import { InMemoryFetchLogWriter, InMemoryUsageWriter, StaticSecretProvider } from "./sinks.js";
import { DenialSpikeTracker, InMemoryEventSink } from "./signals.js";

const CRED = "cred-1";

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run_1",
    attempt: 1,
    agentId: "editor",
    role: "editor",
    workspaceId: "ws_1",
    billingAccountId: "bill_1",
    projectId: "proj_1",
    provider: "anthropic",
    modelTier: "frontier",
    rateTableVersion: 1,
    capCredits: 1_000_000,
    allowlist: { endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/messages" }], models: ["claude-opus-5"] },
    urlPolicy: { blockedDomains: [] },
    ...overrides,
  };
}

/** One Anthropic SSE frame per array entry — returned as SEPARATE stream chunks so incremental delivery shows. */
function sseFrames(events: Array<Record<string, unknown>>): string[] {
  return events.map((e) => `event: ${String(e["type"])}\ndata: ${JSON.stringify(e)}\n\n`).concat("data: [DONE]\n\n");
}

/** A streaming SSE fixture: a web_search + a web_fetch server-tool block, input usage at start, output at delta. */
function streamingFixtureFrames(): string[] {
  return sseFrames([
    { type: "message_start", message: { id: "msg_1", model: "claude-opus-5", usage: { input_tokens: 1_000_000 } } },
    { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: {} } },
    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"rhema spec"}' } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", name: "web_fetch", input: { url: "https://a.test/p" } } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: {}, usage: { output_tokens: 1_000_000 } },
  ]);
}

class RecordingSink implements ResponseSink {
  head: { status: number; headers: Record<string, string> } | undefined;
  readonly writes: string[] = [];
  ended = false;
  writeHead(status: number, headers: Record<string, string>): void {
    this.head = { status, headers };
  }
  write(chunk: Uint8Array): void {
    this.writes.push(Buffer.from(chunk).toString("utf8"));
  }
  end(): void {
    this.ended = true;
  }
}

interface Harness extends StreamingHandlerDeps {
  usageWriter: InMemoryUsageWriter;
  fetchLogWriter: InMemoryFetchLogWriter;
  capAccountant: InMemoryCapAccountant;
  forwarded: { req?: Parameters<StreamingForwarder>[0]; called: number };
}

function harness(opts: { context?: RunContext | null; chunks?: string[]; status?: number; headers?: Record<string, string>; capAccountant?: InMemoryCapAccountant } = {}): Harness {
  const context = opts.context === undefined ? ctx() : opts.context;
  const map: Record<string, RunContext> = context ? { [CRED]: context } : {};
  const forwarded: { req?: Parameters<StreamingForwarder>[0]; called: number } = { called: 0 };
  const chunks = opts.chunks ?? streamingFixtureFrames();
  const streamForward: StreamingForwarder = (req) => {
    forwarded.req = req;
    forwarded.called++;
    async function* body(): AsyncIterable<Uint8Array> {
      for (const c of chunks) yield Buffer.from(c, "utf8");
    }
    return Promise.resolve({
      status: opts.status ?? 200,
      headers: opts.headers ?? { "content-type": "text/event-stream", "transfer-encoding": "chunked", "content-length": "999" },
      body: body(),
    });
  };
  let counter = 0;
  return {
    resolver: { resolve: (c: string) => map[c] ?? null } as RunContextResolver,
    secrets: new StaticSecretProvider("sk-PROVIDER"),
    streamForward,
    usageWriter: new InMemoryUsageWriter(),
    fetchLogWriter: new InMemoryFetchLogWriter(),
    capAccountant: opts.capAccountant ?? new InMemoryCapAccountant(),
    events: new InMemoryEventSink(),
    denialSpikes: new DenialSpikeTracker(),
    novelDomains: new NovelDomainTracker(),
    newId: () => `id_${++counter}`,
    now: () => new Date("2026-09-02T00:00:00.000Z"),
    forwarded,
  };
}

function request(overrides: Partial<ProxyRequest> = {}): ProxyRequest {
  return {
    method: "POST",
    host: "api.anthropic.com",
    path: "/v1/messages",
    url: "https://api.anthropic.com/v1/messages",
    headers: { [PROXY_CREDENTIAL_HEADER]: CRED, "content-type": "application/json" },
    body: JSON.stringify({ model: "claude-opus-5", stream: true, messages: [{ role: "user", content: "hi" }] }),
    ...overrides,
  };
}

describe("streamProxyRequest — incremental delivery + meter-once (D-P0.07-5)", () => {
  it("delivers the upstream stream frame-by-frame (a write per chunk) after the headers", async () => {
    const h = harness();
    const sink = new RecordingSink();
    await streamProxyRequest(request(), h, sink);

    expect(sink.head?.status).toBe(200);
    expect(sink.ended).toBe(true);
    // one write per upstream chunk — NOT a single buffered write of the whole body (that is the bug we fix).
    expect(sink.writes.length).toBe(streamingFixtureFrames().length);
    expect(sink.writes.length).toBeGreaterThan(1);
    // the reassembled stream equals the upstream body verbatim (nothing dropped/reordered).
    expect(sink.writes.join("")).toBe(streamingFixtureFrames().join(""));
  });

  it("strips response framing headers so the transport re-chunks (no stale content-length)", async () => {
    const h = harness();
    const sink = new RecordingSink();
    await streamProxyRequest(request(), h, sink);
    const keys = Object.keys(sink.head!.headers).map((k) => k.toLowerCase());
    expect(keys).not.toContain("content-length");
    expect(keys).not.toContain("transfer-encoding");
    expect(sink.head!.headers["content-type"]).toBe("text/event-stream");
  });

  it("meters the accumulated response ONCE and logs each server-tool fetch/search once", async () => {
    const h = harness();
    await streamProxyRequest(request(), h, new RecordingSink());

    // exactly one usage row, priced from the folded SSE usage (Opus 5: 1M in + 1M out).
    expect(h.usageWriter.rows).toHaveLength(1);
    expect(h.usageWriter.rows[0]!.model).toBe("claude-opus-5");
    expect(h.usageWriter.rows[0]!.source).toBe("proxy");
    expect(h.capAccountant.spentCredits("run_1")).toBeGreaterThan(0);

    // the fetch log carries the search + the fetch each once, plus the served-request (`inference`) row.
    const kinds = h.fetchLogWriter.rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === "search")).toHaveLength(1);
    expect(kinds.filter((k) => k === "fetch")).toHaveLength(1);
    expect(kinds.filter((k) => k === "inference")).toHaveLength(1);
  });

  it("writes an early refusal whole and never forwards (missing credential)", async () => {
    const h = harness();
    const sink = new RecordingSink();
    await streamProxyRequest(request({ headers: { "content-type": "application/json" } }), h, sink);
    expect(sink.head?.status).toBe(403);
    expect(sink.ended).toBe(true);
    expect(h.forwarded.called).toBe(0); // no upstream forward on a refusal
    expect(JSON.parse(sink.writes.join(""))).toMatchObject({ error: { type: "egress.denied" } });
  });

  it("refuses at the cap with a 402 and does not forward", async () => {
    const h = harness();
    h.capAccountant.record("run_1", 1_000_001); // already over the 1,000,000 cap
    const sink = new RecordingSink();
    await streamProxyRequest(request(), h, sink);
    expect(sink.head?.status).toBe(402);
    expect(h.forwarded.called).toBe(0);
  });
});

describe("streamProxyRequest — meter-before-end ordering (DEF.3 / STB.3 F10)", () => {
  it("commits the usage record BEFORE the stream's terminal bytes reach the client", async () => {
    // §12.4's residual bound is one in-flight request; the invariant that makes it honest is ORDERING:
    // a client that observes end-of-stream is already on the meter. Instrument both sides and assert
    // the durable usage write lands before the last chunk + end() — no consumed-but-unmetered window.
    const order: string[] = [];
    const h = harness();
    const write = h.usageWriter.write.bind(h.usageWriter);
    h.usageWriter.write = async (row) => {
      order.push("usage");
      return write(row);
    };
    class OrderedSink extends RecordingSink {
      write(c: Uint8Array): void {
        order.push("chunk");
        super.write(c);
      }
      end(): void {
        order.push("end");
        super.end();
      }
    }
    const sink = new OrderedSink();
    await streamProxyRequest(request(), h, sink);

    expect(h.usageWriter.rows).toHaveLength(1); // the response WAS metered…
    expect(sink.ended).toBe(true);
    // …and its row committed before the terminal chunk + end() hit the client.
    expect(order.indexOf("usage")).toBeLessThan(order.lastIndexOf("chunk"));
    expect(order.indexOf("usage")).toBeLessThan(order.indexOf("end"));
    // stream integrity is unchanged — the withheld tail still delivers every byte.
    expect(sink.writes.join("")).toBe(streamingFixtureFrames().join(""));
  });

  it("a served stream that crosses the cap makes the NEXT request 402 (spec'd residual bound: one request)", async () => {
    const shared = new InMemoryCapAccountant();
    const context = ctx({ capCredits: 4000 });
    const h1 = harness({ context, capAccountant: shared });
    await streamProxyRequest(request(), h1, new RecordingSink());
    // Opus 5 fixture: 1M in + 1M out = $30 list → 4,200 precise credits — one request over the 4,000 cap.
    expect(shared.spentCredits("run_1")).toBeCloseTo(4200, 6);

    const h2 = harness({ context, capAccountant: shared });
    const sink2 = new RecordingSink();
    await streamProxyRequest(request(), h2, sink2);
    expect(sink2.head?.status).toBe(402);
    expect(h2.forwarded.called).toBe(0);
    expect(h2.fetchLogWriter.rows.some((r) => r.decision === "deny" && r.denyReason === "cap")).toBe(true);
    expect(h2.usageWriter.rows).toHaveLength(0);
  });

  it("a meterOnly (est_) context meters usage but writes no run-scoped rows — and the stream completes", async () => {
    // DEF.2 Stage-B: the claim pre-pass mints est_<id> credentials with NO `runs` row (an estimate must
    // never create one). fetch_log/run_events*/pause_signals all FK to runs(id) — pre-fix the step-9
    // fetch_log write threw INSIDE meter() after the usage commit, truncating the delivered body at the
    // withheld tail (seen live: a 100-byte partial JSON → res.json() throws → no estimate_cache row).
    const h = harness({ context: ctx({ runId: "est_1", meterOnly: true }) });
    const sink = new RecordingSink();
    await streamProxyRequest(request(), h, sink);

    expect(sink.head?.status).toBe(200);
    expect(sink.ended).toBe(true); // the FULL body reaches the client…
    expect(sink.writes.join("")).toBe(streamingFixtureFrames().join(""));
    expect(h.usageWriter.rows).toHaveLength(1); // …metered as absorbed COGS…
    expect(h.usageWriter.rows[0]!.runId).toBe("est_1");
    expect(h.capAccountant.spentCredits("est_1")).toBeGreaterThan(0);
    expect(h.fetchLogWriter.rows).toHaveLength(0); // …but nothing run-scoped is written.
  });

  it("a meterOnly context keeps refusal HTTP semantics without emitting run-scoped rows/events", async () => {
    const h = harness({ context: ctx({ runId: "est_2", meterOnly: true }) });
    h.capAccountant.record("est_2", 1_000_001); // over the 1,000,000 cap
    const sink = new RecordingSink();
    await streamProxyRequest(request(), h, sink);

    expect(sink.head?.status).toBe(402);
    expect(sink.ended).toBe(true); // a refusal is written whole…
    expect(h.forwarded.called).toBe(0);
    expect(h.fetchLogWriter.rows).toHaveLength(0); // …no deny row or event — there is no run to attribute to.
    const events = h.events as InMemoryEventSink;
    expect(events.egressDenied).toHaveLength(0);
    expect(events.pauseSignals).toHaveLength(0);
  });

  it("a response the meter refuses is never fully delivered — honest truncation, not silent unmetering (I2)", async () => {
    // Usage arrives in a message_delta but no model is nameable (not in the stream, not in the
    // request) → the meter must refuse; the withheld terminal frame then never reaches the client.
    const sink = new RecordingSink();
    const noModelChunks = sseFrames([{ type: "message_delta", delta: {}, usage: { output_tokens: 100 } }]);
    const noModelBody = JSON.stringify({ stream: true, messages: [{ role: "user", content: "hi" }] }); // no "model"
    const h = harness({ chunks: noModelChunks });
    await expect(streamProxyRequest(request({ body: noModelBody }), h, sink)).rejects.toThrow(/no model/i);
    expect(h.usageWriter.rows).toHaveLength(0); // nothing metered…
    expect(sink.ended).toBe(false); // …and the handler never completed the response…
    // …so the stream never reaches `[DONE]` — the SDK sees a truncated response, never a
    // complete-but-unmetered one. (The server shell's catch ends the socket; tested separately.)
    expect(sink.writes.join("")).not.toContain("[DONE]");
  });
});
