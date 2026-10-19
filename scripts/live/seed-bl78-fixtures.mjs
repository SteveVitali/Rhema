#!/usr/bin/env node
// BL-78 fixture substrate (FIX.1 / REQ-FIX-BL78-5B4 + REQ-FIX-BL78-M31) — the two $0 substrates
// the MAINT.3 residual legs need on a flagged test tenant:
//
//   --mooted      seeds the writable journey dossier (`jrn-bl78-mooted`), then gives it a STALE-CHIP
//                 finding: an `obligation_findings` edge + the obligation flipped `open→mooted`
//                 (with its `obligation_transitions` audit row), plus a `discharged` edge for the
//                 second closed-state arm. `findingObligationState` now resolves for those cards,
//                 so a `defer` POST routes into the closed-world machine and must answer
//                 **409 `obligation_not_routable`** (never the pre-fix 500) with zero writes —
//                 D-STB.5b-4's live-leg probe (`scripts/live` has no browser; the probe is the leg).
//
//   --entitlement seeds the flagged tenant's trial entitlement: `billing_accounts.trial_state` →
//                 'trial_active' (+ `trial_killed_at` null) and an `unused` `trial_entitlements`
//                 row matching `PRICING.trial.entitlement` verbatim (review/standard/base, 2800-word
//                 cap). The run sheet's claimable read (`sheet-context.ts`) then emits the
//                 entitlement → the `review/standard/base` shape renders `Included` + hidden
//                 `entitlementId`, and a mismatched shape renders the funded estimate with no
//                 `data-included` — D-MAINT.3-1's two render arms ($0; the launch arm stays paid).
//
// Guards: SYSTEM_DATABASE_URL (system-role) required; the resolved workspace MUST carry `is_test`;
// DRY-RUN BY DEFAULT — `--execute` writes. Idempotent: slug-seeded project + upsert-shaped rows.
//
//   SYSTEM_DATABASE_URL=postgres://<system-role-dsn> \
//     node scripts/live/seed-bl78-fixtures.mjs --mooted --entitlement --execute
//
// Requires a built @rhema/db (the writable-dossier seed ships as dist): pnpm --filter @rhema/db build
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const require = createRequire(resolve(repoRoot, "packages", "journeys", "package.json"));
const pg = require("pg");

const dsn = process.env.SYSTEM_DATABASE_URL ?? process.env.JOURNEY_DATABASE_URL;
if (!dsn) {
  console.error("[bl78] SYSTEM_DATABASE_URL (system-role DSN) required — the writes must bypass RLS");
  process.exit(1);
}
const execute = process.argv.includes("--execute");
const wantMooted = process.argv.includes("--mooted") || process.argv.includes("--all") || process.argv.length <= 2;
const wantEntitlement =
  process.argv.includes("--entitlement") || process.argv.includes("--all") || process.argv.length <= 2;
const EMAIL = process.env.BL78_FIXTURE_EMAIL ?? "test+jrn-a@rhema.tools";

let seedWritableDossier;
try {
  ({ seedWritableDossier } = await import(
    resolve(repoRoot, "packages", "db", "dist", "seed", "showcase.js")
  ));
} catch {
  console.error("[bl78] packages/db/dist not built — run `pnpm --filter @rhema/db build` first");
  process.exit(1);
}

const client = new pg.Client({ connectionString: dsn });
await client.connect();
const db = {
  exec: (sql, params) => client.query(sql, params),
  query: (sql, params) => client.query(sql, params),
};
try {
  // 1 — resolve the flagged workspace + an owner identity (the same resolution reseat-n9 carries).
  const ws = (
    await client.query(
      `select w.id, w.billing_account_id, w.is_test, wm.user_id
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
    console.error(`[bl78] ${EMAIL} has no workspace — sign the identity in once, then re-run`);
    process.exit(1);
  }
  if (ws.is_test !== true) {
    console.error(
      `[bl78] ${EMAIL} resolves to non-flagged workspace ${ws.id} — refusing prod writes on a non-test tenant`,
    );
    process.exit(1);
  }
  console.log(`[bl78] ${EMAIL} → workspace ${ws.id} (is_test) → billing account ${ws.billing_account_id}`);

  if (wantMooted) {
    // 2 — the dossier seed (idempotent on its slug base), then the closed-state edges.
    const w = await seedWritableDossier(db, {
      workspaceId: ws.id,
      ownerId: ws.user_id,
      ids: () => `bl78_${randomUUID()}`,
      slugBase: "jrn-bl78-mooted",
      title: "JRN BL-78 stale-chip dossier",
      seedLabel: "bl78-fixture-seed",
    });
    console.log(`[bl78] dossier slug=${w.slug} run=${w.reviewRunId} corr=${w.reviewCorrId}`);

    const findings = (
      await client.query(
        `select f.id, f.ordinal, f.severity, o.id as obligation_id, o.state
           from findings f
           left join revision_obligations o on o.finding_id = f.id
          where f.correspondence_id = $1 order by f.ordinal`,
        [w.reviewCorrId],
      )
    ).rows;
    const open = findings.find((f) => f.obligation_id && f.state === "open");
    const alreadyMooted = findings.find((f) => f.obligation_id && f.state === "mooted");
    const mooted = open ?? alreadyMooted;
    const discharged = findings.find((f) => f.obligation_id && f.state === "discharged");
    if (!mooted) {
      console.error("[bl78] no open/mooted seeded obligation — the fixture changed; inspect findings");
      process.exit(1);
    }
    const edges = [mooted, discharged].filter(Boolean).map((f) => ({
      obligationId: f.obligation_id,
      findingId: f.id,
    }));

    if (!execute) {
      console.log(
        `[bl78] DRY-RUN would: insert obligation_findings edges (${edges.length})` +
          (open ? ` + transition ${mooted.obligation_id} open→mooted (cause 'moot')` : " — already mooted") +
          ` on ${w.slug}`,
      );
    } else {
      await client.query("begin");
      try {
        for (const e of edges) {
          await client.query(
            `insert into obligation_findings (obligation_id, finding_id, correspondence_id, relation)
               values ($1,$2,$3,'root') on conflict do nothing`,
            [e.obligationId, e.findingId, w.reviewCorrId],
          );
        }
        // REQ-OBJ-1's invariant is trigger-enforced (0003_invariants.sql): a direct
        // `UPDATE revision_obligations SET state` raises check_violation — the ONLY legal
        // path is the transition row itself, whose after-insert trigger flips state +
        // state_since + closed_at. `open` already gates the insert, so a rerun that found
        // the row already mooted never re-attempts the (now-invalid) transition.
        if (open) {
          await client.query(
            `insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor, at)
               values ($1,$2,'open','mooted','moot',$3::jsonb, now())`,
            [`bl78t_${randomUUID()}`, mooted.obligation_id, JSON.stringify({ kind: "system", label: "bl78-fixture-seed" })],
          );
        }
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
      // the probe surface: post defer to the mooted card → expect 409 obligation_not_routable.
      console.log(
        `[bl78] mooted arm live — probe: POST /projects/<pid>/findings/${mooted.id}/dispositions ` +
          `{kind:'defer'} → expect 409 obligation_not_routable, zero writes ` +
          `(dossier /p/${w.slug}/review/${w.reviewRunId}; discharged twin ${discharged?.id ?? "none"})`,
      );
    }
  }

  if (wantEntitlement) {
    // 3 — the entitled-tenant arm: trial machine live + an unused review/standard/base row.
    const acct = (
      await client.query(
        `select id, trial_state, trial_killed_at from billing_accounts where id = $1`,
        [ws.billing_account_id],
      )
    ).rows[0];
    if (!acct) {
      console.error(`[bl78] workspace ${ws.id} has no billing account row — provision first`);
      process.exit(1);
    }
    const existing = (
      await client.query(
        `select id, state, kind, rigor, model_tier, word_cap from trial_entitlements
           where billing_account_id = $1 order by expires_at desc nulls last limit 1`,
        [acct.id],
      )
    ).rows[0];
    const plan = {
      trialState: "trial_active",
      // matches PRICING.trial.entitlement verbatim (contracts/src/domain/pricing.json) — the sheet
      // only claims a row in ('locked','unused') on a live, unkilled, in-audience account.
      entitlement: { kind: "review", rigor: "standard", model_tier: "base", word_cap: 2800, state: "unused" },
    };
    const claimable =
      acct.trial_killed_at == null &&
      (acct.trial_state === "trial_pending" || acct.trial_state === "trial_active") &&
      existing &&
      (existing.state === "locked" || existing.state === "unused") &&
      existing.kind === plan.entitlement.kind &&
      existing.rigor === plan.entitlement.rigor &&
      existing.model_tier === plan.entitlement.model_tier;

    if (claimable) {
      console.log(`[bl78] entitlement arm already live — ${existing.id} (${existing.state}) on ${acct.id}`);
    } else if (!execute) {
      console.log(
        `[bl78] DRY-RUN would: set billing_accounts.trial_state='trial_active' on ${acct.id} ` +
          `(now ${acct.trial_state ?? "null"}${acct.trial_killed_at ? ", killed" : ""}) and ` +
          `${existing ? "update" : "insert"} a trial_entitlements row ` +
          `(${plan.entitlement.kind}/${plan.entitlement.rigor}/${plan.entitlement.model_tier}, ` +
          `${plan.entitlement.word_cap}w, ${plan.entitlement.state})`,
      );
    } else {
      await client.query("begin");
      try {
        await client.query(
          `update billing_accounts set trial_state = 'trial_active', trial_killed_at = null where id = $1`,
          [acct.id],
        );
        if (existing) {
          await client.query(
            `update trial_entitlements
                set kind = $2, rigor = $3, model_tier = $4, word_cap = $5, state = 'unused',
                    consumed_by_run_id = null, expires_at = now() + interval '14 days'
              where id = $1`,
            [
              existing.id,
              plan.entitlement.kind,
              plan.entitlement.rigor,
              plan.entitlement.model_tier,
              plan.entitlement.word_cap,
            ],
          );
          console.log(`[bl78] re-armed entitlement ${existing.id}`);
        } else {
          await client.query(
            `insert into trial_entitlements
               (id, billing_account_id, kind, word_cap, rigor, model_tier, state, expires_at)
             values ($1,$2,$3,$4,$5,$6,'unused', now() + interval '14 days')`,
            [
              `bl78ent_${randomUUID()}`,
              acct.id,
              plan.entitlement.kind,
              plan.entitlement.word_cap,
              plan.entitlement.rigor,
              plan.entitlement.model_tier,
            ],
          );
          console.log(`[bl78] inserted trial entitlement on ${acct.id}`);
        }
        await client.query("commit");
      } catch (e) {
        await client.query("rollback");
        throw e;
      }
      console.log(
        `[bl78] entitlement arm live — render probe: /p/<slug>/run?workflow=review&rigor=standard&modelTier=base ` +
          `→ Included + hidden entitlementId; any other shape → funded estimate, no data-included`,
      );
    }
  }
} finally {
  await client.end();
}
