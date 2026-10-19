#!/usr/bin/env node
// T8 expired-export mint (FIX.1 / D-FIX.1-1) — hand-dates ONE `account_exports` row so the
// token-gated download's 7-day expiry arm is observable: the row reads `status='ready'`, carries a
// non-null `s3_key`, and its `expires_at` sits ~8 days in the PAST (the minted link expired ~1 day
// ago). `GET /export/download?token=<minted>` then answers `410 export_link_expired` — T8's second
// half, unreachable any other way on the ~26 h-purged test-tenant class (the row never lives long
// enough for the honest 7-day wait).
//
// Why a script: the operator's hand-date is the ticket's clock-rule option (ii) — a fixture row,
// not a purge exemption, and NEVER a prod write. DRY-RUN BY DEFAULT: the write lands only under
// `--execute`, and only after the resolved workspace proves `is_test`. System-role DSN only — the
// FORCE-RLS table takes the app role's writes nowhere.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/mint-t8-export.mjs                 # dry-run: resolve + preview
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/mint-t8-export.mjs --execute       # mint the row, print the token
//   …then: JOURNEY_T8_EXPORT_TOKEN=<printed> pnpm --filter @rhema/journeys exec rhema-journeys --steps T8 …
//
// Rollback: `delete from account_exports where id = '<printed id>'` — one row, nothing else
// references it. Re-minting after a purge prints a fresh id + token; bind the NEW token.
import { createRequire } from "node:module";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL;
if (!dsn) {
  console.error("[mint-t8] SYSTEM_DATABASE_URL (system-role DSN) required — the write must bypass RLS");
  process.exit(1);
}
const execute = process.argv.includes("--execute");
const EMAIL = process.env.T8_FIXTURE_EMAIL ?? "test+jrn-a@rhema.tools";
const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");

const client = new pg.Client({ connectionString: dsn });
await client.connect();
try {
  // 1 — resolve the identity's CURRENT flagged workspace (+ a user row for the FK). A purge may
  // leave stale membership rows: prefer the is_test workspace, newest first — the same resolution
  // reseat-n9-fixture.mjs carries.
  const ws = (
    await client.query(
      `select w.id, w.is_test, wm.user_id
         from "user" u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where u.email = $1
        order by w.is_test desc, w.created_at desc
        limit 1`,
      [EMAIL],
    )
  ).rows[0];
  if (!ws) {
    console.error(`[mint-t8] ${EMAIL} has no workspace — sign the identity in once, then re-run`);
    process.exit(1);
  }
  if (ws.is_test !== true) {
    console.error(
      `[mint-t8] ${EMAIL} resolves to non-flagged workspace ${ws.id} — refusing a prod write on a non-test tenant`,
    );
    process.exit(1);
  }
  console.log(`[mint-t8] ${EMAIL} → workspace ${ws.id} → user ${ws.user_id}`);

  // 2 — an already-minted LIVE expired row on this workspace is reusable: its token can't be
  // re-derived (hash-only storage — REQ-ARCH-30), so report it and let the operator pass --fresh
  // for a new token+row.
  const live = (
    await client.query(
      `select id, expires_at from account_exports
        where workspace_id = $1 and status = 'ready' and s3_key is not null
          and token_sha256 is not null and expires_at <= now()
        order by created_at desc limit 1`,
      [ws.id],
    )
  ).rows[0];
  if (live && !process.argv.includes("--fresh")) {
    console.log(
      `[mint-t8] an expired ready row already rides this workspace: ${live.id} ` +
        `(expired ${live.expires_at.toISOString()}) — its token left no trace (hash-only). ` +
        `Bind the token you recorded at mint, or re-run with --fresh for a new token+row.`,
    );
    process.exit(0);
  }

  // 3 — mint. `ready_at`/`created_at` sit ~9 days back so the row's own timeline reads like a real
  // export that ran, mailed, and aged out; `expires_at` = ready + 7d = ~1 day ago. The `s3_key`
  // never resolves on the 410 arm (the route returns before presigning) — a labeled stub keeps the
  // NOT-NULL leg honest without touching the object bucket.
  const id = `t8exp_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
  const token = `t8exp_${randomBytes(24).toString("base64url")}`;
  const sql = `insert into account_exports
      (id, workspace_id, user_id, kind, status, sha256, bytes, s3_key, token_sha256,
       created_at, ready_at, expires_at)
    values ($1,$2,$3,'account_zip','ready',$4,$5,$6,$7,
            now() - interval '9 days', now() - interval '8 days', now() - interval '1 day')`;
  const params = [
    id,
    ws.id,
    ws.user_id,
    sha256Hex(`t8-expired-fixture:${id}`),
    128,
    `fixtures/t8-expired-export/${id}.zip`,
    sha256Hex(token),
  ];

  if (!execute) {
    console.log(`[mint-t8] DRY-RUN would INSERT ${id} on ${ws.id}:`);
    console.log(`  status='ready'  created_at=now()-9d  ready_at=now()-8d  expires_at=now()-1d (the 410 arm)`);
    console.log(`  s3_key=fixtures/t8-expired-export/${id}.zip (stub — never dereferenced at 410)`);
    console.log(`  token_sha256=sha256(<minted token>) — the raw token prints ONLY under --execute`);
    console.log(`[mint-t8] re-run with --execute to write; rollback: delete from account_exports where id='${id}'`);
    process.exit(0);
  }

  await client.query("begin");
  try {
    await client.query(sql, params);
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  }
  console.log(`[mint-t8] minted ${id} on ${ws.id} (created_at −9d, ready_at −8d, expires_at −1d)`);
  console.log(`[mint-t8] bind the leg: JOURNEY_T8_EXPORT_TOKEN=${token}`);
  console.log(`[mint-t8] expect: GET /export/download?token=<that> → 410 {"error":"export_link_expired"}`);
  console.log(`[mint-t8] rollback: delete from account_exports where id='${id}'`);
} finally {
  await client.end();
}
