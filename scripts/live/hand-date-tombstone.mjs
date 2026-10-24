#!/usr/bin/env node
// R6WRT.1 / REQ-WRT-3 — D-P1.04-2's hand-date arm (GD-PREAUTH-ACTS.R6): back-date ONE purpose-made,
// purge-exempt TEST tombstone's `deleted_at` past the 30-day grace and arm its `project.purge`
// pgboss job in the past, so the worker's next `project.purge` tick fires the real destruction leg
// (the destruction READ is REQ-CLK-3 → R6CLK.1 — this act only ARMS).
//
// "Purge-exempt" = the 26 h test-tenant sweep cannot reach the workspace before `project.purge`
// fires: either an existing `is_test` workspace still inside the freshness window, or a NEW scratch
// `is_test` workspace created here (the ticket's "create the scratch project on an is_test
// workspace if needed — a test-tenant write inside this item's scope"). The scratch project
// carries ONE draft so the destruction is a real tree delete, not a bare row.
//
//   --dry-run (default): read-only (BEGIN READ ONLY); resolves the workspace/owner/project/job,
//                        prints the planned write set with row evidence + scope verdict + JSON.
//   --execute:           requires R6WRT_OPERATOR_GO=confirmed AND the resolved plan == the ruled
//                        item exactly. Fails closed otherwise. Verbatim dumps →
//                        docs/build/logs/r6wrt1-capture/ (gitignored; rollback = delete the
//                        created rows / restore deleted_at), redacted dumps → the --out reports
//                        dir, then ONE transaction, then post-state reads.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/hand-date-tombstone.mjs [--dry-run|--execute] [--out <reports-dir>]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

// ---------------------------------------------------------------- verbatim scope (D-P1.04-2 arm)
const PROBE_SLUG = "r6wrt1-tombstone-probe";
const PROBE_TITLE = "R6WRT.1 tombstone probe";
const PROBE_WS_NAME = "r6wrt1-tombstone-probe-tenant";
const PURGE_HOURS = 26; // TEST_TENANT_PURGE_HOURS default (worker main.ts)
const GRACE_DAYS = 30; // PROJECT_PURGE_AFTER_DAYS (worker deletion.ts)
const JOB_NAME = "project.purge";

// ---------------------------------------------------------------- modes / env
const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const outIdx = argv.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 10);
const outDir = outIdx > -1 ? argv[outIdx + 1] : resolve(repoRoot, "docs", "build", "reports", `${stamp}_R6WRT.1`, "req-wrt-3");
const logsDir = resolve(repoRoot, "docs", "build", "logs", "r6wrt1-capture");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dsn) {
  console.error("[tombstone] SYSTEM_DATABASE_URL (system-role DSN over the IAP tunnel) required");
  process.exit(1);
}
if (execute && process.env.R6WRT_OPERATOR_GO !== "confirmed") {
  console.error(
    "[tombstone] refusing: --execute requires R6WRT_OPERATOR_GO=confirmed — the operator's " +
      "recorded go (GD-PREAUTH-ACTS.R6). The dry-run list is presented verbatim; the write " +
      "executes only on an exact scope match.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------- ULID mint (orchestrator ids.ts)
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function ulid(now = Date.now()) {
  let time = "";
  let t = Math.floor(now);
  for (let i = 0; i < 10; i++) {
    time = CROCKFORD[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let rand = "";
  for (let i = 0; i < 16; i++) rand += CROCKFORD[randomInt(0, 32)];
  return time + rand;
}

// ---------------------------------------------------------------- resolve phase (read-only)
const client = new pg.Client({ connectionString: dsn });
await client.connect();
await client.query("begin read only");
const q = async (text, params = []) => (await client.query(text, params)).rows;
const observations = [];
const plan = {
  key: "tombstone",
  name: `arm ONE purge-exempt test tombstone ('${PROBE_SLUG}', deleted_at now()-30d) + its ${JOB_NAME} job`,
  status: "absent",
  guards: [],
  writes: [],
};
const guard = (name, ok, detail) => plan.guards.push({ name, ok, detail });

// pgboss surface — the arm target must exist.
const pgbossCols = await q(
  `select column_name from information_schema.columns where table_schema = 'pgboss' and table_name = 'job'`,
  [],
);
guard("pgboss", pgbossCols.length > 0, `pgboss.job columns=${pgbossCols.length}`);
const jobCols = new Set(pgbossCols.map((c) => c.column_name));

// (a) workspace: an is_test workspace inside the freshness window wins; else plan-create.
const freshWs = (
  await q(
    `select id, name, kind, is_test, billing_account_id,
            extract(epoch from (now() - created_at)) / 3600.0 as age_h
       from workspaces where is_test
       order by created_at desc limit 5`,
  )
);
let ws = null;
for (const w of freshWs) {
  if (Number(w.age_h) < PURGE_HOURS) {
    ws = w;
    break;
  }
  observations.push(`is_test workspace ${w.id} (${w.name}) is ${Number(w.age_h).toFixed(1)}h old — inside/next-to the ${PURGE_HOURS}h sweep window, not purge-exempt enough`);
}
plan.createWorkspace = null;
if (ws) {
  guard("workspace", true, `existing is_test ws ${ws.id} (${ws.name}) age=${Number(ws.age_h).toFixed(1)}h < ${PURGE_HOURS}h — purge-exempt`);
} else {
  plan.createWorkspace = { id: ulid(), billingAccountId: ulid(), name: PROBE_WS_NAME };
  guard("workspace", true, `no fresh is_test workspace — plan-create ${PROBE_WS_NAME} (is_test, fresh ⇒ purge-exempt)`);
}

// (b) owner user: a member of any is_test workspace, else any test+*@rhema.tools user.
const owner =
  (
    await q(
      `select u.id, u.email from "user" u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where w.is_test order by w.created_at desc limit 1`,
    )
  )[0] ??
  (
    await q(
      `select id, email from "user" where email ~ '^test\\+.*@rhema\\.tools$' order by created_at desc limit 1`,
    )
  )[0];
guard("owner", owner != null, owner ? `owner user ${owner.id} (${owner.email})` : "no test user resolvable — blocked");

// (c) the probe project itself (idempotent across reruns of this script).
const existing = (
  await q(
    `select p.id, p.title, p.slug, p.workspace_id, p.owner_id, p.deleted_at, p.created_at
       from projects p where p.slug = $1`,
    [PROBE_SLUG],
  )
);
if (existing.length > 1) {
  plan.status = "blocked";
  guard("uniqueness", false, `${existing.length} '${PROBE_SLUG}' projects — ambiguous`);
} else {
  plan.existing = existing[0] ?? null;
}
if (plan.existing) {
  // a pre-existing probe is reused ONLY on the fresh is_test workspace we resolved — a probe on
  // any other workspace (stale, or worse: non-test) blocks the whole act, never silently rewrites
  // a tenant outside the resolved plan.
  guard("probe-placement", ws != null && plan.existing.workspace_id === ws.id,
    `probe ${plan.existing.id} on ws ${plan.existing.workspace_id} (resolved ws ${ws?.id ?? "plan-create"})`);
  plan.projectId = plan.existing.id;
  const ageDays = plan.existing.deleted_at ? (Date.now() - new Date(plan.existing.deleted_at).getTime()) / 86400000 : 0;
  plan.needsTombstone = plan.existing.deleted_at == null || ageDays < GRACE_DAYS;
  observations.push(
    `probe project ${plan.existing.id} already exists (deleted_at=${plan.existing.deleted_at ?? "null"}, age=${ageDays.toFixed(1)}d)`,
  );
} else {
  plan.projectId = ulid();
  plan.needsTombstone = true;
}

// (d) the job row — armed iff a project.purge job exists with start_after <= now().
if (jobCols.size > 0 && plan.projectId) {
  const jobs = await q(
    `select j.id::text as id, j.state::text as state, j.start_after, j.singleton_key
       from pgboss.job j where j.name = $1 and j.data->>'projectId' = $2 order by j.created_on desc limit 3`,
    [JOB_NAME, plan.projectId],
  );
  plan.existingJobs = jobs;
  // armed = a LIVE job (created/retry/active — completed/cancelled/failed/expired never fire)
  // whose start is already past.
  plan.needsJob = !jobs.some(
    (j) => ["created", "retry", "active"].includes(j.state) && new Date(j.start_after) <= new Date(),
  );
  if (jobs.length > 0)
    observations.push(`existing ${JOB_NAME} jobs for probe: ${JSON.stringify(jobs)}`);
}
await client.query("rollback");

if (plan.status !== "blocked" && plan.guards.every((g) => g.ok)) {
  plan.status = plan.existing && !plan.needsTombstone && !plan.needsJob ? "armed-already" : "armable";
}

// ---------------------------------------------------------------- report
const mode = execute ? "EXECUTE" : "DRY-RUN";
console.log(`[tombstone] ${mode} ${new Date().toISOString()}`);
const artifact = { mode, at: new Date().toISOString(), items: [], observations };
const guardStr = plan.guards.map((g) => `${g.ok ? "ok" : "BLOCK"}:${g.name}`).join(" ");
console.log(
  `[tombstone] item ${plan.key}: ${plan.status} — ${plan.name}` +
    ` — plan {createWorkspace:${plan.createWorkspace ? plan.createWorkspace.id : "reuse"} project:${plan.projectId} tombstone:${plan.needsTombstone} job:${plan.needsJob}}` +
    ` — guards ${guardStr}`,
);
artifact.items.push({ ...plan, _rows: undefined });
delete artifact.items[0]._rows;

// exactly ONE tombstone arm — nothing else is writable. 'armed-already' is an exact match with a
// zero-write plan (already armed by a prior execute of this same item).
const scopeExact = plan.status === "armable" || plan.status === "armed-already";
const verdict = scopeExact
  ? `resolved plan == ruled item exactly (one '${PROBE_SLUG}' tombstone + its ${JOB_NAME} job)`
  : "MISMATCH — resolved plan ≠ ruled item; pre-authorization VOID for this act (record + report, do not execute)";
console.log(`[tombstone] observations: ${observations.length ? observations.join(" | ") : "none"}`);
console.log(`[tombstone] scope verdict: ${verdict}`);
artifact.scopeExact = scopeExact;

if (!execute) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "dry-run.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[tombstone] dry-run artifact → ${outDir}/dry-run.json`);
  await client.end();
  process.exit(0);
}
if (!scopeExact) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "refused.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.error(`[tombstone] REFUSING --execute: ${verdict} — artifact → ${outDir}/refused.json`);
  await client.end();
  process.exit(4);
}

// ---------------------------------------------------------------- execute (one transaction)
mkdirSync(outDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
// pre-state capture: the resolved plan verbatim (rollback = drop the created rows; the ids are
// minted here so the rollback set is enumerable) + any pre-existing probe/job rows.
writeFileSync(resolve(logsDir, "reqwrt3-plan.json"), JSON.stringify(plan, null, 2) + "\n");
writeFileSync(resolve(outDir, "prestate-plan.json"), JSON.stringify(plan, null, 2) + "\n");
console.log(`[tombstone] pre-state captured: plan (${plan.projectId})`);

const tombstonedAt = new Date(Date.now() - (GRACE_DAYS * 24 + 1) * 60 * 60 * 1000); // 30d + 1h margin
const written = {};
await client.query("begin");
try {
  if (plan.createWorkspace) {
    await client.query(`insert into billing_accounts (id) values ($1)`, [plan.createWorkspace.billingAccountId]);
    await client.query(
      `insert into workspaces (id, kind, name, billing_account_id, is_test) values ($1,'personal',$2,$3,true)`,
      [plan.createWorkspace.id, plan.createWorkspace.name, plan.createWorkspace.billingAccountId],
    );
    written.workspace = plan.createWorkspace.id;
  }
  const wsId = plan.createWorkspace?.id ?? ws.id;
  if (!plan.existing) {
    const draftId = ulid();
    await client.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, created_at, deleted_at)
       values ($1,$2,$3,$4,$5,$6,$6)`,
      [plan.projectId, wsId, owner.id, PROBE_TITLE, PROBE_SLUG, tombstonedAt],
    );
    await client.query(
      `insert into drafts (id, project_id, n, origin, created_at) values ($1,$2,1,'r6wrt1_probe',$3)`,
      [draftId, plan.projectId, tombstonedAt],
    );
    written.project = plan.projectId;
    written.draft = draftId;
  } else if (plan.needsTombstone) {
    await client.query(
      `update projects set deleted_at = $2 where id = $1`,
      [plan.projectId, tombstonedAt],
    );
    written.tombstone = `${plan.projectId} → ${tombstonedAt.toISOString()}`;
  }
  if (plan.needsJob) {
    // the arm: a project.purge job already past its start — the worker's next poll fires it.
    // Column set introspected at resolve time (pg-boss owns its schema; versions differ).
    const cols = ["name", "data", "start_after", "singleton_key", "expirein", "keepuntil"].filter((c) =>
      jobCols.has(c),
    );
    const vals = cols.map((_, i) => `$${i + 1}`).join(",");
    const params = cols.map((c) =>
      c === "name" ? JOB_NAME
      : c === "data" ? JSON.stringify({ tenantId: wsId, projectId: plan.projectId, tombstonedAt: tombstonedAt.toISOString() })
      : c === "start_after" ? new Date(Date.now() - 60_000)
      : c === "singleton_key" ? `${JOB_NAME}:${plan.projectId}`
      : c === "expirein" ? "00:15:00"
      : /* keepuntil */ new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    );
    await client.query(`insert into pgboss.job (${cols.join(",")}) values (${vals})`, params);
    written.job = `${JOB_NAME}:${plan.projectId}`;
  }
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  console.error(`[tombstone] transaction rolled back: ${e.message}`);
  await client.end();
  process.exit(1);
}
console.log(`[tombstone] written: ${JSON.stringify(written)}`);

// post-state: the tombstone is armed (or already DESTROYED by the sweep between commit and read —
// either proves the arm). Read both legs.
const proj = (await q(`select id, deleted_at from projects where id = $1`, [plan.projectId]))[0];
const jobRows = await q(
  `select j.id::text as id, j.state::text as state, j.start_after, j.completed_on
     from pgboss.job j where j.name = $1 and j.data->>'projectId' = $2 order by j.created_on desc limit 3`,
  [JOB_NAME, plan.projectId],
);
const post = {
  project: proj ? { id: proj.id, deleted_at: proj.deleted_at, age_days: (Date.now() - new Date(proj.deleted_at).getTime()) / 86400000 } : null,
  destroyedAlready: proj == null,
  jobs: jobRows,
};
console.log(`[tombstone] post-state: ${JSON.stringify(post)}`);
const armed =
  post.destroyedAlready ||
  (post.project != null &&
    post.project.age_days >= GRACE_DAYS &&
    jobRows.some((j) => ["created", "retry", "active"].includes(j.state) && new Date(j.start_after) <= new Date()));
artifact.apply = { written, post, ok: armed, observations };
writeFileSync(resolve(outDir, "apply.json"), JSON.stringify(artifact, null, 2) + "\n");
writeFileSync(resolve(outDir, "post-state.json"), JSON.stringify(post, null, 2) + "\n");
console.log(`[tombstone] ${armed ? "ARMED" : "ARM — POST-STATE DEVIATION (inspect apply.json)"} — artifact → ${outDir}/apply.json`);
await client.end();
process.exit(armed ? 0 : 4);
