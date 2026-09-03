import type { MigrationDb } from "../migrate.js";
import { agentTypesSeed, protocolsSeed } from "./code-seed.js";

// The seed built from the three real projects (REQ-DATA-3): drafts, a review dossier, findings, and revision
// obligations exercising spawn, address, rebut, defer and carry (all three projects have multi-round history).
// Used by CI to prove "migrations apply cleanly against the real-project seed" (AC2) and as a fixture base for
// later tickets. Seeded as the owner (RLS bypassed); tenant scoping is exercised separately (rls.test.ts).
// Content (titles, finding text, verdicts) is drawn from the real ~/agent-discourse dossiers.

const WS = "ws_seed";
const USER = "user_seed";
const BILL = "bill_seed";

interface SeedProject {
  id: string;
  slug: string;
  title: string;
}
const PROJECTS: SeedProject[] = [
  { id: "proj_pv", slug: "the-politics-of-visibility", title: "The Politics of Visibility" },
  {
    id: "proj_sd",
    slug: "structure-of-political-difference",
    title: "The Structure of Political Difference",
  },
  { id: "proj_cr", slug: "constitution-of-reason", title: "The Constitution of Reason" },
];

/** Apply the full three-real-project seed. Idempotent-ish: intended for a fresh migrated database. */
export async function seedRealProjects(db: MigrationDb): Promise<void> {
  await agentTypesSeed(db);
  await protocolsSeed(db);

  await db.query(`insert into billing_accounts (id) values ($1) on conflict do nothing`, [BILL]);
  await db.query(
    `insert into workspaces (id, kind, name, billing_account_id) values ($1,'personal','Seed',$2) on conflict do nothing`,
    [WS, BILL],
  );
  await db.query(
    `insert into "user" (id, email, name) values ($1,'seed@example.com','Seed User') on conflict do nothing`,
    [USER],
  );
  await db.query(
    `insert into subscriptions (id, billing_account_id, tier, status) values ('sub_seed',$1,'writer','active') on conflict do nothing`,
    [BILL],
  );

  for (const p of PROJECTS) {
    await db.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id, protocol_version, rigor_default)
       values ($1,$2,$3,$4,$5,'essay',1,'full_board') on conflict do nothing`,
      [p.id, WS, USER, p.title, p.slug],
    );
    // two draft versions (multi-round history): v1 frozen, v2 working.
    await db.query(
      `insert into artifacts (id, workspace_id, project_id, kind, namespace, mirror_path)
       values ($1,$2,$3,'draft','shared','drafts/v1.md') on conflict do nothing`,
      [`${p.id}_art1`, WS, p.id],
    );
    await db.query(
      `insert into artifact_versions (id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, immutable)
       values ($1,$2,1,$3,$4,4200,'text/markdown','{"kind":"system"}'::jsonb,true) on conflict do nothing`,
      [`${p.id}_av1`, `${p.id}_art1`, "a".repeat(64), `tenants/${WS}/objects/${"a".repeat(64)}`],
    );
    await db.query(
      `insert into drafts (id, project_id, n, origin, state, promoted_version_id)
       values ($1,$2,1,'imported','frozen',$3) on conflict do nothing`,
      [`${p.id}_d1`, p.id, `${p.id}_av1`],
    );
    await db.query(
      `insert into drafts (id, project_id, n, origin, state) values ($1,$2,2,'human_revision','working') on conflict do nothing`,
      [`${p.id}_d2`, p.id],
    );
  }

  await seedPoliticsOfVisibility(db);
  await seedStructureOfDifference(db);
  await seedConstitutionOfReason(db);
}

/** A review correspondence with one finding whose obligation is SPAWNED then ADDRESSED. */
async function seedPoliticsOfVisibility(db: MigrationDb): Promise<void> {
  const P = "proj_pv";
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids, protocol_id, protocol_version)
     values ('corr_pv1',$1,'review',$2,'run_pv1', now(), '{}','essay',1) on conflict do nothing`,
    [P, `${P}_d1`],
  );
  await db.query(
    `insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
     values ('find_pv1','corr_pv1',$1,1,'argument','major','both',
       'The injury is the thesis and it is the least-evidenced thing in the piece',
       'Anticipatory chilling is under-evidenced and Posner''s counterargument goes unanswered.') on conflict do nothing`,
    [`${P}_d1`],
  );
  // SPAWN: a major finding spawns one obligation at delivery (open).
  await db.query(
    `insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title, state, opened_on_draft_id, created_by)
     values ('obl_pv1',$1,'finding','find_pv1','major','argument',
       'Answer the Posner counterargument','open',$2,'{"kind":"system"}'::jsonb) on conflict do nothing`,
    [P, `${P}_d1`],
  );
  await db.query(
    `insert into obligation_findings (obligation_id, finding_id, correspondence_id, relation)
     values ('obl_pv1','find_pv1','corr_pv1','root') on conflict do nothing`,
  );
  // ADDRESS: an accept/adapt move records status done/verified.
  await db.query(
    `insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor, run_id, finding_id)
     values ('tr_pv1','obl_pv1','open','addressed','adapt_move','{"kind":"user","userId":"user_seed"}'::jsonb,'run_pv2','find_pv1')`,
  );
}

/** An obligation DEFERRED with a horizon, and CARRIED onto a second round's finding. */
async function seedStructureOfDifference(db: MigrationDb): Promise<void> {
  const P = "proj_sd";
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids, protocol_id, protocol_version)
     values ('corr_sd1',$1,'review',$2,'run_sd1', 1, now(), '{}','essay',1),
            ('corr_sd2',$1,'review',$2,'run_sd2', 2, now(), '{}','essay',1) on conflict do nothing`,
    [P, `${P}_d1`],
  );
  await db.query(
    `insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body) values
       ('find_sd1','corr_sd1',$1,1,'claim','blocking','editor','Trump ''market-leaning'' is misleading in context','Escalated to Tier 1 given the tariff program.'),
       ('find_sd2','corr_sd2',$1,1,'claim','major','editor','Currency characterization still misleading','Recurs in round two.') on conflict do nothing`,
    [`${P}_d1`],
  );
  await db.query(
    `insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title, state, opened_on_draft_id, rounds_open, created_by)
     values ('obl_sd1',$1,'finding','find_sd1','blocking','claim','Fix the misleading political characterizations','open',$2,1,'{"kind":"system"}'::jsonb) on conflict do nothing`,
    [P, `${P}_d1`],
  );
  await db.query(
    `insert into obligation_findings (obligation_id, finding_id, correspondence_id, relation) values
       ('obl_sd1','find_sd1','corr_sd1','root'),
       ('obl_sd1','find_sd2','corr_sd2','carried') on conflict do nothing`,
  );
  // DEFER: set the rationale (non-state update, allowed) then transition to deferred with a horizon.
  await db.query(
    `update revision_obligations set rationale=$1, defer_horizon='{"until":"next_review"}'::jsonb where id='obl_sd1'`,
    ["Not this round — needs a source sweep first."],
  );
  await db.query(
    `insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor)
     values ('tr_sd1','obl_sd1','open','deferred','defer','{"kind":"user","userId":"user_seed"}'::jsonb)`,
  );
}

/** An obligation REBUTTED with a mandatory rationale on file. */
async function seedConstitutionOfReason(db: MigrationDb): Promise<void> {
  const P = "proj_cr";
  await db.query(
    `insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids, protocol_id, protocol_version)
     values ('corr_cr1',$1,'review',$2,'run_cr1', now(), '{}','essay',1) on conflict do nothing`,
    [P, `${P}_d1`],
  );
  await db.query(
    `insert into findings (id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
     values ('find_cr1','corr_cr1',$1,1,'discourse','major','editor','Kaesberg gloss overreaches','The claim goes beyond what the study licenses.') on conflict do nothing`,
    [`${P}_d1`],
  );
  await db.query(
    `insert into revision_obligations (id, project_id, source, finding_id, severity, kind, title, state, opened_on_draft_id, rationale, created_by)
     values ('obl_cr1',$1,'finding','find_cr1','major','discourse','Narrow or defend the Kaesberg gloss','open',$2,$3,'{"kind":"system"}'::jsonb) on conflict do nothing`,
    [P, `${P}_d1`, "The gloss is defensible: the study's own discussion generalizes it."],
  );
  await db.query(
    `insert into obligation_findings (obligation_id, finding_id, correspondence_id, relation)
     values ('obl_cr1','find_cr1','corr_cr1','root') on conflict do nothing`,
  );
  // REBUT: closed with an argument on file (rationale already set; DB check enforces it).
  await db.query(
    `insert into obligation_transitions (id, obligation_id, from_state, to_state, cause, by_actor, disposition_id)
     values ('tr_cr1','obl_cr1','open','rebutted','rebut_disposition','{"kind":"user","userId":"user_seed"}'::jsonb,'disp_cr1')`,
  );
}
