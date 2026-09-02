import { describe, it, expect } from "vitest";
import { mapMessages, createMapper } from "./mapper.js";
import type { SdkMessage } from "../sdk-types.js";
import type { EngineEvent } from "../engine.js";

const ctx = { phaseKey: "verification", ordinal: 3, of: 7, mainAgentLabel: "editor" };

function events(msgs: SdkMessage[]): EngineEvent[] {
  return mapMessages(msgs, ctx).filter((e) => e.kind === "event");
}

describe("mapper — REQ-ARCH-15 (source.read URL from the RESULT, never the request)", () => {
  it("does not emit source.read from a fetch request alone", () => {
    const evs = events([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "f1", name: "web_fetch", input: { url: "https://requested.example/x" } }] } },
    ]);
    expect(evs.find((e) => e.kind === "event" && e.type === "source.read")).toBeUndefined();
  });

  it("emits source.read with the RESULT's resolved URL, ignoring the requested URL", () => {
    const evs = events([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "f1", name: "web_fetch", input: { url: "https://requested.example/x" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "f1", content: { resolved_url: "https://actual.example/y", status: 200 } }] } },
    ]);
    const read = evs.find((e) => e.kind === "event" && e.type === "source.read");
    expect(read && read.kind === "event" && (read.payload as { url: string }).url).toBe("https://actual.example/y");
  });

  it("a malformed resolved URL does NOT crash the stream — source.read is skipped, the fetch still audits", () => {
    const all = mapMessages(
      [
        { type: "assistant", message: { content: [{ type: "tool_use", id: "f1", name: "web_fetch", input: { url: "https://a.example" } }] } },
        { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "f1", content: { resolved_url: "not a url" } }] } },
        { type: "result", subtype: "success", usage: { input_tokens: 1, output_tokens: 1 } },
      ],
      ctx,
    );
    expect(all.find((e) => e.kind === "event" && e.type === "source.read")).toBeUndefined();
    // the fetch still shows internally, and the phase still terminates cleanly (no thrown generator):
    expect(all.find((e) => e.kind === "event" && e.type === "tool.audit")).toBeDefined();
    expect(all.find((e) => e.kind === "result")).toBeDefined();
  });

  it("never scans free page text for a URL (a URL only in the body yields no source.read)", () => {
    const evs = events([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "f1", name: "web_fetch", input: { url: "https://a.example" } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "f1", content: { body: "visit http://evil.example/?d=leak" } }] } },
    ]);
    expect(evs.find((e) => e.kind === "event" && e.type === "source.read")).toBeUndefined();
    expect(JSON.stringify(evs)).not.toContain("evil.example");
  });
});

describe("mapper — REQ-ARCH-14 (agent.note is template-only) + free-text bounds", () => {
  it("truncates a hostile over-long search query to the §12.5 cap and never crashes", () => {
    const longQuery = "x".repeat(5000);
    const evs = events([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "s1", name: "web_search", input: { query: longQuery } }] } },
      { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "s1", content: { result_count: 0 } }] } },
    ]);
    const search = evs.find((e) => e.kind === "event" && e.type === "search.performed");
    expect(search && search.kind === "event" && (search.payload as { query: string }).query.length).toBeLessThanOrEqual(280);
  });
});

describe("mapper — subagent attribution (parent_tool_use_id → subagent label)", () => {
  it("attributes a subagent's turns to the subagent, not the seat", () => {
    const evs = events([
      { type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Task", input: { subagent_type: "researcher" } }] } },
      { type: "assistant", parent_tool_use_id: "t1", message: { content: [{ type: "tool_use", id: "s1", name: "web_search", input: { query: "q" } }] } },
      { type: "user", parent_tool_use_id: "t1", message: { content: [{ type: "tool_result", tool_use_id: "s1", content: { result_count: 2 } }] } },
    ]);
    const search = evs.find((e) => e.kind === "event" && e.type === "search.performed");
    expect(search && search.kind === "event" && search.agentLabel).toBe("researcher");
    const started = evs.find((e) => e.kind === "event" && e.type === "subagent.started");
    expect(started && started.kind === "event" && started.agentLabel).toBe("editor");
  });
});

describe("mapper — usage accumulation across ticks", () => {
  it("folds each assistant usage block into the running snapshot (sdk_stream)", () => {
    const m = createMapper(ctx);
    m.push({ type: "assistant", message: { content: [], usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 40 } } });
    m.push({ type: "assistant", message: { content: [], usage: { input_tokens: 50, output_tokens: 10 } } });
    expect(m.usage().inputTokens).toBe(150);
    expect(m.usage().outputTokens).toBe(30);
    expect(m.usage().cacheReadTokens).toBe(40);
  });

  it("does NOT double-count the terminal result usage (it is the cumulative total, not a delta)", () => {
    const m = createMapper(ctx);
    m.push({ type: "assistant", message: { content: [], usage: { input_tokens: 100, output_tokens: 20 } } });
    m.push({ type: "assistant", message: { content: [], usage: { input_tokens: 100, output_tokens: 20 } } });
    // per-turn accumulation so far: 200/40 (the provisional running Σ)
    expect(m.usage().inputTokens).toBe(200);
    // the result carries the authoritative cumulative total (210/42) — it OVERWRITES, never adds:
    m.push({ type: "result", subtype: "success", usage: { input_tokens: 210, output_tokens: 42 }, total_cost_usd: 0.5 });
    expect(m.usage().inputTokens).toBe(210);
    expect(m.usage().outputTokens).toBe(42);
    expect(m.usage().costUsd).toBe(0.5);
  });

  it("emits a provisional usage marker per usage-bearing turn (running Σ; review 13 F4)", () => {
    const all = mapMessages(
      [
        { type: "assistant", message: { content: [], usage: { input_tokens: 100, output_tokens: 20 } } },
        { type: "result", subtype: "success", usage: { input_tokens: 100, output_tokens: 20 } },
      ],
      ctx,
    );
    expect(all.filter((e) => e.kind === "usage").length).toBe(1);
    expect(all.filter((e) => e.kind === "result").length).toBe(1);
  });
});
