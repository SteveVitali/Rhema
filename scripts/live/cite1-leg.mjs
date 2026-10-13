#!/usr/bin/env node
// CITE.1 funded legs — launch one workflow run on a funded JOURNEY.1 test tenant and report the
// terminal row + evidence counts (ids/counts only — Manifest #10; no prompt or draft text).
// Unlike scripts/live/res1-probe.mjs (which is planted-error-specific), this driver is content-
// agnostic: the caller judges verdicts; it also handles rigor:"quick" + autoProceedRun, which
// LiveWorkflowLauncher's rigor map cannot express.
//
//   API_BASE_URL=https://api.rhema.tools  DATABASE_URL=<system dsn>
//   PROBE_USER_ID=… PROBE_WORKSPACE_ID=… PROBE_BILLING_ACCOUNT_ID=…   (auth via cookie on prod)
//   PROBE_PROJECT_ID=… PROBE_SESSION_COOKIE="<name>=<token>"
//   WORKFLOW=review|fact_check  RIGOR=quick|standard  MODEL_TIER=base
//   WORDS=<n>  CLAIMS=<n>            — inputSnapshot sizing (refine estimate to get real claims)
//   AUTO=1                          — autoProceedRun (unattended)
//   IDEMP=<seed>                    — idempotency key prefix
//
// Prints one JSON line: { runId, state, estimateCredits, capCredits, usage, fetchCounts,
// claimVerdicts, completeness } — the run ledger quotes it verbatim.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// `pg` is a declared dep of `integration/` — resolve through it (repo-root .mjs has no bare-import
// path under pnpm's strict linking).
const require = createRequire(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "integration", "package.json"),
);
const pg = require("pg");

const need = (n) => {
  const v = process.env[n];
  if (!v) { console.error(`missing env ${n}`); process.exit(1); }
  return v;
};

const API = need("API_BASE_URL").replace(/\/+$/, "");
const COOKIE = process.env.PROBE_SESSION_COOKIE ?? "";
const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
const sql = { query: (t, p) => pool.query(t, p) };
const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);

const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: COOKIE },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
};

try {
  const projectId = need("PROBE_PROJECT_ID");
  const workflow = process.env.WORKFLOW ?? "review";
  const rigor = process.env.RIGOR ?? "quick";
  const modelTier = process.env.MODEL_TIER ?? "base";
  const words = Number(process.env.WORDS ?? 0) || undefined;
  const claims = Number(process.env.CLAIMS ?? 0) || undefined;
  const idemp = `${process.env.IDEMP ?? "cite1-leg"}-${Date.now().toString(36)}`;

  // the estimate pre-pass refines claimCount the way the sheet does (~5 cr COGS, absorbed).
  if (claims === undefined && words !== undefined) {
    const est = await post(`/projects/${projectId}/estimates`, {
      workflow, rigor, modelTier,
      inputs: { ...(words ? { words } : {}) },
      ...(process.env.REFINE === "1" ? { refine: true } : {}),
    });
    let parsed = null;
    try { parsed = JSON.parse(est.body); } catch {}
    console.log(`[cite1-leg] estimate ${est.status}:`, JSON.stringify({
      estimateCredits: parsed?.estimateCredits ?? parsed?.estimate?.credits,
      capCredits: parsed?.capCredits ?? parsed?.cap,
      claimCount: parsed?.claimCount,
    }));
    if (parsed?.claimCount != null) process.env.CLAIMS = String(parsed.claimCount);
  }

  const runBody = {
    idempotencyKey: `${idemp}-${workflow}-${rigor}`,
    workflow,
    rigor,
    modelTier,
    inputs: { sidecar: true },
    ...(process.env.AUTO === "1" ? { autoProceedRun: true } : {}),
    inputSnapshot: {
      ...(words !== undefined ? { wordCount: words } : {}),
      ...(Number(process.env.CLAIMS ?? 0) > 0 ? { claimCount: Number(process.env.CLAIMS) } : {}),
    },
  };
  const launched = await post(`/projects/${projectId}/runs`, runBody);
  if (launched.status !== 200 && launched.status !== 201) {
    console.error(`[cite1-leg] launch refused ${launched.status}: ${launched.body}`);
    process.exit(3);
  }
  const { runId } = JSON.parse(launched.body);
  console.log(`[cite1-leg] launched run ${runId}`);

  const deadline = Date.now() + 45 * 60_000;
  let row;
  for (;;) {
    row = (await sql.query(
      `select id, workflow, rigor, state, estimate_credits, cap_credits, entitlement_id,
              created_at, started_at, ended_at, citation_completeness
         from runs where id = $1`, [runId])).rows[0];
    if (!row) throw new Error(`run ${runId} not found`);
    if (TERMINAL.has(row.state)) break;
    if (Date.now() > deadline) throw new Error(`run ${runId} not terminal in 45min (${row.state})`);
    await new Promise((r) => setTimeout(r, 15_000));
  }

  const usage = (await sql.query(
    `select model, coalesce(sum(searches),0)::int searches, coalesce(sum(fetches),0)::int fetches,
            coalesce(sum(credits),0)::int credits, round(coalesce(sum(list_cost_usd),0)::numeric,4) usd
       from usage_records where run_id = $1 group by model order by model`, [runId])).rows;
  const fetchCounts = (await sql.query(
    `select kind, decision, count(*)::int n from fetch_log where run_id = $1 group by kind, decision order by kind, decision`,
    [runId])).rows;
  const claimVerdicts = (await sql.query(
    `select c.verdict, count(*)::int n
       from claims c join correspondence_items ci on ci.id = c.correspondence_id
      where ci.run_id = $1 group by c.verdict order by c.verdict`, [runId])).rows;
  const sources = (await sql.query(
    `select count(*)::int n from claim_sources cs join claims c on c.id = cs.claim_id
      join correspondence_items ci on ci.id = c.correspondence_id where ci.run_id = $1`, [runId])).rows[0];

  console.log("[cite1-leg] outcome:", JSON.stringify({
    runId, state: row.state, workflow: row.workflow, rigor: row.rigor,
    estimateCredits: row.estimate_credits, capCredits: row.cap_credits,
    entitlementId: row.entitlement_id, endedAt: row.ended_at,
    usage, fetchCounts, claimVerdicts, claimSources: sources.n,
    completeness: row.citation_completeness,
  }));
} finally {
  await pool.end();
}
