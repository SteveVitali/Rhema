// The provisional-credit renderer (D-P0.08-2) — binds the phase-loop's `CreditRenderer` seam to the shared
// versioned rate table in @rhema/contracts, so a running phase's `usage.tick` includes the IN-FLIGHT phase's
// provisional cost (not just committed-phase spend). The proxy's `usage_records{source:'proxy'}` rows stay
// the meter of record; this is the same rate math applied to the SDK's streamed token markers for a live
// run-card total. Its unblocker (the rate table lifted into @rhema/contracts) is satisfied (P0.11).
//
// Pure: rate table × token snapshot → credits. Fully unit-tested here; the live ±2% cross-check against the
// proxy needs a live metered run (Stage B — the model id resolves there).

import {
  listCostUsd,
  platformCredits,
  RATE_TABLES,
  CURRENT_RATE_TABLE_VERSION,
  type MeteredUsage,
} from "@rhema/contracts";
import type { UsageSnapshot } from "@rhema/engine";
import type { CreditRenderer } from "./phase-loop.js";

/**
 * Map a model tier (§12.3) to a representative rate-table model family. The provisional `UsageSnapshot` carries
 * only the tier, so the running-phase estimate prices at the tier's model; the exact model id lands on the
 * committed `sdk_estimate` row (the ±2% cross-check reads that, not this provisional figure).
 */
export const TIER_MODEL: Readonly<Record<string, string>> = {
  base: "claude-sonnet-5",
  balanced: "claude-opus-5",
  frontier: "claude-fable-5",
};

/** Map the engine's UsageSnapshot onto the contracts' MeteredUsage (cacheCreation → cacheWrite). */
function toMeteredUsage(u: UsageSnapshot): MeteredUsage {
  return {
    inputTokens: u.inputTokens,
    outputTokens: u.outputTokens,
    cacheReadTokens: u.cacheReadTokens,
    cacheWriteTokens: u.cacheCreationTokens,
    webSearchRequests: u.webSearchRequests,
    webFetchRequests: u.webFetchRequests,
  };
}

/**
 * Build a `CreditRenderer` bound to the shared rate table. Prices the in-flight phase's token snapshot under
 * the run's pinned rate-table version (falling back to the current version if the pinned one is unknown) at
 * the tier's representative model, then applies the 1.4 platform rate + $0.01 credit peg (fractional — the
 * cap accountant rounds once per run at debit time, P0.11; rounding here would double-round).
 */
export function createRateTableCreditRenderer(tierModel: Readonly<Record<string, string>> = TIER_MODEL): CreditRenderer {
  return (usage: UsageSnapshot, modelTier: string, rateTableVersion: number): number => {
    const table = RATE_TABLES[rateTableVersion] ?? RATE_TABLES[CURRENT_RATE_TABLE_VERSION];
    if (!table) return 0;
    const model = tierModel[modelTier] ?? modelTier; // an unknown tier falls through as a model id (prefix match)
    return platformCredits(listCostUsd(toMeteredUsage(usage), table, model));
  };
}

/** The default renderer apps inject into `PhaseLoopDeps.renderCredits` at deploy. */
export const rateTableCreditRenderer: CreditRenderer = createRateTableCreditRenderer();
