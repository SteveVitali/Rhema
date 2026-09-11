import { describe, expect, it } from "vitest";
import { extractModel, extractUsage, extractUsageFromJson, extractUsageFromSse, isSseBody } from "./usage-block.js";

const JSON_RESPONSE = JSON.stringify({
  id: "msg_1",
  model: "claude-opus-5",
  usage: {
    input_tokens: 1200,
    output_tokens: 340,
    cache_read_input_tokens: 5000,
    cache_creation_input_tokens: 800,
    server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 },
  },
});

// A minimal SSE stream: message_start carries input + cache; message_delta carries cumulative output + tools.
const SSE_RESPONSE = [
  `event: message_start`,
  `data: ${JSON.stringify({ type: "message_start", message: { model: "claude-fable-5-1", usage: { input_tokens: 900, cache_read_input_tokens: 100, output_tokens: 1 } } })}`,
  ``,
  `event: message_delta`,
  `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 512, server_tool_use: { web_search_requests: 4 } } })}`,
  ``,
  `event: message_stop`,
  `data: ${JSON.stringify({ type: "message_stop" })}`,
  ``,
].join("\n");

describe("usage extraction", () => {
  it("reads a non-streaming JSON usage block incl. server_tool_use + cache (AC3)", () => {
    const u = extractUsageFromJson(JSON_RESPONSE);
    expect(u).toEqual({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 5000,
      cacheWriteTokens: 800,
      webSearchRequests: 2,
      webFetchRequests: 1,
    });
  });

  it("folds message_start + message_delta for an SSE stream", () => {
    const u = extractUsageFromSse(SSE_RESPONSE);
    expect(u).toEqual({
      inputTokens: 900,
      outputTokens: 512,
      cacheReadTokens: 100,
      cacheWriteTokens: 0,
      webSearchRequests: 4,
      webFetchRequests: 0,
    });
  });

  it("auto-detects SSE vs JSON and returns null when there is no usage", () => {
    expect(isSseBody(SSE_RESPONSE)).toBe(true);
    expect(isSseBody(JSON_RESPONSE)).toBe(false);
    expect(isSseBody("", "text/event-stream; charset=utf-8")).toBe(true);
    expect(extractUsage(JSON_RESPONSE)).not.toBeNull();
    expect(extractUsage(JSON.stringify({ error: { type: "overloaded" } }))).toBeNull();
    expect(extractUsage("not json")).toBeNull();
  });

  it("extracts the authoritative response model (JSON + SSE)", () => {
    expect(extractModel(JSON_RESPONSE)).toBe("claude-opus-5");
    expect(extractModel(SSE_RESPONSE)).toBe("claude-fable-5-1");
    expect(extractModel("not json")).toBeNull();
  });
});
