import { describe, expect, it } from "vitest";
import { createTestDb } from "../testing/pglite.js";
import {
  applySuggestionToMarkdown,
  resolveAnchor,
  splitMarkdownBlocks,
} from "@rhema/findings-core";
import {
  seedShowcaseProject,
  seedWritableDossier,
  seedDeliveredRunReport,
  seedOpenApprovalGate,
  SHOWCASE_FIXTURE_CLAIMS,
  SHOWCASE_FIXTURE_FINDINGS,
  SHOWCASE_FIXTURE_V2_MD,
  type ShowcaseSeedDeps,
} from "./showcase.js";
import { SHOWCASE_SLUG, SHOWCASE_TITLE, findingEvidenceSchema } from "@rhema/contracts";

// P1.17 (§15.4; REQ-POS-3; REQ-GROWTH-2) — the deterministic Showcase dossier seed: one read-only
// worked-example project per workspace, seeded at $0, shaped like a real delivered dossier (outline →
// frozen v1 → working v2 → letter + response + the claim ledger + findings + obligations + fetch log).
// The essay content is a labeled fixture (D-P1.17-1 — the real walkthrough essay is an H5 decision).

let idCounter = 0;
const ids = () => () => `id_${(idCounter++).toString().padStart(4, "0")}`; // process-unique: ids span workspaces
const clock = { now: () => new Date("2026-10-01T00:00:00Z") };

async function ownerAndWorkspace(db: Awaited<ReturnType<typeof createTestDb>>) {
  await db.query(`insert into billing_accounts (id) values ('ba_sx')`);
  await db.query(`insert into "user" (id, email) values ('usr_sx', 'sx@test.dev')`);
  await db.query(`insert into workspaces (id, billing_account_id, kind, name) values ('ws_sx','ba_sx','personal','SX')`);
  await db.query(
    `insert into workspace_members (workspace_id, user_id, role) values ('ws_sx','usr_sx','admin')`,
  );
  return { workspaceId: "ws_sx", ownerId: "usr_sx" };
}

function depsFor(workspaceId: string, ownerId: string): ShowcaseSeedDeps {
  return { workspaceId, ownerId, ids: ids(), clock };
}

describe("the Showcase dossier seed (§15.4)", () => {
  it("seeds one showcase project per workspace — deterministic, $0, read-only-shaped", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);

    const r = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    expect(r.slug).toBe(SHOWCASE_SLUG);
    expect(r.firstFindingId).toBeTruthy();
    expect(r.reviewRunId).toBeTruthy();

    const p = (
      await db.query(`select title, showcase, protocol_id from projects where id = $1`, [r.projectId])
    ).rows[0] as { title: string; showcase: boolean; protocol_id: string };
    expect(p).toEqual({ title: SHOWCASE_TITLE, showcase: true, protocol_id: "essay" });

    // $0: the frozen dossier's run is precomputed — no spend ledger rows, a completed run row only.
    const run = (
      await db.query(`select state, workflow, spent_credits, estimate_credits from runs where id = $1`, [
        r.reviewRunId,
      ])
    ).rows[0] as { state: string; workflow: string; spent_credits: number; estimate_credits: number };
    expect(run.state).toBe("completed");
    expect(run.workflow).toBe("review");
    expect(run.spent_credits).toBeGreaterThan(0); // the dossier shows what it WOULD have cost
    const usage = (await db.query(`select count(*)::int n from usage_records`)).rows[0] as { n: number };
    const ledger = (await db.query(`select count(*)::int n from credit_ledger`)).rows[0] as { n: number };
    expect(usage.n).toBe(0); // no billing rows — the fixture spends nothing
    expect(ledger.n).toBe(0);

    // the dossier's shape: 7 committed phases, letter + response correspondence, claims + findings.
    const phases = (
      await db.query(`select count(*)::int n from steps where run_id = $1 and state = 'done'`, [
        r.reviewRunId,
      ])
    ).rows[0] as { n: number };
    expect(phases.n).toBe(7);
    const corr = (
      await db.query(
        `select kind, ordinal from correspondence_items where project_id = $1 order by kind`,
        [r.projectId],
      )
    ).rows as { kind: string }[];
    expect(corr.map((x) => x.kind).sort()).toEqual(["response", "review"]);
    const claims = (
      await db.query(`select count(*)::int n from claims where correspondence_id = $1`, [r.reviewCorrId])
    ).rows[0] as { n: number };
    expect(claims.n).toBe(SHOWCASE_FIXTURE_CLAIMS.length);

    // REQ-POS-3 — the anchored proof: ≥1 contradicted tier-1 claim whose source URL was fetched.
    const proof = (
      await db.query(
        `select c.id, cs.url, fl.status as fetch_status
           from claims c
           join claim_sources cs on cs.claim_id = c.id
           join fetch_log fl on fl.url = cs.url and fl.run_id = $2
          where c.correspondence_id = $1 and c.tier = 1 and c.verdict = 'contradicted'`,
        [r.reviewCorrId, r.reviewRunId],
      )
    ).rows as { id: string; url: string; fetch_status: number }[];
    expect(proof.length).toBeGreaterThanOrEqual(1);
    expect(proof[0]!.fetch_status).toBe(200);

    // the finding-1 anchor the /app redirect deep-links to.
    const f0 = (
      await db.query(`select severity, kind from findings where id = $1`, [r.firstFindingId])
    ).rows[0] as { severity: string; kind: string };
    expect(f0).toBeTruthy();

    // HOT.1 — the seed writes the CANONICAL evidence shape: every findings row's evidence parses
    // against findingEvidenceSchema (urls always present; no legacy [{claim, source}] arrays).
    const evRows = (
      await db.query(`select evidence from findings where correspondence_id = $1 and evidence is not null`, [
        r.reviewCorrId,
      ])
    ).rows as { evidence: unknown }[];
    expect(evRows.length).toBeGreaterThan(0);
    for (const row of evRows) {
      expect(findingEvidenceSchema.safeParse(row.evidence).success).toBe(true);
    }

    await db.close();
  });

  it("is idempotent — a second seed returns the same ids and writes nothing", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);

    const a = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    const b = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    expect(b).toEqual(a);
    const n = (
      await db.query(`select count(*)::int n from projects where workspace_id = $1 and showcase`, [
        workspaceId,
      ])
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
    await db.close();
  });

  it("two workspaces each get their own Showcase; a taken slug deconflicts deterministically", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);
    // a user project squatting on the slug first
    await db.query(
      `insert into projects (id, workspace_id, owner_id, title, slug) values ('prj_user','ws_sx','usr_sx','Mine','showcase')`,
    );
    const r = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    expect(r.slug).toBe("showcase-2");

    // a second workspace seeds cleanly with the base slug.
    await db.query(`insert into billing_accounts (id) values ('ba_sx2')`);
    await db.query(`insert into "user" (id, email) values ('usr_sx2', 'sx2@test.dev')`);
    await db.query(`insert into workspaces (id, billing_account_id, kind, name) values ('ws_sx2','ba_sx2','personal','SX2')`);
    const r2 = await seedShowcaseProject(db, depsFor("ws_sx2", "usr_sx2"));
    expect(r2.slug).toBe(SHOWCASE_SLUG);
    expect(r2.projectId).not.toBe(r.projectId);
    await db.close();
  });

  // SPA.21 (REQ-VFY-10) — the seeded WRITABLE dossier the journeys' T12F/T13F free mutation legs
  // walk: the same fixture dossier on a NORMAL project (showcase=false ⇒ the api's
  // showcaseReadOnlyGuard accepts its finding writes), idempotent on its slug base, coexisting with
  // the workspace's read-only Showcase.
  it("the writable journey dossier seeds showcase=false, coexists with the Showcase, and is slug-idempotent", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);

    const sx = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    const w = await seedWritableDossier(db, {
      ...depsFor(workspaceId, ownerId),
      slugBase: "jrn-dossier",
      title: "JRN-seed dossier",
      seedLabel: "journey-dossier-seed",
    });
    expect(w.slug).toBe("jrn-dossier");
    expect(w.projectId).not.toBe(sx.projectId);
    expect(w.reviewRunId).toBeTruthy();

    const p = (
      await db.query(`select title, showcase from projects where id = $1`, [w.projectId])
    ).rows[0] as { title: string; showcase: boolean };
    expect(p).toEqual({ title: "JRN-seed dossier", showcase: false });

    // the writable dossier carries the full fixture substrate — findings incl. the
    // suggestion-bearing anchor (the T13F Apply leg's arm) + the triage ledger rows.
    const findings = (
      await db.query(
        `select count(*)::int n,
                count(*) filter (where suggestion is not null and suggestion ? 'replacement'
                                  and anchor is not null)::int sug
           from findings where correspondence_id = $1`,
        [w.reviewCorrId],
      )
    ).rows[0] as { n: number; sug: number };
    expect(findings.n).toBeGreaterThan(0);
    expect(findings.sug).toBeGreaterThanOrEqual(1);
    // the frozen_by audit blob names the journey seed, never "showcase-seed".
    const fb = (
      await db.query(
        `select frozen_by->>'label' as label from drafts where project_id = $1 and frozen_by is not null limit 1`,
        [w.projectId],
      )
    ).rows[0] as { label: string } | undefined;
    expect(fb?.label).toBe("journey-dossier-seed");

    // slug-idempotent: a second call returns the same ids and writes no second project.
    const w2 = await seedWritableDossier(db, {
      ...depsFor(workspaceId, ownerId),
      slugBase: "jrn-dossier",
      title: "JRN-seed dossier",
      seedLabel: "journey-dossier-seed",
    });
    expect(w2).toEqual(w);
    const n = (
      await db.query(
        `select count(*)::int n from projects where workspace_id = $1 and slug like 'jrn-dossier%'`,
        [workspaceId],
      )
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
    // …and the Showcase stays exactly one row — the writable seed never touches it.
    const sxN = (
      await db.query(`select count(*)::int n from projects where workspace_id = $1 and showcase`, [
        workspaceId,
      ])
    ).rows[0] as { n: number };
    expect(sxN.n).toBe(1);
    await db.close();
  });

  // SPA.22 (REQ-VFY-10) — the seeded DELIVERED run report the journeys' R6F free render leg
  // walks: the dossier fixture plus the ledger/metered facts the report reads — a grant+debit
  // credit_ledger pair (net 0), `step:<phase>`-keyed proxy usage_records (the metered total —
  // 4110 cr > the 3860 cr charged so the differences block reasons), and `usage.tick` run
  // events. Slug-idempotent; the workspace's Showcase stays untouched.
  it("the delivered run report seeds metered+ledger facts at $0 and is slug-idempotent", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);

    const sx = await seedShowcaseProject(db, depsFor(workspaceId, ownerId));
    const r = await seedDeliveredRunReport(db, {
      ...depsFor(workspaceId, ownerId),
      slugBase: "jrn-report",
      title: "JRN-seed run report",
      seedLabel: "journey-report-seed",
    });
    expect(r.slug).toBe("jrn-report");
    expect(r.projectId).not.toBe(sx.projectId);
    expect(r.reviewRunId).toBeTruthy();

    // the run reads delivered.
    const run = (
      await db.query(`select state, spent_credits, cap_credits from runs where id = $1`, [r.reviewRunId])
    ).rows[0] as { state: string; spent_credits: number; cap_credits: number };
    expect(run.state).toBe("completed");
    expect(run.spent_credits).toBe(3860);
    expect(run.cap_credits).toBeGreaterThanOrEqual(3860); // the cap trigger admits the seeded debit

    // the ledger pair: one grant (the seeded top-up the journey user never actually paid) + one
    // run-scoped debit for 3860 cr — `kind` carries the sign, `credits` stays positive, Σ nets 0.
    const ledger = (
      await db.query(
        `select kind, credits, run_id, source from credit_ledger order by kind`,
      )
    ).rows as { kind: string; credits: number; run_id: string | null; source: string }[];
    expect(ledger).toEqual([
      { kind: "debit", credits: 3860, run_id: r.reviewRunId, source: "run" },
      { kind: "grant", credits: 3860, run_id: null, source: "seed" },
    ]);

    // the metered facts: 5 `step:<phase>`-keyed proxy rows (verification dominates →
    // fact_check_dominated fires; second_read rides `balanced` vs the run's `frontier` tier →
    // second_read_model fires) summing to the run's metered 4110 cr > the 3860 cr charged.
    const usage = (
      await db.query(
        `select step_id, role, credits, model_tier, source, provider from usage_records where run_id = $1 order by credits desc`,
        [r.reviewRunId],
      )
    ).rows as {
      step_id: string;
      role: string;
      credits: number;
      model_tier: string;
      source: string;
      provider: string;
    }[];
    expect(usage.length).toBe(5);
    expect(usage.reduce((a, u) => a + u.credits, 0)).toBe(4110);
    expect(usage.every((u) => u.source === "proxy" && u.provider === "anthropic")).toBe(true);
    expect(usage.map((u) => u.step_id).sort()).toEqual(
      ["step:craft", "step:discourse", "step:letter", "step:second_read", "step:verification"].sort(),
    );
    expect(usage[0]).toMatchObject({ step_id: "step:verification", role: "verifier", credits: 2200 });
    expect(
      usage.find((u) => u.step_id === "step:second_read"),
    ).toMatchObject({ role: "editor", model_tier: "balanced" });

    // slug-idempotent: a second call returns the same ids and writes no second project / rows.
    const r2 = await seedDeliveredRunReport(db, {
      ...depsFor(workspaceId, ownerId),
      slugBase: "jrn-report",
      title: "JRN-seed run report",
      seedLabel: "journey-report-seed",
    });
    expect(r2).toEqual(r);
    const rows = (
      await db.query(
        `select
           (select count(*)::int from projects where workspace_id = $1 and slug like 'jrn-report%') p,
           (select count(*)::int from usage_records) u,
           (select count(*)::int from credit_ledger) l`,
        [workspaceId],
      )
    ).rows[0] as { p: number; u: number; l: number };
    expect(rows).toEqual({ p: 1, u: 5, l: 2 });
    // …and the Showcase stays exactly one row — the report seed never touches it.
    const sxN = (
      await db.query(`select count(*)::int n from projects where workspace_id = $1 and showcase`, [
        workspaceId,
      ])
    ).rows[0] as { n: number };
    expect(sxN.n).toBe(1);
    await db.close();
  });

  // FIX.1 (REQ-FIX-T13F) — the Apply substrate pin: the fixture's suggestion-bearing finding
  // carries a canonical `{replacement}` + an anchor that resolves EXACT against the V2 working
  // head (the api splices `suggestion.replacement` at the resolved span verbatim — a drift between
  // the quote/offsets and the V2 text strands T13F's Apply leg on `anchor_lost`).
  it("the Apply arm's anchor resolves exact against the V2 working head and the splice lands", () => {
    const f = SHOWCASE_FIXTURE_FINDINGS[0] as {
      readonly anchor?: Parameters<typeof resolveAnchor>[0];
      readonly suggestion?: { readonly replacement?: string };
    };
    const blocks = splitMarkdownBlocks(SHOWCASE_FIXTURE_V2_MD);
    const res = resolveAnchor(f.anchor, blocks);
    expect(res.method).toBe("exact");
    expect(res.blockId).toBe("b7");
    const splice = applySuggestionToMarkdown(
      SHOWCASE_FIXTURE_V2_MD,
      f.anchor,
      f.suggestion?.replacement ?? "",
    );
    expect(splice.ok).toBe(true);
    if (splice.ok) expect(splice.markdown).toContain(f.suggestion?.replacement ?? "");
  });

  // FIX.1 (REQ-FIX-T15) — the seeded open `approve_triage` gate: `waiting_gate` run + unresolved,
  // unheld, blocking gate row — the four predicates the Inbox's group-1a query AND the gate list's
  // `(blocking or waiting_gate)` read both key on. Idempotent on an already-parked run.
  it("the open-gate seed parks the review run at an unresolved blocking approve_triage gate", async () => {
    const db = await createTestDb();
    const { workspaceId, ownerId } = await ownerAndWorkspace(db);
    const w = await seedWritableDossier(db, {
      ...depsFor(workspaceId, ownerId),
      slugBase: "jrn-gate",
      title: "JRN gated dossier",
      seedLabel: "journey-gate-seed",
    });
    const g = await seedOpenApprovalGate(db, depsFor(workspaceId, ownerId), { runId: w.reviewRunId });
    const run = (
      await db.query(`select state from runs where id = $1`, [w.reviewRunId])
    ).rows[0] as { state: string };
    expect(run.state).toBe("waiting_gate");
    const gate = (
      await db.query(
        `select kind, blocking, held, resolved_at, on_expiry, deadline_at from gates where id = $1`,
        [g.gateId],
      )
    ).rows[0] as {
      kind: string;
      blocking: boolean;
      held: boolean;
      resolved_at: string | null;
      on_expiry: string;
      deadline_at: string | null;
    };
    expect(gate).toEqual({
      kind: "approve_triage",
      blocking: true,
      held: false,
      resolved_at: null,
      on_expiry: "wait",
      deadline_at: null,
    });
    // idempotent — a second call returns the same gate, writes no second row.
    const g2 = await seedOpenApprovalGate(db, depsFor(workspaceId, ownerId), { runId: w.reviewRunId });
    expect(g2).toEqual(g);
    const n = (
      await db.query(`select count(*)::int n from gates where run_id = $1`, [w.reviewRunId])
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
    await db.close();
  });
});
