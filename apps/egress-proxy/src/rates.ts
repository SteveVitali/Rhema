// @rhema/egress-proxy — versioned rate tables + list-cost math (REQ-SPEC-11, REQ-BILL-2; §12.7).
//
// The rate table is now the SINGLE SOURCE in `@rhema/contracts` (P0.11 lifted it there so the ledger's
// `/pricing/rates` publication and the resume re-price read the same versioned prices the proxy rates under —
// REQ-BILL-2). The proxy still OWNS rate-table APPLICATION: it rates every metered response under the run's
// versioned table and writes `usage_records{source:'proxy'}` (the meter of record). This module re-exports the
// shared types + data so the proxy's internal imports (`./rates`) and public API are unchanged.

export {
  type ModelRate,
  type RateTable,
  type MeteredUsage,
  PLATFORM_RATE,
  USD_PER_CREDIT,
  RATE_TABLE_V1,
  RATE_TABLES,
  CURRENT_RATE_TABLE_VERSION,
  EMPTY_METERED_USAGE,
  UnknownRateTableError,
  UnknownModelError,
  rateTableFor,
  rateForModel,
  isModelPriceable,
  listCostUsd,
  platformCredits,
} from "@rhema/contracts";
