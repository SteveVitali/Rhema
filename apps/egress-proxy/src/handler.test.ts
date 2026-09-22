import { describe, expect, it } from "vitest";
import { InMemoryCapAccountant } from "./cap.js";
import type { RunContext, RunContextResolver } from "./context.js";
import { PROXY_CREDENTIAL_HEADER, AGENT_ID_HEADER } from "./credential.js";
import { handleProxyRequest, type Forwarder, type HandlerDeps, type ProxyRequest, type UpstreamResponse } from "./handler.js";
import { NovelDomainTracker, ResearchUsageTracker } from "./outbound-limits.js";
import {
  InMemoryFetchLogWriter,
  InMemoryUsageWriter,
  StaticSecretProvider,
} from "./sinks.js";
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
    allowlist: {
      endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/messages" }],
      models: ["claude-opus-5"],
    },
    urlPolicy: { blockedDomains: ["holdout.example"] },
    ...overrides,
  };
}

function resolverFor(map: Record<string, RunContext>): RunContextResolver {
  return { resolve: (c) => map[c] ?? null };
}

/** A messages response body with a full usage block (Opus 5: 1M in + 1M out = $30 list → 4200 credits). */
function opusResponse(): string {
  return JSON.stringify({
    id: "msg_1",
    model: "claude-opus-5",
    usage: { input_tokens: 1_000_000, output_tokens: 1_000_000 },
  });
}

interface Harness extends HandlerDeps {
  usageWriter: InMemoryUsageWriter;
  fetchLogWriter: InMemoryFetchLogWriter;
  events: InMemoryEventSink;
  capAccountant: InMemoryCapAccountant;
  forwarded: { req?: Parameters<Forwarder>[0] };
}

function harness(opts: {
  context?: RunContext | null;
  response?: UpstreamResponse;
  capAccountant?: InMemoryCapAccountant;
} = {}): Harness {
  const context = opts.context === undefined ? ctx() : opts.context;
  const map: Record<string, RunContext> = context ? { [CRED]: context } : {};
  const forwarded: { req?: Parameters<Forwarder>[0] } = {};
  const response = opts.response ?? {
    status: 200,
    headers: { "content-type": "application/json" },
    body: opusResponse(),
  };
  const forward: Forwarder = async (req) => {
    forwarded.req = req;
    return response;
  };
  let counter = 0;
  return {
    resolver: resolverFor(map),
    secrets: new StaticSecretProvider("sk-PROVIDER"),
    forward,
    usageWriter: new InMemoryUsageWriter(),
    fetchLogWriter: new InMemoryFetchLogWriter(),
    capAccountant: opts.capAccountant ?? new InMemoryCapAccountant(),
    events: new InMemoryEventSink(),
    denialSpikes: new DenialSpikeTracker(),
    novelDomains: new NovelDomainTracker(),
    researchUsage: new ResearchUsageTracker(), // per-test isolation — the prod default is a shared instance
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
    headers: {
      [PROXY_CREDENTIAL_HEADER]: CRED,
      authorization: "Bearer sandbox-token",
      "x-api-key": "sk-sandbox",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-opus-5", messages: [{ role: "user", content: "hi" }] }),
    ...overrides,
  };
}

describe("handleProxyRequest — credential gate (AC1)", () => {
  it("refuses a credential-less request with 403 egress.denied and never forwards", async () => {
    const h = harness();
    const headers = { "content-type": "application/json" };
    const res = await handleProxyRequest(request({ headers }), h);
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("egress.denied");
    expect(h.events.egressDenied).toHaveLength(1);
    expect(h.events.egressDenied[0]!.reason).toContain("missing");
    expect(h.forwarded.req).toBeUndefined();
    // No run to attribute → no fetch_log row.
    expect(h.fetchLogWriter.rows).toHaveLength(0);
  });

  it("refuses an invalid credential (binds to no run) with 403", async () => {
    const h = harness();
    const res = await handleProxyRequest(request({ headers: { [PROXY_CREDENTIAL_HEADER]: "bogus" } }), h);
    expect(res.status).toBe(403);
    expect(h.forwarded.req).toBeUndefined();
  });

  it("refuses an off-allowlist endpoint with 403 + a deny fetch_log row", async () => {
    const h = harness();
    const res = await handleProxyRequest(request({ host: "evil.example", url: "https://evil.example/v1/messages" }), h);
    expect(res.status).toBe(403);
    expect(h.forwarded.req).toBeUndefined();
    expect(h.fetchLogWriter.rows).toHaveLength(1);
    expect(h.fetchLogWriter.rows[0]).toMatchObject({ decision: "deny", status: 403, attempt: 1, runId: "run_1" });
    expect(h.events.egressDenied).toHaveLength(1);
  });

  it("refuses an off-allowlist model with 403", async () => {
    const h = harness();
    const body = JSON.stringify({ model: "claude-fable-5-1", messages: [] });
    const res = await handleProxyRequest(request({ body }), h);
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.message).toContain("claude-fable-5-1");
    expect(h.forwarded.req).toBeUndefined();
  });
});

describe("handleProxyRequest — serve, scrub, meter, log (AC3, AC5, AC6)", () => {
  it("forwards with the provider key, strips sandbox auth, meters the response, logs the request", async () => {
    const h = harness();
    const res = await handleProxyRequest(request(), h);
    expect(res.status).toBe(200);

    // AC5: sandbox Authorization + x-api-key never forwarded; only the injected provider key reaches upstream.
    const fwd = h.forwarded.req!;
    expect(fwd.headers["authorization"]).toBeUndefined();
    expect(fwd.headers["x-api-key"]).toBe("sk-PROVIDER");
    expect(fwd.headers[PROXY_CREDENTIAL_HEADER]).toBeUndefined();

    // Metered into the rows of record (Opus 5: $30 list → 4200 credits).
    expect(h.usageWriter.rows).toHaveLength(1);
    expect(h.usageWriter.rows[0]).toMatchObject({
      runId: "run_1",
      source: "proxy",
      model: "claude-opus-5",
      listCostUsd: 30,
      credits: 4200,
    });
    expect(h.capAccountant.spentCredits("run_1")).toBeCloseTo(4200, 6);

    // AC6: a fetch_log row for the served request, tagged run/attempt/agent, url, status, decision.
    const infRows = h.fetchLogWriter.rows.filter((r) => r.kind === "inference");
    expect(infRows).toHaveLength(1);
    expect(infRows[0]).toMatchObject({
      runId: "run_1",
      attempt: 1,
      agentLabel: "editor",
      url: "https://api.anthropic.com/v1/messages",
      status: 200,
      decision: "allow",
    });
  });

  it("attributes a subagent via the harness agent-id header", async () => {
    const h = harness();
    const headers = { [PROXY_CREDENTIAL_HEADER]: CRED, [AGENT_ID_HEADER]: "second-reader", "content-type": "application/json" };
    await handleProxyRequest(request({ headers }), h);
    expect(h.usageWriter.rows[0]!.subagentLabel).toBe("second-reader");
    expect(h.fetchLogWriter.rows[0]!.agentLabel).toBe("second-reader");
  });

  it("meters server_tool_use + cache-write tokens (AC3)", async () => {
    const response: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 1_000_000,
          server_tool_use: { web_search_requests: 10 },
        },
      }),
    };
    const h = harness({ response });
    await handleProxyRequest(request(), h);
    // cache write 1.25 × $5 = $6.25 + 10 × $0.01 = $6.35 list.
    expect(h.usageWriter.rows[0]).toMatchObject({ cacheWriteTokens: 1_000_000, searches: 10, listCostUsd: 6.35 });
  });

  it("does not meter a non-2xx response but still logs the request", async () => {
    const response: UpstreamResponse = {
      status: 429,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: { type: "overloaded" } }),
    };
    const h = harness({ response });
    const res = await handleProxyRequest(request(), h);
    expect(res.status).toBe(429);
    expect(h.usageWriter.rows).toHaveLength(0);
    expect(h.fetchLogWriter.rows.filter((r) => r.kind === "inference")).toHaveLength(1);
  });
});

describe("handleProxyRequest — cap enforcement (AC2)", () => {
  it("serves the request that crosses the cap, then refuses the next with 402 budget", async () => {
    // cap 4000 credits; each opus response meters 4200 → the first serves and crosses, the second is refused.
    const shared = new InMemoryCapAccountant();
    const context = ctx({ capCredits: 4000 });
    const h1 = harness({ context, capAccountant: shared });
    const first = await handleProxyRequest(request(), h1);
    expect(first.status).toBe(200);
    expect(shared.spentCredits("run_1")).toBeCloseTo(4200, 6);
    // Σ usage rows reflect the served (crossing) response.
    expect(h1.usageWriter.rows).toHaveLength(1);

    const h2 = harness({ context, capAccountant: shared });
    const second = await handleProxyRequest(request(), h2);
    expect(second.status).toBe(402);
    expect(JSON.parse(second.body).error.type).toBe("budget");
    expect(h2.forwarded.req).toBeUndefined();
    // The refused request is logged as a deny, but never metered.
    expect(h2.usageWriter.rows).toHaveLength(0);
    expect(h2.fetchLogWriter.rows.some((r) => r.decision === "deny" && r.denyReason === "cap")).toBe(true);
  });
});

describe("handleProxyRequest — outbound-channel limits (AC4)", () => {
  it("strips a web_fetch URL whose query string exceeds 256 chars before forwarding", async () => {
    const longQuery = "d=" + "a".repeat(298);
    const body = JSON.stringify({
      model: "claude-opus-5",
      messages: [
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "web_fetch", input: { url: `https://leak.example/p?${longQuery}` } }],
        },
      ],
    });
    const h = harness();
    await handleProxyRequest(request({ body }), h);
    const fwdBody = JSON.parse(h.forwarded.req!.body) as {
      messages: { content: { input: { url: string } }[] }[];
    };
    // The over-long query is stripped from the OUTBOUND body before it can leave.
    expect(fwdBody.messages[0]!.content[0]!.input.url).toBe("https://leak.example/p");
  });

  it("logs THIS turn's server-tool activity from the response (fetch log of record), not from request history", async () => {
    const response: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: "server_tool_use", name: "web_search", input: { query: "widgets review" } },
          { type: "server_tool_use", name: "web_fetch", input: { url: "https://src.example/a" } },
          { type: "text", text: "answer" },
        ],
      }),
    };
    const h = harness({ response });
    await handleProxyRequest(request(), h);
    const search = h.fetchLogWriter.rows.filter((r) => r.kind === "search");
    const fetch = h.fetchLogWriter.rows.filter((r) => r.kind === "fetch");
    expect(search).toHaveLength(1);
    expect(search[0]).toMatchObject({ query: "widgets review", decision: "allow", attempt: 1 });
    expect(fetch).toHaveLength(1);
    expect(fetch[0]).toMatchObject({ url: "https://src.example/a", decision: "allow" });
  });

  it("emits suspicious_query + a pause signal and refuses when a search shares ≥12 draft words", async () => {
    const draft = "the quick brown fox jumps over the lazy dog while the cat sleeps in the sun";
    const context = ctx({ draftText: draft });
    const body = JSON.stringify({
      model: "claude-opus-5",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "server_tool_use",
              name: "web_search",
              input: { query: "the quick brown fox jumps over the lazy dog while the cat" },
            },
          ],
        },
      ],
    });
    const h = harness({ context });
    const res = await handleProxyRequest(request({ body }), h);
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("suspicious_query");
    expect(h.forwarded.req).toBeUndefined();
    expect(h.events.pauseSignals).toHaveLength(1);
    expect(h.events.pauseSignals[0]).toMatchObject({ runId: "run_1", reason: "suspicious_query" });
    expect(h.fetchLogWriter.rows.some((r) => r.kind === "search" && r.denyReason === "suspicious_query")).toBe(true);
  });

  it("injects the run's blocked domains into a server web tool before forwarding (§12.6)", async () => {
    const body = JSON.stringify({
      model: "claude-opus-5",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "web_search_20250305", name: "web_search" }],
    });
    const h = harness();
    await handleProxyRequest(request({ body }), h);
    const fwdBody = JSON.parse(h.forwarded.req!.body) as { tools: { blocked_domains?: string[] }[] };
    expect(fwdBody.tools[0]!.blocked_domains).toContain("holdout.example");
  });
});

describe("handleProxyRequest — server web tools guaranteed + logged end-to-end (P0.15i)", () => {
  it("injects a server web_search into a Messages request that carried no tools (the P0.15h searches=0 fix)", async () => {
    const h = harness();
    await handleProxyRequest(request(), h); // base body has NO tools[]
    const fwdBody = JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string; type?: string; blocked_domains?: string[] }[] };
    const search = fwdBody.tools?.find((t) => t.name === "web_search");
    expect(search).toBeDefined();
    expect(search!.type).toBe("web_search_20250305");
    // and it is domain-scoped to the run policy in the same pass.
    expect(search!.blocked_domains).toContain("holdout.example");
    // web_fetch is ON by default (GA, no beta header) — injected alongside web_search.
    expect(fwdBody.tools?.some((t) => t.name === "web_fetch")).toBe(true);
  });

  it("still forwards the injected web_search when the run has NO url policy (the common case — S3)", async () => {
    // Most Reviews have no blocked/allowed domains, so `injected.rewritten` is false; the `ensured.added` term is
    // what forwards the tool. Without it the injected tool would be silently dropped for these runs.
    const h = harness({ context: ctx({ urlPolicy: { blockedDomains: [] } }) });
    await handleProxyRequest(request(), h);
    const fwdBody = JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string; blocked_domains?: string[] }[] };
    const search = fwdBody.tools?.find((t) => t.name === "web_search");
    expect(search).toBeDefined();
    // no policy ⇒ the tool is present but unscoped (no blocked_domains added).
    expect(search!.blocked_domains).toBeUndefined();
  });

  it("injects web_fetch by default; a run can opt it OUT via ctx.webTools", async () => {
    const on = harness();
    await handleProxyRequest(request(), on);
    expect((JSON.parse(on.forwarded.req!.body) as { tools?: { name?: string }[] }).tools?.some((t) => t.name === "web_fetch")).toBe(true);

    const off = harness({ context: ctx({ webTools: { fetch: false } }) });
    await handleProxyRequest(request(), off);
    expect((JSON.parse(off.forwarded.req!.body) as { tools?: { name?: string }[] }).tools?.some((t) => t.name === "web_fetch")).toBe(false);
  });

  it("does not inject into a non-Messages endpoint (e.g. count_tokens)", async () => {
    const h = harness();
    const req = request({ path: "/v1/messages/count_tokens", url: "https://api.anthropic.com/v1/messages/count_tokens" });
    await handleProxyRequest(req, h);
    const fwdBody = JSON.parse(h.forwarded.req!.body) as { tools?: unknown };
    expect(fwdBody.tools).toBeUndefined();
  });

  it("meters searches>0 and logs the RESULT urls as fetch rows once the model actually searches (AC3 chain)", async () => {
    // The server-side search returns pages; those result urls become the fetch log of record for cited⇒fetched.
    const response: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 2 } },
        content: [
          { type: "server_tool_use", name: "web_search", input: { query: "is the claim true" } },
          {
            type: "web_search_tool_result",
            content: [
              { type: "web_search_result", url: "https://reuters.com/article/x", title: "X" },
              { type: "web_search_result", url: "https://nature.com/y", title: "Y" },
            ],
          },
          { type: "text", text: "verified" },
        ],
      }),
    };
    const h = harness({ response });
    await handleProxyRequest(request(), h);
    // usage_records.searches > 0 (the §12.7 meter of record).
    expect(h.usageWriter.rows[0]!.searches).toBe(2);
    // and the RESULT urls are logged as fetch rows (the provenance cited⇒fetched resolves against).
    const fetchedUrls = h.fetchLogWriter.rows.filter((r) => r.kind === "fetch").map((r) => r.url);
    expect(fetchedUrls).toContain("https://reuters.com/article/x");
    expect(fetchedUrls).toContain("https://nature.com/y");
  });
});

describe("handleProxyRequest — per-run research budget (PRB.22; D-PRB.21-1)", () => {
  /** A request body whose assistant history already contains `n` web_fetch invocations. */
  function historyWithFetches(n: number): string {
    return JSON.stringify({
      model: "claude-opus-5",
      messages: [
        { role: "user", content: "verify" },
        {
          role: "assistant",
          content: Array.from({ length: n }, (_, i) => ({
            type: "server_tool_use",
            name: "web_fetch",
            input: { url: `https://src.example/${i}` },
          })),
        },
      ],
    });
  }

  it("drops web_fetch once the run's fetch budget is already consumed by history", async () => {
    const context = ctx({ webTools: { fetchBudget: 2, searchBudget: 10 } });
    const h = harness({ context });
    await handleProxyRequest(request({ body: historyWithFetches(2) }), h);
    const tools = (JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string }[] }).tools ?? [];
    expect(tools.some((t) => t.name === "web_fetch")).toBe(false); // exhausted — tool removed
    expect(tools.some((t) => t.name === "web_search")).toBe(true); // still budgeted
  });

  it("shrinks max_uses to the remaining budget (partial remainder)", async () => {
    const context = ctx({ webTools: { fetchBudget: 5 } });
    const h = harness({ context });
    await handleProxyRequest(request({ body: historyWithFetches(3) }), h);
    const tools = (JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string; max_uses?: number }[] }).tools ?? [];
    expect(tools.find((t) => t.name === "web_fetch")?.max_uses).toBe(2);
  });

  it("accumulates METERED server_tool_use counts across requests (subagent histories)", async () => {
    const context = ctx({ webTools: { searchBudget: 2 } });
    const response: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 2 } },
      }),
    };
    const shared = new ResearchUsageTracker();
    const h1 = harness({ context, response });
    await handleProxyRequest(request(), { ...h1, researchUsage: shared });
    expect(shared.usage("run_1")).toEqual({ fetches: 0, searches: 2 });

    // next request (any history — a subagent's own context would carry none): budget spent → no web_search.
    const h2 = harness({ context });
    await handleProxyRequest(request(), { ...h2, researchUsage: shared });
    const tools = (JSON.parse(h2.forwarded.req!.body) as { tools?: { name?: string }[] }).tools ?? [];
    expect(tools.some((t) => t.name === "web_search")).toBe(false);
  });
});

describe("handleProxyRequest — denial spike pause (REQ-ARCH-32)", () => {
  it("emits a single pause signal once egress denials reach the spike threshold", async () => {
    // Reuse one events sink + spike tracker across denials by sharing the harness.
    const h = harness();
    const offAllowlist = request({ host: "evil.example", url: "https://evil.example/v1/messages" });
    for (let i = 0; i < 5; i++) await handleProxyRequest(offAllowlist, h);
    expect(h.events.egressDenied.length).toBe(5);
    expect(h.events.pauseSignals.filter((s) => s.reason === "egress_denied_spike")).toHaveLength(1);
  });
});
