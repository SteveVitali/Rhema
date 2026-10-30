// R6DEP.4 — self-healing stable-identity substrate for the scheduled suite (F-R6DEP4-1's second
// half). The hourly `test-tenant.purge` sweep (TEST_TENANT_PURGE_HOURS=26) destroys every flagged
// workspace ~26 h after minting — including jrn-a's — so fixture rows seated on its billing
// account/workspace die on a daily cycle: N9's BILL.3 fixture sub stranded on the dead account
// ("Buy 1,000 credits: not in the DOM" — §14.2's `topups_require_plan` gate is CORRECT product
// behavior on the re-minted free tier), and T8's minted expired-export row gone with the workspace
// (the bound token then answers 404, not 410). The durable arm is the same JOURNEY_DATABASE_URL
// seed pattern the dossier fixtures already carry (`seedWritableDossier`/`seedDeliveredRunReport`):
// the leg re-seats its own substrate on the CURRENT workspace before probing. `subscriptions` is
// account-scoped (no RLS); `account_exports` is FORCE-RLS tenant-keyed (tenant context required).
// JOURNEY_DATABASE_URL unset ⇒ both are no-ops and the legs keep their honest failure modes.

import { createHash } from "node:crypto";
import pg from "pg";
import { sha256Hex } from "@rhema/contracts";
import { stableIdentity } from "./session.js";

let pool: pg.Pool | null = null;
function fixtureDb(): pg.Pool {
  const url = process.env.JOURNEY_DATABASE_URL;
  if (!url) throw new Error("needs JOURNEY_DATABASE_URL (a read pool bound to the stage Postgres)");
  pool ??= new pg.Pool({ connectionString: url, max: 1 });
  return pool;
}

const JRNA = stableIdentity("a"); // test+jrn-a@rhema.tools — the returning fixture tenant

/** Resolve the identity's CURRENT flagged workspace + billing account off the non-RLS auth
 *  tables — the same newest-first resolution reseat-n9-fixture.mjs carries (a purge can leave
 *  stale membership rows). */
async function currentBillingAccount(email: string): Promise<{ workspaceId: string; billingAccountId: string }> {
  const row = (
    await fixtureDb().query(
      `select w.id, w.billing_account_id
         from "user" u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where u.email = $1
        order by w.is_test desc, w.created_at desc
        limit 1`,
      [email],
    )
  ).rows[0] as { id: string; billing_account_id: string } | undefined;
  if (!row) throw new Error(`fixture substrate: ${email} has no workspace (sign-in should have provisioned one)`);
  return { workspaceId: row.id, billingAccountId: row.billing_account_id };
}

/** N9 Entry 2's substrate: a `writer`/`past_due` subscriptions row on jrn-a's CURRENT billing
 *  account — the same shape `sub_jrna_bill3_fixture` carries (paid tier + the honest past-due
 *  banner; `billing.period-tick` stays inert on null stripe ids). Idempotent: no-ops when any
 *  live row already rides the account, UPDATEs a stale `sub_jrna_journey_seed` onto the current
 *  account (the purge orphans it each cycle), INSERTs otherwise. `subscriptions` is
 *  account-scoped — no tenant context needed. No-op when JOURNEY_DATABASE_URL is unbound. */
export async function ensureJrnaPaidFixture(email: string = JRNA): Promise<void> {
  if (!process.env.JOURNEY_DATABASE_URL) return;
  const { billingAccountId } = await currentBillingAccount(email);
  const seated = (
    await fixtureDb().query(
      `select id from subscriptions where billing_account_id = $1 and status in ('active','past_due') limit 1`,
      [billingAccountId],
    )
  ).rows[0];
  if (seated) return;
  await fixtureDb().query(
    `insert into subscriptions
       (id, billing_account_id, tier, status, period_start, period_end,
        renewal_failed_at, cancel_at_period_end, stripe_customer_id, stripe_subscription_id,
        billing_cycle, scheduled_tier, updated_at)
     values ('sub_jrna_journey_seed', $1, 'writer', 'past_due',
             now() - interval '1 day', now() + interval '29 days',
             null, false, null, null, 'monthly', null, now())
     on conflict (id) do update
       set billing_account_id = excluded.billing_account_id,
           tier = 'writer', status = 'past_due',
           period_start = excluded.period_start, period_end = excluded.period_end,
           updated_at = now()`,
    [billingAccountId],
  );
}

/** T8's 410 arm substrate: a ready `account_exports` row whose `expires_at` already passed and
 *  whose `token_sha256` matches the bound `JOURNEY_T8_EXPORT_TOKEN`. The workspace dies ~26 h
 *  after minting and takes the row with it; the bound token stays valid because the leg re-mints
 *  the SAME hash onto the CURRENT workspace each run (the mint script's rotating-token recipe is
 *  what made a static secret impossible — a leg-held token never rotates). `account_exports` is
 *  FORCE-RLS tenant-keyed, so the insert rides `set_config('app.tenant_id')` like the dossier
 *  seeds — a no-op under a BYPASSRLS system DSN, load-bearing under `rhema_app_login`. The `s3_key`
 *  stub is never dereferenced: the route 410s before presigning (mint-t8-export.mjs's own note).
 *  No-op when JOURNEY_DATABASE_URL is unbound. */
export async function ensureT8ExpiredExport(email: string, token: string): Promise<void> {
  if (!process.env.JOURNEY_DATABASE_URL) return;
  const tokenHash = sha256Hex(token);
  const row = (
    await fixtureDb().query(
      `select w.id as workspace_id, wm.user_id
         from "user" u
         join workspace_members wm on wm.user_id = u.id
         join workspaces w on w.id = wm.workspace_id
        where u.email = $1
        order by w.is_test desc, w.created_at desc
        limit 1`,
      [email],
    )
  ).rows[0] as { workspace_id: string; user_id: string } | undefined;
  if (!row) throw new Error(`fixture substrate: ${email} has no workspace (sign-in should have provisioned one)`);
  const client = await fixtureDb().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.tenant_id', $1, true)", [row.workspace_id]);
    const existing = (
      await client.query(
        `select id from account_exports
          where token_sha256 = $1 and status = 'ready' and expires_at <= now() limit 1`,
        [tokenHash],
      )
    ).rows[0];
    if (!existing) {
      const id = `t8exp_jrn_${createHash("sha256").update(token).digest("hex").slice(0, 14)}`;
      await client.query(
        `insert into account_exports
           (id, workspace_id, user_id, kind, status, sha256, bytes, s3_key, token_sha256,
            created_at, ready_at, expires_at)
         values ($1,$2,$3,'account_zip','ready',$4,$5,$6,$7,
                 now() - interval '9 days', now() - interval '8 days', now() - interval '1 day')
         on conflict (id) do nothing`,
        [
          id,
          row.workspace_id,
          row.user_id,
          sha256Hex(`t8-expired-fixture:${id}`),
          128,
          `fixtures/t8-expired-export/${id}.zip`,
          tokenHash,
        ],
      );
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
