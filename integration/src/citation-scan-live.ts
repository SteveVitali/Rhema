// CITE.1 — the live entrypoint behind scripts/live/cite1-citation-scan.mjs. Runs the $0 baseline
// (`scanCitationCompleteness`, packages/ledger/src/citation-scan.ts) against a deployed stage's
// database + object store: every completed review/fact_check run's PRE-STRIP committed claim ledger
// scored against its fetch_log under the legacy byte-join AND the canonical join, misses classified
// normalization-only / search-result-only / truly-unretrieved. READ-ONLY — nothing is written.
//
//   DATABASE_URL     a pg connection string able to see every workspace's rows (the SEC.1
//                    system/migration role — cross-tenant by design, never a user route)
//   OBJECTS_BUCKET   the stage's artifact bucket (the claim-ledger sidecar bytes are
//                    content-addressed there)
//   SCAN_LIMIT       optional cap on scored runs (debugging)
//
// Output is ids + counts + url identifiers only — no claim text, no prompt/draft bodies
// (Manifest #10). Exit 0 always (an empty result is a valid answer); 1 on a connection/usage error.

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import { createGcsContentStore } from "@rhema/mirror";
import { scanCitationCompleteness, type ScanContentStore } from "@rhema/ledger";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[cite-scan] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

async function main(): Promise<number> {
  const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
  const sql: SqlClient = {
    query: (text, params) => pool.query(text, params as never[]),
  };
  // the scan's store is content-addressed but tenant-prefixed (`tenants/<ws>/objects/<sha>`): bind one
  // GcsContentStore per row workspace, cached — the scan is cross-tenant by design, reading each run's
  // ledger under the run's own prefix.
  const stores = new Map<string, Promise<(sha256: string) => Promise<Uint8Array | null>>>();
  const store: ScanContentStore = {
    get: async (sha256, workspaceId) => {
      let bound = stores.get(workspaceId);
      if (!bound) {
        bound = createGcsContentStore({ bucketName: need("OBJECTS_BUCKET"), workspaceId }).then(
          (s) => s.get.bind(s),
        );
        stores.set(workspaceId, bound);
      }
      return (await bound)(sha256);
    },
  };
  const limit = process.env.SCAN_LIMIT ? Number(process.env.SCAN_LIMIT) : undefined;
  try {
    const res = await scanCitationCompleteness(sql, store, limit ? { limit } : undefined);
    console.log(
      `[cite-scan] scanned ${res.scanned} completed review/fact_check runs at ${res.at}; ` +
        `scored ${res.scored} pre-strip claim ledgers (${res.unreadable} unreadable)`,
    );
    const a = res.aggregate;
    console.log(
      `[cite-scan] aggregate (test tenants excluded): ` +
        JSON.stringify({
          citedUrls: a.citedUrls,
          legacyCovered: a.legacyCovered,
          canonicalCovered: a.canonicalCovered,
          legacyCompleteness: a.legacyCompleteness,
          canonicalCompleteness: a.canonicalCompleteness,
          missClasses: {
            normalizationOnly: a.normalizationOnly,
            searchOnly: a.searchOnly,
            trulyUnretrieved: a.trulyUnretrieved,
          },
          searchRowsWithoutUrl: a.searchRowsWithoutUrl,
        }),
    );
    for (const r of res.runs) {
      console.log(
        JSON.stringify({
          runId: r.runId,
          workspaceId: r.workspaceId,
          workflow: r.workflow,
          endedAt: r.endedAt,
          testTenant: r.testTenant,
          citedUrls: r.citedUrls,
          legacyCovered: r.legacyCovered,
          canonicalCovered: r.canonicalCovered,
          legacyMisses: r.legacyMisses,
          missClasses: {
            normalizationOnly: r.normalizationOnly,
            searchOnly: r.searchOnly,
            trulyUnretrieved: r.trulyUnretrieved,
          },
          missedUrls: r.missedUrls,
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
  .catch((e) => {
    console.error("[cite-scan] failed:", e);
    process.exit(1);
  });
