#!/usr/bin/env node
// R6OPS.1 (REQ-DEP-2(a)) — the PITR restore drill driver. Pre-authorized by
// `GD-PREAUTH-ACTS.R6` for exactly ONE scratch Cloud SQL instance, created →
// PITR-verified → destroyed. The live `rhema-prod-postgres` is never touched
// (this script never writes to the source DSN — reads only, and all writes go
// through `gcloud sql` on the SCRATCH name).
//
// With --execute it:
//   1. captures pre-state on prod (row counts over `COUNT_TABLES` + one tenant
//      read — the newest non-test workspace's newest project row), recording
//      the captured instant T0;
//   2. `gcloud sql instances clone rhema-prod-postgres <scratch> --point-in-time
//      <T0>` — PITR restores the source to T0 INTO the new scratch instance;
//   3. polls the scratch to RUNNABLE, opens an IAP tunnel to its private IP via
//      the egress-proxy VM (the established prod-read path), connects with the
//      same system-role credentials a clone preserves;
//   4. asserts the scratch row counts equal the captured T0 counts and the same
//      tenant row reads back — RTO = clone-start → first successful verified
//      read;
//   5. destroys the scratch (`gcloud sql instances delete`, clearing
//      deletion-protection if set) and verifies absence;
//   6. prints the evidence JSON (restore point, RTO, per-table counts, tenant
//      read, destroy-confirmation).
//
//   RESTORE_DRILL_ACK=yes DATABASE_URL=<system dsn over an open tunnel to prod> \
//     node scripts/live/restore-drill.mjs --execute \
//       [--point-in-time <RFC3339>] [--scratch <name>] [--proxy-vm <name> --proxy-zone <zone>] [--timeout-m 30]
//   node scripts/live/restore-drill.mjs --dry-run   # prints the plan; touches nothing
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { spawnSync, spawn } from "node:child_process";

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
const PROJECT = flag("--project") || "rhema-507501";
const SOURCE = flag("--source") || "rhema-prod-postgres";
const SCRATCH = flag("--scratch") || `rhema-r6ops-drill-${Math.floor(Date.now() / 1000)}`;
const PIT_FLAG = flag("--point-in-time");
const TIMEOUT_M = Number(flag("--timeout-m") || 30);
const PORT = 15437;
const TICKET = "187_R6OPS.1";

// The tables whose T0 row counts the drill asserts survive the restore. Chosen to cover the
// write-heavy surfaces (run machinery, metering) + the reference set (_migrations, protocols).
const COUNT_TABLES = [
  "workspaces", '"user"', "projects", "runs", "run_events", "gates",
  "fetch_log", "pause_signals", "usage_records", "deployments", "_migrations", "protocols",
];

const gcloud = (gargs, { capture = true } = {}) => {
  const r = spawnSync("gcloud", gargs, {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return { status: r.status ?? 1, stdout: (r.stdout ?? "").trim() };
};

function plan() {
  return {
    ticket: TICKET,
    req: "REQ-DEP-2(a)",
    authority: "GD-PREAUTH-ACTS.R6 — ONE scratch Cloud SQL instance, created → PITR-verified → destroyed; the live instance is NEVER touched",
    scratch: SCRATCH,
    source: SOURCE,
    pitr: PIT_FLAG ?? "<captured T0 on prod>",
    countTables: COUNT_TABLES,
    steps: [
      "pre-state on prod (row counts + one tenant read) at recorded T0",
      `gcloud sql instances clone ${SOURCE} ${SCRATCH} --point-in-time <T0>`,
      "poll to RUNNABLE; IAP-tunnel the scratch private IP; connect as postgres",
      "assert scratch counts == T0 counts + the tenant row reads back; RTO = clone-start → verified-read",
      `gcloud sql instances delete ${SCRATCH} (+ --no-deletion-protection if set); verify absent`,
    ],
    timeout_m: TIMEOUT_M,
  };
}

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, plan: plan() }, null, 1));
  process.exit(0);
}

if (process.env.RESTORE_DRILL_ACK !== "yes") {
  console.error("refusing: --execute requires RESTORE_DRILL_ACK=yes (the operator's pre-authorized act)");
  process.exit(3);
}
if (!process.env.DATABASE_URL) {
  console.error("refusing: --execute requires DATABASE_URL (system-role DSN over the IAP tunnel to prod)");
  process.exit(3);
}
// The scratch reuses the prod postgres credentials a PITR clone preserves — the password rides
// the DSN's memory only, never a log line or the evidence JSON.
const dsnUrl = new URL(process.env.DATABASE_URL);
const scratchDsn = (port) =>
  `postgres://${encodeURIComponent(dsnUrl.username)}:${encodeURIComponent(dsnUrl.password)}@127.0.0.1:${port}/rhema`;

const evidence = {
  ticket: TICKET,
  req: "REQ-DEP-2(a)",
  at: new Date().toISOString(),
  scratch: SCRATCH,
  source: SOURCE,
  pre_state: null,
  pitr_point: null,
  clone: null,
  verify: null,
  rto: null,
  destroy: null,
  verdict: null,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function countsOn(pool, tables) {
  const out = {};
  for (const t of tables) {
    out[t] = (await pool.query(`select count(*)::bigint as n from ${t}`)).rows[0].n;
  }
  return out;
}

let tunnel = null;
try {
  // --- 1. pre-state on prod over the caller's open tunnel (read-only) ---
  const prod = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  let t0;
  try {
    t0 = (await prod.query("select now() as t")).rows[0].t;
    const counts = await countsOn(prod, COUNT_TABLES);
    const ws = (
      await prod.query(
        "select id from workspaces where not is_test order by created_at desc limit 1",
      )
    ).rows[0];
    const tenant = ws
      ? (
          await prod.query(
            "select id, title, workspace_id, created_at from projects where workspace_id = $1 order by created_at desc limit 1",
            [ws.id],
          )
        ).rows[0]
      : null;
    evidence.pre_state = { t0: t0.toISOString(), counts, workspace: ws?.id ?? null, tenant_row: tenant };
  } finally {
    await prod.end();
  }
  const pitrPoint = PIT_FLAG ?? evidence.pre_state.t0;
  evidence.pitr_point = pitrPoint;

  // --- 2. PITR-clone the source into the ONE authorized scratch instance ---
  // `--async`: gcloud's sync wait aborts (~10 min) while the server-side restore keeps
  // running — the RUNNABLE poll below is the real wait (live: a PENDING_CREATE wait of
  // ~10 min on the first drill run hit exactly this).
  const cloneStart = Date.now();
  const clone = gcloud([
    "sql", "instances", "clone", SOURCE, SCRATCH,
    "--project", PROJECT, "--point-in-time", pitrPoint, "--async",
  ]);
  evidence.clone = {
    started_at: new Date(cloneStart).toISOString(),
    exit: clone.status,
    runnable_at: null,
  };
  if (clone.status !== 0) throw new Error(`gcloud sql clone exited ${clone.status}`);
  // --- 3. poll to RUNNABLE + read the scratch private IP ---
  const deadline = Date.now() + TIMEOUT_M * 60 * 1000;
  let desc = null;
  while (Date.now() < deadline) {
    const d = gcloud(["sql", "instances", "describe", SCRATCH, "--project", PROJECT, "--format=json"]);
    if (d.status === 0) {
      desc = JSON.parse(d.stdout);
      if (desc.state === "RUNNABLE") break;
    }
    await sleep(20000);
  }
  if (!desc || desc.state !== "RUNNABLE") throw new Error(`scratch did not reach RUNNABLE (state=${desc?.state})`);
  evidence.clone.runnable_at = new Date().toISOString();
  const ip = (desc.ipAddresses ?? []).find((a) => a.type === "PRIVATE")?.ipAddress;
  if (!ip) throw new Error("scratch has no PRIVATE ip — cannot reach it via the IAP tunnel");
  evidence.clone.private_ip = ip;
  evidence.clone.region = desc.region;
  evidence.clone.deletion_protection = desc.settings?.deletionProtectionEnabled ?? false;

  // Resolve the egress-proxy VM for the IAP tunnel (same path every prod read takes).
  const proxyVm =
    flag("--proxy-vm") ??
    gcloud([
      "compute", "instances", "list", "--project", PROJECT,
      "--filter", "name~^rhema-prod-proxy AND status=RUNNING",
      "--format", "value(name)",
    ]).stdout.split("\n")[0];
  const proxyZone =
    flag("--proxy-zone") ??
    gcloud([
      "compute", "instances", "list", "--project", PROJECT,
      "--filter", `name=${proxyVm}`, "--format", "value(zone)",
    ]).stdout.split("\n")[0];
  if (!proxyVm || !proxyZone) throw new Error("no running rhema-prod-proxy VM for the IAP tunnel");
  tunnel = spawn(
    "gcloud",
    ["compute", "ssh", proxyVm, "--zone", proxyZone, "--project", PROJECT,
      "--tunnel-through-iap", "--", "-L", `127.0.0.1:${PORT}:${ip}:5432`, "-N", "-o", "StrictHostKeyChecking=accept-new"],
    { stdio: ["ignore", "inherit", "inherit"] },
  );
  evidence.clone.tunnel = { vm: proxyVm, zone: proxyZone, local_port: PORT };

  // --- 4. verified read on the scratch: counts == T0 + the tenant row ---
  const scratch = new pg.Pool({ connectionString: scratchDsn(PORT), max: 1 });
  let verifiedAt = null;
  try {
    const connDeadline = Date.now() + 5 * 60 * 1000;
    for (;;) {
      try {
        await scratch.query("select 1");
        break;
      } catch (e) {
        if (Date.now() > connDeadline) throw e;
        await sleep(5000);
      }
    }
    const scratchCounts = await countsOn(scratch, COUNT_TABLES);
    const mismatches = Object.entries(evidence.pre_state.counts)
      .filter(([t, n]) => String(scratchCounts[t]) !== String(n))
      .map(([t, n]) => ({ table: t, prod_t0: n, scratch: scratchCounts[t] }));
    let tenantOk = null;
    if (evidence.pre_state.tenant_row) {
      const row = (
        await scratch.query(
          "select id, title, workspace_id, created_at from projects where id = $1",
          [evidence.pre_state.tenant_row.id],
        )
      ).rows[0];
      tenantOk =
        !!row &&
        row.title === evidence.pre_state.tenant_row.title &&
        row.workspace_id === evidence.pre_state.tenant_row.workspace_id;
    }
    verifiedAt = new Date();
    evidence.verify = {
      verified_at: verifiedAt.toISOString(),
      counts_match: mismatches.length === 0,
      mismatches,
      tenant_read: tenantOk,
      scratch_counts: scratchCounts,
    };
    evidence.rto = {
      // Recovery Time Objective as the drill defines it: clone-call → first verified read.
      clone_started: evidence.clone.started_at,
      runnable_at: evidence.clone.runnable_at,
      verified_read_at: evidence.verify.verified_at,
      rto_seconds: Math.round((verifiedAt.getTime() - cloneStart) / 1000),
    };
    evidence.verdict =
      mismatches.length === 0 && (tenantOk !== false)
        ? "PASS — PITR restored the T0 state; counts match; tenant read OK"
        : "FAIL — restore-point divergence (see mismatches / tenant_read)";
  } finally {
    await scratch.end();
  }
} catch (err) {
  evidence.error = String(err);
  if (!evidence.verdict) evidence.verdict = `FAIL — ${err.message}`;
} finally {
  // --- 5. destroy + verify absent (always, even on a failed verify) ---
  try {
    tunnel?.kill("SIGTERM");
    const exists =
      gcloud(["sql", "instances", "describe", SCRATCH, "--project", PROJECT]).status === 0;
    if (exists) {
      const d = gcloud(["sql", "instances", "describe", SCRATCH, "--project", PROJECT, "--format=json"]);
      if (d.status === 0 && JSON.parse(d.stdout).settings?.deletionProtectionEnabled) {
        gcloud(["sql", "instances", "patch", SCRATCH, "--project", PROJECT, "--no-deletion-protection"]);
      }
      // Retry through 409s — an in-flight operation (e.g. a still-running clone) blocks
      // delete until it completes.
      let del = { status: -1 };
      const delDeadline = Date.now() + 15 * 60 * 1000;
      while (Date.now() < delDeadline) {
        del = gcloud(["sql", "instances", "delete", SCRATCH, "--project", PROJECT, "--quiet"]);
        if (del.status === 0) break;
        await sleep(15000);
      }
      const gone =
        gcloud(["sql", "instances", "describe", SCRATCH, "--project", PROJECT]).status !== 0;
      evidence.destroy = { delete_exit: del.status, verified_absent: gone };
    } else {
      evidence.destroy = { delete_exit: null, verified_absent: true, note: "scratch never existed" };
    }
  } catch (err) {
    evidence.destroy = { error: String(err) };
  }
  if (evidence.destroy?.verified_absent !== true && !evidence.verdict) {
    evidence.verdict = "FAIL — scratch could not be verified absent";
  }
}

console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict?.startsWith("PASS") && evidence.destroy?.verified_absent ? 0 : 4);
