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
//   PROBE_SESSION_COOKIE        (optional) "<name>=<token>" session cookie — REQUIRED on prod, where
//                               the IDENTITY_HEADERS forgeable-header shim is never enabled
//                               (apps/api/src/auth-context.ts: x-rhema-* headers only resolve on
//                               stages that opt in). The cookie is the test tenant's own, minted
//                               through the real magic-link funnel — never a lifted session.
//   PROBE_EXPECT_MODELS         (optional csv) model ids that must each show ≥1 metered search
//                               (substring-matched — the provider resolves dated aliases, e.g.
//                               "claude-haiku" matches "claude-haiku-4-5-20251001"). The D-RES.1-1
//                               contract: BOTH the Sonnet main pair and the Haiku research-subagent
//                               pair search.

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import { driveResearchProbe } from "./research-probe.js";
import type { FetchLike } from "./live-launcher.js";

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
  // Session-cookie auth path (prod): wrap fetch so the run-creation POST carries the cookie the
  // session middleware resolves; the x-rhema-* headers stay as the dev/preview-stage identity seam.
  const sessionCookie = process.env.PROBE_SESSION_COOKIE;
  const baseFetch = globalThis.fetch.bind(globalThis) as unknown as FetchLike;
  const fetchWithSession: FetchLike | undefined = sessionCookie
    ? (url, init) =>
        baseFetch(url, {
          ...init,
          headers: { ...((init.headers ?? {}) as Record<string, string>), cookie: sessionCookie },
        })
    : undefined;
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
      ...(fetchWithSession ? { fetch: fetchWithSession } : {}),
    });
    const failures = [...out.failures];
    // The D-RES.1-1 both-models clause: usage_records must show ≥1 search for every expected model
    // (the run's own usage rows — substring match absorbs dated-alias resolution).
    const expectModels = (process.env.PROBE_EXPECT_MODELS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const m of expectModels) {
      const hit = Object.entries(out.detail.searchesByModel).some(
        ([model, n]) => model.includes(m) && n >= 1,
      );
      if (!hit) failures.push(`expected model ${m} ran zero searches`);
    }
    const ok = failures.length === 0;
    console.log("[res1-probe] outcome:", JSON.stringify({ ok, detail: out.detail }));
    for (const f of failures) console.error(`[res1-probe] FAIL: ${f}`);
    return ok ? 0 : 2;
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
