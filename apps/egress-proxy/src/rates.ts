// @rhema/egress-proxy — versioned rate tables + list-cost math (REQ-SPEC-11, REQ-BILL-2; §12.7).
//
// This ticket OWNS rate-table application. The proxy rates every metered response under the RUN's versioned
// rate table (`runs.rate_table_version`), so a price change ships as a new table version and every
// `usage_records` row records the version it was rated under (REQ-BILL-2 — the dollar peg never changes).
// List cost is the raw provider list price (no platform rate); `platformCredits` applies the published
// 1.4 platform rate and the 1 credit = $0.01 peg (§14.1). The cap is enforced in CREDITS (`runs.cap_credits`).

/** Per-model provider list prices (USD per million tokens). */
export interface ModelRate {
  readonly inputUsdPerMTok: number;
  readonly outputUsdPerMTok: number;
}

/** A versioned provider rate table (§12.7 prices). Keyed by canonical model family; matched by prefix. */
export interface RateTable {
  readonly version: number;
  readonly models: Readonly<Record<string, ModelRate>>;
  /** cache-read tokens are billed at this multiple of the input price (§12.7: 0.1×). */
  readonly cacheReadMultiplier: number;
  /** cache-write tokens are billed at this multiple of the input price (§12.7: 1.25×). */
  readonly cacheWriteMultiplier: number;
  /** web search is billed per request (§12.7: $10 / 1k = $0.01/request). */
  readonly webSearchUsdPerRequest: number;
}

/** The published 1.4 platform rate (§14.1). List cost × this = platform cost; the dollar peg never changes. */
export const PLATFORM_RATE = 1.4 as const;

/** 1 credit = $0.01 of Rhema usage (§14.1). */
export const USD_PER_CREDIT = 0.01 as const;

/**
 * Rate table version 1 (§12.7): Sonnet 5 $2/$10, Opus 5 $5/$25, Fable 5 $10/$50 per MTok; cache read 0.1×,
 * cache write 1.25×; web search $10/1k. Keys are canonical model families; a dated model id (e.g.
 * `claude-fable-5-1`) matches its family by prefix.
 */
export const RATE_TABLE_V1: RateTable = {
  version: 1,
  models: {
    "claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    "claude-opus-5": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
    "claude-fable-5": { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  },
  cacheReadMultiplier: 0.1,
  cacheWriteMultiplier: 1.25,
  webSearchUsdPerRequest: 10 / 1000,
};

/** Every known rate table, by version. Later tickets append versions; a version is never edited in place. */
export const RATE_TABLES: Readonly<Record<number, RateTable>> = {
  [RATE_TABLE_V1.version]: RATE_TABLE_V1,
};

/** Raised when a run references a rate-table version the proxy does not know — never meter silently. */
export class UnknownRateTableError extends Error {
  constructor(version: number) {
    super(`unknown rate_table_version ${version} — refusing to meter silently (REQ-SPEC-11)`);
    this.name = "UnknownRateTableError";
  }
}

/** Raised when a response's model has no price in the run's table — an unmetered channel is a hard failure. */
export class UnknownModelError extends Error {
  constructor(model: string, version: number) {
    super(`model ${model} has no price in rate table v${version} — refusing to meter silently (REQ-SPEC-11)`);
    this.name = "UnknownModelError";
  }
}

/** Look up the rate table for a run's version; throws rather than defaulting (never silent billing). */
export function rateTableFor(version: number): RateTable {
  const t = RATE_TABLES[version];
  if (!t) throw new UnknownRateTableError(version);
  return t;
}

/** Resolve a model id to its `ModelRate`: exact match first, then the longest matching family prefix. */
export function rateForModel(table: RateTable, model: string): ModelRate {
  const exact = table.models[model];
  if (exact) return exact;
  let best: { key: string; rate: ModelRate } | undefined;
  for (const [key, rate] of Object.entries(table.models)) {
    if (model.startsWith(key) && (!best || key.length > best.key.length)) best = { key, rate };
  }
  if (!best) throw new UnknownModelError(model, table.version);
  return best.rate;
}

/** True when `model` can be priced under `version` (used to refuse an unpriceable request up front). */
export function isModelPriceable(version: number, model: string): boolean {
  try {
    rateForModel(rateTableFor(version), model);
    return true;
  } catch {
    return false;
  }
}

/** The token/tool counts read from a response `usage` block (all default 0). */
export interface MeteredUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly webSearchRequests: number;
  readonly webFetchRequests: number;
}

export const EMPTY_METERED_USAGE: MeteredUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  webSearchRequests: 0,
  webFetchRequests: 0,
};

/**
 * Provider list cost (USD) of one response's usage under `table` for `model` (§12.7). Includes
 * `server_tool_use` (web search) and cache read/write — the tokens `modelUsage` reports unevenly, which is
 * exactly why the proxy, not the SDK, is the meter of record. web_fetch carries no per-request price (its
 * tokens are already in input/output). No rounding here: the row of record keeps full precision.
 */
export function listCostUsd(usage: MeteredUsage, table: RateTable, model: string): number {
  const rate = rateForModel(table, model);
  const perMTok = (tokens: number, price: number): number => (tokens / 1_000_000) * price;
  return (
    perMTok(usage.inputTokens, rate.inputUsdPerMTok) +
    perMTok(usage.outputTokens, rate.outputUsdPerMTok) +
    perMTok(usage.cacheReadTokens, rate.inputUsdPerMTok * table.cacheReadMultiplier) +
    perMTok(usage.cacheWriteTokens, rate.inputUsdPerMTok * table.cacheWriteMultiplier) +
    usage.webSearchRequests * table.webSearchUsdPerRequest
  );
}

/**
 * Platform credits for a list cost (§14.1): list × the 1.4 platform rate ÷ $0.01/credit. NOT rounded — the
 * spec rounds up ONCE per run at debit time (P0.11), so the cap accountant sums these fractional credits and
 * rounds once. Rounding per row here would double-round and drift the cap.
 */
export function platformCredits(listUsd: number): number {
  return (listUsd * PLATFORM_RATE) / USD_PER_CREDIT;
}
