// The provider Usage & Cost report source for `usage.reconcile` (PRB.08; REQ-BILL-13). Each night the job
// pulls the previous day's report from the provider's admin API and normalizes it to
// `ProviderUsageReport.rows` — one row per request id with the provider's reported list cost in USD, which the
// reconciler joins on `usage_records.provider_request_id`.
//
// Anthropic's Admin API serves `/v1/organizations/usage_report/messages` (grouped usage incl. request ids
// when `group_by[]=request_id`) and `/v1/organizations/cost_report` (dollar cost). `normalizeUsageReport`
// accepts the usage-report envelope defensively — `request_id`/`requestId` for the join key and a cost field
// under any of the names the two endpoints have used — so the ONLY edit a report-shape change needs is here.
// The admin key is a Secret Manager secret (never an env on web/collab).

import type { ProviderUsageReport, ProviderReportRow } from "@rhema/ledger";

/** Fetch a provider Usage & Cost report over HTTPS. `adminKey` is the Secret-Manager-loaded admin key. */
export class AnthropicAdminReportSource {
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
    const url =
      `${base}/v1/organizations/usage_report/messages` +
      `?starting_at=${encodeURIComponent(`${date}T00:00:00Z`)}` +
      `&ending_at=${encodeURIComponent(`${date}T23:59:59Z`)}` +
      `&group_by[]=request_id&limit=1000`;
    const fetchImpl = this.args.fetchImpl ?? fetch;
    const res = await fetchImpl(url, {
      headers: { "x-api-key": this.args.adminKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`provider report fetch failed: ${res.status}`);
    const body = (await res.json()) as unknown;
    return { provider: "anthropic", reportKey: `anthropic:${date}`, asOf: day, rows: normalizeUsageReport(body) };
  }
}

interface JsonObject {
  [k: string]: unknown;
}

/** Normalize the provider usage-report envelope to `{requestId, listCostUsd}` rows. Rows without a request
 *  id (aggregated buckets) are skipped — they cannot join the meter-of-record and the reconciler counts
 *  their absence as unmatched on the PROXY side instead. */
export function normalizeUsageReport(body: unknown): ProviderReportRow[] {
  const rows: ProviderReportRow[] = [];
  const data = (body as JsonObject)?.["data"];
  const entries = Array.isArray(data) ? data : Array.isArray(body) ? body : [];
  for (const entry of entries as JsonObject[]) {
    // the report may nest per-request rows under `results` (bucketed envelope) or list them flat.
    const leafs = Array.isArray(entry["results"]) ? (entry["results"] as JsonObject[]) : [entry];
    for (const leaf of leafs) {
      const requestId = leaf["request_id"] ?? leaf["requestId"] ?? leaf["id"];
      const cost = leaf["cost_usd"] ?? leaf["list_cost_usd"] ?? leaf["cost"] ?? leaf["usd"];
      if (typeof requestId !== "string" || requestId.length === 0) continue;
      const listCostUsd = typeof cost === "number" ? cost : typeof cost === "string" ? Number(cost) : NaN;
      if (!Number.isFinite(listCostUsd)) continue;
      rows.push({ requestId, listCostUsd });
    }
  }
  return rows;
}
