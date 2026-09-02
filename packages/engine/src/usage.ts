// @rhema/engine — SDK usage accumulation (the §12.7 cross-check figure).
//
// The proxy is the meter of record (§12.7); the engine accumulates the SDK's own `usage` blocks so the
// orchestrator can persist `usage_records{source:'sdk_stream'}` per tick and cross-check the proxy total
// (a >2% divergence raises a flag). Cost is the SDK's estimate, never the billed number.

import type { UsageSnapshot } from "./engine.js";
import { emptyUsage } from "./engine.js";
import type { SdkUsage } from "./sdk-types.js";

/** Fold an SDK usage block into a snapshot in place, returning it. Tolerates partial/absent fields. */
export function addUsage(acc: UsageSnapshot, u: SdkUsage | undefined, costUsd?: number): UsageSnapshot {
  if (u) {
    acc.inputTokens += u.input_tokens ?? 0;
    acc.outputTokens += u.output_tokens ?? 0;
    acc.cacheReadTokens += u.cache_read_input_tokens ?? 0;
    acc.cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
    acc.webSearchRequests += u.server_tool_use?.web_search_requests ?? 0;
    acc.webFetchRequests += u.server_tool_use?.web_fetch_requests ?? 0;
  }
  if (typeof costUsd === "number") acc.costUsd = costUsd;
  return acc;
}

/**
 * REPLACE a snapshot's token/tool fields with an authoritative total (the terminal `result` message's `usage`
 * is the CUMULATIVE total for the whole query, not another per-turn delta — folding it with `addUsage` would
 * ≈double the figure and trip the §12.7 >2% proxy-vs-SDK cross-check on every run). Sets `costUsd` when given.
 */
export function setUsageTotals(acc: UsageSnapshot, u: SdkUsage | undefined, costUsd?: number): UsageSnapshot {
  if (u) {
    acc.inputTokens = u.input_tokens ?? acc.inputTokens;
    acc.outputTokens = u.output_tokens ?? acc.outputTokens;
    acc.cacheReadTokens = u.cache_read_input_tokens ?? acc.cacheReadTokens;
    acc.cacheCreationTokens = u.cache_creation_input_tokens ?? acc.cacheCreationTokens;
    acc.webSearchRequests = u.server_tool_use?.web_search_requests ?? acc.webSearchRequests;
    acc.webFetchRequests = u.server_tool_use?.web_fetch_requests ?? acc.webFetchRequests;
  }
  if (typeof costUsd === "number") acc.costUsd = costUsd;
  return acc;
}

/** A deep copy of a snapshot (so a yielded provisional tick is never mutated by later folds). */
export function cloneUsage(u: UsageSnapshot): UsageSnapshot {
  return { ...u };
}

export { emptyUsage };
