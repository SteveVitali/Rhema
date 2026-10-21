#!/usr/bin/env node
// R6WRT.1 / REQ-WRT-2 — D-BL38.1-1 deployments-stamp rewrite (GD-PREAUTH-ACTS.R6).
//
// The verbatim scope is ONE row: `deployments` id `prod:d5a74cc` — the second short-sha stamp
// (protocols 0.4.0+ec61156725a895ab, rate_table 2026-10-14, deployed 2026-10-14T15:24:36Z) and the
// ONLY stamp for its deploy (no full-sha twin — delete would lose the record, so the operator
// ruled REWRITE-IN-PLACE: id → `prod:<40-char sha>` — the row's git_sha verbatim when full, else
// the UNIQUE `git rev-parse` expansion of its short sha, guarded to commits that predate the
// deploy stamp).
//
//   --dry-run (default): read-only (BEGIN READ ONLY); resolves the row, verifies the signature +
//                        the 40-char git_sha + that the target id is free, prints the itemized set
//                        with row evidence + scope verdict + JSON artifact.
//   --execute:           requires R6WRT_OPERATOR_GO=confirmed AND the resolved set == the ruled
//                        item EXACTLY. Fails closed otherwise. Verbatim row dump →
//                        docs/build/logs/r6wrt1-capture/ (gitignored; rollback = restore the id),
//                        redacted dump → the --out reports dir, then ONE transaction, then
//                        post-state reads.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/bl38-stamp-rewrite.mjs [--dry-run|--execute] [--out <reports-dir>]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

// ---------------------------------------------------------------- verbatim scope (D-BL38.1-1)
const SHORT_ID = "prod:d5a74cc";
const EXPECTED = {
  stage: "prod",
  protocols_version: "0.4.0+ec61156725a895ab",
  rate_table_version: "2026-10-14",
  deployed_at: "2026-10-14T15:24:36",
};

// ---------------------------------------------------------------- modes / env
const argv = process.argv.slice(2);
const execute = argv.includes("--execute");
const outIdx = argv.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 10);
const outDir = outIdx > -1 ? argv[outIdx + 1] : resolve(repoRoot, "docs", "build", "reports", `${stamp}_R6WRT.1`, "req-wrt-2");
const logsDir = resolve(repoRoot, "docs", "build", "logs", "r6wrt1-capture");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dsn) {
  console.error("[bl38-stamp] SYSTEM_DATABASE_URL (system-role DSN over the IAP tunnel) required");
  process.exit(1);
}
if (execute && process.env.R6WRT_OPERATOR_GO !== "confirmed") {
  console.error(
    "[bl38-stamp] refusing: --execute requires R6WRT_OPERATOR_GO=confirmed — the operator's " +
      "recorded go (GD-PREAUTH-ACTS.R6). The dry-run list is presented verbatim; the write " +
      "executes only on an exact scope match.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------- resolve phase (read-only)
const client = new pg.Client({ connectionString: dsn });
await client.connect();
await client.query("begin read only");
const q = async (text, params = []) => (await client.query(text, params)).rows;
const observations = [];
const item = {
  key: "deployment",
  name: `rewrite deployments id ${SHORT_ID} → prod:<40-char git_sha>`,
  status: "absent",
  guards: [],
};

const row = (await q(`select * from deployments where id = $1`, [SHORT_ID]))[0];
let targetId = null;
if (row) {
  item.row = { id: row.id, stage: row.stage, git_sha: row.git_sha, protocols_version: row.protocols_version, rate_table_version: row.rate_table_version, deployed_at: row.deployed_at };
  const guard = (name, ok, detail) => item.guards.push({ name, ok, detail });
  guard("signature",
    row.stage === EXPECTED.stage &&
      row.protocols_version === EXPECTED.protocols_version &&
      row.rate_table_version === EXPECTED.rate_table_version &&
      String(new Date(row.deployed_at).toISOString()).startsWith(EXPECTED.deployed_at),
    `stage=${row.stage} protocols=${row.protocols_version} rate_table=${row.rate_table_version} deployed_at=${new Date(row.deployed_at).toISOString()}`);
  // The 40-char target: the row's git_sha verbatim when full, else the UNIQUE repo expansion of
  // the row's short sha (`git rev-parse` fails closed on ambiguity). Sanity: the expanded
  // commit must not postdate the deploy stamp (a rewritten id is provenance — it must name the
  // commit that actually deployed).
  const gitSha = String(row.git_sha ?? "");
  if (/^[0-9a-f]{40}$/.test(gitSha)) {
    item.fullSha = gitSha;
    item.shaSource = "row";
  } else if (/^[0-9a-f]{7,39}$/.test(gitSha)) {
    const exp = spawnSync("git", ["rev-parse", "--verify", `${gitSha}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    const full = exp.status === 0 ? exp.stdout.trim() : null;
    item.fullSha = /^[0-9a-f]{40}$/.test(full ?? "") ? full : null;
    item.shaSource = "repo-expansion";
    const ct = item.fullSha
      ? spawnSync("git", ["show", "-s", "--format=%cI", item.fullSha], { cwd: repoRoot, encoding: "utf8" })
      : null;
    item.commitTime = ct?.status === 0 ? ct.stdout.trim() : null;
  }
  const commitBeforeDeploy =
    item.commitTime == null ? true : new Date(item.commitTime) <= new Date(row.deployed_at);
  guard("git-sha", item.fullSha != null,
    `git_sha=${gitSha} → ${item.fullSha ?? "UNRESOLVABLE"} (source=${item.shaSource ?? "none"}${item.commitTime ? `, commit ${item.commitTime}` : ""})`);
  guard("sha-before-deploy", commitBeforeDeploy,
    `commit ${item.commitTime ?? "n/a"} ≤ deployed_at ${new Date(row.deployed_at).toISOString()}`);
  if (item.fullSha && commitBeforeDeploy) {
    targetId = `prod:${item.fullSha}`;
    const clash = (await q(`select id from deployments where id = $1`, [targetId]))[0];
    guard("target-free", !clash, clash ? `target id ${targetId} already exists` : `target ${targetId} free`);
    item.targetId = targetId;
  }
  item.status = item.guards.every((g) => g.ok) ? "rewritable" : "blocked";
}
// cross-check: any OTHER short-sha deployments rows are observations, never touched.
const strayShortSha = await q(`select id from deployments where id ~ '^prod:[0-9a-f]{7}$' and id <> $1`, [SHORT_ID]);
for (const r of strayShortSha) observations.push(`additional short-sha deployments row ${r.id} — out-of-scope`);
await client.query("rollback");

// ---------------------------------------------------------------- report
const mode = execute ? "EXECUTE" : "DRY-RUN";
console.log(`[bl38-stamp] ${mode} ${new Date().toISOString()}`);
const artifact = { mode, at: new Date().toISOString(), items: [], observations };
const guardStr = item.guards.map((g) => `${g.ok ? "ok" : "BLOCK"}:${g.name}`).join(" ");
console.log(
  `[bl38-stamp] item ${item.key}: ${item.status} — ${item.name}` +
    (item.row ? ` — row ${JSON.stringify(item.row)}` : "") +
    (guardStr ? ` — guards ${guardStr}` : ""),
);
artifact.items.push({
  key: item.key,
  name: item.name,
  status: item.status,
  guards: item.guards,
  row: item.row,
  fullSha: item.fullSha,
  shaSource: item.shaSource,
  commitTime: item.commitTime,
  targetId,
});

const scopeExact = item.status === "rewritable";
const verdict = scopeExact
  ? `resolved set == ruled item exactly (${SHORT_ID} → ${targetId})`
  : "MISMATCH — resolved set ≠ ruled item; pre-authorization VOID for this act (record + report, do not execute)";
console.log(`[bl38-stamp] observations: ${observations.length ? observations.join(" | ") : "none"}`);
console.log(`[bl38-stamp] scope verdict: ${verdict}`);
artifact.scopeExact = scopeExact;

if (!execute) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "dry-run.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[bl38-stamp] dry-run artifact → ${outDir}/dry-run.json`);
  await client.end();
  process.exit(0);
}
if (!scopeExact) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "refused.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.error(`[bl38-stamp] REFUSING --execute: ${verdict} — artifact → ${outDir}/refused.json`);
  await client.end();
  process.exit(4);
}

// ---------------------------------------------------------------- execute (one transaction)
mkdirSync(outDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });
// pre-state: verbatim dump → gitignored logs (rollback = `update deployments set id='<short>' …`),
// redacted-safe full row → committed reports (deployments carries no secrets — ids/shas/versions).
writeFileSync(resolve(logsDir, "reqwrt2-deployments.json"), JSON.stringify([row], null, 2) + "\n");
writeFileSync(resolve(outDir, "prestate-deployments.json"), JSON.stringify([row], null, 2) + "\n");
console.log(`[bl38-stamp] pre-state captured: deployments (1 row)`);

let rewritten = 0;
await client.query("begin");
try {
  const res = await client.query(`update deployments set id = $2 where id = $1 returning id`, [SHORT_ID, targetId]);
  rewritten = res.rowCount;
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  console.error(`[bl38-stamp] transaction rolled back: ${e.message}`);
  await client.end();
  process.exit(1);
}
console.log(`[bl38-stamp] rewritten: ${SHORT_ID} → ${targetId} (${rewritten} row)`);

// post-state: short id absent, target present with identical payload, zero remaining short-sha rows.
const post = {
  shortId: (await q(`select id from deployments where id = $1`, [SHORT_ID])).length,
  target: await q(`select id, git_sha, protocols_version, deployed_at from deployments where id = $1`, [targetId]),
  remainingShortSha: (await q(`select id from deployments where id ~ '^prod:[0-9a-f]{7}$'`, [])).length,
};
console.log(`[bl38-stamp] post-state: ${JSON.stringify(post)}`);
const ok = post.shortId === 0 && post.target.length === 1 && post.remainingShortSha === 0;
artifact.apply = { rewritten, post, ok, observations };
writeFileSync(resolve(outDir, "apply.json"), JSON.stringify(artifact, null, 2) + "\n");
writeFileSync(resolve(outDir, "post-state.json"), JSON.stringify(post, null, 2) + "\n");
console.log(`[bl38-stamp] ${ok ? "APPLY OK" : "APPLY — POST-STATE DEVIATION (inspect apply.json)"} — artifact → ${outDir}/apply.json`);
await client.end();
process.exit(ok ? 0 : 4);
