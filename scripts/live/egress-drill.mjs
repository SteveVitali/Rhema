#!/usr/bin/env node
// R6OPS.1 (REQ-DEP-2(c); D-P1.22-2 leg (e)) — the egress-denied-spike PLAYBOOK drill driver.
// Runs `docs/ops/playbooks/egress-denied-spike.md` end-to-end on ONE canary `is_test` run
// (canary-pause.mjs precedent; the one prod write this ticket's header authorizes):
//
//   1. pre-state capture — pending pause_signals, running runs, fetch_log deny census;
//   2. PLANT — one synthetic `runs` row (state='running', is_test ws, requested_by NULL,
//      estimate/cap 0) + a deny SPIKE of `fetch_log` rows (decision='deny',
//      deny_reason='domain_blocklist' — the playbook's diagnose target) + one
//      `pause_signals` row (reason='egress_denied_spike', the proxy's real signal);
//   3. DETECT — the worker's drainPauseSignals claims the signal → running → waiting_gate +
//      blocking `refusal` gate (on_expiry='cancel') + paired events;
//   4. DIAGNOSE (playbook steps 1–3) — the deny_reason distribution query verbatim;
//   5. NEGATIVE CONTROL — the `egress_denied_10m` SLO probe query (from
//      packages/orchestrator/src/slo.ts, NOT_FROM_TEST_RUN verbatim) still reads 0:
//      flagged test tenants never count toward SLOs (ADR-020), so a canary spike must
//      NOT page — the probe's exclusion is asserted live;
//   6. CONTAIN — the run is verified parked (`waiting_gate` + unresolved refusal gate —
//      the playbook's "leave it parked pending review");
//   7. ROLLBACK — every planted row deleted (fetch_log, pause_signals, runs → cascade
//      gates/run_events/seq) — residue 0 across all five tables; prints the timeline.
//
//   EGRESS_DRILL_ACK=yes DATABASE_URL=<system dsn over the IAP tunnel> \
//     node scripts/live/egress-drill.mjs --execute [--workspace-id <id>] [--timeout-s 60]
//   node scripts/live/egress-drill.mjs --dry-run   # prints the plan; touches nothing
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
const WORKSPACE_ID = flag("--workspace-id") || null;
const TIMEOUT_S = Number(flag("--timeout-s") || 60);
const DENY_ROWS = 4;
const TICKET = "187_R6OPS.1";

// The probe's exact test-tenant exclusion (packages/orchestrator/src/slo.ts NOT_FROM_TEST_RUN).
const NOT_FROM_TEST_RUN = (fk) =>
  `not exists (select 1 from runs r join workspaces w on w.id = r.workspace_id
     where r.id = ${fk} and w.is_test)`;
const EGRESS_PROBE = `select count(*)::int as n from fetch_log where decision = 'deny'
  and ts > now() - interval '10 minutes' and ${NOT_FROM_TEST_RUN("fetch_log.run_id")}`;

if (dryRun) {
  console.log(
    JSON.stringify(
      {
        dry_run: true,
        plan: {
          ticket: TICKET,
          req: "REQ-DEP-2(c)",
          playbook: "docs/ops/playbooks/egress-denied-spike.md",
          plant: [
            "insert runs (synthetic canary: running, is_test ws, requested_by null, 0 credits)",
            `insert fetch_log ×${DENY_ROWS} (decision='deny', deny_reason='domain_blocklist')`,
            "insert pause_signals (reason='egress_denied_spike', canary marker)",
          ],
          playbook_legs: ["detect (drain→waiting_gate+refusal)", "diagnose (deny_reason distribution)",
            "negative control (egress_denied_10m probe = 0 under is_test)", "contain (parked)"],
          rollback: ["delete fetch_log/pause_signals/runs (cascade) — residue asserted 0"],
        },
      },
      null,
      1,
    ),
  );
  process.exit(0);
}

if (process.env.EGRESS_DRILL_ACK !== "yes") {
  console.error("refusing: --execute requires EGRESS_DRILL_ACK=yes (the operator's prod-write go)");
  process.exit(3);
}
if (!process.env.DATABASE_URL) {
  console.error("refusing: --execute requires DATABASE_URL (system-role DSN over the IAP tunnel)");
  process.exit(3);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const timeline = [];
const stamp = (leg) => timeline.push({ leg, at: new Date().toISOString() });
const evidence = { ticket: TICKET, req: "REQ-DEP-2(c)", timeline, playbook: {}, verdict: null };
let runId = null;
let signalId = null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const c = await pool.connect();
  try {
    const ws = WORKSPACE_ID
      ? (await c.query("select id, is_test from workspaces where id = $1", [WORKSPACE_ID])).rows[0]
      : (
          await c.query(
            "select id, is_test from workspaces where is_test order by created_at desc limit 1",
          )
        ).rows[0];
    if (!ws) throw new Error("no workspace: pass --workspace-id or ensure an is_test tenant exists");
    if (!ws.is_test)
      throw new Error(`refusing: workspace ${ws.id} is not is_test — canaries never touch real tenants`);
    evidence.workspace_id = ws.id;

    evidence.pre_state = {
      pending_signals: (await c.query("select count(*)::int as n from pause_signals where processed_at is null")).rows[0].n,
      denies_10m_all: (await c.query("select count(*)::int as n from fetch_log where decision='deny' and ts > now() - interval '10 minutes'")).rows[0].n,
      egress_probe: (await c.query(EGRESS_PROBE)).rows[0].n,
    };
    stamp("pre_state");

    runId = `r6ops1-egress-${Date.now()}`;
    await c.query(
      `insert into runs (id, workspace_id, workflow, state, inputs, model_profile, model_tier, rigor,
         estimate_credits, cap_credits, rate_table_version, requested_by, started_at)
       values ($1,$2,'review','running',$3::jsonb,'{"tier":"base"}','base','quick',0,0,1,null,now())`,
      [runId, ws.id, JSON.stringify({ canary: "R6OPS.1", synthetic: true, ticket: TICKET })],
    );
    for (let i = 0; i < DENY_ROWS; i++) {
      await c.query(
        `insert into fetch_log (run_id, ts, agent_label, kind, url, normalized_url, status, bytes, decision, deny_reason)
         values ($1, now(), 'r6ops1-drill', 'fetch', $2, $2, 403, 0, 'deny', 'domain_blocklist')`,
        [runId, `https://blocked-${i}.r6ops-drill.invalid/`],
      );
    }
    signalId = (
      await c.query(
        `insert into pause_signals (run_id, workspace_id, reason, detail)
         values ($1,$2,'egress_denied_spike',$3::jsonb) returning id`,
        [runId, ws.id, JSON.stringify({ canary: "R6OPS.1", ticket: TICKET })],
      )
    ).rows[0].id;
    evidence.canary = { run_id: runId, signal_id: signalId, deny_rows: DENY_ROWS };
    stamp("planted");

    // DETECT — the drain claims the signal and parks the run (worker sweep ~5 s).
    const deadline = Date.now() + TIMEOUT_S * 1000;
    let snap = null;
    while (Date.now() < deadline) {
      snap = {
        run_state: (await c.query("select state from runs where id = $1", [runId])).rows[0]?.state,
        signal: (
          await c.query(
            "select claimed_at, processed_at from pause_signals where id = $1",
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
    stamp("detected");

    // DIAGNOSE — the playbook's verbatim distribution read (detect §).
    const distribution = (
      await c.query(
        "select run_id, status, deny_reason, count(*)::int as n from fetch_log where decision='deny' group by 1,2,3 order by 4 desc limit 10",
      )
    ).rows;
    const canaryDenies = (
      await c.query(
        "select count(*)::int as n from fetch_log where run_id = $1 and decision='deny'",
        [runId],
      )
    ).rows[0].n;
    stamp("diagnosed");

    // NEGATIVE CONTROL — the SLO probe must NOT see the canary spike (is_test exclusion).
    const probeAfter = (await c.query(EGRESS_PROBE)).rows[0].n;
    stamp("probe_read");

    // CONTAIN — the playbook's "leave it parked": waiting_gate + unresolved blocking refusal.
    const refusal = (snap?.gates ?? []).find(
      (g) => g.kind === "refusal" && g.blocking && g.on_expiry === "cancel" && !g.resolved_at,
    );
    const events = (
      await c.query(
        "select type, payload from run_events where run_id = $1 order by seq",
        [runId],
      )
    ).rows;
    evidence.playbook = {
      detect: {
        paused: snap?.run_state === "waiting_gate" && !!snap?.signal?.processed_at,
        refusal_gate: !!refusal,
        events: events.map((e) => e.type),
      },
      diagnose: { distribution, canary_deny_rows: canaryDenies },
      negative_control: {
        probe: "egress_denied_10m (NOT_FROM_TEST_RUN verbatim from slo.ts)",
        pre: evidence.pre_state.egress_probe,
        post: probeAfter,
        excluded: probeAfter === evidence.pre_state.egress_probe,
      },
      contain: { parked: snap?.run_state === "waiting_gate" && !!refusal },
    };
    stamp("contained_verified");
    evidence.verdict =
      evidence.playbook.detect.paused &&
      evidence.playbook.detect.refusal_gate &&
      evidence.playbook.negative_control.excluded &&
      canaryDenies === DENY_ROWS
        ? "PASS — playbook ran end-to-end on the canary; spike parked the run; is_test exclusion held"
        : "INCOMPLETE — a playbook leg did not observe its expected state";
  } finally {
    try {
      if (signalId) await c.query("delete from pause_signals where id = $1", [signalId]);
      if (runId) {
        await c.query("delete from fetch_log where run_id = $1", [runId]);
        await c.query("delete from runs where id = $1", [runId]);
      }
      const residue = {
        runs: (await c.query("select count(*)::int as n from runs where id = $1", [runId])).rows[0].n,
        signals: (await c.query("select count(*)::int as n from pause_signals where id = $1", [signalId])).rows[0].n,
        gates: (await c.query("select count(*)::int as n from gates where run_id = $1", [runId])).rows[0].n,
        events: (await c.query("select count(*)::int as n from run_events where run_id = $1", [runId])).rows[0].n,
        fetch_log: (await c.query("select count(*)::int as n from fetch_log where run_id = $1", [runId])).rows[0].n,
      };
      evidence.rollback = { deleted: ["fetch_log", "pause_signals", "runs (cascade)"], residue };
    } catch (err) {
      evidence.rollback = { error: String(err) };
    }
    stamp("rolled_back");
    c.release();
  }
} finally {
  await pool.end();
}

console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict?.startsWith("PASS") ? 0 : 4);
