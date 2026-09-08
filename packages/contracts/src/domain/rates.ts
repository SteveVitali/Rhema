// @rhema/contracts — versioned provider rate tables + list-cost math (REQ-SPEC-11, REQ-BILL-2; §12.7, §14.1).
//
// The single source of truth for provider prices, the 1.4 platform rate, and the $0.01 credit peg. Two
// packages consume it: `egress-proxy` (the meter of record — rates every metered response under the run's
// versioned rate table) and `@rhema/ledger` (P0.11 — the `/pricing/rates` publication and the resume
// re-price). A price change ships as a NEW table version; a version is never edited in place, so every
// `usage_records` row keeps the version it was rated under (REQ-BILL-2 — the dollar peg never changes).
// List cost is the raw provider list price (no platform rate); `platformCredits` applies the 1.4 platform
// rate and the 1 credit = $0.01 peg (§14.1). Caps are enforced in CREDITS (`runs.cap_credits`).

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
  /** The date this table became effective (REQ-BILL-19; ISO date). Published on `/pricing/rates`. */
  readonly effectiveDate: string;
}

/** The published 1.4 platform rate (§14.1). List cost × this = platform cost; the dollar peg never changes. */
export const PLATFORM_RATE = 1.4 as const;

/** 1 credit = $0.01 of Rhema usage (§14.1). */
export const USD_PER_CREDIT = 0.01 as const;

/**
 * Rate table version 1 (§12.7): Haiku 4.5 $1/$5, Sonnet 5 $2/$10, Opus 5 $5/$25, Fable 5 $10/$50 per MTok;
 * cache read 0.1×, cache write 1.25×; web search $10/1k. Keys are canonical model families; a dated model id
 * (e.g. `claude-fable-5-1`) matches its family by prefix. `claude-haiku-4-5` is the base-tier research fan-out
 * model (`@rhema/engine` roster) and is on every tier's proxy allowlist (`MODELS_BY_TIER`) — it MUST be priced
 * here or a base-tier research request would 403 as unpriceable (F4). Adding a family key is additive: no prior
 * run could have been metered against a model absent from the table (it would have failed closed).
 */
export const RATE_TABLE_V1: RateTable = {
  version: 1,
  models: {
    "claude-haiku-4-5": { inputUsdPerMTok: 1, outputUsdPerMTok: 5 },
    "claude-sonnet-5": { inputUsdPerMTok: 2, outputUsdPerMTok: 10 },
    "claude-opus-5": { inputUsdPerMTok: 5, outputUsdPerMTok: 25 },
    "claude-fable-5": { inputUsdPerMTok: 10, outputUsdPerMTok: 50 },
  },
  cacheReadMultiplier: 0.1,
  cacheWriteMultiplier: 1.25,
  webSearchUsdPerRequest: 10 / 1000,
  effectiveDate: "2026-09-02",
};

/** Every known rate table, by version. Later tickets append versions; a version is never edited in place. */
export const RATE_TABLES: Readonly<Record<number, RateTable>> = {
  [RATE_TABLE_V1.version]: RATE_TABLE_V1,
};

/** The version the estimator/proxy default to when a run does not pin one (always the newest). */
export const CURRENT_RATE_TABLE_VERSION = RATE_TABLE_V1.version;

/** Raised when a run references a rate-table version we do not know — never meter silently. */
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

// ---- /pricing/rates publication (REQ-BILL-19; §14.6) ------------------------------------------------------
// The public payload — current + previous tables with effective dates and the 1.4 platform rate — that every
// run report links to. Pure data; served by apps/api and re-exported by @rhema/ledger (P0.11 owns pricing).
// The full pricing PAGE is PRB.8 / P1.16.

export interface PublishedRateTable {
  readonly version: number;
  readonly effectiveDate: string;
  readonly current: boolean;
  readonly models: RateTable["models"];
  readonly cacheReadMultiplier: number;
  readonly cacheWriteMultiplier: number;
  readonly webSearchUsdPerRequest: number;
}

export interface RatesPublication {
  readonly platformRate: number;
  readonly usdPerCredit: number;
  readonly currentVersion: number;
  /** Every known table, newest first; the newest is flagged `current`. */
  readonly tables: readonly PublishedRateTable[];
}

/** Build the `/pricing/rates` payload from the versioned rate tables (REQ-BILL-2/19). */
export function buildRatesPublication(): RatesPublication {
  const tables = Object.values(RATE_TABLES)
    .slice()
    .sort((a, b) => b.version - a.version)
    .map((t) => ({
      version: t.version,
      effectiveDate: t.effectiveDate,
      current: t.version === CURRENT_RATE_TABLE_VERSION,
      models: t.models,
      cacheReadMultiplier: t.cacheReadMultiplier,
      cacheWriteMultiplier: t.cacheWriteMultiplier,
      webSearchUsdPerRequest: t.webSearchUsdPerRequest,
    }));
  return { platformRate: PLATFORM_RATE, usdPerCredit: USD_PER_CREDIT, currentVersion: CURRENT_RATE_TABLE_VERSION, tables };
}
