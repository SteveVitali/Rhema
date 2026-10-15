#!/usr/bin/env node
// R5OPS.1 (REQ-OPS-1; REQ-ARCH-32; §12.8) — the canary pause smoke driver. The ONE scripted
// production write this ticket is authorized to make, run once under the operator's go.
//
// What it does (with --execute):
//   1. pre-state capture — the target workspace + the pending pause_signals census;
//   2. stages the canary — a synthetic `runs` row (state='running', an is_test workspace,
//      requested_by NULL so no notification can ever mail a human, estimate/cap_credits 0 so no
//      metered burn is possible) + ONE synthetic `pause_signals` row via the same insert shape
//      the egress proxy's SqlSignalSink uses;
//   3. observes the worker's `drainPauseSignals` sweep claim the row and `pauseRun` transition
//      `running → waiting_gate` + open the blocking `refusal` gate (on_expiry='cancel'), with the
//      paired `run.state_changed`/`gate.opened` events — the mechanism under test;
//   4. ROLLS BACK: `delete pause_signals` row + `delete runs` row (FK cascade removes the gate,
//      the events, and the seq counter) — every row this driver wrote is deleted before exit;
//   5. post-state verify — nothing remains; prints the evidence JSON.
//
// Caveats recorded honestly: the pgboss `notify:waiting:<gate>` singleton job the gate schedules
// (GATE_WAITING_DELAY_MS ≈ 15 min) survives as a queue row; when it fires the gate is gone, so
// `gateNotice` returns not_found — and requested_by NULL means `no_recipient` regardless. The
// workspace row and any pre-existing rows are never modified.
//
//   CANARY_ACK=yes DATABASE_URL=<system dsn> node scripts/live/canary-pause.mjs \
//     --execute --workspace-id <id> [--reason egress_denied_spike] [--timeout-s 45]
//   node scripts/live/canary-pause.mjs --dry-run   # prints the plan; touches nothing
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(
  resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "integration", "package.json"),
);
const pg = require("pg");

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const WORKSPACE_ID = flag("--workspace-id") || process.env.CANARY_WORKSPACE_ID || null;
const REASON = flag("--reason") || "egress_denied_spike";
const TIMEOUT_S = Number(flag("--timeout-s") || 45);
const TICKET = "161_R5OPS.1";

const VALID_REASONS = ["suspicious_query", "egress_denied_spike", "user_source_fetch"];

function plan() {
  return {
    ticket: TICKET,
    req: "REQ-OPS-1",
    reason: REASON,
    workspaceId: WORKSPACE_ID ?? "<newest workspaces.is_test row>",
    writes: [
      "insert runs (one synthetic row: state='running', workflow='review', model_tier='base', rigor='quick', estimate_credits=0, cap_credits=0, requested_by=null)",
      `insert pause_signals (reason='${REASON}', detail={"canary":"R5OPS.1"})`,
    ],
    observe: [
      "drainPauseSignals claims the row (claimed_at set, attempts=1)",
      "runs.state running → waiting_gate",
      "gates row kind='refusal' blocking=true on_expiry='cancel'",
      "run_events: run.state_changed{running→waiting_gate, reason} + gate.opened{kind:'refusal'}",
    ],
    rollback: ["delete pause_signals row", "delete runs row (cascades gates/run_events/run_event_seq)"],
    timeout_s: TIMEOUT_S,
  };
}

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, plan: plan() }, null, 1));
  process.exit(0);
}

// ---- fail-closed guards (the live arm is the operator-gated prod write) ----
if (process.env.CANARY_ACK !== "yes") {
  console.error("refusing: --execute requires CANARY_ACK=yes (the operator's prod-write go)");
  process.exit(3);
}
if (!process.env.DATABASE_URL) {
  console.error("refusing: --execute requires DATABASE_URL (system-role DSN over the IAP tunnel)");
  process.exit(3);
}
if (!VALID_REASONS.includes(REASON)) {
  console.error(`refusing: --reason must be one of ${VALID_REASONS.join("/")}`);
  process.exit(2);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const evidence = {
  ticket: TICKET,
  req: "REQ-OPS-1",
  at: new Date().toISOString(),
  reason: REASON,
  pre_state: null,
  canary: null,
  observation: null,
  rollback: null,
  verdict: null,
};
let runId = null;
let signalId = null;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const c = await pool.connect();
  try {
    // --- pick the canary workspace (an is_test tenant; explicit flag wins) ---
    const ws = WORKSPACE_ID
      ? (
          await c.query("select id, is_test from workspaces where id = $1", [WORKSPACE_ID])
        ).rows[0]
      : (
          await c.query(
            "select id, is_test from workspaces where is_test order by created_at desc limit 1",
          )
        ).rows[0];
    if (!ws) throw new Error("no workspace: pass --workspace-id or ensure an is_test tenant exists");
    if (!ws.is_test) throw new Error(`refusing: workspace ${ws.id} is not is_test — canaries never touch real tenants`);
    evidence.workspace_id = ws.id;

    // --- pre-state capture ---
    evidence.pre_state = {
      pending_signals: (
        await c.query("select count(*)::int as n from pause_signals where processed_at is null")
      ).rows[0].n,
      running_runs: (await c.query("select count(*)::int as n from runs where state='running'"))
        .rows[0].n,
      canary_run_exists: false,
    };

    // --- stage the canary: one synthetic running run + ONE pause signal ---
    runId = `r5ops1-canary-${Date.now()}`;
    await c.query(
      `insert into runs (id, workspace_id, workflow, state, inputs, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, rate_table_version, requested_by, started_at)
       values ($1,$2,'review','running',$3::jsonb,'{"tier":"base"}','base','quick',0,0,1,null,now())`,
      [runId, ws.id, JSON.stringify({ canary: "R5OPS.1", synthetic: true, ticket: TICKET })],
    );
    const sig = await c.query(
      `insert into pause_signals (run_id, workspace_id, reason, detail)
       values ($1,$2,$3,$4::jsonb) returning id`,
      [runId, ws.id, REASON, JSON.stringify({ canary: "R5OPS.1", ticket: TICKET })],
    );
    signalId = sig.rows[0].id;
    evidence.canary = { run_id: runId, signal_id: signalId };

    // --- observe the drain: poll until processed + waiting_gate, or timeout ---
    const deadline = Date.now() + TIMEOUT_S * 1000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = {
        run_state: (await c.query("select state from runs where id = $1", [runId])).rows[0]?.state,
        signal: (
          await c.query(
            "select claimed_at, attempts, processed_at from pause_signals where id = $1",
            [signalId],
          )
        ).rows[0],
        gates: (
          await c.query(
            "select kind, blocking, on_expiry, resolved_at from gates where run_id = $1",
            [runId],
          )
        ).rows,
      };
      if (snap.signal?.processed_at && snap.run_state === "waiting_gate") break;
      await sleep(1000);
    }
    const events = (
      await c.query(
        "select type, payload from run_events where run_id = $1 order by seq",
        [runId],
      )
    ).rows;
    evidence.observation = {
      final: snap,
      events: events.map((e) => ({ type: e.type, payload: e.payload })),
      elapsed_ms_note: "polled at 1 s cadence; the worker sweep interval is ~5 s",
    };
    const refusal = (snap?.gates ?? []).find(
      (g) => g.kind === "refusal" && g.blocking && g.on_expiry === "cancel" && !g.resolved_at,
    );
    const stateEvent = events.find(
      (e) =>
        e.type === "run.state_changed" &&
        e.payload?.from === "running" &&
        e.payload?.to === "waiting_gate" &&
        e.payload?.reason === REASON,
    );
    const gateEvent = events.find(
      (e) => e.type === "gate.opened" && e.payload?.kind === "refusal",
    );
    evidence.verdict =
      snap?.run_state === "waiting_gate" && snap?.signal?.processed_at && refusal && stateEvent && gateEvent
        ? "PASS — canary pause propagated end-to-end"
        : "INCOMPLETE — drain observation did not reach waiting_gate+refusal within the window";
  } finally {
    // --- rollback, ALWAYS (even on a failed observation): the rows this driver wrote go away ---
    try {
      if (signalId)
        await c.query("delete from pause_signals where id = $1", [signalId]);
      if (runId)
        await c.query("delete from runs where id = $1", [runId]);
      const residue = {
        runs: (await c.query("select count(*)::int as n from runs where id = $1", [runId]))
          .rows[0].n,
        signals: (
          await c.query("select count(*)::int as n from pause_signals where id = $1", [signalId])
        ).rows[0].n,
        gates: (await c.query("select count(*)::int as n from gates where run_id = $1", [runId]))
          .rows[0].n,
        events: (
          await c.query("select count(*)::int as n from run_events where run_id = $1", [runId])
        ).rows[0].n,
      };
      evidence.rollback = { deleted: ["pause_signals", "runs (cascade)"], residue };
    } catch (err) {
      evidence.rollback = { error: String(err) };
    }
    c.release();
  }
} finally {
  await pool.end();
}

console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict?.startsWith("PASS") ? 0 : 4);
