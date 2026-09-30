// PRB.16 — LIVE PROD fixture for the golden-path verification (Stage-B driver; operator-gated).
//
// Prod has no "create project" surface (beta projects on dev came from `seedRealProjects`, which must
// NEVER run on prod — it writes a seed account). So this helper does the minimum a real signed-up
// account cannot do for itself: insert ONE project row + ONE frozen imported draft (the exact row shape
// `createImportedDraft` writes — artifact → immutable artifact_version → drafts v1) with REAL markdown
// bytes content-addressed into the objects bucket, and FUND the account's topup bucket so the run hold
// succeeds (a fresh signup has no credits — the beta's funding channel is Stripe, out of PRB.16 scope).
//
// Tenant-keyed writes go through `withTenant` — prod runs FORCE ROW LEVEL SECURITY, so even the owner
// connection is subject to policy (`workspace_id = current_tenant()`). That is the prod difference vs
// the dev fixture helpers and is itself part of the assertion.
//
// Everything AROUND the fixture stays real: signup, session, estimates, run creation, worker→GKE→proxy
// inference, delivery, dossier, triage, editor, export all run through the deployed api/web surface.
//
//   DATABASE_URL='postgresql://postgres:…@127.0.0.1:15434/rhema' \
//   OBJECTS_BUCKET=rhema-prod-artifacts PROBE_EMAIL='<signed-up email>' \
//     pnpm exec tsx integration/src/live-prod-fixture.ts
//
// Idempotent (fixed ids + on-conflict no-ops). Clean-up is a follow-up delete keyed on the printed ids.

import { createHash } from "node:crypto";
import pg from "pg";
import { createGcsContentStore } from "@rhema/mirror";
import { withTenant } from "@rhema/db";

const PROJECT_ID = "proj_prb16";
const ARTIFACT_ID = "proj_prb16_art1";
const VERSION_ID = "proj_prb16_av1";
const DRAFT_ID = "proj_prb16_d1";
const FUND_CREDITS = 200_000; // headroom over one full_board Review cap (~1053 credits) by a wide margin

/** A real ~600-word draft — genuine prose for the Editor to review (short on purpose: this run is the
 *  prod golden-path proof, not a content exercise; shorter prose = cheaper inference). */
const DRAFT_MD = `# The Quiet Cost of Convenience

Every convenience is a small loan taken out against a future self. The apps that remember our passwords
also remember our habits; the services that spare us a phone call spare us, too, the small negotiations
by which we used to learn what things cost and who we were dealing with. None of this is an argument
against convenience — a washing machine is a genuine liberation, and only a fool romanticizes the mangle.
But the habit of never asking what a convenience costs is how a culture ends up unable to price anything.

## What the shortcut erases

Consider the commute that navigation software quietly reroutes. The driver saves eleven minutes and
learns nothing about why the road was slow — a school letting out, a construction permit, a crash that
will be in tomorrow's incident log. Multiply that ignorance by a hundred million trips and you get a
public that experiences traffic as weather: uncaused, unanswerable, merely endured. The shortcut did not
just move the car. It removed the driver from the class of people who might have asked a question.

This is the pattern, not the exception. Autocomplete finishes our sentences so efficiently that we stop
noticing which sentences we meant to write. Filters sort our mail so reliably that we stop noticing which
messages never arrived. Each individual gain is real. The aggregate is a population that can no longer
distinguish between the world and the version of the world an intermediary chose to show them.

## The bill arrives later

The deeper cost is deferred competence. Skills that are never exercised do not merely rest; they
atrophy, and they take with them the confidence that comes from having done a thing oneself. A generation
that has never navigated without a blue dot, never cooked without a kit, never argued a bill without a
chatbot, is not worse than its parents — it is more dependent, in ways that only become visible when the
convenience fails. And conveniences fail at exactly the wrong moment: the outage, the hack, the quiet
repricing of a service that turned out to be subsidized by something else all along.

None of this calls for a return to the mangle. It calls for a habit of asking, each time a friction is
removed, what the friction was doing — who it was training, what it was teaching, which small
negotiations it was forcing us to have. Some frictions are pure waste, and good riddance. Others are the
load-bearing kind, the ones that kept us in contact with the actual cost of things. Telling them apart
is the work convenience makes hardest, which is precisely why it is worth doing.
`;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  const email = process.env.PROBE_EMAIL;
  const objectsBucket = process.env.OBJECTS_BUCKET ?? "rhema-prod-artifacts";
  if (!databaseUrl || !email) throw new Error("DATABASE_URL + PROBE_EMAIL required");
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const log = (m: string): void => console.log(`[prod-fixture] ${m}`);

  try {
    // 1. Resolve the REAL signed-up account (signup.ts / better-auth user.create provisioned it).
    const acct = (
      await pool.query(
        `select u.id as user_id, m.workspace_id, w.billing_account_id
           from "user" u
           join workspace_members m on m.user_id = u.id
           join workspaces w on w.id = m.workspace_id and w.kind = 'personal'
          where u.email = $1`,
        [email],
      )
    ).rows[0] as { user_id: string; workspace_id: string; billing_account_id: string } | undefined;
    if (!acct) throw new Error(`no provisioned account for ${email} — run the real signup first`);
    log(`account: user=${acct.user_id} ws=${acct.workspace_id} ba=${acct.billing_account_id}`);

    // 2. Draft bytes → the objects bucket (content-addressed, same as createImportedDraft's put).
    const bytes = Buffer.from(DRAFT_MD, "utf8");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const wordCount = DRAFT_MD.split(/\s+/).filter(Boolean).length;
    const store = await createGcsContentStore({ bucketName: objectsBucket, workspaceId: acct.workspace_id });
    const { key } = await store.put(acct.workspace_id, sha256, bytes);
    log(`draft bytes → ${key} (${bytes.length}B, ${wordCount} words, sha ${sha256.slice(0, 12)}…)`);

    const client = await pool.connect();
    try {
      await withTenant(client, acct.workspace_id, async (tx) => {
        // 3. The project row (essay protocol; the seeded `protocols` row is the seedProtocols upsert).
        await tx.query(
          `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, protocol_version, rigor_default)
           values ($1,$2,$3,$4,$5,'essay',1,'full_board') on conflict (id) do nothing`,
          [PROJECT_ID, acct.workspace_id, acct.user_id, "The Quiet Cost of Convenience", "quiet-cost-of-convenience"],
        );

        // 4. The frozen imported draft — the exact shape createImportedDraft writes (human_upload,
        //    frozen, promoted_version_id, immutable version, head_version_id, mirror_path drafts/v1.md).
        const actor = JSON.stringify({ kind: "user", userId: acct.user_id });
        await tx.query(
          `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
           values ($1,$2,$3,'draft','shared','drafts/v1.md') on conflict (id) do nothing`,
          [ARTIFACT_ID, acct.workspace_id, PROJECT_ID],
        );
        await tx.query(
          `insert into artifact_versions
             (id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, immutable)
           values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7::jsonb,true) on conflict (id) do nothing`,
          [VERSION_ID, ARTIFACT_ID, sha256, key, bytes.length, wordCount, actor],
        );
        await tx.query(`update artifacts set head_version_id = $2 where id = $1`, [ARTIFACT_ID, VERSION_ID]);
        await tx.query(
          `insert into drafts (id, project_id, n, origin, state, promoted_version_id)
           values ($1,$2,1,'human_upload','frozen',$3) on conflict (id) do nothing`,
          [DRAFT_ID, PROJECT_ID, VERSION_ID],
        );

        // 5. Fund the account's topup bucket (ledger grant + maintained balance row — the same pattern
        //    live-prepare-fixture uses on dev). A real account's credits arrive via Stripe (PRB.17's
        //    leg); this is the fixture half of the run-hold prerequisite.
        await tx.query(
          `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key)
           values ('cl_prb16_probe_fund', $1, $2, 'grant', $3, 'topup', 'live_test', 'PRB.16 golden-path fixture fund', 'prb16-fixture-fund')
           on conflict (id) do nothing`,
          [acct.workspace_id, acct.billing_account_id, FUND_CREDITS],
        );
      });
    } finally {
      client.release();
    }
    log(`project ${PROJECT_ID} + draft ${DRAFT_ID} (v1 frozen, promoted=${VERSION_ID}) written under tenant ${acct.workspace_id}`);

    // credit_balances is account-keyed (no workspace_id column) — outside the tenant scope.
    await pool.query(
      `insert into credit_balances (billing_account_id, bucket, available, held)
       values ($1, 'topup', $2, 0)
       on conflict (billing_account_id, bucket) do update set available = greatest(credit_balances.available, $2), updated_at = now()`,
      [acct.billing_account_id, FUND_CREDITS],
    );
    const bal = (
      await pool.query(`select available, held from credit_balances where billing_account_id=$1 and bucket='topup'`, [
        acct.billing_account_id,
      ])
    ).rows[0];
    log(`funded ${acct.billing_account_id}: ${JSON.stringify(bal)}`);

    log(`done. project=${PROJECT_ID} draft=${DRAFT_ID} version=${VERSION_ID}`);
  } finally {
    await pool.end();
  }
}

main().catch((err: unknown) => {
  console.error("[prod-fixture] failed:", err);
  process.exit(1);
});
