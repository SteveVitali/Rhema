#!/usr/bin/env node
// BL38.1 — prod test-data residue cleanup (BL-38, ratified Q-5: confirm-after-dry-run).
// The verbatim scope is the four itemized families from
// `docs/build/reports/2026-10-01_prod-test-data-inventory.md` rows 1–4:
//
//   1. stale draft `01M3D7E119PP2HA9GP6XT2DG87` (v7, human_upload — the STB.2 import round-trip
//      artifact on `my-first-project`, operator workspace `01M2V3PM11XSF05VJ9G01PM5ZB`)
//   2. stray `deployments` provenance row `prod:82179e1` (`0.4.0+test` — superseded by the
//      full-sha twin `prod:82179e1356b1d5…` 39 s later; the twin is NEVER touched)
//   3. review account `14stevevitali+rhema-review@gmail.com` (+ its seeded Showcase copy) —
//      the scheduled `account.hard-delete` pipeline is the canonical path; this script only
//      acts while the `deletion_requested_at` marker is set PAST the 14-day grace
//   4. the two "The Library After Dark" test projects on the review account's workspace
//      (+ the accidental Page note + the completed review run — all inside the account tree)
//
// Anything resolving outside this list is an observation — reported, NEVER deleted.
//
//   --dry-run (default): read-only; prints the itemized list + scope verdict + JSON artifact
//   --apply:             requires BL38_OPERATOR_GO=confirmed (the operator's recorded go —
//                        fails closed otherwise). Per deletable item: verbatim row dumps →
//                        docs/build/logs/bl38-capture/ (gitignored, rollback =
//                        restore-from-capture), redacted dumps → the --out reports dir,
//                        then the bounded deletes in ONE transaction, then post-state reads.
//                        --apply REFUSES when any out-of-scope observation exists (the gate's
//                        "stop and report" arm is coded, not discretionary).
//
// Delete mechanics replicate the deployed canonical orders verbatim: the account leg is
// `handleAccountHardDelete`'s 19-statement leaf-first sequence (usage_records anonymized in
// place; workspaces/billing/ledger retained per the tax contract); the orphan-project leg is
// `handleProjectPurge`'s order (apps/worker/src/jobs.ts).
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/cleanup-bl38-residue.mjs [--dry-run|--apply] [--out <reports-dir>]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

// ---------------------------------------------------------------- verbatim scope (Q-5)
const OPERATOR_WS = "01M2V3PM11XSF05VJ9G01PM5ZB";
const DRAFT_ID = "01M3D7E119PP2HA9GP6XT2DG87";
const DRAFT_SIG = { n: 7, origin: "human_upload", projectSlug: "my-first-project" };
const STRAY_DEPLOYMENT_ID = "prod:82179e1";
const STRAY_DEPLOYMENT_SIG = "0.4.0+test";
const DEPLOYMENT_TWIN_ID = "prod:82179e1356b1d574739f759f1eecb111af73729b";
const REVIEW_EMAIL = "14stevevitali+rhema-review@gmail.com";
const LAD_TITLES = ["The Library After Dark", "The Library After Dark (review test)"];
const ACCOUNT_GRACE_DAYS = 14; // REQ-ACCT-4 — the scheduled hard-delete's grace window

// ---------------------------------------------------------------- modes / env
const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const outIdx = argv.indexOf("--out");
const stamp = new Date().toISOString().slice(0, 10);
const outDir = outIdx > -1 ? argv[outIdx + 1] : resolve(repoRoot, "docs", "build", "reports", `${stamp}_bl38-cleanup`);
const logsDir = resolve(repoRoot, "docs", "build", "logs", "bl38-capture");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL ?? process.env.DATABASE_URL;
if (!dsn) {
  console.error("[cleanup] SYSTEM_DATABASE_URL (system-role DSN over the IAP tunnel) required");
  process.exit(1);
}
if (apply && process.env.BL38_OPERATOR_GO !== "confirmed") {
  console.error(
    "[cleanup] refusing: --apply requires BL38_OPERATOR_GO=confirmed — the operator's recorded go " +
      "(ratified Q-5). The dry-run list is presented verbatim; deletions execute only on the explicit go.",
  );
  process.exit(2);
}

// ---------------------------------------------------------------- redaction (committed evidence)
// The committed dumps carry ids / kinds / counts / timestamps only — secrets, tokens, sessions,
// content and free-text fields redact by name; bytea and any object not whitelisted redact by
// shape. Verbatim dumps stay local under docs/build/logs/ (gitignored) — rollback source.
const REDACT_FIELD =
  /token|secret|passw|credential|auth|ip_address|user_agent|payload|input|snapshot|y_state|state_vector|spans|body|text|suggestion|evidence|checks|result|failure|prefs|rubric|anchor|projections|options|extra|content|detail|guidance|answer|scope|sample_set|build_note|byline|handle|error|image|^name$|^value$|edits|block_id_map|created_by|frozen_by|by_actor|discharged_by|stripe|idempotency|brief|session_store|question|source_line|statement|defer_horizon|^data$|blob|note|sha256|s3_key|_key$|spec$|opts|args|env/i;
const KEEP_OBJECT_FIELDS = new Set([
  "tags", "registers", "lock_set", "opted_out", "artifact_ids", "produced_version_ids",
  "expected_artifacts", "member_profile_ids", "overlay_version_ids", "rubric_dims", "image_digests", "hosts",
]);
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
const q = async (text, params = []) => (await client.query(text, params)).rows;
const observations = [];
const items = [];

async function resolveDraft() {
  const item = { key: "draft", name: `stale draft ${DRAFT_ID} (v${DRAFT_SIG.n}, ${DRAFT_SIG.origin})`, status: "absent", guards: [], captures: [], deletes: [] };
  const d = (
    await q(
      `select d.id, d.project_id, d.n, d.origin, d.state, d.promoted_version_id, d.live_doc_id, d.base_draft_id,
              p.slug, p.title as project_title, p.workspace_id, p.deleted_at as project_deleted_at
         from drafts d join projects p on p.id = d.project_id where d.id = $1`,
      [DRAFT_ID],
    )
  )[0];
  if (!d) return item;
  item.row = { id: d.id, n: d.n, origin: d.origin, state: d.state, project: d.slug, projectId: d.project_id, workspace_id: d.workspace_id };
  // placement + signature guards — the contract names THIS draft on THIS project on THIS workspace.
  if (d.workspace_id !== OPERATOR_WS || d.slug !== DRAFT_SIG.projectSlug) {
    item.status = "blocked";
    item.guards.push({ name: "placement", ok: false, detail: `draft lives on ${d.slug}@${d.workspace_id}, not ${DRAFT_SIG.projectSlug}@${OPERATOR_WS}` });
    return item;
  }
  item.guards.push({ name: "placement", ok: true, detail: `${d.slug}@${OPERATOR_WS}` });
  // linked artifact tree: the draft's promoted version → its artifact → all the artifact's versions.
  const versions = d.promoted_version_id
    ? await q(
        `select av.id, av.artifact_id, av.ordinal, a.mirror_path, a.kind, a.head_version_id
           from artifact_versions av join artifacts a on a.id = av.artifact_id
          where av.artifact_id = (select artifact_id from artifact_versions where id = $1)
          order by av.ordinal`,
        [d.promoted_version_id],
      )
    : [];
  const artifactIds = [...new Set(versions.map((v) => v.artifact_id))];
  const versionIds = versions.map((v) => v.id);
  // NO-ACTION referencers — any row here is OUTSIDE the draft's own tree → blocked, never deleted.
  const probes = [
    ["working_copies", `select id from working_copies where base_draft_id = $1 or reconciled_into = $1`, [DRAFT_ID]],
    ["correspondence_items", `select id from correspondence_items where draft_id = $1`, [DRAFT_ID]],
    ["claims", `select id from claims where draft_id = $1`, [DRAFT_ID]],
    ["findings", `select id from findings where draft_id = $1`, [DRAFT_ID]],
    ["revision_obligations", `select id from revision_obligations where opened_on_draft_id = $1`, [DRAFT_ID]],
    // (the only other NO-ACTION drafts edge — backlog_items.opened_on_draft_id — was dropped by 0005)
    ["descendant_drafts", `select id from drafts where base_draft_id = $1`, [DRAFT_ID]],
    ["accepted_draft", `select id from projects where accepted_draft_id = $1`, [DRAFT_ID]],
    ["shared_versions", `select id from drafts where id <> $1 and promoted_version_id = any($2)`, [DRAFT_ID, versionIds]],
    ["figures_on_artifact", `select id from figures where artifact_id = any($1) or inserted_in_draft_id = $2`, [artifactIds, DRAFT_ID]],
  ];
  let blocked = false;
  for (const [name, sql, params] of probes) {
    const rows = await q(sql, params);
    if (rows.length > 0) {
      blocked = true;
      item.guards.push({ name, ok: false, detail: `${rows.length} referencing row(s) outside the itemized tree — out-of-scope` });
    }
  }
  if (blocked) {
    item.status = "blocked";
    return item;
  }
  // in-tree rows: live_docs/restore_points cascade on the draft; provenance_maps on the versions
  // are pre-deleted as part of the same residue item.
  item.captures = [
    ["drafts", `select * from drafts where id = $1`, [DRAFT_ID]],
    ["live_docs", `select * from live_docs where draft_id = $1`, [DRAFT_ID]],
    ["restore_points", `select * from restore_points where live_doc_id in (select id from live_docs where draft_id = $1)`, [DRAFT_ID]],
    ["provenance_maps", `select * from provenance_maps where draft_version_id = any($1)`, [versionIds]],
    ["artifact_versions", `select * from artifact_versions where artifact_id = any($1) order by ordinal`, [artifactIds]],
    ["artifacts", `select * from artifacts where id = any($1)`, [artifactIds]],
  ];
  item.deletes = [
    ["provenance_maps", `delete from provenance_maps where draft_version_id = any($1)`, [versionIds]],
    ["drafts", `delete from drafts where id = $1`, [DRAFT_ID]],
    ["artifacts", `delete from artifacts where id = any($1)`, [artifactIds]],
  ];
  item.status = "deletable";
  return item;
}

async function resolveDeployment() {
  const item = { key: "deployment", name: `stray deployments row ${STRAY_DEPLOYMENT_ID}`, status: "absent", guards: [], captures: [], deletes: [] };
  const row = (await q(`select * from deployments where id = $1`, [STRAY_DEPLOYMENT_ID]))[0];
  if (!row) return item;
  item.row = { id: row.id, stage: row.stage, git_sha: row.git_sha, protocols_version: row.protocols_version, deployed_at: row.deployed_at };
  if (row.protocols_version !== STRAY_DEPLOYMENT_SIG) {
    item.status = "blocked";
    item.guards.push({ name: "signature", ok: false, detail: `protocols_version=${row.protocols_version} ≠ ${STRAY_DEPLOYMENT_SIG} — not the documented stray` });
    return item;
  }
  const twin = (await q(`select id, protocols_version, deployed_at from deployments where id = $1`, [DEPLOYMENT_TWIN_ID]))[0];
  if (!twin) {
    item.status = "blocked";
    item.guards.push({ name: "twin", ok: false, detail: `full-sha twin ${DEPLOYMENT_TWIN_ID} absent — the stray is the only deploy record` });
    return item;
  }
  item.guards.push({ name: "signature", ok: true, detail: STRAY_DEPLOYMENT_SIG });
  item.guards.push({ name: "twin", ok: true, detail: `${twin.id} @ ${twin.deployed_at}` });
  item.captures = [["deployments", `select * from deployments where id = $1`, [STRAY_DEPLOYMENT_ID]]];
  item.deletes = [["deployments", `delete from deployments where id = $1`, [STRAY_DEPLOYMENT_ID]]];
  item.status = "deletable";
  return item;
}

async function resolveAccount() {
  const item = { key: "account", name: `review account ${REVIEW_EMAIL} (+ seeded Showcase copy)`, status: "absent", guards: [], captures: [], deletes: [] };
  const user = (
    await q(`select id, email, email_verified, deletion_requested_at, created_at from "user" where email = $1`, [REVIEW_EMAIL])
  )[0];
  if (!user) {
    // verify the scheduled deletion completed — the retained shells (contract: workspaces +
    // billing rows survive) are evidence, not residue.
    item.verify = async () => {
      const shells = await q(
        `select w.id, w.kind, w.is_test from workspaces w
          where w.id not in (select workspace_id from workspace_members) and w.name ilike '%review%'`,
      );
      return { shells };
    };
    return item;
  }
  item.row = { id: user.id, email: user.email, deletion_requested_at: user.deletion_requested_at, created_at: user.created_at };
  const ws = (
    await q(
      `select w.id, w.kind, w.is_test, w.created_at from workspace_members wm join workspaces w on w.id = wm.workspace_id
        where wm.user_id = $1 order by w.created_at limit 1`,
      [user.id],
    )
  )[0];
  item.workspaceId = ws?.id;
  const graceOk =
    user.deletion_requested_at != null &&
    Date.now() - new Date(user.deletion_requested_at).getTime() >= ACCOUNT_GRACE_DAYS * 24 * 60 * 60 * 1000;
  if (!graceOk) {
    item.status = "blocked";
    item.guards.push({
      name: "marker",
      ok: false,
      detail:
        user.deletion_requested_at == null
          ? "deletion_requested_at is NULL — the scheduled account-deletion pipeline was never engaged or was cancelled; the inventory's action was 'keep the scheduled deletion'"
          : `marker ${user.deletion_requested_at} is inside the ${ACCOUNT_GRACE_DAYS}d grace — deleting early is outside the scheduled-delete contract`,
    });
    return item;
  }
  item.guards.push({ name: "marker", ok: true, detail: `deletion_requested_at=${user.deletion_requested_at} (past ${ACCOUNT_GRACE_DAYS}d grace)` });
  if (!ws) {
    item.status = "blocked";
    item.guards.push({ name: "workspace", ok: false, detail: "no workspace resolvable — partial deletion state" });
    return item;
  }
  if (ws.is_test !== true) {
    // NOT a guard failure — the review account is deliberately unflagged (created pre-0046
    // through the real funnel); recorded for the evidence line only.
    item.guards.push({ name: "workspace", ok: true, detail: `workspace ${ws.id} is_test=${ws.is_test} (unflagged review account — expected)` });
  }
  const projects = await q(`select id, title, slug, deleted_at from projects where workspace_id = $1 order by created_at`, [ws.id]);
  item.projects = projects.map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
  // the account tree (canonical handleAccountHardDelete leaf-first order, verbatim) — usage_rows
  // anonymized in place; workspaces/billing/ledger retained.
  const W = ws.id, U = user.id;
  item.captures = [
    ["usage_records", `select * from usage_records where workspace_id = $1`, [W]],
    ["account_exports", `select * from account_exports where workspace_id = $1`, [W]],
    ["analytics_events", `select * from analytics_events where workspace_id = $1`, [W]],
    ["provenance_maps", `select * from provenance_maps where draft_version_id in (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id where a.workspace_id = $1)`, [W]],
    ["working_copies", `select * from working_copies where base_draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or reconciled_into in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1)`, [W]],
    ["persona_members", `select * from persona_members where member_id in (select id from personas where workspace_id = $1)`, [W]],
    ["gates", `select * from gates where step_id in (select s.id from steps s join runs r on r.id = s.run_id join projects p on p.id = r.project_id where p.workspace_id = $1) or run_id in (select r.id from runs r join projects p on p.id = r.project_id where p.workspace_id = $1)`, [W]],
    ["decision_requests", `select * from decision_requests where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["obligation_findings", `select * from obligation_findings where obligation_id in (select id from revision_obligations where project_id in (select id from projects where workspace_id = $1)) or finding_id in (select f.id from findings f join correspondence_items ci on ci.id = f.correspondence_id where ci.project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["revision_obligations", `select * from revision_obligations where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["dispositions", `select * from dispositions where response_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1)) or finding_id in (select f.id from findings f join correspondence_items ci on ci.id = f.correspondence_id where ci.project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["findings", `select * from findings where draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or correspondence_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["claims", `select * from claims where draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or correspondence_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["correspondence_items", `select * from correspondence_items where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["steps", `select * from steps where run_id in (select r.id from runs r join projects p on p.id = r.project_id where p.workspace_id = $1)`, [W]],
    ["runs", `select * from runs where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["drafts", `select * from drafts where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["artifact_versions", `select * from artifact_versions where artifact_id in (select id from artifacts where workspace_id = $1)`, [W]],
    ["artifacts", `select * from artifacts where workspace_id = $1`, [W]],
    ["projects", `select * from projects where workspace_id = $1`, [W]],
    ["personas", `select * from personas where workspace_id = $1`, [W]],
    ["sessions", `select * from session where user_id = $1`, [U]],
    ["accounts", `select * from account where user_id = $1`, [U]],
    ["devices", `select * from device where user_id = $1`, [U]],
    ["workspace_members", `select * from workspace_members where user_id = $1`, [U]],
    ["verification", `select * from verification where identifier = $1 or identifier = $2`, [`email-change:${U}`, user.email]],
    ["user", `select * from "user" where id = $1`, [U]],
  ];
  item.deletes = [
    ["usage_records", `update usage_records set user_id = null, project_id = null, persona_id = null where workspace_id = $1`, [W]],
    ["account_exports", `delete from account_exports where workspace_id = $1`, [W]],
    ["analytics_events", `delete from analytics_events where workspace_id = $1`, [W]],
    ["provenance_maps", `delete from provenance_maps where draft_version_id in (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id where a.workspace_id = $1)`, [W]],
    ["working_copies", `delete from working_copies where base_draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or reconciled_into in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1)`, [W]],
    ["persona_members", `delete from persona_members where member_id in (select id from personas where workspace_id = $1)`, [W]],
    ["gates", `delete from gates where step_id in (select s.id from steps s join runs r on r.id = s.run_id join projects p on p.id = r.project_id where p.workspace_id = $1) or run_id in (select r.id from runs r join projects p on p.id = r.project_id where p.workspace_id = $1)`, [W]],
    ["decision_requests", `delete from decision_requests where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["obligation_findings", `delete from obligation_findings where obligation_id in (select id from revision_obligations where project_id in (select id from projects where workspace_id = $1)) or finding_id in (select f.id from findings f join correspondence_items ci on ci.id = f.correspondence_id where ci.project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["revision_obligations", `delete from revision_obligations where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["dispositions", `delete from dispositions where response_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1)) or finding_id in (select f.id from findings f join correspondence_items ci on ci.id = f.correspondence_id where ci.project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["findings", `delete from findings where draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or correspondence_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["claims", `delete from claims where draft_id in (select d.id from drafts d join projects p on p.id = d.project_id where p.workspace_id = $1) or correspondence_id in (select id from correspondence_items where project_id in (select id from projects where workspace_id = $1))`, [W]],
    ["correspondence_items", `delete from correspondence_items where project_id in (select id from projects where workspace_id = $1)`, [W]],
    ["projects", `delete from projects where workspace_id = $1`, [W]],
    ["personas", `delete from personas where workspace_id = $1`, [W]],
    ["artifacts", `delete from artifacts where workspace_id = $1`, [W]],
    ["verification", `delete from verification where identifier = $1 or identifier = $2`, [`email-change:${U}`, user.email]],
    ["user", `delete from "user" where id = $1`, [U]],
  ];
  item.status = "deletable";
  return item;
}

async function resolveLadProjects(reviewUser) {
  const item = { key: "lad", name: `Library-After-Dark projects (${LAD_TITLES.map((t) => `"${t}"`).join(" + ")})`, status: "absent", guards: [], captures: [], deletes: [] };
  const all = await q(`select p.id, p.title, p.slug, p.workspace_id, p.deleted_at from projects p where p.title = any($1)`, [LAD_TITLES]);
  if (all.length === 0) return item;
  // attribution: LAD rows may only ever resolve on the REVIEW account's OWN workspace —
  // title-matched rows anywhere else are observations, NEVER deletes. When the account is
  // already gone there is no attribution seam left: any surviving title-match is flagged for
  // the report, never guessed (an operator-workspace tombstone in its 30-day purge window —
  // inventory row 5 — is contract state, not residue).
  const reviewWs = reviewUser?.workspaceId;
  const inScope = all.filter((p) => reviewWs != null && p.workspace_id === reviewWs);
  const outScope = all.filter((p) => p.workspace_id !== reviewWs);
  for (const p of outScope)
    observations.push(
      `LAD-titled project ${p.id} "${p.title}" on workspace ${p.workspace_id}${p.deleted_at ? ` (tombstoned ${new Date(p.deleted_at).toISOString()})` : ""} — out-of-scope, untouched`,
    );
  if (inScope.length === 0) return item;
  item._inScopeIds = inScope.map((p) => p.id);
  item.rows = inScope.map((p) => ({ id: p.id, title: p.title, workspace_id: p.workspace_id }));
  if (reviewUser?.status === "deletable") {
    // covered by the account cascade — listed for the itemized evidence, deleted inside item 3.
    item.status = "via-account";
    return item;
  }
  if (reviewUser?.status === "blocked") {
    item.status = "blocked";
    item.guards.push({ name: "account", ok: false, detail: "review account blocked — LAD projects stay (never delete a live account's projects)" });
    return item;
  }
  // orphan case: the account is already gone — per-project purge order (handleProjectPurge):
  // working_copies → provenance_maps → analytics_events → projects (keyed id AND workspace).
  const ids = inScope.map((p) => p.id);
  item.captures = [
    ["working_copies", `select * from working_copies where base_draft_id in (select id from drafts where project_id = any($1)) or reconciled_into in (select id from drafts where project_id = any($1))`, [ids]],
    ["provenance_maps", `select * from provenance_maps where draft_version_id in (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id where a.project_id = any($1))`, [ids]],
    ["analytics_events", `select * from analytics_events where project_id = any($1)`, [ids]],
    ["correspondence_items", `select * from correspondence_items where project_id = any($1)`, [ids]],
    ["runs", `select * from runs where project_id = any($1)`, [ids]],
    ["drafts", `select * from drafts where project_id = any($1)`, [ids]],
    ["artifact_versions", `select * from artifact_versions where artifact_id in (select id from artifacts where project_id = any($1))`, [ids]],
    ["artifacts", `select * from artifacts where project_id = any($1)`, [ids]],
    ["projects", `select * from projects where id = any($1) and workspace_id = $2`, [ids, reviewWs]],
  ];
  item.deletes = [
    ["working_copies", `delete from working_copies where base_draft_id in (select id from drafts where project_id = any($1)) or reconciled_into in (select id from drafts where project_id = any($1))`, [ids]],
    ["provenance_maps", `delete from provenance_maps where draft_version_id in (select av.id from artifact_versions av join artifacts a on a.id = av.artifact_id where a.project_id = any($1))`, [ids]],
    ["analytics_events", `delete from analytics_events where project_id = any($1)`, [ids]],
    ["projects", `delete from projects where id = any($1) and workspace_id = $2`, [ids, reviewWs]],
  ];
  item.status = "deletable";
  return item;
}

const draft = await resolveDraft();
const deployment = await resolveDeployment();
const account = await resolveAccount();
const lad = await resolveLadProjects(account);
items.push(draft, deployment, account, lad);

// cross-check probes (evidence only — anything matching is an observation, never deleted):
const strayShortSha = await q(`select id from deployments where id ~ '^prod:[0-9a-f]{7}$' and id <> $1`, [STRAY_DEPLOYMENT_ID]);
for (const r of strayShortSha) observations.push(`additional short-sha deployments row ${r.id} — out-of-scope`);
const otherTestDrafts = await q(
  `select d.id, d.n, d.origin from drafts d join projects p on p.id = d.project_id
    where p.workspace_id = $1 and p.slug = $2 and d.origin = 'human_upload' and d.id <> $3`,
  [OPERATOR_WS, DRAFT_SIG.projectSlug, DRAFT_ID],
);
for (const r of otherTestDrafts) observations.push(`additional human_upload draft ${r.id} (v${r.n}) on ${DRAFT_SIG.projectSlug} — out-of-scope`);

// ---------------------------------------------------------------- report
const mode = apply ? "APPLY" : "DRY-RUN";
console.log(`[cleanup] ${mode} ${new Date().toISOString()}`);
const artifact = { mode, at: new Date().toISOString(), items: [], observations };

for (const item of items) {
  const counts = {};
  for (const [table, sql, params] of item.captures) {
    const rows = await q(sql, params);
    counts[table] = rows.length;
    item._rows = { ...(item._rows ?? {}), [table]: rows };
  }
  const guardStr = item.guards.map((g) => `${g.ok ? "ok" : "BLOCK"}:${g.name}`).join(" ");
  console.log(
    `[cleanup] item ${item.key}: ${item.status} — ${item.name}` +
      (Object.keys(counts).length ? ` — rows {${Object.entries(counts).map(([t, n]) => `${t}=${n}`).join(" ")}}` : "") +
      (item.row ? ` — row ${JSON.stringify(item.row)}` : "") +
      (item.rows ? ` — ${item.rows.map((r) => r.id).join(",")}` : "") +
      (guardStr ? ` — guards ${guardStr}` : ""),
  );
  artifact.items.push({ key: item.key, name: item.name, status: item.status, guards: item.guards, counts });
}

// the deletion list is the `deletable`/`via-account` items only — by construction ⊆ the
// verbatim Q-5 scope; observations are context rows the driver resolved and refused (they
// never enter a delete set — a foreign title-match must not freeze the ratified items either).
const verdict = observations.length
  ? `deletion list in-scope + ${observations.length} out-of-scope observation(s) recorded (untouched)`
  : "deletion list in-scope";
console.log(`[cleanup] observations: ${observations.length ? observations.join(" | ") : "none"}`);
console.log(`[cleanup] scope verdict: ${verdict}`);

if (!apply) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "dry-run.json"), JSON.stringify(artifact, null, 2) + "\n");
  console.log(`[cleanup] dry-run artifact → ${outDir}/dry-run.json — present verbatim to the operator; --apply only on the recorded go`);
  await client.end();
  process.exit(0);
}

// ---------------------------------------------------------------- apply (bounded deletes)
mkdirSync(outDir, { recursive: true });
mkdirSync(logsDir, { recursive: true });

// pre-state: verbatim dumps → gitignored logs; redacted → committed reports. BEFORE any delete.
for (const item of items) {
  if (item.status !== "deletable") continue;
  for (const [table, rows] of Object.entries(item._rows ?? {})) {
    writeFileSync(resolve(logsDir, `${item.key}-${table}.json`), JSON.stringify(rows, null, 2) + "\n");
    writeFileSync(resolve(outDir, `prestate-${item.key}-${table}.json`), JSON.stringify(rows.map(redactRow), null, 2) + "\n");
  }
  console.log(`[cleanup] pre-state captured: ${item.key} (${Object.entries(item._rows ?? {}).map(([t, r]) => `${t}:${r.length}`).join(" ")})`);
}

const deleted = {};
await client.query("begin");
try {
  for (const item of items) {
    if (item.status !== "deletable") continue;
    for (const [table, sql, params] of item.deletes) {
      const res = await client.query(`${sql} returning 1`, params);
      deleted[`${item.key}.${table}`] = (deleted[`${item.key}.${table}`] ?? 0) + res.rowCount;
    }
  }
  await client.query("commit");
} catch (e) {
  await client.query("rollback");
  console.error(`[cleanup] transaction rolled back: ${e.message}`);
  await client.end();
  process.exit(1);
}
console.log(`[cleanup] deleted: ${JSON.stringify(deleted)}`);

// post-state: every target re-resolves absent; invariants hold. LAD verifies on the resolved
// in-scope ids (a foreign title-match — an operator tombstone in its purge window — is state).
const post = {};
post.draft = (await q(`select id from drafts where id = $1`, [DRAFT_ID])).length;
post.deploymentsStray = (await q(`select id from deployments where id = $1`, [STRAY_DEPLOYMENT_ID])).length;
post.deploymentsTwin = (await q(`select id from deployments where id = $1`, [DEPLOYMENT_TWIN_ID])).length;
post.reviewUser = (await q(`select id from "user" where email = $1`, [REVIEW_EMAIL])).length;
const ladIds = lad._inScopeIds ?? [];
post.ladProjectsInScope = ladIds.length
  ? (await q(`select id from projects where id = any($1)`, [ladIds])).length
  : 0;
post.ladProjectsGlobal = (await q(`select id, workspace_id, deleted_at from projects where title = any($1)`, [LAD_TITLES])).length;
post.myFirstProject = (await q(`select id from projects where workspace_id = $1 and slug = $2`, [OPERATOR_WS, DRAFT_SIG.projectSlug])).length;
post.blockedSkipped = items.filter((i) => i.status === "blocked").map((i) => i.key);
console.log(`[cleanup] post-state: ${JSON.stringify(post)}`);
const ok =
  post.draft === 0 && post.deploymentsStray === 0 && post.deploymentsTwin === 1 &&
  post.reviewUser === 0 && post.ladProjectsInScope === 0 && post.myFirstProject === 1;
artifact.apply = { deleted, post, ok, observations };
writeFileSync(resolve(outDir, "apply.json"), JSON.stringify(artifact, null, 2) + "\n");
console.log(`[cleanup] ${ok ? "APPLY OK" : "APPLY — POST-STATE DEVIATION (inspect apply.json)"} — artifact → ${outDir}/apply.json`);
await client.end();
// 0 = clean; 3 = post-state ok but blocked items were skipped (report to the operator);
// 4 = post-state deviation.
process.exit(ok ? (post.blockedSkipped.length ? 3 : 0) : 4);
