// The `/pricing/rates` publication (REQ-BILL-19; §14.6). The rate tables and the pure publication builder live
// in `@rhema/contracts` (the single versioned source the proxy meters under); P0.11 owns pricing, so it
// re-exports them here for the ledger's callers (resume re-price) and the api's `/pricing/rates` route. The
// full pricing PAGE is PRB.8 / P1.16.

export {
  buildRatesPublication,
  type RatesPublication,
  type PublishedRateTable,
  RATE_TABLES,
  CURRENT_RATE_TABLE_VERSION,
  rateTableFor,
  PLATFORM_RATE,
  USD_PER_CREDIT,
  type RateTable,
} from "@rhema/contracts";
