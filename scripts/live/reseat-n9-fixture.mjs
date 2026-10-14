#!/usr/bin/env node
// N9 fixture reseat (MAINT.3 / D-OBS.1-3) — re-seats the BILL.3 fixture subscription row
// `sub_jrna_bill3_fixture` (tier `writer`, `past_due`, `renewal_failed_at=NULL`, period −1d→+29d,
// no Stripe ids — the past-due shape that renders the honest banner while leaving the hourly
// `billing.period-tick` inert) onto test+jrn-a's CURRENT billing account.
//
// Why: the ~26 h test-tenant purge reaps jrn-a's workspace; the next sign-in re-provisions a FRESH
// billing account, stranding the fixture row on the stale account (observed 2026-10-02: fixture on
// `01M3V0VJ…`, jrn-a re-provisioned → §14.2 mounts Checkout top-ups only for a paid tier → N9's
// "Buy 1,000 credits" substrate gone). This recurs every purge cycle — a script, not an ad-hoc SQL.
//
// Idempotent: no-op when the row already rides the current account; UPDATEs it in place when it
// sits on a stale account (preserves the row's audit identity); INSERTs it when the purge deleted
// it outright. FAILS CLOSED unless the resolved workspace carries `is_test` — a prod write on a
// non-flagged tenant is refused, not guessed.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> node scripts/live/reseat-n9-fixture.mjs [--dry-run]
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL;
if (!dsn) {
  console.error("[reseat] SYSTEM_DATABASE_URL (system-role DSN) required — the write must bypass RLS");
  process.exit(1);
}
const dryRun = process.argv.includes("--dry-run");
const EMAIL = process.env.N9_FIXTURE_EMAIL ?? "test+jrn-a@rhema.tools";
const SUB_ID = "sub_jrna_bill3_fixture";

const client = new pg.Client({ connectionString: dsn });
await client.connect();
try {
  // 1 — resolve the identity's CURRENT flagged workspace → billing account. A purge may leave stale
  // membership rows: prefer the is_test workspace, newest first.
  const ws = (
    await client.query(
      `select w.id, w.billing_account_id, w.is_test, w.created_at
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
    console.error(`[reseat] ${EMAIL} has no workspace — sign the identity in once, then re-run`);
    process.exit(1);
  }
  if (ws.is_test !== true) {
    console.error(`[reseat] ${EMAIL} resolves to non-flagged workspace ${ws.id} — refusing a prod write on a non-test tenant`);
    process.exit(1);
  }
  const account = ws.billing_account_id;
  console.log(`[reseat] ${EMAIL} → workspace ${ws.id} → billing account ${account}`);

  // 2 — locate the fixture row (any account).
  const fixture = (
    await client.query(`select id, billing_account_id, tier, status from subscriptions where id = $1`, [SUB_ID])
  ).rows[0];

  if (fixture?.billing_account_id === account && fixture.tier === "writer" && fixture.status === "past_due") {
    console.log(`[reseat] already seated — ${SUB_ID} on ${account} (writer/past_due). nothing to do.`);
  } else {
    const sql = fixture
      ? // stale seat: move the SAME row onto the current account and refresh the fixture shape.
        `update subscriptions
            set billing_account_id = $1, tier = 'writer', status = 'past_due',
                period_start = now() - interval '1 day', period_end = now() + interval '29 days',
                renewal_failed_at = null, cancel_at_period_end = false,
                stripe_customer_id = null, stripe_subscription_id = null,
                billing_cycle = 'monthly', scheduled_tier = null, updated_at = now()
          where id = $2`
      : // purged outright: insert the row the BILL.3 run ledger records (runs/BILL.3.md §fixture note).
        `insert into subscriptions
            (id, billing_account_id, tier, status, period_start, period_end,
             included_credits, concurrency, billing_cycle, renewal_failed_at, cancel_at_period_end)
          values
            ($2, $1, 'writer', 'past_due', now() - interval '1 day', now() + interval '29 days',
             2000, 1, 'monthly', null, false)`;
    if (dryRun) {
      console.log(`[reseat] DRY-RUN would ${fixture ? "UPDATE (reseat)" : "INSERT"} ${SUB_ID} → ${account}`);
    } else {
      await client.query("begin");
      try {
        await client.query(sql, [account, SUB_ID]);
        // never leave two live rows on the account — an ended/free provisioning row is fine, but a
        // second active|past_due row would make the effective-tier read nondeterministic.
        const others = (
          await client.query(
            `select id from subscriptions
              where billing_account_id = $1 and id <> $2 and status in ('active','past_due')`,
            [account, SUB_ID],
          )
        ).rows;
        if (others.length > 0) {
          await client.query(
            `update subscriptions set status = 'ended', updated_at = now()
              where billing_account_id = $1 and id <> $2 and status in ('active','past_due')`,
            [account, SUB_ID],
          );
          console.log(`[reseat] ended ${others.length} stale live row(s): ${others.map((r) => r.id).join(", ")}`);
        }
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
      console.log(`[reseat] ${fixture ? "reseated" : "inserted"} ${SUB_ID} on ${account}`);
    }
  }

  // 3 — report the effective tier the billing read will now see.
  const tier = (
    await client.query(
      `select tier from subscriptions where billing_account_id = $1 and status in ('active','past_due')
         order by created_at desc limit 1`,
      [account],
    )
  ).rows[0]?.tier;
  console.log(`[reseat] effective tier for ${account}: ${tier ?? "free"}${tier === "writer" ? " — N9 top-up substrate restored" : ""}`);
} finally {
  await client.end();
}
