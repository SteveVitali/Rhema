#!/usr/bin/env node
// R6WRT.1 / REQ-WRT-1 — GD-RES.2-1 "refund + relabel" retro apply (GD-PREAUTH-ACTS.R6).
//
// The verbatim scope is the two real-user zero-coverage runs from the RES.2 historical scan
// (runs/RES.2.md § Historical scan — the operator's ruled list):
//
//   1. run 01M3EAAZG2AQ289B6ZFEP5XYN2 — refund  56 cr
//   2. run 01M3SK62YZST272B35CG12K6TW — refund 340 cr   (the 2026-09-30 incident run)
//
// plus `delivery.label='unverified'` on those two runs. The test-tenant probes
// (01M3VT9R…/01M3VYSGV… fact_checks) get NO credit action and stay `delivery=null` — the GD row's
// verbatim note ("no class exists yet").
//
// Refund shape replicates `refundPhases` + `settleUnverifiedDelivery`'s money legs VERBATIM
// (packages/ledger/src/{resume,unverified-settle}.ts): one `refund` row per (research-phase step,
// bucket) net debit — kind='refund', source='run', reason='platform_fault:zero_coverage',
// idempotency_key `platform-fault:<runId>:<stepId>#<bucket>` — with the credit_balances +available
// maintenance in the SAME transaction, then `runs.delivery` stamped write-once
// {label:'unverified',checkableClaims,coveredClaims,platformFaultSettledAt,refundedCredits,
// alerted:false}. `alerted:false` marks the alert leg DISPOSITIONED without a page: a truthful
// "not alerted" that keeps the stranded sweep's leg E from paging ops for a 25-day-old run the
// operator already ruled on (the sweep retries while EITHER marker is null). The canonical
// run.unverified / cost.refunded event rows are deliberately NOT emitted — minimal verbatim scope;
// every surface reads `runs.delivery` / `credit_ledger` directly.
//
//   --dry-run (default): read-only (BEGIN READ ONLY); resolves each ruled run, recomputes the
//                        zero-coverage predicate + the per-(step,bucket) refund draws, prints the
//                        itemized set with row evidence + a scope verdict + JSON artifact.
//   --execute:           requires R6WRT_OPERATOR_GO=confirmed AND the resolved set == the ruled
//                        items EXACTLY (ids, state, predicate, totals). Fails closed otherwise.
//                        Verbatim row dumps → docs/build/logs/r6wrt1-capture/ (gitignored;
//                        rollback = restore-from-capture), redacted dumps → the --out reports
//                        dir, then ONE transaction, then post-state reads.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/res2-retro-apply.mjs [--dry-run|--execute] [--out <reports-dir>]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomInt } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

// ---------------------------------------------------------------- verbatim scope (GD-RES.2-1)
const RULED = [
  { runId: "01M3EAAZG2AQ289B6ZFEP5XYN2", credits: 56 },
  { runId: "01M3SK62YZST272B35CG12K6TW", credits: 340 },
];
const RULED_IDS = RULED.map((r) => r.runId);
const TEST_TENANT_PROBES = ["01M3VT9R1MAVVKM3Q7RXCRY5RD", "01M3VYSGV9XZ9RCWNP0CGDXQHD"];
const RESEARCH_PHASES = ["verification", "discourse"]; // scan's default research-class keys
const REFUND_REASON = "platform_fault:zero_coverage";
const BUCKET_ORDER = ["included", "topup", "trial_pocket", "daily", "promo"]; // CONSUMPTION_ORDER

// ---------------------------------------------------------------- modes / env
const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const outIdx = argv.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 10);
const outDir = outIdx > -1 ? argv[outIdx + 1] : resolve(repoRoot, "docs", "build", "reports", `${stamp}_R6WRT.1`, "req-wrt-1");
const logsDir = resolve(repoRoot, "docs", "build", "logs", "r6wrt1-capture");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dsn) {
  console.error("[res2-retro] SYSTEM_DATABASE_URL (system-role DSN over the IAP tunnel) required");
  process.exit(1);
}
if (execute && process.env.R6WRT_OPERATOR_GO !== "confirmed") {
  console.error(
    "[res2-retro] refusing: --execute requires R6WRT_OPERATOR_GO=confirmed — the operator's " +
      "recorded go (GD-PREAUTH-ACTS.R6). The dry-run list is presented verbatim; writes execute " +
      "only on an exact scope match.",
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

// ---------------------------------------------------------------- redaction (committed evidence)
const REDACT_FIELD =
  /token|secret|passw|credential|auth|ip_address|user_agent|payload|input|snapshot|y_state|state_vector|spans|body|text|suggestion|evidence|checks|result|failure|prefs|rubric|anchor|projections|options|extra|content|detail|guidance|answer|scope|sample_set|build_note|byline|handle|error|image|^name$|^value$|edits|block_id_map|created_by|frozen_by|by_actor|discharged_by|stripe|idempotency|brief|session_store|question|source_line|statement|defer_horizon|^data$|blob|note|sha256|s3_key|_key$|spec$|opts|args|env/i;
const KEEP_OBJECT_FIELDS = new Set(["delivery", "tags", "registers", "lock_set", "opted_out"]);
function redactRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (REDACT_FIELD.test(k)) {
      out[k] = "<redacted>";
    } else if (v != null && typeof v === "object") {
      if (v instanceof Date) out[k] = v.toISOString();
      else if (Buffer.isBuffer(v)) out[k] = `<bytea ${v.length}B>`;
      else out[k] = KEEP_OBJECT_FIELDS.has(k) ? v : "<redacted:obj>";
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------- resolve phase (read-only)
const client = new pg.Client({ connectionString: dsn });
await client.connect();
await client.query("begin read only");
const q = async (text, params = []) => (await client.query(text, params)).rows;
const observations = [];
const items = [];

async function resolveRun(ruled) {
  const item = {
    key: `run:${ruled.runId}`,
    name: `refund ${ruled.credits}cr + relabel 'unverified' on ${ruled.runId}`,
    status: "absent",
    guards: [],
    captures: [],
    writes: [],
  };
  const run = (
    await q(
      `select r.id, r.state, r.workflow, r.delivery, r.ended_at, r.workspace_id, r.project_id,
              r.entitlement_id, r.spent_credits, w.billing_account_id, w.is_test
         from runs r join workspaces w on w.id = r.workspace_id where r.id = $1`,
      [ruled.runId],
    )
  )[0];
  if (!run) return item;
  item.row = {
    id: run.id,
    state: run.state,
    workflow: run.workflow,
    delivery: run.delivery,
    ended_at: run.ended_at,
    workspace_id: run.workspace_id,
    billing_account_id: run.billing_account_id,
    is_test: run.is_test,
  };
  const guard = (name, ok, detail) => item.guards.push({ name, ok, detail });
  guard("state", run.state === "completed", `state=${run.state}`);
  guard("workflow", run.workflow === "review", `workflow=${run.workflow}`);
  guard("delivery-null", run.delivery == null, `delivery=${JSON.stringify(run.delivery)}`);
  guard("tenant", run.is_test === false, `is_test=${run.is_test}`);
  if (item.guards.some((g) => !g.ok)) {
    item.status = "blocked";
    return item;
  }
  // recompute the zero-coverage predicate (scan's verbatim claims predicate — post-Path-B truth).
  const cov = (
    await q(
      `select count(c.id) filter (where c.tier in (1,2))::int as checkable,
              count(c.id) filter (
                where c.tier in (1,2)
                  and (c.url is not null
                       or exists (select 1 from claim_sources cs where cs.claim_id = c.id))
              )::int as covered
         from correspondence_items ci left join claims c on c.correspondence_id = ci.id
        where ci.run_id = $1`,
      [ruled.runId],
    )
  )[0];
  item.checkableClaims = Number(cov.checkable);
  item.coveredClaims = Number(cov.covered);
  guard("zero-coverage", item.checkableClaims > 0 && item.coveredClaims === 0,
    `checkable=${item.checkableClaims} covered=${item.coveredClaims}`);
  // research-class steps + the refundPhases net-per-(step,bucket) draws.
  const steps = await q(
    `select id, phase from steps where run_id = $1 and phase = any($2::text[]) and state = 'done' order by ordinal`,
    [ruled.runId, RESEARCH_PHASES],
  );
  item.steps = steps.map((s) => s.id);
  let total = 0;
  const draws = [];
  for (const s of steps) {
    const nets = await q(
      `select bucket,
              coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as net
         from credit_ledger where run_id = $1 and phase_id = $2 and kind in ('debit','refund') group by bucket`,
      [ruled.runId, s.id],
    );
    const perBucket = nets
      .filter((n) => Number(n.net) > 0)
      .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));
    const stepTotal = perBucket.reduce((a, n) => a + Number(n.net), 0);
    total += stepTotal;
    for (const n of perBucket) draws.push({ stepId: s.id, phase: s.phase, bucket: n.bucket, credits: Number(n.net) });
  }
  item.refundDraws = draws;
  item.wouldRefund = total;
  guard("ruled-total", total === ruled.credits, `computed ${total}cr ${total === ruled.credits ? "=" : "≠"} ruled ${ruled.credits}cr`);
  // already-applied probe: an existing platform-fault key means the money leg already landed once.
  const prior = await q(
    `select count(*)::int as n from credit_ledger where idempotency_key like $1`,
    [`platform-fault:${ruled.runId}:%`],
  );
  guard("not-yet-refunded", Number(prior[0].n) === 0, `existing platform-fault rows=${prior[0].n}`);
  if (item.guards.some((g) => !g.ok)) {
    item.status = "blocked";
    return item;
  }
  item.captures = [
    ["runs", `select * from runs where id = $1`, [ruled.runId]],
    ["steps", `select * from steps where run_id = $1 order by ordinal`, [ruled.runId]],
    ["credit_ledger", `select * from credit_ledger where run_id = $1 order by at, id`, [ruled.runId]],
    [
      "credit_balances",
      `select * from credit_balances where billing_account_id = $1 order by bucket`,
      [run.billing_account_id],
    ],
    ["workspaces", `select * from workspaces where id = $1`, [run.workspace_id]],
  ];
  item.status = "applicable";
  return item;
}

for (const ruled of RULED) items.push(await resolveRun(ruled));

// observations (evidence only — anything unexpected is reported, never written):
for (const probeId of TEST_TENANT_PROBES) {
  const probe = (
    await q(
      `select r.id, r.workflow, r.delivery, w.is_test from runs r join workspaces w on w.id = r.workspace_id where r.id = $1`,
      [probeId],
    )
  )[0];
  observations.push(
    probe
      ? `test-tenant probe ${probeId} (${probe.workflow}) delivery=${JSON.stringify(probe.delivery)} is_test=${probe.is_test} — untouched (no class exists)`
      : `test-tenant probe ${probeId} absent from prod`,
  );
}
// any OTHER zero-coverage review run carrying delivery=null is a new finding — never written.
const otherCandidates = await q(
  `select r.id, r.workflow, r.ended_at, w.is_test
     from runs r join workspaces w on w.id = r.workspace_id
     join correspondence_items ci on ci.run_id = r.id
     left join claims c on c.correspondence_id = ci.id
    where r.state = 'completed' and r.workflow in ('review','fact_check') and r.delivery is null
      and r.id <> all($1::text[])
    group by r.id, r.workflow, r.ended_at, w.is_test
   having count(c.id) filter (where c.tier in (1,2)) > 0
      and count(c.id) filter (
            where c.tier in (1,2)
              and (c.url is not null
                   or exists (select 1 from claim_sources cs where cs.claim_id = c.id))) = 0`,
  [[...RULED_IDS, ...TEST_TENANT_PROBES]],
);
for (const r of otherCandidates)
  observations.push(
    `NEW zero-coverage ${r.workflow} ${r.id} (ended ${r.ended_at}, is_test=${r.is_test}) — out-of-scope finding, untouched`,
  );
await client.query("rollback");

// ---------------------------------------------------------------- report
const mode = execute ? "EXECUTE" : "DRY-RUN";
console.log(`[res2-retro] ${mode} ${new Date().toISOString()}`);
const artifact = { mode, at: new Date().toISOString(), items: [], observations };
const applicable = items.filter((i) => i.status === "applicable");

for (const item of items) {
  const guardStr = item.guards.map((g) => `${g.ok ? "ok" : "BLOCK"}:${g.name}`).join(" ");
  console.log(
    `[res2-retro] item ${item.key}: ${item.status} — ${item.name}` +
      (item.row ? ` — run ${JSON.stringify(item.row)}` : "") +
      (item.refundDraws ? ` — draws ${JSON.stringify(item.refundDraws)}` : "") +
      (guardStr ? ` — guards ${guardStr}` : ""),
  );
  artifact.items.push({
    key: item.key,
    name: item.name,
    status: item.status,
    guards: item.guards,
    checkableClaims: item.checkableClaims,
    coveredClaims: item.coveredClaims,
    refundDraws: item.refundDraws,
    wouldRefund: item.wouldRefund,
  });
}

// the scope verdict: the applicable set must equal the ruled items EXACTLY — every ruled run
// resolved `applicable` with its ruled total, nothing extra, zero blocked.
const scopeExact =
  applicable.length === RULED.length &&
  RULED.every((r) => {
    const item = items.find((i) => i.key === `run:${r.runId}`);
    return item?.status === "applicable" && item.wouldRefund === r.credits;
  });
const verdict = scopeExact
  ? `resolved set == ruled set exactly (${RULED.length} runs, ${RULED.reduce((a, r) => a + r.credits, 0)}cr)`
  : "MISMATCH — resolved set ≠ ruled set; pre-authorization VOID for this act (record + report, do not execute)";
console.log(`[res2-retro] observations: ${observations.length ? observations.join(" | ") : "none"}`);
console.log(`[res2-retro] scope verdict: ${verdict}`);
artifact.scopeExact = scopeExact;

if (!execute) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "dry-run.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[res2-retro] dry-run artifact → ${outDir}/dry-run.json`);
  await client.end();
  process.exit(0);
}
if (!scopeExact) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "refused.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.error(`[res2-retro] REFUSING --execute: ${verdict} — artifact → ${outDir}/refused.json`);
  await client.end();
  process.exit(4);
}

// ---------------------------------------------------------------- execute (one transaction)
mkdirSync(outDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

// pre-state: verbatim dumps → gitignored logs; redacted → committed reports. BEFORE any write.
for (const item of applicable) {
  item._rows = {};
  for (const [table, sql, params] of item.captures) {
    const rows = await q(sql, params);
    item._rows[`${item.key}-${table}`] = rows;
    writeFileSync(resolve(logsDir, `reqwrt1-${item.key.replace(":", "_")}-${table}.json`), JSON.stringify(rows, null, 2) + "\n");
    writeFileSync(
      resolve(outDir, `prestate-${item.key.replace(":", "_")}-${table}.json`),
      JSON.stringify(rows.map(redactRow), null, 2) + "\n",
    );
  }
  console.log(`[res2-retro] pre-state captured: ${item.key} (${Object.entries(item._rows).map(([t, r]) => `${t}:${r.length}`).join(" ")})`);
}

const now = new Date();
const written = {};
await client.query("begin");
try {
  for (const item of applicable) {
    const run = item.row;
    let refunded = 0;
    for (const draw of item.refundDraws) {
      // verbatim refundPhases/applyLedgerEntry: refund row + balance in the same transaction,
      // idempotent on the episode key `platform-fault:<runId>:<stepId>#<bucket>`.
      const ins = await client.query(
        `insert into credit_ledger
           (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, reason, expires_at, stripe_ref, idempotency_key, at)
         values ($1,$2,$3,'refund',$4,$5,$6,$7,'run',$8,null,null,$9,$10)
         on conflict (idempotency_key) do nothing
         returning id`,
        [
          ulid(),
          run.workspace_id,
          run.billing_account_id,
          draw.credits,
          draw.bucket,
          run.id,
          draw.stepId,
          REFUND_REASON,
          `platform-fault:${run.id}:${draw.stepId}#${draw.bucket}`,
          now,
        ],
      );
      if (ins.rows.length === 0) continue; // replay dedupe — never count twice
      refunded += draw.credits;
      await client.query(
        `insert into credit_balances (billing_account_id, bucket, available, held, updated_at)
         values ($1,$2,0,0,$3) on conflict (billing_account_id, bucket) do nothing`,
        [run.billing_account_id, draw.bucket, now],
      );
      await client.query(
        `update credit_balances set available = available + $3, updated_at = $4
         where billing_account_id = $1 and bucket = $2`,
        [run.billing_account_id, draw.bucket, draw.credits, now],
      );
      written[`${item.key}.${draw.stepId}.${draw.bucket}`] = draw.credits;
    }
    // the write-once delivery label + the settlement markers (settleUnverifiedDelivery's TX1
    // shape verbatim; alerted:false dispositions the alert leg without a page — header comment).
    const upd = await client.query(
      `update runs set delivery = $2::jsonb where id = $1 and delivery is null returning id`,
      [
        run.id,
        JSON.stringify({
          label: "unverified",
          checkableClaims: item.checkableClaims,
          coveredClaims: item.coveredClaims,
          platformFaultSettledAt: now.toISOString(),
          refundedCredits: refunded,
          alerted: false,
        }),
      ],
    );
    if (upd.rows.length !== 1) throw new Error(`delivery write-once violated on ${run.id}`);
    written[`${item.key}.delivery`] = refunded;
  }
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  console.error(`[res2-retro] transaction rolled back: ${e.message}`);
  await client.end();
  process.exit(1);
}
console.log(`[res2-retro] written: ${JSON.stringify(written)}`);

// post-state: labels stamped, refund totals == ruled, balances moved, probes untouched.
const post = {};
for (const ruled of RULED) {
  const r = (
    await q(
      `select delivery->>'label' as label, delivery->>'refundedCredits' as refunded,
              (select coalesce(sum(credits),0)::int from credit_ledger
                where run_id = $1 and kind = 'refund' and reason = $2) as refund_total
         from runs where id = $1`,
      [ruled.runId, REFUND_REASON],
    )
  )[0];
  post[ruled.runId] = { label: r?.label, refundRows: r ? Number(r.refund_total) : 0, marker: r?.refunded };
}
for (const probeId of TEST_TENANT_PROBES) {
  const r = (await q(`select delivery from runs where id = $1`, [probeId]))[0];
  post[probeId] = { delivery: r?.delivery ?? null };
}
console.log(`[res2-retro] post-state: ${JSON.stringify(post)}`);
const ok =
  RULED.every((r) => post[r.runId]?.label === "unverified" && post[r.runId]?.refundRows === r.credits) &&
  TEST_TENANT_PROBES.every((p) => post[p]?.delivery == null);
artifact.apply = { written, post, ok, observations };
writeFileSync(resolve(outDir, "apply.json"), JSON.stringify(artifact, null, 2) + "\n");
writeFileSync(resolve(outDir, "post-state.json"), JSON.stringify(post, null, 2) + "\n");
console.log(`[res2-retro] ${ok ? "APPLY OK" : "APPLY — POST-STATE DEVIATION (inspect apply.json)"} — artifact → ${outDir}/apply.json`);
await client.end();
process.exit(ok ? 0 : 4);
