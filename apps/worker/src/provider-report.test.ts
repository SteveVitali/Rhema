import { describe, expect, it } from "vitest";
import {
  AnthropicAdminReportSource,
  normalizeCostReport,
  normalizeUsageBuckets,
  ProviderReportFetchError,
} from "./provider-report.js";

// STB.4 — the REAL Anthropic Usage & Cost contract. Fixtures mirror the published response shapes:
// cost_report buckets carry `amount` decimal strings in CENTS; usage_report buckets carry token
// counts grouped by model; both paginate via {has_more, next_page}. No request-level rows exist.

const COST_BODY = {
  data: [
    {
      starting_at: "2026-09-26T00:00:00Z",
      ending_at: "2026-09-27T00:00:00Z",
      results: [
        {
          amount: "2422.8135", // $24.228135
          currency: "USD",
          cost_type: "tokens",
          token_type: "uncached_input_tokens",
          description: "Claude Sonnet 5 Usage - Input Tokens",
          model: "claude-sonnet-5",
        },
        {
          amount: "31.1479",
          currency: "USD",
          cost_type: "tokens",
          token_type: "output_tokens",
          description: "Claude Haiku Usage - Output Tokens",
          model: "claude-haiku-4-5-20251001",
        },
        {
          amount: "90.00",
          currency: "USD",
          cost_type: "web_search",
          description: "Web Search Usage",
          model: null,
        },
      ],
    },
  ],
  has_more: false,
  next_page: null,
};

const USAGE_BODY = {
  data: [
    {
      starting_at: "2026-09-26T00:00:00Z",
      ending_at: "2026-09-27T00:00:00Z",
      results: [
        {
          model: "claude-sonnet-5",
          uncached_input_tokens: 6472,
          cache_creation: { ephemeral_1h_input_tokens: 1000, ephemeral_5m_input_tokens: 2405570 },
          cache_read_input_tokens: 35196086,
          output_tokens: 1082803,
          server_tool_use: { web_search_requests: 2 },
        },
      ],
    },
    {
      starting_at: "2026-09-26T00:00:00Z",
      ending_at: "2026-09-27T00:00:00Z",
      results: [
        {
          model: "claude-haiku-4-5-20251001",
          uncached_input_tokens: 41591,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 120901 },
          cache_read_input_tokens: 66963,
          output_tokens: 4413,
          server_tool_use: { web_search_requests: 9 },
        },
        // a second haiku leaf in the same bucket — same model, summed.
        {
          model: "claude-haiku-4-5-20251001",
          uncached_input_tokens: 9,
          cache_creation: { ephemeral_1h_input_tokens: 0, ephemeral_5m_input_tokens: 0 },
          cache_read_input_tokens: 0,
          output_tokens: 1,
          server_tool_use: { web_search_requests: 0 },
        },
      ],
    },
  ],
  has_more: false,
  next_page: null,
};

describe("normalizeCostReport (cents → USD)", () => {
  it("sums `amount` decimal strings as lowest currency units into dollars", () => {
    expect(normalizeCostReport([COST_BODY])).toBeCloseTo(24.228135 + 0.311479 + 0.9, 6);
  });
  it("accepts flat envelopes and skips non-numeric amounts", () => {
    expect(
      normalizeCostReport([{ data: [{ amount: "100.00", currency: "USD" }, { amount: "x" }] }]),
    ).toBeCloseTo(1.0, 6);
  });
  it("throws on non-USD rows — never silently mis-sums a currency", () => {
    expect(() => normalizeCostReport([{ data: [{ amount: "1.00", currency: "EUR" }] }])).toThrow(
      /non-USD/,
    );
  });
});

describe("normalizeUsageBuckets (per-model token totals)", () => {
  it("sums buckets per model incl. both cache-creation classes + server-tool searches", () => {
    const rows = normalizeUsageBuckets([USAGE_BODY]);
    const sonnet = rows.find((r) => r.model === "claude-sonnet-5");
    const haiku = rows.find((r) => r.model === "claude-haiku-4-5-20251001");
    expect(sonnet).toMatchObject({
      uncachedInputTokens: 6472,
      cacheCreationInputTokens: 2406570,
      cacheReadInputTokens: 35196086,
      outputTokens: 1082803,
      webSearchRequests: 2,
    });
    expect(haiku).toMatchObject({
      uncachedInputTokens: 41600, // 41591 + 9 across the two leaves
      outputTokens: 4414,
    });
    expect(rows).toHaveLength(2);
  });
});

describe("AnthropicAdminReportSource.fetch (the live endpoints)", () => {
  it("hits cost_report + usage_report for the report day and emits a window, never request rows", async () => {
    const urls: string[] = [];
    const src = new AnthropicAdminReportSource({
      adminKey: "sk-ant-admin-test",
      day: new Date("2026-09-26T12:00:00Z"),
      fetchImpl: (async (url: RequestInfo | URL) => {
        urls.push(String(url));
        const body = String(url).includes("cost_report") ? COST_BODY : USAGE_BODY;
        return new Response(JSON.stringify(body), { status: 200 });
      }) as typeof fetch,
    });
    const report = await src.fetch();

    expect(report.provider).toBe("anthropic");
    expect(report.reportKey).toBe("anthropic:2026-09-26");
    expect(report.rows).toHaveLength(0); // the real API has no per-request rows
    expect(report.window?.usd).toBeCloseTo(24.228135 + 0.311479 + 0.9, 6);
    expect(report.window?.start.toISOString()).toBe("2026-09-26T00:00:00.000Z");
    expect(report.window?.end.toISOString()).toBe("2026-09-27T00:00:00.000Z");
    expect(
      report.window?.tokensByModel.find((m) => m.model === "claude-sonnet-5")?.outputTokens,
    ).toBe(1082803);

    // both endpoints hit with the day's [start, next-day) bounds; ending_at is exclusive
    const cost = urls.find((u) => u.includes("cost_report"))!;
    const usage = urls.find((u) => u.includes("usage_report/messages"))!;
    expect(cost).toContain("starting_at=2026-09-26T00%3A00%3A00.000Z");
    expect(cost).toContain("ending_at=2026-09-27T00%3A00%3A00.000Z");
    expect(usage).toContain("bucket_width=1d");
    expect(usage).toContain("group_by[]=model");
    // the dead guess must never come back
    expect(usage).not.toContain("request_id");
  });

  it("paginates via has_more + next_page", async () => {
    const urls: string[] = [];
    const paged = (page: number, last: boolean) => ({
      data: [
        {
          starting_at: "2026-09-26T00:00:00Z",
          ending_at: "2026-09-27T00:00:00Z",
          results: [{ amount: "100.00", currency: "USD", description: `p${page}` }],
        },
      ],
      has_more: !last,
      next_page: last ? null : `page_${page + 1}`,
    });
    const src = new AnthropicAdminReportSource({
      adminKey: "k",
      day: new Date("2026-09-26T12:00:00Z"),
      fetchImpl: (async (url: RequestInfo | URL) => {
        urls.push(String(url));
        const u = String(url);
        if (u.includes("cost_report")) {
          const body = u.includes("page=page_2") ? paged(2, true) : paged(1, false);
          return new Response(JSON.stringify(body), { status: 200 });
        }
        return new Response(JSON.stringify(USAGE_BODY), { status: 200 });
      }) as typeof fetch,
    });
    const report = await src.fetch();
    expect(report.window?.usd).toBeCloseTo(2.0, 6); // two pages × 100 cents
    expect(urls.some((u) => u.includes("page=page_2"))).toBe(true);
  });

  it("a non-2xx surfaces as a provider report failure (placeholder-free failures stay loud)", async () => {
    const src = new AnthropicAdminReportSource({
      adminKey: "k",
      day: new Date("2026-09-26T12:00:00Z"),
      fetchImpl: (async () => new Response("{}", { status: 401 })) as typeof fetch,
    });
    await expect(src.fetch()).rejects.toThrow(/provider report fetch failed: 401/);
  });

  // R6OPS.1 — the refusal carries its HTTP status so the job can classify a bound-but-denied key
  // (401/403 → honest degrade) vs a transient fault (5xx → pg-boss retry).
  it("the refusal is a ProviderReportFetchError carrying the HTTP status", async () => {
    const src = new AnthropicAdminReportSource({
      adminKey: "k",
      day: new Date("2026-09-26T12:00:00Z"),
      fetchImpl: (async () => new Response("{}", { status: 403 })) as typeof fetch,
    });
    const err = await src.fetch().then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ProviderReportFetchError);
    expect((err as ProviderReportFetchError).status).toBe(403);
    expect((err as Error).message).toBe("provider report fetch failed: 403");
  });
});
