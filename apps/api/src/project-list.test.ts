import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { projectState } from "@rhema/orchestrator";
import { seedRealProjects } from "@rhema/db";
import {
  listProjectStates,
  projectGroupKey,
  buildStatusLine,
  clampStatusLine,
} from "./project-list.js";
import type { SqlClient } from "./invite.js";
import type { Principal } from "./run-routes.js";

// AC2 (REQ-PROD-9 / REQ-SPEC-3). Each list row's pill + primary action is DERIVED from the §6.3 state
// function over the project's real rows — there is no stored status column. Deterministic on PGlite over the
// three-real-project seed, plus synthetic projects that exercise other states.

let db: OrchestratorTestDb;
let sql: SqlClient;
const principal: Principal = {
  userId: "user_seed",
  workspaceId: "ws_seed",
  billingAccountId: "bill_seed",
};

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  await seedRealProjects({
    exec: (s) => db.pg.exec(s),
    query: (s, p) => db.pg.query(s, p as unknown[]) as Promise<{ rows: unknown[] }>,
  });
});
afterEach(() => db.close());

describe("listProjectStates — REQ-PROD-9 / REQ-SPEC-3", () => {
  it("returns the workspace's projects with a §6.3-derived state (never a stored status)", async () => {
    const rows = await listProjectStates(sql, principal);
    expect(rows.map((r) => r.id).sort()).toEqual(["proj_cr", "proj_pv", "proj_sd"]);
    // Each seeded project has v1 (imported, reviewed) + v2 (human_revision) → the review of v1 is orphaned by
    // the human edit → `edited_by_you` / "Revise using your edits" (§6.3).
    for (const r of rows) {
      expect(r.state.key).toBe("edited_by_you");
      expect(r.state.pill).toBe("Edited by you");
      expect(r.state.suggested).toEqual({ action: "revise_using_edits", label: "Revise using your edits" });
    }
  });

  it("the projects table stores no status/state column (REQ-SPEC-3)", async () => {
    const cols = (
      await db.pg.query(
        "select column_name from information_schema.columns where table_name='projects'",
      )
    ).rows as { column_name: string }[];
    const names = new Set(cols.map((c) => c.column_name));
    expect(names.has("status")).toBe(false);
    expect(names.has("state")).toBe(false);
  });

  it("derives varied states from the data (draft → Review; reviewed → Read the Editor's letter)", async () => {
    // a fresh imported draft with no review → Draft / Review
    await db.pg.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id) values ('proj_new','ws_seed','user_seed','New','new','essay')`,
    );
    await db.pg.query(
      `insert into drafts (id, project_id, n, origin, state) values ('proj_new_d1','proj_new',1,'imported','working')`,
    );
    // a reviewed single-version draft → Reviewed / Read the Editor's letter
    await db.pg.query(
      `insert into projects (id, workspace_id, owner_id, title, slug, protocol_id) values ('proj_rev','ws_seed','user_seed','Rev','rev','essay')`,
    );
    await db.pg.query(
      `insert into drafts (id, project_id, n, origin, state) values ('proj_rev_d1','proj_rev',1,'imported','working')`,
    );
    await db.pg.query(
      `insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids, protocol_id, protocol_version)
         values ('corr_rev','proj_rev','review','proj_rev_d1','run_rev', now(), '{}','essay',1)`,
    );

    const rows = await listProjectStates(sql, principal);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("proj_new")!.state.key).toBe("draft");
    expect(byId.get("proj_new")!.state.suggested.action).toBe("review");
    expect(byId.get("proj_rev")!.state.key).toBe("reviewed");
    expect(byId.get("proj_rev")!.state.suggested.action).toBe("read_letter");
  });

  it("row state equals projectState() of the same project's assembled inputs (no divergence)", async () => {
    const rows = await listProjectStates(sql, principal);
    // Reconstruct pv's inputs independently and confirm the row matches the pure function exactly.
    const pv = rows.find((r) => r.id === "proj_pv")!;
    const recomputed = projectState({
      outlinePresent: false,
      versions: [
        { n: 1, origin: "imported" },
        { n: 2, origin: "human_revision" },
      ],
      reviews: [{ draftN: 1 }],
      responses: [],
      runs: [],
      acceptedVersionN: null,
      exports: [],
      archivedAt: null,
    });
    expect(pv.state).toEqual(recomputed);
  });

  it("scopes to the principal's workspace (no cross-tenant leak)", async () => {
    const other = await listProjectStates(sql, { ...principal, workspaceId: "ws_other" });
    expect(other).toEqual([]);
  });
});

// ---- P1.04 — the §5.2 attention groups + status lines (derived per row, never persisted) ----

describe("projectGroupKey — the §5.2 attention group (REQ-IDE-3/6 amended)", () => {
  const st = (key: string, overlay: "running" | "needs_you" | null = null) =>
    ({ key, overlay }) as never;
  it("needs_you and running overlays win; an unopened review lands ready_to_read; opened clears to quiet", () => {
    expect(projectGroupKey({ state: st("draft", "needs_you"), letterOpened: false })).toBe("needs_you");
    expect(projectGroupKey({ state: st("draft", "running"), letterOpened: false })).toBe("running");
    expect(projectGroupKey({ state: st("reviewed"), letterOpened: false })).toBe("ready_to_read");
    // §5.2 — Ready to read clears when the deliverable is opened.
    expect(projectGroupKey({ state: st("reviewed"), letterOpened: true })).toBe("quiet");
    expect(projectGroupKey({ state: st("accepted"), letterOpened: false })).toBe("quiet");
  });
});

describe("buildStatusLine / clampStatusLine — the ≤120-char row line", () => {
  const base = {
    state: { pill: "Draft" } as never,
    headDraftN: 3 as number | null,
    activeRun: null,
    stepsDone: null,
    stepsTotal: null,
    waitingGateKind: null,
    needsYouDeadlineAt: null,
    latestReviewFindings: null,
    latestReviewMajors: null,
    lastRunFailed: false,
  };
  it("needs_you names the gate + deadline; running carries workflow/state/steps/credits; ready counts findings", () => {
    expect(
      buildStatusLine({ ...base, group: "needs_you", waitingGateKind: "approve_triage", needsYouDeadlineAt: "2026-10-01T00:00:00.000Z" }),
    ).toBe("Approve triage · due 2026-10-01");
    expect(
      buildStatusLine({
        ...base,
        group: "running",
        activeRun: { state: "running", workflow: "review", spentCredits: 12, capCredits: 40 },
        stepsDone: 2,
        stepsTotal: 5,
      }),
    ).toBe("Review of v3 · running · 2/5 steps · 12 / 40 cr");
    expect(
      buildStatusLine({ ...base, group: "ready_to_read", latestReviewFindings: 12, latestReviewMajors: 3 }),
    ).toBe("Review of v3 ready · 12 findings, 3 major");
    expect(buildStatusLine({ ...base, group: "quiet" })).toBe("Draft · v3");
    expect(buildStatusLine({ ...base, group: "quiet", lastRunFailed: true })).toBe("Draft · v3 · last run failed");
  });
  it("clamps at 120 chars", () => {
    const long = buildStatusLine({
      ...base,
      group: "needs_you",
      waitingGateKind: "x".repeat(200),
    });
    expect(long.length).toBeLessThanOrEqual(120);
    expect(clampStatusLine("y".repeat(200)).length).toBe(120);
  });
});

describe("listProjectStates — P1.04 row facts", () => {
  it("a waiting-gate project groups needs_you with the soonest deadline + gate kind on the line", async () => {
    await seedProject(db, { projectId: "prj_gate", draftN: 1 });
    await db.pg.query(
      `insert into runs (id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier, rigor, estimate_credits, cap_credits, rate_table_version)
         values ('run_gate','ws_seed','prj_gate','review','waiting_gate','{}','balanced','balanced','standard',10,40,1)`,
    );
    await db.pg.query(
      `insert into gates (id, run_id, kind, blocking, on_expiry, opened_at, deadline_at)
         values ('gate_1','run_gate','approve_triage', true, 'auto', now(), '2026-10-05T00:00:00Z')`,
    );
    const row = (await listProjectStates(sql, principal)).find((r) => r.id === "prj_gate")!;
    expect(row.group).toBe("needs_you");
    expect(row.state.overlay).toBe("needs_you");
    expect(row.needsYouDeadlineAt).toBe("2026-10-05T00:00:00.000Z");
    expect(row.statusLine).toBe("Approve triage · due 2026-10-05");
    expect(row.statusLine.length).toBeLessThanOrEqual(120);
  });

  it("a running project groups running with step progress; a delivered-unopened letter groups ready_to_read", async () => {
    await seedProject(db, { projectId: "prj_run", draftN: 1 });
    await db.pg.query(
      `insert into runs (id, workspace_id, project_id, workflow, state, inputs, model_profile, model_tier, rigor, estimate_credits, cap_credits, spent_credits, rate_table_version)
         values ('run_live','ws_seed','prj_run','review','running','{}','balanced','balanced','standard',10,40,12,1)`,
    );
    await db.pg.query(
      `insert into steps (id, run_id, phase, ordinal, state) values
         ('st1','run_live','read',1,'done'), ('st2','run_live','read',2,'running')`,
    );
    await seedProject(db, { projectId: "prj_let", draftN: 1 });
    const letterDraft = (await db.pg.query(`select id from drafts where project_id='prj_let'`)).rows[0] as { id: string };
    await db.pg.query(
      `insert into correspondence_items (id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids, protocol_id, protocol_version)
         values ('corr_let','prj_let','review',$1,'run_let', now(), '{}','essay',1)`,
      [letterDraft.id],
    );
    const rows = await listProjectStates(sql, principal);
    const run = rows.find((r) => r.id === "prj_run")!;
    expect(run.group).toBe("running");
    expect(run.activeRun).toMatchObject({ runId: "run_live", state: "running", workflow: "review" });
    expect(run.statusLine).toContain("running");
    expect(run.statusLine).toContain("1/2 steps");
    const letter = rows.find((r) => r.id === "prj_let")!;
    expect(letter.group).toBe("ready_to_read");
    expect(letter.letterOpened).toBe(false);
    // §5.2 — Ready to read clears when the deliverable is opened (letter_opened_at, migration 0029).
    await db.pg.query(`update correspondence_items set letter_opened_at = now() where id='corr_let'`);
    const after = (await listProjectStates(sql, principal)).find((r) => r.id === "prj_let")!;
    expect(after.letterOpened).toBe(true);
    expect(after.group).toBe("quiet");
  });

  it("archived rows carry archivedAt + derived 'archived'; deleted rows leave the read entirely", async () => {
    await db.pg.query(`update projects set archived_at = now() where id = 'proj_pv'`);
    await db.pg.query(`update projects set deleted_at = now() where id = 'proj_sd'`);
    const rows = await listProjectStates(sql, principal);
    expect(rows.map((r) => r.id).sort()).toEqual(["proj_cr", "proj_pv"]);
    const pv = rows.find((r) => r.id === "proj_pv")!;
    expect(pv.archivedAt).not.toBeNull();
    expect(pv.state.key).toBe("archived");
    expect(pv.group).toBe("quiet");
  });
});
