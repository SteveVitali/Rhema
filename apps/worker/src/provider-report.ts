// The provider Usage & Cost report source for `usage.reconcile` (PRB.08 → STB.4; REQ-BILL-13). Each night
// the job pulls the previous day's report from the provider's admin API and hands it to the reconciler.
//
// THE REAL ANTHROPIC CONTRACT (verified against the published API reference, STB.4 — the earlier
// `group_by[]=request_id` guess does not exist):
//
//   • GET /v1/organizations/cost_report — daily buckets ONLY (bucket_width=1d). Each bucket's
//     `results[]` rows carry `amount` as a decimal string in LOWEST CURRENCY UNITS (cents for USD —
//     "123.45" = $1.2345), plus optional group_by {description, workspace_id} breakdowns.
//   • GET /v1/organizations/usage_report/messages — buckets of TOKEN counts (uncached_input_tokens,
//     cache_creation.{ephemeral_1h,ephemeral_5m}_input_tokens, cache_read_input_tokens, output_tokens,
//     server_tool_use.web_search_requests); group_by ⊆ {model, api_key_id, workspace_id, …}.
//   • NEITHER endpoint exposes request-level granularity — `provider_request_id` can never join —
//     so this source emits `rows: []` and a `window` payload for `reconcileProviderWindow`.
//   • Requires an Admin API key (`sk-ant-admin…`) or an org-scoped key — a standard workspace key is
//     refused 401 (verified live, STB.4). The key is a Secret Manager secret (never an env on
//     web/collab).
//
// The cost report is ORG-WIDE: it has no api-key filter (group_by is description/workspace_id only),
// so `usd` covers everything billed to the org — Console and other keys included. The usage report is
// fetched unfiltered for the same reason; non-Rhema consumption shows up as report-only model rows or
// a positive dollar divergence, which the window arm reports honestly rather than hiding.
//
// `normalizeCostReport` / `normalizeUsageBuckets` accept the envelopes defensively — leaf rows may
// sit flat under `data[]` or nested under `results[]` — so the ONLY edit a report-shape drift needs
// is here.

import type { ProviderUsageReport, ProviderWindowModelUsage } from "@rhema/ledger";
import type { ProviderReportSource } from "./billing-jobs.js";

interface JsonObject {
  [k: string]: unknown;
}

/** Fetch the provider Usage & Cost report over HTTPS. `adminKey` is the Secret-Manager-loaded admin key. */
export class AnthropicAdminReportSource implements ProviderReportSource {
  constructor(
    private readonly args: {
      readonly adminKey: string;
      readonly baseUrl?: string;
      readonly fetchImpl?: typeof fetch;
      /** the report day (UTC); defaults to yesterday. */
      readonly day?: Date;
    },
  ) {}

  async fetch(): Promise<ProviderUsageReport> {
    const base = this.args.baseUrl ?? "https://api.anthropic.com";
    const day = this.args.day ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    const date = day.toISOString().slice(0, 10);
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000); // `ending_at` is exclusive

    const [costBodies, usageBodies] = await Promise.all([
      this.fetchAll(
        `${base}/v1/organizations/cost_report` +
          `?starting_at=${encodeURIComponent(start.toISOString())}` +
          `&ending_at=${encodeURIComponent(end.toISOString())}` +
          `&group_by[]=description&limit=31`,
      ),
      this.fetchAll(
        `${base}/v1/organizations/usage_report/messages` +
          `?starting_at=${encodeURIComponent(start.toISOString())}` +
          `&ending_at=${encodeURIComponent(end.toISOString())}` +
          `&bucket_width=1d&group_by[]=model&limit=31`,
      ),
    ]);

    return {
      provider: "anthropic",
      reportKey: `anthropic:${date}`,
      asOf: day,
      rows: [],
      window: {
        start,
        end,
        usd: normalizeCostReport(costBodies),
        tokensByModel: normalizeUsageBuckets(usageBodies),
      },
    };
  }

  /** Page through a report endpoint collecting every `data[]` bucket (bounded — a report never
   *  exceeds a handful of pages at 1d granularity; the cap fails loudly rather than looping). */
  private async fetchAll(firstUrl: string): Promise<JsonObject[]> {
    const fetchImpl = this.args.fetchImpl ?? fetch;
    const headers = { "x-api-key": this.args.adminKey, "anthropic-version": "2023-06-01" };
    const bodies: JsonObject[] = [];
    let url: string | null = firstUrl;
    for (let page = 0; page < 10 && url; page++) {
      const res = await fetchImpl(url, { headers });
      if (!res.ok) throw new Error(`provider report fetch failed: ${res.status}`);
      const body = (await res.json()) as JsonObject;
      bodies.push(body);
      const next = body["next_page"];
      const hasMore = body["has_more"] === true;
      url =
        hasMore && typeof next === "string" && next.length > 0
          ? `${firstUrl}&page=${encodeURIComponent(next)}`
          : null;
    }
    return bodies;
  }
}

/** Flatten `data[].results[]` (bucketed envelope) or a flat `data[]`/`body[]` to leaf rows. */
function leafRows(bodies: unknown[]): JsonObject[] {
  const out: JsonObject[] = [];
  for (const body of bodies) {
    const data = (body as JsonObject)?.["data"];
    const entries = Array.isArray(data) ? data : Array.isArray(body) ? (body as unknown[]) : [];
    for (const entry of entries as JsonObject[]) {
      const leafs = Array.isArray(entry["results"]) ? (entry["results"] as JsonObject[]) : [entry];
      out.push(...leafs);
    }
  }
  return out;
}

/** Sum a cost_report's `amount` fields into USD. `amount` is a decimal string in LOWEST currency
 *  units — cents for USD ("123.45" = $1.2345) — so the sum divides by 100. Rows in non-USD currency
 *  are skipped loudly (thrown, never silently mis-summed). */
export function normalizeCostReport(bodies: unknown[]): number {
  let cents = 0;
  for (const leaf of leafRows(bodies)) {
    const currency = leaf["currency"];
    if (currency !== undefined && currency !== null && currency !== "USD") {
      throw new Error(`provider cost report row in non-USD currency: ${String(currency)}`);
    }
    const amount = leaf["amount"];
    const n = typeof amount === "string" || typeof amount === "number" ? Number(amount) : NaN;
    if (!Number.isFinite(n)) continue;
    cents += n;
  }
  return cents / 100;
}

/** Aggregate a usage_report's per-model buckets into `ProviderWindowModelUsage` rows (several
 *  buckets can repeat a model across the window — summed here). */
export function normalizeUsageBuckets(bodies: unknown[]): ProviderWindowModelUsage[] {
  const byModel = new Map<string, ProviderWindowModelUsage & { model: string | null }>();
  const num = (v: unknown): number =>
    typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? Number(v) || 0 : 0;
  for (const leaf of leafRows(bodies)) {
    const model = typeof leaf["model"] === "string" ? (leaf["model"] as string) : null;
    const key = model ?? "";
    const cacheCreation = (leaf["cache_creation"] ?? {}) as JsonObject;
    const tools = (leaf["server_tool_use"] ?? {}) as JsonObject;
    const cur = byModel.get(key) ?? {
      model,
      uncachedInputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
      outputTokens: 0,
      webSearchRequests: 0,
    };
    byModel.set(key, {
      model,
      uncachedInputTokens: cur.uncachedInputTokens + num(leaf["uncached_input_tokens"]),
      cacheCreationInputTokens:
        cur.cacheCreationInputTokens +
        num(cacheCreation["ephemeral_1h_input_tokens"]) +
        num(cacheCreation["ephemeral_5m_input_tokens"]),
      cacheReadInputTokens: cur.cacheReadInputTokens + num(leaf["cache_read_input_tokens"]),
      outputTokens: cur.outputTokens + num(leaf["output_tokens"]),
      webSearchRequests: cur.webSearchRequests + num(tools["web_search_requests"]),
    });
  }
  return [...byModel.values()];
}
