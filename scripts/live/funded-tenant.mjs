#!/usr/bin/env node
// R5ECON.3 (REQ-FND-8) — the funded stable tenant preparation driver. DRY-RUN-FIRST: with no
// flag it only READS + PRINTS — the tenant probe rows, the intended purge-exemption mutation,
// and the verbatim house-grant command. `--execute` is the explicit gate for the ONE write this
// script owns (the created_at freshness refresh — the purge-exemption arm); the credit grant
// itself stays on the api's `admin-cli house-grant` seam, printed verbatim for the operator.
//
// What "funded + purge-exempt" means here (the sweep's real predicate — worker jobs.ts
// handleTestTenantPurge): a workspace is purge-swept when `is_test = true` AND
// `created_at < now() - TEST_TENANT_PURGE_HOURS` (default 26). The funded tenant keeps `is_test`
// (the spend guard + lever arms need it), so the exemption is FRESHNESS — a periodic
// `created_at` refresh ahead of the sweep, run by the operator, never by a leg. This script is
// the committed driver for both halves:
//
//   node scripts/live/funded-tenant.mjs                 # probe + print (zero writes)
//   node scripts/live/funded-tenant.mjs --execute       # probe + the created_at refresh
//
// Env: JOURNEY_DATABASE_URL — REQUIRED, the system-role DSN (the workspace read + the refresh
// are cross-tenant system reads; a non-bypass role refuses).
// JOURNEY_FUNDED_STABLE_TAG (default "a") names the stable identity (test+jrn-<tag>@rhema.tools).
// TEST_TENANT_PURGE_HOURS (default 26) — the deployed sweep window the freshness check reads.
// FUNDED_GRANT_CREDITS (default 10000) — the suggested house grant: ~$60 list-COGS envelope at
// the proxy meter's platform-rate (1 credit = $0.01; $1 list COGS meters ≈140 proxy credits).
// FUNDED_GRANT_EXPIRES (default +90 days) — the grant's expiry date (YYYY-MM-DD).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

const J = await import(resolve(repoRoot, "packages", "journeys", "dist", "index.js"));
const { stableIdentity } = J;

const EXECUTE = process.argv.includes("--execute");
const stableTag = process.env.JOURNEY_FUNDED_STABLE_TAG ?? "a";
const email = stableIdentity(stableTag);
const PURGE_HOURS = Number(process.env.TEST_TENANT_PURGE_HOURS ?? 26);
const GRANT_CREDITS = Number(process.env.FUNDED_GRANT_CREDITS ?? 10_000);
const GRANT_EXPIRES =
  process.env.FUNDED_GRANT_EXPIRES ??
  new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString().slice(0, 10);

const dsn = process.env.JOURNEY_DATABASE_URL;
if (!dsn) {
  console.error("funded-tenant requires JOURNEY_DATABASE_URL (system-role DSN over the IAP tunnel)");
  process.exit(3);
}
const pool = new pg.Pool({ connectionString: dsn, max: 1 });
const q = (sql, params) => pool.query(sql, params).then((r) => r.rows);

try {
  const trust = await q(
    `select (r.rolsuper or r.rolbypassrls) as bypass from pg_roles r where r.rolname = current_user`,
  );
  if (trust[0]?.bypass !== true) {
    console.error("the bound role is not RLS-bypassing — bind the system DSN (D-STB.5b-1). Refusing.");
    process.exit(3);
  }

  // ---- the probe (reads only — the rows the window checklist's tenant item evaluates) --------
  const user = (
    await q(`select id, email, created_at from "user" where email = $1`, [email])
  )[0];
  const ws = user
    ? (
        await q(
          `select w.id, w.is_test, w.created_at, w.billing_account_id,
                  extract(epoch from (now() - w.created_at)) / 3600 as age_hours
             from workspaces w join workspace_members m on m.workspace_id = w.id
            where m.user_id = $1 order by w.created_at desc limit 1`,
          [user.id],
        )
      )[0]
    : undefined;
  const balance = ws?.billing_account_id
    ? (
        await q(
          `select available, held from credit_balances where billing_account_id = $1`,
          [ws.billing_account_id],
        )
      )[0]
    : undefined;

  console.log(`[funded-tenant] stable identity ${email} (JOURNEY_FUNDED_STABLE_TAG=${stableTag})`);
  if (!user) {
    console.log(
      `  user     ABSENT — provision it by signing the identity in through the real magic link ` +
        `(the journeys' JourneySessions.signIn on ${email}); the tenant's is_test flag lands at ` +
        `provisioning (the TEST_MAILBOX base+tag rule)`,
    );
  } else {
    console.log(`  user     ${user.id} (created ${user.created_at})`);
  }
  if (!ws) {
    console.log(`  tenant   ABSENT — no workspace for the identity yet (see the sign-in note above)`);
  } else {
    const age = Number(ws.age_hours);
    console.log(
      `  tenant   ${ws.id} · is_test=${ws.is_test} · age ${age.toFixed(1)}h ` +
        `(purge sweeps is_test workspaces older than ${PURGE_HOURS}h) ` +
        `· billing ${ws.billing_account_id ?? "none"}`,
    );
    console.log(
      `  exempt   ${age < PURGE_HOURS ? "FRESH — inside the sweep window" : `STALE — ${(age - PURGE_HOURS).toFixed(1)}h past the window; refresh before the next hourly sweep`}`,
    );
    console.log(
      `  balance  ${balance ? `${balance.available} cr available (${balance.held} held)` : "no credit_balances row"}`,
    );
  }

  // ---- the intended operations ------------------------------------------------------------
  console.log(`\n[funded-tenant] intended operations:`);
  console.log(
    `  1. purge exemption (freshness arm) — UPDATE workspaces SET created_at = now() WHERE id = '${ws?.id ?? "<tenant>"}' ` +
      `${EXECUTE ? "(EXECUTING below)" : "(dry-run — pass --execute to run it)"}`,
  );
  console.log(
    `  2. the house grant — on the api stage checkout: ` +
      `node dist/admin-cli.js house-grant --billing-account ${ws?.billing_account_id ?? "<acct>"} ` +
      `--credits ${GRANT_CREDITS} --expires ${GRANT_EXPIRES} --note "funded window R5F (≈$60 list-COGS envelope)" ` +
      `(the admin-cli seam owns the ledger rows + audit trail — this script never writes credits)`,
  );

  if (EXECUTE) {
    if (!ws) {
      console.error(`\n[funded-tenant] --execute refused: no tenant to refresh — provision the identity first`);
      process.exit(3);
    }
    await q(`update workspaces set created_at = now() where id = $1`, [ws.id]);
    const after = (
      await q(
        `select extract(epoch from (now() - created_at)) / 3600 as age_hours from workspaces where id = $1`,
        [ws.id],
      )
    )[0];
    console.log(
      `\n[funded-tenant] EXECUTED — workspace ${ws.id} created_at refreshed; age now ${Number(after.age_hours).toFixed(2)}h ` +
        `(re-run ahead of every sweep; ${PURGE_HOURS}h is the bound)`,
    );
  } else {
    console.log(`\n[funded-tenant] dry-run — no writes. --execute performs only the created_at refresh.`);
  }
  process.exit(0);
} finally {
  await pool.end();
}
