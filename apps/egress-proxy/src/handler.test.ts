import { describe, expect, it } from "vitest";
import { InMemoryCapAccountant } from "./cap.js";
import type { RunContext, RunContextResolver } from "./context.js";
import { PROXY_CREDENTIAL_HEADER, AGENT_ID_HEADER, STEP_HEADER } from "./credential.js";
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

describe("handleProxyRequest — SDK connectivity probe (DEF.3 / STB.3 F7)", () => {
  /** A run whose allowlist carries the probe endpoint the vendored SDK fires at CLI init. */
  const probeCtx = (): RunContext =>
    ctx({
      allowlist: {
        endpoints: [
          { host: "api.anthropic.com", pathPrefix: "/v1/" },
          { host: "api.anthropic.com", pathPrefix: "/api/hello" },
        ],
        models: ["claude-opus-5"],
      },
    });
  const helloReq = (): ProxyRequest =>
    request({
      method: "HEAD",
      path: "/api/hello",
      url: "https://api.anthropic.com/api/hello",
      body: "",
      headers: { [PROXY_CREDENTIAL_HEADER]: CRED },
    });

  it("forwards an allowlisted HEAD /api/hello and logs an allow row — no egress.denied event", async () => {
    const h = harness({
      context: probeCtx(),
      response: { status: 200, headers: {}, body: "" },
    });
    const res = await handleProxyRequest(helloReq(), h);
    expect(res.status).toBe(200);
    expect(h.forwarded.req).toBeDefined();
    expect(h.forwarded.req!.method).toBe("HEAD");
    expect(h.forwarded.req!.path).toBe("/api/hello");
    // no model, no usage block → nothing metered; the honest allow row is the record.
    expect(h.usageWriter.rows).toHaveLength(0);
    expect(h.events.egressDenied).toHaveLength(0);
    const rows = h.fetchLogWriter.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ decision: "allow", url: "https://api.anthropic.com/api/hello", status: 200 });
  });

  it("still denies other off-allowlist provider paths — the probe fix widens nothing else", async () => {
    const h = harness({ context: probeCtx() });
    const res = await handleProxyRequest(
      request({ method: "GET", path: "/api/other", url: "https://api.anthropic.com/api/other", body: "", headers: { [PROXY_CREDENTIAL_HEADER]: CRED } }),
      h,
    );
    expect(res.status).toBe(403);
    expect(h.forwarded.req).toBeUndefined();
    expect(h.events.egressDenied).toHaveLength(1);
    expect(h.fetchLogWriter.rows[0]).toMatchObject({ decision: "deny" });
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

  it("RPT.1 — the harness step stamp lands on usage_records.step_id and never reaches upstream", async () => {
    const h = harness();
    const headers = {
      [PROXY_CREDENTIAL_HEADER]: CRED,
      [STEP_HEADER]: "step:checking_claims",
      "content-type": "application/json",
    };
    const res = await handleProxyRequest(request({ headers }), h);
    expect(res.status).toBe(200);
    // the metered row carries the phase attribution the report's Level-4 join resolves.
    expect(h.usageWriter.rows[0]!.stepId).toBe("step:checking_claims");
    // the internal stamp is stripped from the upstream request (a provider never sees it).
    expect(h.forwarded.req!.headers[STEP_HEADER]).toBeUndefined();
    // an unstamped request meters unattributed (null, not a guess).
    const h2 = harness();
    await handleProxyRequest(request(), h2);
    expect(h2.usageWriter.rows[0]!.stepId).toBeNull();
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
    // CITE.1 — the RESULT urls land on `search` rows carrying `url` (the guard/chip retrieved set is
    // fetch ∪ search-url rows; a search hit is retrieval evidence, not a fetch).
    const searchRows = h.fetchLogWriter.rows.filter((r) => r.kind === "search");
    const searchUrls = searchRows.map((r) => r.url).filter((u): u is string => u !== undefined);
    expect(searchUrls).toContain("https://reuters.com/article/x");
    expect(searchUrls).toContain("https://nature.com/y");
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

describe("handleProxyRequest — RES.1 executed-only history + research floor + phase stamp", () => {
  const PHASE = "x-rhema-phase-class";
  /** Assistant history with `n` EXECUTED web_search calls (`server_tool_use` — provider-written). */
  function executedSearchHistory(n: number): string {
    return JSON.stringify({
      model: "claude-opus-5",
      messages: [
        { role: "user", content: "verify" },
        {
          role: "assistant",
          content: Array.from({ length: n }, (_, i) => ({
            type: "server_tool_use",
            name: "web_search",
            input: { query: `q${i}` },
          })),
        },
      ],
    });
  }
  /** Assistant history with `n` bare `tool_use` calls for web_search — the model's call, never executed. */
  function phantomSearchHistory(n: number): string {
    return JSON.stringify({
      model: "claude-opus-5",
      messages: [
        { role: "user", content: "verify" },
        {
          role: "assistant",
          content: Array.from({ length: n }, (_, i) => ({
            type: "tool_use",
            name: "web_search",
            input: { query: `phantom ${i}` },
          })),
        },
      ],
    });
  }
  const toolsOf = (h: Harness): { name?: string; type?: string; max_uses?: number }[] =>
    (JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string; type?: string; max_uses?: number }[] }).tools ?? [];

  it("the incident regression: bare tool_use blocks in history do NOT consume the search budget", async () => {
    // 2026-09-30: 24 phantom `tool_use` web_search blocks would have read as an exhausted budget under the
    // old name-or-type history count, dropping the tool. Executed-only counting sees zero executions.
    const h = harness({ context: ctx({ webTools: { searchBudget: 24 } }) });
    await handleProxyRequest(request({ body: phantomSearchHistory(24) }), h);
    expect(toolsOf(h).some((t) => t.name === "web_search" && t.type === "web_search_20250305")).toBe(true);
  });

  it("a non-research request sees the bound NET of the floor; `research`-stamped sees the full remainder", async () => {
    const context = ctx({ webTools: { searchBudget: 24, searchFloor: 4 } });
    const body = executedSearchHistory(21); // 24 − 21 = 3 left for research; 24 − 4 − 21 < 0 for everyone else

    const unstamped = harness({ context });
    await handleProxyRequest(request({ body }), unstamped);
    expect(toolsOf(unstamped).some((t) => t.name === "web_search")).toBe(false);

    const judged = harness({ context });
    await handleProxyRequest(request({ body, headers: { ...request().headers, [PHASE]: "verify_structural" } }), judged);
    expect(toolsOf(judged).some((t) => t.name === "web_search")).toBe(false);

    const research = harness({ context });
    await handleProxyRequest(request({ body, headers: { ...request().headers, [PHASE]: "research" } }), research);
    expect(toolsOf(research).find((t) => t.name === "web_search")?.max_uses).toBe(3);
  });

  it("a `preflight`-stamped probe keeps its declared max_uses:1 on an exhausted budget", async () => {
    const context = ctx({ webTools: { searchFloor: 4 } });
    const shared = new ResearchUsageTracker();
    shared.record("run_1", { searches: 24 }); // committed budget fully spent
    const probeBody = JSON.stringify({
      model: "claude-opus-5",
      messages: [{ role: "user", content: "Reply with the word ok." }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    });
    // a normal request is refused the tool outright…
    const denied = harness({ context });
    await handleProxyRequest(request({ body: probeBody }), { ...denied, researchUsage: shared });
    expect(toolsOf(denied).some((t) => t.name === "web_search")).toBe(false);
    // …but the harness's own probe still reaches it (resume re-preflight on a spent budget).
    const probe = harness({ context });
    await handleProxyRequest(
      request({ body: probeBody, headers: { ...request().headers, [PHASE]: "preflight" } }),
      { ...probe, researchUsage: shared },
    );
    expect(toolsOf(probe).find((t) => t.name === "web_search")?.max_uses).toBe(1);
  });

  it("a metered PREFLIGHT response does not consume the research bound it exists to verify", async () => {
    // RES.1 — bypassBudget is symmetric: the probe's executions must not settle into the committed
    // count either, or preflight shrinks the envelope it is proving reachable (first live probe:
    // 2 of 8 searches + 2 of 16 fetches spent on preflight before verification even ran).
    const context = ctx({ webTools: { searchBudget: 8 } });
    const shared = new ResearchUsageTracker();
    const probeResponse: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_search_requests: 1 } },
      }),
    };
    const h = harness({ context, response: probeResponse });
    await handleProxyRequest(
      request({ headers: { ...request().headers, [PHASE]: "preflight" } }),
      { ...h, researchUsage: shared },
    );
    // billed usage still lands on the usage row (the meter of record)…
    expect(h.usageWriter.rows[0]!.searches).toBe(1);
    // …but the research bound sees nothing — the next request still draws the full budget.
    expect(shared.usage("run_1")).toEqual({ fetches: 0, searches: 0 });
    const h2 = harness({ context });
    await handleProxyRequest(request(), { ...h2, researchUsage: shared });
    expect(toolsOf(h2).find((t) => t.name === "web_search")?.max_uses).toBe(8);
  });

  it("two parallel requests can never be granted the same budget slice (the four-subagent window)", async () => {
    // The incident shape: 12-search budget, a wave of parallel research subagents each admitted with the
    // full remainder while committed=0. With reservations the second wave-member sees the first's grant.
    const context = ctx({ webTools: { searchBudget: 12 } });
    const shared = new ResearchUsageTracker();
    let resolveFirst!: (r: UpstreamResponse) => void;
    const gate = new Promise<UpstreamResponse>((res) => {
      resolveFirst = res;
    });
    const h1 = harness({ context });
    const forward1: Forwarder = async (req) => {
      h1.forwarded.req = req;
      return gate; // held open — grant stays reserved while upstream is in flight
    };
    const p1 = handleProxyRequest(request(), { ...h1, forward: forward1, researchUsage: shared });
    // spin until request 1 has been admitted (its forwarded body is captured)
    for (let i = 0; i < 50 && h1.forwarded.req === undefined; i++) await new Promise((r) => setTimeout(r, 1));
    expect(toolsOf(h1).find((t) => t.name === "web_search")?.max_uses).toBe(12); // granted the remainder

    const h2 = harness({ context });
    await handleProxyRequest(request(), { ...h2, researchUsage: shared });
    expect(toolsOf(h2).some((t) => t.name === "web_search")).toBe(false); // 12 − 12 reserved = 0

    // release the wedge: metering commits 0 real use (the response ran no tools) and frees the grant.
    resolveFirst({ status: 200, headers: { "content-type": "application/json" }, body: opusResponse() });
    await p1;
    const h3 = harness({ context });
    await handleProxyRequest(request(), { ...h3, researchUsage: shared });
    expect(toolsOf(h3).some((t) => t.name === "web_search")).toBe(true);
  });

  it("a dead upstream releases the reservation (a wedged grant cannot starve verification)", async () => {
    const context = ctx({ webTools: { searchBudget: 12 } });
    const shared = new ResearchUsageTracker();
    const h1 = harness({ context });
    const failing: Forwarder = async () => {
      throw new Error("upstream unreachable");
    };
    await expect(handleProxyRequest(request(), { ...h1, forward: failing, researchUsage: shared })).rejects.toThrow(
      "upstream unreachable",
    );
    expect(shared.inflight("run_1")).toEqual({ searches: 0, fetches: 0 }); // released on forward failure
    const h2 = harness({ context });
    await handleProxyRequest(request(), { ...h2, researchUsage: shared });
    expect(toolsOf(h2).some((t) => t.name === "web_search")).toBe(true);
  });

  it("the phase stamp is a proxy-internal header — never forwarded to the provider", async () => {
    const h = harness();
    await handleProxyRequest(request({ headers: { ...request().headers, [PHASE]: "research" } }), h);
    expect(h.forwarded.req!.headers[PHASE]).toBeUndefined();
    expect(Object.keys(h.forwarded.req!.headers).some((k) => k.toLowerCase() === PHASE)).toBe(false);
  });

  it("a sandbox-declared bare-name `web_search` is stripped and the real server tool injected (incident shape)", async () => {
    const h = harness();
    const body = JSON.stringify({
      model: "claude-opus-5",
      messages: [{ role: "user", content: "verify" }],
      tools: [{ name: "web_search", description: "search", input_schema: { type: "object" } }],
    });
    await handleProxyRequest(request({ body }), h);
    const tools = toolsOf(h);
    const searchTools = tools.filter((t) => t.name === "web_search");
    expect(searchTools).toHaveLength(1);
    expect(searchTools[0]!.type).toBe("web_search_20250305"); // the real server tool, not the impostor
  });

  it("a `backfill`-stamped request draws the DEDICATED allowance on an exhausted research budget — floor intact", async () => {
    // fetchBudget 6 fully spent + fetchFloor 2 reserved: research would see nothing; the re-entry's
    // fetches draw `backfillFetchBudget` — a separate line, never the research budget nor the floor.
    const context = ctx({ webTools: { fetchBudget: 6, fetchFloor: 2, searchBudget: 24, backfillFetchBudget: 4 } });
    const shared = new ResearchUsageTracker();
    shared.record("run_1", { fetches: 6 }); // committed research budget fully spent

    const research = harness({ context });
    await handleProxyRequest(request(), { ...research, researchUsage: shared });
    expect(toolsOf(research).some((t) => t.name === "web_fetch")).toBe(false); // exhausted + floored

    const backfill = harness({ context });
    await handleProxyRequest(
      request({ headers: { ...request().headers, [PHASE]: "backfill" } }),
      { ...backfill, researchUsage: shared },
    );
    const tools = toolsOf(backfill);
    expect(tools.find((t) => t.name === "web_fetch")?.max_uses).toBe(4); // the allowance, untouched by research
    expect(tools.some((t) => t.name === "web_search")).toBe(false); // backfill never discovers — fetch only
    // the stamp lands on the request's fetch_log row (the completeness `backfilled` ids read it).
    expect(backfill.fetchLogWriter.rows.some((r) => r.kind === "inference" && r.phaseClass === "backfill")).toBe(true);
  });

  it("a metered BACKFILL response settles on the dedicated counter — the research bound is untouched", async () => {
    const context = ctx({ webTools: { fetchBudget: 6, fetchFloor: 2, backfillFetchBudget: 4 } });
    const shared = new ResearchUsageTracker();
    const fetchResponse: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1, server_tool_use: { web_fetch_requests: 2 } },
      }),
    };
    const h = harness({ context, response: fetchResponse });
    await handleProxyRequest(
      request({ headers: { ...request().headers, [PHASE]: "backfill" } }),
      { ...h, researchUsage: shared },
    );
    // metered to the run (the usage row + the dedicated counter)…
    expect(shared.backfillUsage("run_1")).toEqual({ fetches: 2 });
    // …but the research bound sees nothing — the floor's reservation is never spent by the mechanism.
    expect(shared.usage("run_1")).toEqual({ fetches: 0, searches: 0 });
    const research = harness({ context });
    await handleProxyRequest(request(), { ...research, researchUsage: shared });
    expect(toolsOf(research).find((t) => t.name === "web_fetch")?.max_uses).toBe(4); // 6 − 2 floor − 0 research
    // …and the allowance shrinks for the NEXT backfill call: 4 − 2 = 2 left.
    const backfill2 = harness({ context });
    await handleProxyRequest(
      request({ headers: { ...request().headers, [PHASE]: "backfill" } }),
      { ...backfill2, researchUsage: shared },
    );
    expect(toolsOf(backfill2).find((t) => t.name === "web_fetch")?.max_uses).toBe(2);
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

// P1.21 — Memo confidentiality (REQ-WF-8; §16.4): `fetchUserDataForbidden` + `userSourceDomains` are
// ENFORCED at the proxy — a web_fetch to a user-source domain is denied before forwarding, its deny row
// carries the URL only, and every logged search query is the redacted placeholder.
describe("handleProxyRequest — memo user-source confidentiality (REQ-WF-8)", () => {
  const memoCtx = () =>
    ctx({
      urlPolicy: {
        blockedDomains: [],
        userSourceDomains: ["wiki.acme.co"],
        fetchUserDataForbidden: true,
      },
    });

  /** A request body whose history contains a web_fetch invocation to `url`. */
  function fetchHistory(url: string): string {
    return JSON.stringify({
      model: "claude-opus-5",
      messages: [
        { role: "user", content: "verify" },
        { role: "assistant", content: [{ type: "server_tool_use", name: "web_fetch", input: { url } }] },
      ],
    });
  }

  it("denies a web_fetch to a user-source domain BEFORE forwarding (403 + user_source row + pause)", async () => {
    const h = harness({ context: memoCtx() });
    const res = await handleProxyRequest(request({ body: fetchHistory("https://wiki.acme.co/q3-metrics") }), h);
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("user_source");
    expect(h.forwarded.req).toBeUndefined();
    const deny = h.fetchLogWriter.rows.find((r) => r.decision === "deny");
    expect(deny).toMatchObject({ kind: "fetch", url: "https://wiki.acme.co/q3-metrics", denyReason: "user_source" });
    expect(h.events.pauseSignals[0]).toMatchObject({ runId: "run_1", reason: "user_source_fetch" });
  });

  it("denies a fetch to a SUBDOMAIN of a user-source domain", async () => {
    const h = harness({ context: memoCtx() });
    const res = await handleProxyRequest(request({ body: fetchHistory("https://app.wiki.acme.co/x") }), h);
    expect(res.status).toBe(403);
    expect(h.forwarded.req).toBeUndefined();
  });

  it("leaves an unrelated fetch alone under the same policy", async () => {
    const h = harness({ context: memoCtx() });
    const res = await handleProxyRequest(request({ body: fetchHistory("https://reuters.com/story") }), h);
    expect(res.status).toBe(200);
    expect(h.forwarded.req).toBeDefined();
  });

  it("redacts the logged search query under fetchUserDataForbidden (never source text in fetch_log)", async () => {
    const response: UpstreamResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-opus-5",
        usage: { input_tokens: 1, output_tokens: 1 },
        content: [{ type: "server_tool_use", name: "web_search", input: { query: "industry benchmarks" } }],
      }),
    };
    const h = harness({ context: memoCtx(), response });
    await handleProxyRequest(request(), h);
    const search = h.fetchLogWriter.rows.find((r) => r.kind === "search");
    expect(search).toBeDefined();
    expect(search!.query).toBe("[redacted: user-source confidentiality]");
  });

  it("unions user-source domains onto the injected tool's blocked_domains (provider-side second layer)", async () => {
    const h = harness({ context: memoCtx() });
    await handleProxyRequest(request(), h); // base body has no tools → the proxy injects them
    const fwdBody = JSON.parse(h.forwarded.req!.body) as { tools?: { name?: string; blocked_domains?: string[] }[] };
    const search = fwdBody.tools?.find((t) => t.name === "web_search");
    expect(search!.blocked_domains).toContain("wiki.acme.co");
  });

  it("the n-gram guard diffs search queries against the frozen user-source text (draftText)", async () => {
    const internal = "arr grew twelve percent while churn fell to four percent in the third quarter of the fiscal year";
    const context = ctx({
      draftText: internal,
      urlPolicy: { blockedDomains: [], fetchUserDataForbidden: true },
    });
    const body = JSON.stringify({
      model: "claude-opus-5",
      messages: [
        {
          role: "assistant",
          content: [
            {
              type: "server_tool_use",
              name: "web_search",
              input: { query: "arr grew twelve percent while churn fell to four percent in the third" },
            },
          ],
        },
      ],
    });
    const h = harness({ context });
    const res = await handleProxyRequest(request({ body }), h);
    expect(res.status).toBe(403);
    expect(JSON.parse(res.body).error.type).toBe("suspicious_query");
    // and the deny row carries the placeholder, not the leaked query.
    const deny = h.fetchLogWriter.rows.find((r) => r.denyReason === "suspicious_query");
    expect(deny!.query).toBe("[redacted: user-source confidentiality]");
  });
});
