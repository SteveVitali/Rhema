// RES.1 — the live entrypoint behind scripts/live/res1-probe.mjs. Reads the deployed-api + DB seams
// from env, drives the bounded fact_check probe, and prints the outcome (ids/counts/urls only — no
// prompt or draft text, Manifest #10). Exit 0 on a passing probe, 2 on a failing verdict, 1 on error.
//
//   API_BASE_URL                the deployed api base (e.g. https://api.<stage>.rhema…)
//   DATABASE_URL                a pg connection string with read access to runs/usage_records/
//                               fetch_log/claims/claim_sources
//   PROBE_USER_ID / PROBE_WORKSPACE_ID / PROBE_BILLING_ACCOUNT_ID
//                               the principal headers the gateway injects (a provisioned account)
//   PROBE_PROJECT_ID            the project holding the planted-error excerpt draft

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import { driveResearchProbe } from "./research-probe.js";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[res1-probe] missing env ${name}`);
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
    const out = await driveResearchProbe({
      apiBaseUrl: need("API_BASE_URL"),
      principal: {
        userId: need("PROBE_USER_ID"),
        workspaceId: need("PROBE_WORKSPACE_ID"),
        billingAccountId: need("PROBE_BILLING_ACCOUNT_ID"),
      },
      projectId: need("PROBE_PROJECT_ID"),
      sql,
    });
    console.log("[res1-probe] outcome:", JSON.stringify({ ok: out.ok, detail: out.detail }));
    for (const f of out.failures) console.error(`[res1-probe] FAIL: ${f}`);
    return out.ok ? 0 : 2;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("[res1-probe] error:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
