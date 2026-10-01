import { describe, expect, it } from "vitest";
import { extractResponseServerToolsSse, extractResponseServerTools } from "./outbound-limits.js";

/** Build a minimal Anthropic SSE stream from a list of `data:` payload objects. */
function sse(events: Array<Record<string, unknown>>): string {
  return events.map((e) => `event: ${String(e["type"])}\ndata: ${JSON.stringify(e)}\n\n`).join("") + "data: [DONE]\n\n";
}

describe("extractResponseServerToolsSse (D-P0.07-5)", () => {
  it("assembles a web_search query from input_json_delta chunks and logs it once", () => {
    const body = sse([
      { type: "message_start", message: {} },
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"que' } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: 'ry":"rhema spec"}' } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: {}, usage: { output_tokens: 5 } },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([{ kind: "search", query: "rhema spec" }]);
  });

  it("extracts a web_fetch url and handles multiple interleaved blocks", () => {
    const body = sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"x"}' } },
      { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", name: "web_fetch", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"url":"https://a.test/p"}' } },
      { type: "content_block_stop", index: 1 },
      { type: "content_block_stop", index: 0 },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([
      { kind: "fetch", url: "https://a.test/p" }, // index 1 stopped first
      { kind: "search", query: "x" },
    ]);
  });

  it("seeds a complete input inlined at content_block_start (no deltas)", () => {
    const body = sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_fetch", input: { url: "https://b.test" } } },
      { type: "content_block_stop", index: 0 },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([{ kind: "fetch", url: "https://b.test" }]);
  });

  it("resolves a truncated stream (no explicit content_block_stop)", () => {
    const body = sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"query":"q"}' } },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([{ kind: "search", query: "q" }]);
  });

  it("ignores non-tool blocks, garbled input, and [DONE]", () => {
    const body = sse([
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "hi" } },
      { type: "content_block_start", index: 1, content_block: { type: "server_tool_use", name: "web_search", input: {} } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{not json" } },
      { type: "content_block_stop", index: 1 },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([]);
    // a JSON (non-SSE) body returns [] from the SSE extractor — the handler dispatches by content-type.
    expect(extractResponseServerToolsSse('{"content":[]}')).toEqual([]);
    // and the JSON extractor still returns [] for an SSE body (they are complementary).
    expect(extractResponseServerTools(body)).toEqual([]);
  });

  it("captures the RESULT urls of a web_search_tool_result block (SSE) — the sources the model cites (P0.15h, cited⇒fetched)", () => {
    const body = sse([
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", name: "web_search", input: { query: "rhema" } } },
      { type: "content_block_stop", index: 0 },
      {
        type: "content_block_start",
        index: 1,
        content_block: {
          type: "web_search_tool_result",
          tool_use_id: "srvtoolu_1",
          content: [
            { type: "web_search_result", url: "https://a.test/one", title: "One" },
            { type: "web_search_result", url: "https://b.test/two", title: "Two" },
          ],
        },
      },
      { type: "content_block_stop", index: 1 },
    ]);
    expect(extractResponseServerToolsSse(body)).toEqual([
      { kind: "search", query: "rhema" },
      { kind: "fetch", url: "https://a.test/one" },
      { kind: "fetch", url: "https://b.test/two" },
    ]);
  });

  it("captures web_search_tool_result urls from a buffered JSON response, and an error result yields none", () => {
    const ok = JSON.stringify({
      content: [
        { type: "server_tool_use", name: "web_search", input: { query: "q" } },
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://c.test/p" }] },
      ],
    });
    expect(extractResponseServerTools(ok)).toEqual([
      { kind: "search", query: "q" },
      { kind: "fetch", url: "https://c.test/p" },
    ]);
    // a web_search_tool_result ERROR carries an object (error_code), not a results array → nothing fetched.
    const err = JSON.stringify({
      content: [{ type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } }],
    });
    expect(extractResponseServerTools(err)).toEqual([]);
  });

  // PRB.19 — the fetch byte receipt: the server-tool result carries the page inline (encrypted_content for a
  // search hit, content.source.data for a web_fetch) — its size is what `fetch_log.bytes` records.
  it("a web_search_result's encrypted_content sizes the fetched page (bytes on the fetch activity)", () => {
    const page = "x".repeat(1234);
    const body = JSON.stringify({
      content: [
        { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.test/p", encrypted_content: page }] },
      ],
    });
    expect(extractResponseServerTools(body)).toEqual([{ kind: "fetch", url: "https://a.test/p", bytes: Buffer.byteLength(page, "utf8") }]);
  });

  it("a web_fetch_tool_result's content.source.data sizes the page (utf8 and base64)", () => {
    const text = "hello fetched page";
    const body = JSON.stringify({
      content: [
        {
          type: "web_fetch_tool_result",
          content: { type: "web_fetch_result", url: "https://a.test/f", content: { source: { type: "text", data: text } } },
        },
        {
          type: "web_fetch_tool_result",
          content: { type: "web_fetch_result", url: "https://a.test/pdf", content: { source: { type: "base64", media_type: "application/pdf", data: Buffer.from("PDFBYTES").toString("base64") } } },
        },
      ],
    });
    expect(extractResponseServerTools(body)).toEqual([
      { kind: "fetch", url: "https://a.test/f", bytes: Buffer.byteLength(text, "utf8") },
      { kind: "fetch", url: "https://a.test/pdf", bytes: Buffer.byteLength("PDFBYTES") },
    ]);
  });

  it("a result with no inline content carries no byte receipt (undefined — the row logs null, never a guess)", () => {
    const body = JSON.stringify({
      content: [{ type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://a.test/p" }] }],
    });
    expect(extractResponseServerTools(body)).toEqual([{ kind: "fetch", url: "https://a.test/p" }]);
  });
});
