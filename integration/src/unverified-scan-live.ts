// RES.2 — the live entrypoint behind scripts/live/res2-unverified-scan.mjs. Runs the HISTORICAL
// zero-coverage scan (`scanHistoricalUnverifiedRuns`, packages/ledger/src/unverified-scan.ts) against
// a deployed stage's database and prints the operator list: every completed Review/fact_check that
// predates `runs.delivery` and satisfies the Unverified predicate (≥1 Tier-1/2 claim, zero covered),
// with its would-be refund total. READ-ONLY — it never relabels, refunds, or restores; the operator
// decision is the deliverable recorded in docs/build/runs/RES.2.md.
//
//   DATABASE_URL   a pg connection string able to see every workspace's rows (the system/migration
//                  role — the scan is cross-tenant by design, like the stranded sweep)
//
// Output is ids + counts + credits only — no claim text, no prompt/draft bodies (Manifest #10).
// Exit 0 always (an empty list is a valid answer); 1 on a connection/usage error.

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import { scanHistoricalUnverifiedRuns } from "@rhema/ledger";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[res2-scan] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<number> {
  const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
  const sql: SqlClient = {
    query: (text, params) => pool.query(text, params as never[]),
  };
  try {
    const res = await scanHistoricalUnverifiedRuns(sql);
    console.log(
      `[res2-scan] scanned ${res.scanned} completed review/fact_check runs at ${res.at}; ` +
        `${res.unverified.length} match the Unverified predicate (delivery is null, ≥1 checkable, 0 covered)`,
    );
    for (const r of res.unverified) {
      console.log(
        JSON.stringify({
          runId: r.runId,
          workspaceId: r.workspaceId,
          billingAccountId: r.billingAccountId,
          workflow: r.workflow,
          endedAt: r.endedAt,
          checkableClaims: r.checkableClaims,
          coveredClaims: r.coveredClaims,
          spentCredits: r.spentCredits,
          wouldRefundCredits: r.wouldRefundCredits,
          entitlementId: r.entitlementId,
          testTenant: r.testTenant,
        }),
      );
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("[res2-scan] failed:", err);
    process.exit(1);
  });
