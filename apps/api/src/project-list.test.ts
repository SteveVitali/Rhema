import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { projectState } from "@rhema/orchestrator";
import { seedRealProjects } from "@rhema/db";
import { listProjectStates } from "./project-list.js";
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
