#!/usr/bin/env node
// R6SOAK.1 (REQ-ENG-7; DEFERRALS D-COST.1-3 (a) / D-P0.15h-3) — the worker right-size cold-import
// soak driver. Runs N pre-registered iterations of the D-P0.15h-3 failure-mode shape against an
// owned `pr-<n>` preview whose worker is pinned to the right-size candidate (0.5 vCPU / 512Mi via
// the preview stage fact — never prod, never a shared stage):
//
//   per iteration:
//     1. `gcloud run services update rhema-<stack>-worker --update-env-vars RHEMA_SOAK_ITER=<i>`
//        → a NEW revision ⇒ a new cold instance (the lazy `import("@kubernetes/client-node")` is
//        per-process, so every iteration starts with the launcher never built — the exact
//        D-P0.15h-3 condition).
//     2. insert a `queued` run fixture on an `is_test` workspace + send the real `run.start`
//        pg-boss job (the same name/payload/singleton key the api uses post-commit).
//     3. poll the DB: the launch's success lands as `slo_samples(signal='run_start_stage_ms',
//        detail='job_launch')`; the failure signature is the launcher's own log markers
//        (`building GKE launcher` / `timeout after` / `launch attempt N/3 failed`) plus a
//        `provisioning` stall or `failed` state.
//     4. enqueue `run.cancel` the moment the launch lands so the run-task pod never reaches
//        provider spend.
//
//   verdict: GREEN iff every iteration launches cleanly — `job_launch` sample present, ≤
//   LAUNCH_BUDGET_MS (the ensureLauncher timeout: hitting it IS the throttled signature), and zero
//   timeout/attempt-failure markers in the worker log window. Anything else → RED (prod keeps
//   1 vCPU/1Gi and this soak is the evidence).
//
// DB access rides `RHEMA_SOAK_DATABASE_URL` — the preview's system-role DSN through the IAP SSH
// tunnel on the preview's own egress-proxy VM (VERIF.2's pattern; the value never enters the
// repo or a report). Usage:
//
//   RHEMA_SOAK_DATABASE_URL='postgresql://postgres:…@127.0.0.1:15433/rhema?sslmode=require&uselibpqcompat=true' \
//     node scripts/live/worker-soak.mjs --stack pr-<n> --iterations 6 \
//       --out docs/build/reports/<date>_R6SOAK.1 [--dry-run]
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
// `pg` + `pg-boss` are the worker's own deps — resolved through its package.json so the driver
// pins the exact client versions the consumer runs (no new dependency, no hoisting assumption).
const require = createRequire(resolve(repoRoot, "apps", "worker", "package.json"));
const pg = require("pg");
const { PgBoss } = require("pg-boss");

export const RUN_START_QUEUE = "run.start"; // RUN_JOBS.start — the api's post-commit send shape
export const RUN_CANCEL_QUEUE = "run.cancel"; // RUN_JOBS.cancel
/** The worker's own failure-mode log markers (apps/worker/src/main.ts). */
export const LOG_MARKERS = ["building GKE launcher", "launch attempt", "timeout after"];
/** ensureLauncher's build timeout — the line between clean and the throttled signature. */
export const LAUNCH_BUDGET_MS = 60_000;
const WATCH_TIMEOUT_MS = 600_000; // > the ~9 min D-P0.15h-3 hang — a red iteration must be SEEN
const REVISION_WAIT_MS = 300_000;

export function parseArgs(argv) {
  const args = {
    stack: undefined,
    iterations: 6,
    project: "rhema-507501",
    region: "us-central1",
    launchBudgetMs: LAUNCH_BUDGET_MS,
    watchTimeoutMs: WATCH_TIMEOUT_MS,
    revisionWaitMs: REVISION_WAIT_MS,
    out: undefined,
    dryRun: false,
    fixturePrefix: "r6soak",
    from: 1,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--stack") args.stack = next();
    else if (a === "--iterations") args.iterations = Number(next());
    else if (a === "--from") args.from = Number(next());
    else if (a === "--project") args.project = next();
    else if (a === "--region") args.region = next();
    else if (a === "--launch-budget-ms") args.launchBudgetMs = Number(next());
    else if (a === "--watch-timeout-ms") args.watchTimeoutMs = Number(next());
    else if (a === "--out") args.out = next();
    else if (a === "--fixture-prefix") args.fixturePrefix = next();
    else if (a === "--dry-run") args.dryRun = true;
    else throw new Error(`worker-soak: unknown arg '${a}'`);
  }
  if (!/^pr-\d+$/.test(args.stack ?? "")) {
    throw new Error(`worker-soak: --stack must be an owned pr-<n> preview — refused '${args.stack}'`);
  }
  if (!(args.iterations >= 1 && args.iterations <= 20)) {
    throw new Error(`worker-soak: --iterations must be 1..20 (got ${args.iterations})`);
  }
  if (!(args.from >= 1 && args.from <= args.iterations)) {
    throw new Error(`worker-soak: --from must be 1..${args.iterations} (got ${args.from})`);
  }
  return args;
}

/** Deterministic per-iteration fixture ids — greppable in every log/DB table. */
export function fixtureIds(args, i) {
  const p = `${args.fixturePrefix}_${args.stack}_${i}`;
  return {
    userId: `usr_${args.fixturePrefix}`,
    billingAccountId: `ba_${args.fixturePrefix}`,
    workspaceId: `ws_${args.fixturePrefix}`,
    projectId: `prj_${args.fixturePrefix}`,
    runId: `run_${p}`,
  };
}

/**
 * Classify one iteration's observation. `clean` = the launch landed inside the budget with no
 * timeout/retry machinery firing; `degraded` = it landed but only after the failure-mode machinery
 * fired or over budget; `failed` = the launch never landed inside the watch window.
 */
export function classifyIteration(rec, launchBudgetMs = LAUNCH_BUDGET_MS) {
  if (rec.jobLaunchMs == null) return "failed";
  const markers = rec.logMarkers ?? [];
  const retryFired = markers.some((m) => m.includes("timeout after") || m.includes("launch attempt"));
  if (rec.jobLaunchMs > launchBudgetMs || retryFired) return "degraded";
  return "clean";
}

/** GREEN iff every iteration is clean — a degraded launch is the throttled signature surviving.
 *  ZERO records is RED (fail-closed — a soak that recorded nothing attests nothing). */
export function verdictFor(records, launchBudgetMs = LAUNCH_BUDGET_MS) {
  const classes = records.map((r) => classifyIteration(r, launchBudgetMs));
  return {
    verdict: records.length > 0 && classes.every((c) => c === "clean") ? "green" : "red",
    classes,
  };
}

// ---------------------------------------------------------------- live seams (injectable for tests)

function gcloud(gargs, { capture = false } = {}) {
  const r = spawnSync("gcloud", gargs, {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
  });
  return { status: r.status ?? 1, stdout: r.stdout ?? "" };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolve the worker's Pulumi-AUTONAMED Cloud Run service (`rhema-<stack>-worker-<6hex>` —
 * the literal prefix NOT_FOUNDs, the F-VERIF.2-1 lesson; monitoring.ts pins the same fact).
 * Exactly one match or the soak refuses (fail-closed: never aim at an ambiguous service).
 */
export function workerServiceName(listJson, stack) {
  let rows = [];
  try {
    rows = JSON.parse(listJson);
  } catch {
    return null;
  }
  const names = rows
    .map((r) => r?.metadata?.name ?? "")
    .filter((n) => new RegExp(`^rhema-${stack}-worker(-[0-9a-f]+)?$`).test(n));
  return names.length === 1 ? names[0] : null;
}

function resolveWorkerService(args, g = gcloud) {
  const r = g(
    ["run", "services", "list", "--project", args.project, "--region", args.region,
     "--filter", `metadata.name~^rhema-${args.stack}-worker`, "--format", "json"],
    { capture: true },
  );
  if (r.status !== 0) return null;
  return workerServiceName(r.stdout, args.stack);
}

/** The worker service's live revision state (latestReady + the 100%-traffic revision). */
function workerRevisionState(args, svc, g = gcloud) {
  const r = g(
    [
      "run", "services", "describe", svc,
      "--project", args.project, "--region", args.region, "--format", "json",
    ],
    { capture: true },
  );
  if (r.status !== 0) return null;
  try {
    const svc = JSON.parse(r.stdout);
    const traffic = (svc.status?.traffic ?? []).find((t) => t.percent === 100);
    const limits = svc.spec?.template?.spec?.containers?.[0]?.resources?.limits ?? {};
    return {
      latestReady: svc.status?.latestReadyRevisionName ?? null,
      serving: traffic?.revisionName ?? null,
      cpu: limits.cpu ?? null,
      memory: limits.memory ?? null,
    };
  } catch {
    return null;
  }
}

async function waitForRevision(args, svc, previous, g, sleep) {
  const deadline = Date.now() + args.revisionWaitMs;
  while (Date.now() < deadline) {
    const s = workerRevisionState(args, svc, g);
    if (s?.latestReady && s.latestReady === s.serving && s.latestReady !== previous) return s;
    await sleep(5_000);
  }
  throw new Error(`worker-soak: revision never rolled (still ${previous}) after ${args.revisionWaitMs}ms`);
}

/** The worker log lines carrying the failure-mode markers inside [fromIso, now]. */
function workerLogMarkers(args, svc, fromIso, g = gcloud) {
  const filter =
    `resource.type="cloud_run_revision" AND resource.labels.service_name="${svc}" ` +
    `AND timestamp>="${fromIso}"`;
  const r = g(
    ["logging", "read", filter, "--project", args.project, "--format", "json", "--limit", "500"],
    { capture: true },
  );
  if (r.status !== 0) return [];
  let entries = [];
  try {
    entries = JSON.parse(r.stdout);
  } catch {
    return [];
  }
  const lines = entries.map((e) => e.textPayload ?? "").filter(Boolean);
  return lines.filter((l) => LOG_MARKERS.some((m) => l.includes(m)));
}

async function seedFixture(db, args) {
  const ids = fixtureIds(args, 0);
  await db.query(`insert into billing_accounts(id) values ($1) on conflict (id) do nothing`, [
    ids.billingAccountId,
  ]);
  await db.query(
    `insert into "user"(id, email, email_verified) values ($1,$2,true) on conflict (id) do nothing`,
    [ids.userId, `${ids.userId}@rhema.tools`],
  );
  await db.query(
    `insert into workspaces(id, kind, name, billing_account_id, is_test) values ($1,'personal','R6SOAK.1 soak',$2,true)
       on conflict (id) do nothing`,
    [ids.workspaceId, ids.billingAccountId],
  );
  await db.query(
    `insert into projects(id, workspace_id, owner_id, title, slug)
       values ($1,$2,$3,'R6SOAK.1 soak project',$4) on conflict (id) do nothing`,
    [ids.projectId, ids.workspaceId, ids.userId, `slug-${ids.projectId}`],
  );
  return ids;
}

async function seedQueuedRun(db, ids) {
  // Mirrors @rhema/orchestrator's testing seedRun shape — a sheet-launched Review run landing in
  // `queued` exactly as POST /projects/:id/runs leaves it before the post-commit `run.start` send.
  await db.query(
    `insert into runs(
       id, workspace_id, project_id, persona_id, workflow, agent_instance_id, state, state_since,
       current_attempt, inputs, input_snapshot, model_profile, model_tier, rigor, estimate_credits,
       cap_credits, spent_credits, rate_table_version, hold_ledger_id, lock_set, created_at)
     values ($1,$2,$3,null,'review',null,'queued',now(),1,'{}'::jsonb,'{}'::jsonb,
             'balanced','base','quick',25,25,0,1,null,'{}',now())
     on conflict (id) do nothing`,
    [ids.runId, ids.workspaceId, ids.projectId],
  );
}

async function readRunState(db, runId) {
  const res = await db.query(
    `select state, extract(epoch from state_since)*1000 as state_since_ms from runs where id = $1`,
    [runId],
  );
  return res.rows[0] ?? null;
}

async function readLaunchSample(db, runId) {
  const res = await db.query(
    `select detail, value_ms from slo_samples
      where run_id = $1 and signal = 'run_start_stage_ms' order by at`,
    [runId],
  );
  const rows = res.rows ?? [];
  return {
    jobLaunchMs: rows.find((r) => r.detail === "job_launch")?.value_ms ?? null,
    admitMintMs: rows.find((r) => r.detail === "admit_mint")?.value_ms ?? null,
  };
}

async function cleanupFixture(db, args, runIds) {
  const ids = fixtureIds(args, 0);
  // workspace-scoped sweep — covers runs seeded by an earlier crashed driver pass too
  const extra = await db
    .query(`select id from runs where workspace_id = $1`, [ids.workspaceId])
    .then((r) => r.rows.map((x) => x.id))
    .catch(() => []);
  for (const runId of new Set([...runIds, ...extra])) {
    await db.query(`delete from slo_samples where run_id = $1`, [runId]).catch(() => {});
    await db.query(`delete from run_events where run_id = $1`, [runId]).catch(() => {});
    await db.query(`delete from usage_records where run_id = $1`, [runId]).catch(() => {});
    await db.query(`delete from proxy_credentials where run_id = $1`, [runId]).catch(() => {});
    await db.query(`delete from proxy_allowlists where run_id = $1`, [runId]).catch(() => {});
    await db.query(`delete from runs where id = $1`, [runId]).catch(() => {});
  }
  await db.query(`delete from projects where id = $1`, [ids.projectId]).catch(() => {});
  await db.query(`delete from workspaces where id = $1`, [ids.workspaceId]).catch(() => {});
  await db.query(`delete from billing_accounts where id = $1`, [ids.billingAccountId]).catch(() => {});
  await db.query(`delete from "user" where id = $1`, [ids.userId]).catch(() => {});
}

export async function soak(args, io = {}) {
  const log = io.log ?? console.log;
  const g = io.gcloud ?? gcloud;
  const sleep = io.sleep ?? defaultSleep;
  const dsn = process.env.RHEMA_SOAK_DATABASE_URL;
  if (!dsn) throw new Error("worker-soak: RHEMA_SOAK_DATABASE_URL is required (system-role DSN via the IAP tunnel)");
  const pool = io.db ?? new pg.Pool({ connectionString: dsn, max: 2 });
  const boss =
    io.boss ??
    new PgBoss({ connectionString: dsn, migrate: false, supervise: false, schedule: false });
  const ownBoss = !io.boss;
  // Transient client drops (IAP tunnel blips, the throttle-side mass timeouts the soak itself
  // induces) surface as 'error' EVENTS on the boss/pool — never let one kill the driver; the
  // supervised clients reconnect on their next tick. A genuinely dead client still fails the
  // awaited calls it actually needs.
  boss.on?.("error", (e) => log(`[soak] boss transient error (supervisor retries): ${e?.message ?? e}`));
  pool.on?.("error", (e) => log(`[soak] pg pool idle-client error: ${e?.message ?? e}`));
  const runIds = [];
  const records = [];
  try {
    if (ownBoss) await boss.start();
    if (io.db == null) await pool.query("select 1");
    const svc = io.workerService ?? resolveWorkerService(args, g);
    if (!svc) throw new Error(`worker-soak: could not resolve exactly one rhema-${args.stack}-worker* service — is the stack up?`);
    const base = workerRevisionState(args, svc, g);
    if (!base) throw new Error(`worker-soak: ${svc} not found/ready — is the stack up?`);
    log(`[soak] worker ${svc} @ ${base.latestReady} cpu=${base.cpu} mem=${base.memory}`);
    if (args.dryRun) {
      log("[soak] dry-run — preconditions green (service reachable, db connected, boss started); no iterations sent");
      return { verdict: "dry-run", records: [] };
    }
    const ids = await seedFixture(pool, args);
    for (let i = args.from ?? 1; i <= args.iterations; i++) {
      const iter = { iteration: i, runId: fixtureIds(args, i).runId };
      const prev = workerRevisionState(args, svc, g)?.latestReady ?? null;
      const upd = g(
        ["run", "services", "update", svc, "--project", args.project,
         "--region", args.region, "--update-env-vars", `RHEMA_SOAK_ITER=${i}`],
        { capture: true },
      );
      if (upd.status !== 0) throw new Error(`worker-soak: revision bump failed for iteration ${i}`);
      const rolled = await waitForRevision(args, svc, prev, g, sleep);
      iter.revision = rolled.latestReady;
      log(`[soak] iter ${i}: cold instance on ${iter.revision}`);
      await seedQueuedRun(pool, { ...ids, runId: iter.runId });
      runIds.push(iter.runId);
      const sentAt = new Date();
      const t0 = Date.now();
      await boss.send(RUN_START_QUEUE, { runId: iter.runId, workspaceId: ids.workspaceId }, {
        singletonKey: iter.runId,
      });
      iter.sentAt = sentAt.toISOString();
      // Watch: job_launch sample = the launch loop returned; failed/terminal = launch gave up.
      const deadline = t0 + args.watchTimeoutMs;
      let state = null;
      while (Date.now() < deadline) {
        const s = await readRunState(pool, iter.runId);
        state = s?.state ?? state;
        const { jobLaunchMs, admitMintMs } = await readLaunchSample(pool, iter.runId);
        iter.state = state;
        iter.jobLaunchMs = jobLaunchMs;
        iter.admitMintMs = admitMintMs;
        if (jobLaunchMs != null || state === "failed") break;
        await sleep(2_000);
      }
      iter.observedMs = Date.now() - t0;
      // The launch resolved one way or the other — stop the pod before it can spend.
      await boss
        .send(RUN_CANCEL_QUEUE, { runId: iter.runId, workspaceId: ids.workspaceId }, { singletonKey: `cancel:${iter.runId}` })
        .catch(() => {});
      iter.logMarkers = workerLogMarkers(args, svc, iter.sentAt, g);
      iter.classification = classifyIteration(iter, args.launchBudgetMs);
      log(
        `[soak] iter ${i}: ${iter.classification} state=${iter.state} jobLaunch=${iter.jobLaunchMs ?? "—"}ms ` +
          `admitMint=${iter.admitMintMs ?? "—"}ms markers=${iter.logMarkers.length}`,
      );
      records.push(iter);
    }
    const { verdict } = verdictFor(records, args.launchBudgetMs);
    return { verdict, records, fixture: ids };
  } finally {
    if (runIds.length && !args.dryRun) await cleanupFixture(pool, args, runIds);
    if (ownBoss) await boss.stop().catch(() => {});
    if (!io.db) await pool.end().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await soak(args);
  if (args.out) {
    mkdirSync(args.out, { recursive: true });
    writeFileSync(resolve(args.out, "worker-soak.json"), JSON.stringify(result, null, 2) + "\n");
  }
  console.log(`[soak] verdict: ${result.verdict}`);
  process.exit(result.verdict === "red" ? 1 : 0);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((err) => {
    console.error("worker-soak:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
