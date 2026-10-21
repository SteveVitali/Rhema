#!/usr/bin/env node
// R5ECON.3 (REQ-FND-7) — the committed driver for the ECON.2 OFF/ON lever measurement pairs
// (D-ECON.2-2/-3 pairs; D-ECON.2-4's adopted-arms non-regression leg is the same seam with
// LEVERS_JSON naming every adopted arm). ONE invocation = ONE arm of a pair: it posts the
// pinned run body with `inputs.cogsLevers` naming the arm, waits terminal, and prints the
// run's metered figure + the FROZEN `input_snapshot.cogsLevers` — the evidence row the
// adoption verdicts read (OFF vs ON `list_cost_usd`, threshold ON < OFF × 0.75 per ADR-087).
//
// The seam is cite1-leg.mjs's (same env, same launch path) PLUS:
//   LEVER=<key>          — one COGS_LEVER_KEYS entry (l1PerPhaseWindow · l2FanoutShape ·
//                          l3PhaseRouting · l4CacheTtl5m · l5ResearchEnvelope · testCheapRoute)
//   ARM=off|on           — the pair arm (off ⇔ the key false; on ⇔ true)
//   LEVERS_JSON=<json>   — multi-arm form for D-ECON.2-4 (every adopted arm on)
//
//   API_BASE_URL=https://api.rhema.tools  DATABASE_URL=<system dsn>
//   PROBE_WORKSPACE_ID=… PROBE_SESSION_COOKIE="<name>=<token>"
//   PROBE_PROJECT_ID=…  WORKFLOW=review  RIGOR=quick|standard  MODEL_TIER=base|balanced
//   WORDS=<n> CLAIMS=<n> IDEMP=<seed> AUTO=1
//
//   node scripts/live/lever-pair.mjs   # LEVER=l2FanoutShape ARM=off  → the pair's OFF row
//   node scripts/live/lever-pair.mjs   # LEVER=l2FanoutShape ARM=on   → the pair's ON row
//
// Prints one JSON line: { runId, state, arm, leversFrozen, usage } — join OFF/ON rows on the
// pair's inputs for the adopt/reject verdict. Fail-closed: the lever pin only freezes on an
// is_test workspace (REQ-ECON-10) — the driver verifies the flag before launching so a
// mis-scoped leg can never produce an unlabeled measurement.
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

const COGS_LEVER_KEYS = [
  "l1PerPhaseWindow", "l2FanoutShape", "l3PhaseRouting",
  "l4CacheTtl5m", "l5ResearchEnvelope", "testCheapRoute",
];

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
  return { status: res.status, body: await res.text() };
};

// the arm's lever set: LEVER+ARM names a single key; LEVERS_JSON names the adopted set.
let levers;
if (process.env.LEVERS_JSON) {
  try {
    levers = JSON.parse(process.env.LEVERS_JSON);
  } catch {
    console.error(`LEVERS_JSON is not parseable JSON: ${process.env.LEVERS_JSON}`);
    process.exit(2);
  }
  const unknown = Object.keys(levers).filter((k) => !COGS_LEVER_KEYS.includes(k));
  if (unknown.length) { console.error(`LEVERS_JSON names unknown lever keys: ${unknown.join(",")}`); process.exit(2); }
} else {
  const lever = need("LEVER");
  if (!COGS_LEVER_KEYS.includes(lever)) {
    console.error(`LEVER must be one of ${COGS_LEVER_KEYS.join(", ")} — got ${JSON.stringify(lever)}`);
    process.exit(2);
  }
  const arm = need("ARM");
  if (arm !== "off" && arm !== "on") {
    console.error(`ARM must be off|on — got ${JSON.stringify(arm)}`);
    process.exit(2);
  }
  levers = { [lever]: arm === "on" };
}
const armLabel = process.env.LEVERS_JSON ? "adopted-set" : `${process.env.LEVER}=${process.env.ARM}`;

try {
  const projectId = need("PROBE_PROJECT_ID");
  const workspaceId = need("PROBE_WORKSPACE_ID");

  // fail closed: the lever pin freezes ONLY on an is_test workspace (REQ-ECON-10) — a lever leg
  // on a non-test tenant silently resolves the deploy default and yields a mislabeled arm.
  const ws = (await sql.query(`select is_test from workspaces where id = $1`, [workspaceId])).rows[0];
  if (!ws) { console.error(`no workspace ${workspaceId}`); process.exit(3); }
  if (ws.is_test !== true) {
    console.error(`workspace ${workspaceId} is NOT is_test — a lever arm frozen here measures nothing (REQ-ECON-10). Refusing.`);
    process.exit(3);
  }

  const workflow = process.env.WORKFLOW ?? "review";
  const rigor = process.env.RIGOR ?? "quick";
  const modelTier = process.env.MODEL_TIER ?? "base";
  const words = Number(process.env.WORDS ?? 0) || undefined;
  const claims = Number(process.env.CLAIMS ?? 0) || undefined;
  const idemp = `${process.env.IDEMP ?? "lever-pair"}-${Date.now().toString(36)}`;

  const runBody = {
    idempotencyKey: `${idemp}-${workflow}-${rigor}`,
    workflow,
    rigor,
    modelTier,
    inputs: { sidecar: true, cogsLevers: levers },
    ...(process.env.AUTO === "1" ? { autoProceedRun: true } : {}),
    inputSnapshot: {
      ...(words !== undefined ? { wordCount: words } : {}),
      ...(claims !== undefined ? { claimCount: claims } : {}),
    },
  };
  const launched = await post(`/projects/${projectId}/runs`, runBody);
  if (launched.status !== 200 && launched.status !== 201) {
    console.error(`[lever-pair] launch refused ${launched.status}: ${launched.body}`);
    process.exit(3);
  }
  const { runId } = JSON.parse(launched.body);
  console.log(`[lever-pair] launched ${armLabel} run ${runId}`);

  const deadline = Date.now() + 45 * 60_000;
  let row;
  for (;;) {
    row = (await sql.query(
      `select id, workflow, rigor, state, estimate_credits, cap_credits, input_snapshot
         from runs where id = $1`, [runId])).rows[0];
    if (!row) throw new Error(`run ${runId} not found`);
    if (TERMINAL.has(row.state)) break;
    if (Date.now() > deadline) throw new Error(`run ${runId} not terminal in 45min (${row.state})`);
    await new Promise((r) => setTimeout(r, 15_000));
  }

  const frozen = (row.input_snapshot ?? {}).cogsLevers ?? null;
  for (const [k, v] of Object.entries(levers)) {
    if (frozen?.[k] !== v) {
      console.error(
        `[lever-pair] FROZEN MISMATCH — input_snapshot.cogsLevers.${k} = ${JSON.stringify(frozen?.[k])}, ` +
          `the posted arm asked ${v}: the pin did not freeze (the measurement is mislabeled — do not join this row)`,
      );
      process.exit(4);
    }
  }

  const usage = (await sql.query(
    `select model, coalesce(sum(searches),0)::int searches, coalesce(sum(fetches),0)::int fetches,
            coalesce(sum(credits),0)::int credits, round(coalesce(sum(list_cost_usd),0)::numeric,4) usd
       from usage_records where run_id = $1 group by model order by model`, [runId])).rows;

  console.log("[lever-pair] outcome:", JSON.stringify({
    runId, state: row.state, workflow: row.workflow, rigor: row.rigor, arm: armLabel,
    leversFrozen: frozen, usage,
    note: "join this row with its pair twin on the identical inputs; adopt when ON usd < OFF usd × 0.75 (ADR-087's 23% pair-noise margin)",
  }));
} finally {
  await pool.end();
}
