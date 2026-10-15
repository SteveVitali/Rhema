#!/usr/bin/env node
// R5ECON.3 (REQ-FND-7) — the committed driver for the BL-20 bounded live legs (D-P1.11-1,
// ≤$5) and D-DEF.1-1's research_burst fetch/distill arm. The sequence rides the real chat
// surface exactly as chat-routes.ts wires it:
//
//   1. POST /projects/:id/chat/threads                        → threadId
//   2. POST /projects/:id/chat/threads/:tid/turns             → a chat_turn RUN launches +
//      returns planCard.researchSheetHref (the card IS the consent — REQ-CHAT-10)
//   3. wait the chat_turn run terminal; read its usage_records meter
//   4. POST /projects/:id/chat/threads/:tid/plan-decision {action:"run_research"}
//      → returns the research_burst SHEET; REQ-CHAT-6 — it must create NO run (the driver
//        proves it by counting research_burst runs before/after)
//   5. launch the research_burst run the sheet points at (the same /projects/:id/runs seam,
//      workflow:"research_burst", inputs:{threadId, fromRunId, sources}) with a
//      fetch-decomposable question — D-DEF.1-1's fetch/distill arm
//   6. read fetch_log kind rows + the metered figure on both runs
//
// Env (cite1-leg.mjs's seam):
//   API_BASE_URL  DATABASE_URL  PROBE_SESSION_COOKIE  PROBE_PROJECT_ID  PROBE_WORKSPACE_ID
//   CHAT_MESSAGE  — the fetch-decomposable question (default: a bounded named-source ask)
//   MODEL_TIER=base  BL20_CAP_USD=5  — the pair's declared bound (D-P1.11-1); leg 2 refuses to
//   launch when leg 1 already broke it.
//   SKIP_BURST=1 — stop after the plan-decision row (chat_turn half only, ≤ the turn's own spend)
//
// Prints one JSON line per leg — ids + metered figures only (Manifest #10).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
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
const COOKIE = need("PROBE_SESSION_COOKIE");
const pool = new pg.Pool({ connectionString: need("DATABASE_URL") });
const sql = { query: (t, p) => pool.query(t, p) };
const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);
const PAIR_CAP_USD = Number(process.env.BL20_CAP_USD ?? 5);
const MESSAGE =
  process.env.CHAT_MESSAGE ??
  "Fetch the two named sources on queue-depth budgeting and tell me, in one paragraph, what the utilisation knee costs a research pipeline at 90% load.";

const req = async (path, init = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: COOKIE, ...(init.headers ?? {}) },
  });
  return { status: res.status, body: await res.text() };
};
const post = (path, body) => req(path, { method: "POST", body: JSON.stringify(body) });

async function waitTerminal(runId, label, budgetMs = 30 * 60_000) {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const row = (
      await sql.query(`select id, workflow, state, spent_credits, cap_credits from runs where id = $1`, [runId])
    ).rows[0];
    if (!row) throw new Error(`${label} run ${runId} not found`);
    if (TERMINAL.has(row.state)) return row;
    if (Date.now() > deadline) throw new Error(`${label} run ${runId} not terminal in ${budgetMs / 60000}min (${row.state})`);
    await new Promise((r) => setTimeout(r, 15_000));
  }
}

const meterUsd = async (runId) =>
  Number(
    (
      await sql.query(
        `select coalesce(sum(list_cost_usd),0)::float8 as usd from usage_records where run_id = $1`,
        [runId],
      )
    ).rows[0]?.usd ?? 0,
  );

try {
  const projectId = need("PROBE_PROJECT_ID");
  need("PROBE_WORKSPACE_ID");
  const modelTier = process.env.MODEL_TIER ?? "base";
  const idemp = `${process.env.IDEMP ?? "bl20"}-${Date.now().toString(36)}`;

  // 1 — the thread.
  const thread = await post(`/projects/${projectId}/chat/threads`, { name: `${idemp} bl20 leg` });
  if (thread.status !== 200 && thread.status !== 201) {
    console.error(`[bl20] thread create → ${thread.status}: ${thread.body.slice(0, 240)}`);
    process.exit(3);
  }
  const threadId = JSON.parse(thread.body)?.thread?.id;
  if (!threadId) { console.error(`[bl20] no thread id in ${thread.body.slice(0, 200)}`); process.exit(3); }

  // 2 — the chat_turn run (the plan card carries researchSheetHref).
  const turn = await post(`/projects/${projectId}/chat/threads/${threadId}/turns`, {
    message: MESSAGE,
    modelTier,
  });
  if (turn.status !== 200 && turn.status !== 201) {
    console.error(`[bl20] turn → ${turn.status}: ${turn.body.slice(0, 240)}`);
    process.exit(3);
  }
  const turnBody = JSON.parse(turn.body);
  const turnRunId = turnBody.runId;
  const sheetHref = turnBody.planCard?.researchSheetHref ?? null;
  if (!turnRunId) { console.error(`[bl20] turn returned no runId: ${turn.body.slice(0, 200)}`); process.exit(3); }
  console.log(`[bl20] chat_turn launched ${turnRunId} · planCard.researchSheetHref=${sheetHref ?? "ABSENT"}`);

  // 3 — wait terminal + meter.
  const turnRow = await waitTerminal(turnRunId, "chat_turn");
  const turnUsd = await meterUsd(turnRunId);
  console.log(
    "[bl20] chat_turn outcome:",
    JSON.stringify({ runId: turnRunId, state: turnRow.state, spentCredits: turnRow.spent_credits, meteredUsd: turnUsd, researchSheetHref: sheetHref }),
  );
  if (!sheetHref) {
    console.error(`[bl20] owed — the plan card carried no researchSheetHref (BL-20's consent card is incomplete)`);
    process.exit(4);
  }

  // 4 — plan-decision run_research returns the SHEET and creates NO run (REQ-CHAT-6).
  const burstsBefore = Number(
    (await sql.query(
      `select count(*)::int n from runs where project_id = $1 and workflow = 'research_burst'`,
      [projectId],
    )).rows[0]?.n ?? 0,
  );
  const decision = await post(`/projects/${projectId}/chat/threads/${threadId}/plan-decision`, {
    action: "run_research",
    runId: turnRunId,
  });
  const burstsAfter = Number(
    (await sql.query(
      `select count(*)::int n from runs where project_id = $1 and workflow = 'research_burst'`,
      [projectId],
    )).rows[0]?.n ?? 0,
  );
  const decisionBody = decision.status === 200 ? JSON.parse(decision.body) : null;
  console.log(
    "[bl20] plan-decision:",
    JSON.stringify({
      status: decision.status, action: decisionBody?.action,
      sheet: decisionBody?.sheet?.href ?? decisionBody?.sheet ?? null,
      researchBurstRunsCreated: burstsAfter - burstsBefore,
    }),
  );
  if (decision.status !== 200 || decisionBody?.action !== "run_research") {
    console.error(`[bl20] owed — plan-decision run_research → ${decision.status}: ${decision.body.slice(0, 240)}`);
    process.exit(4);
  }
  if (burstsAfter !== burstsBefore) {
    console.error(`[bl20] owed — the plan-decision created a research_burst run directly (REQ-CHAT-6 says the SHEET, never a run)`);
    process.exit(4);
  }
  if (process.env.SKIP_BURST === "1") {
    console.log(`[bl20] SKIP_BURST=1 — the research_burst leg stays unlaunched (chat_turn half only, $${turnUsd.toFixed(4)} metered)`);
    process.exit(0);
  }

  // 5 — the bounded pair: refuse to launch leg 2 when leg 1 already broke the pair's bound.
  if (turnUsd > PAIR_CAP_USD) {
    console.error(
      `[bl20] refused — chat_turn alone metered $${turnUsd.toFixed(4)} > the $${PAIR_CAP_USD} pair bound; ` +
        `the research_burst leg stays unlaunched (D-P1.11-1's ≤$5 pair discipline)`,
    );
    process.exit(3);
  }

  // the research_burst run the sheet points at (workflow + the thread/fromRunId inputs).
  const burst = await post(`/projects/${projectId}/runs`, {
    idempotencyKey: `${idemp}-research-burst`,
    workflow: "research_burst",
    modelTier,
    inputs: { threadId, fromRunId: turnRunId, sources: 5 },
  });
  if (burst.status !== 200 && burst.status !== 201) {
    console.error(`[bl20] research_burst launch → ${burst.status}: ${burst.body.slice(0, 240)}`);
    process.exit(3);
  }
  const burstRunId = JSON.parse(burst.body).runId;
  if (!burstRunId) { console.error(`[bl20] no burst runId in ${burst.body.slice(0, 200)}`); process.exit(3); }
  console.log(`[bl20] research_burst launched ${burstRunId}`);

  // 6 — terminal + the fetch/distill evidence (D-DEF.1-1): fetch_log kinds + the meter.
  const burstRow = await waitTerminal(burstRunId, "research_burst");
  const burstUsd = await meterUsd(burstRunId);
  const fetchKinds = (
    await sql.query(
      `select kind, decision, count(*)::int n from fetch_log where run_id = $1 group by kind, decision order by kind`,
      [burstRunId],
    )
  ).rows;
  const steps = (
    await sql.query(
      `select phase, ordinal, state from steps where run_id = $1 order by ordinal`,
      [burstRunId],
    )
  ).rows;
  console.log(
    "[bl20] research_burst outcome:",
    JSON.stringify({
      runId: burstRunId, state: burstRow.state, spentCredits: burstRow.spent_credits,
      meteredUsd: burstUsd, fetchKinds,
      phases: steps.map((s) => `${s.ordinal}:${s.phase}=${s.state}`),
      pairMeteredUsd: turnUsd + burstUsd, pairCapUsd: PAIR_CAP_USD,
    }),
  );
  process.exit(0);
} finally {
  await pool.end();
}
