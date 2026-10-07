import { describe, it, expect } from "vitest";
import { runResearchPreflight, describePreflightFailures } from "./research-preflight.js";
import { PHASE_CLASS_HEADER, PROXY_CREDENTIAL_HEADER } from "./proxy-injector.js";

const SPEC = {
  models: ["claude-a", "claude-b"],
  tools: ["web_search", "web_fetch"] as const,
  toolTypes: { web_search: "web_search_20250305", web_fetch: "web_fetch_20250910" },
  pairs: [
    { model: "claude-a", tool: "web_search" as const },
    { model: "claude-a", tool: "web_fetch" as const },
    { model: "claude-b", tool: "web_search" as const },
    { model: "claude-b", tool: "web_fetch" as const },
  ],
};

interface CapturedCall {
  url: string;
  headers: Record<string, string>;
  body: {
    model: string;
    tool_choice?: { type: string; name: string };
    tools: { type: string; name: string; max_uses?: number }[];
  };
}

/** A real provider result block for `tool` — the pass rule's positive shape. */
const REAL_RESULT = (tool: string) =>
  tool === "web_search"
    ? {
        type: "web_search_tool_result",
        tool_use_id: "srv_1",
        content: [{ type: "web_search_result", url: "https://example.com/a", title: "2026" }],
      }
    : {
        type: "web_fetch_tool_result",
        tool_use_id: "srv_1",
        content: { type: "web_fetch_result", url: "https://example.com/", retrieved_at: "now" },
      };

type Mode = "ok" | "http_error" | "no_result" | "error_result";

/** A fetch stub that records each probe call and answers per-pair with a shaped response. */
function fakeFetch(modeFor: (model: string, tool: string) => Mode = () => "ok") {
  const calls: CapturedCall[] = [];
  const impl: typeof fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as CapturedCall["body"];
    const headers = Object.fromEntries(
      Object.entries(init?.headers ?? {}).map(([k, v]) => [k, String(v)]),
    );
    calls.push({ url: String(input), headers, body });
    const tool = body.tools[0]!.name;
    const mode = modeFor(body.model, tool);
    if (mode === "http_error") {
      return new Response(
        JSON.stringify({ error: { type: "invalid_request_error", message: "tool not supported" } }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }
    const content =
      mode === "ok"
        ? [{ type: "server_tool_use", name: tool, input: {} }, REAL_RESULT(tool)]
        : mode === "error_result"
          ? [
              { type: "server_tool_use", name: tool, input: {} },
              {
                type: `${tool}_tool_result`,
                tool_use_id: "srv_1",
                content: { type: `${tool}_tool_result_error`, error_code: "too_many_requests" },
              },
            ]
          : // no_result: a 2xx the model answered WITHOUT calling the tool (the incident's shape)
            [{ type: "text", text: "2026" }];
    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return { calls, impl };
}

describe("runResearchPreflight — the bounded model × server-tool probe (RES.1)", () => {
  it("probes every pair through the proxy with the run credential + the preflight class stamp", async () => {
    const { calls, impl } = fakeFetch();
    const out = await runResearchPreflight({
      baseUrl: "https://proxy.test/",
      credential: "cred-1",
      spec: SPEC,
      fetchImpl: impl,
    });
    expect(out).toEqual({ ok: true, probed: 4 });
    // every call hits the run's proxy /v1/messages, carries the credential + phase-class, declares the
    // server-authored variant clamped to max_uses: 1, and FORCES the call so the pass rule is real.
    for (const c of calls) {
      expect(c.url).toBe("https://proxy.test/v1/messages");
      expect(c.headers[PROXY_CREDENTIAL_HEADER]).toBe("cred-1");
      expect(c.headers[PHASE_CLASS_HEADER]).toBe("preflight");
      // the proxy forwards client headers verbatim and injects none — a probe without
      // anthropic-version 400s `invalid_request_error` upstream (live-diagnosed 2026-10-01).
      expect(c.headers["anthropic-version"]).toBe("2023-06-01");
      expect(c.body.tools[0]!.max_uses).toBe(1);
      expect(c.body.tool_choice).toEqual({ type: "tool", name: c.body.tools[0]!.name });
    }
    expect(new Set(calls.map((c) => c.body.model)).size).toBe(2);
  });

  it("a refused pair fails with the HTTP status + provider error class — never silently skipped", async () => {
    const { impl } = fakeFetch((model, tool) =>
      model === "claude-b" && tool === "web_fetch" ? "http_error" : "ok",
    );
    const out = await runResearchPreflight({
      baseUrl: "https://proxy.test",
      credential: "c",
      spec: SPEC,
      fetchImpl: impl,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures).toEqual([
        { model: "claude-b", tool: "web_fetch", ok: false, status: 400, reason: "invalid_request_error" },
      ]);
      expect(describePreflightFailures(out.failures)).toContain("claude-b×web_fetch HTTP 400");
    }
  });

  it("a 2xx WITHOUT the tool's result block fails — the model never called it (the incident's shape)", async () => {
    const { impl } = fakeFetch((model, tool) =>
      model === "claude-a" && tool === "web_search" ? "no_result" : "ok",
    );
    const out = await runResearchPreflight({
      baseUrl: "https://proxy.test",
      credential: "c",
      spec: SPEC,
      fetchImpl: impl,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.failures).toEqual([
        { model: "claude-a", tool: "web_search", ok: false, status: 200, reason: "no_tool_result" },
      ]);
    }
  });

  it("an error result block fails — the provider ran the tool and reported an error", async () => {
    const { impl } = fakeFetch((model, tool) =>
      model === "claude-b" && tool === "web_search" ? "error_result" : "ok",
    );
    const out = await runResearchPreflight({
      baseUrl: "https://proxy.test",
      credential: "c",
      spec: SPEC,
      fetchImpl: impl,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failures[0]!.status).toBe(200);
  });

  it("a transport failure fails closed as a no-response pair", async () => {
    const impl = (() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
    const out = await runResearchPreflight({
      baseUrl: "https://proxy.test",
      credential: "c",
      spec: { ...SPEC, pairs: [SPEC.pairs[0]!] },
      fetchImpl: impl,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.failures[0]!.reason).toContain("transport");
  });
});
