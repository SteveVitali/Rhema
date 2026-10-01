import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.06 — `GET /projects/:id/run-sheet-context` (§5.6; REQ-IDE-13): the sheet's ONE context read. The
// decisive behavior is `blockedBy` — under the P1.06 concurrency ruling (ledger G22) the sheet blocks
// ONLY when its workflow+scope's lock set collides with a non-terminal run's exclusive keys: a scoped
// reader does NOT gate a differently-scoped reader; an identical scope does; a writer gates everything.

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const ctx = (query = "") =>
  app.request(`/projects/${seed.projectId}/run-sheet-context${query}`).then(async (r) => ({
    status: r.status,
    body: (await r.json()) as {
      headDraft?: { id: string; n: number; state: string } | null;
      dontAskUnder?: number;
      blockedBy?: { runId: string; state: string } | null;
      project?: { approvalPolicy?: string };
    },
  }));

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, contentStore: new InMemoryContentStore() });
});
afterEach(() => db.close());

describe("GET /projects/:id/run-sheet-context (P1.06; §5.6)", () => {
  it("returns the head draft + project facts with blockedBy null when nothing runs", async () => {
    const { status, body } = await ctx("?workflow=review");
    expect(status).toBe(200);
    expect(body.headDraft).toMatchObject({ id: seed.draftId, n: 1, state: "working" });
    expect(body.blockedBy).toBeNull();
    expect(body.dontAskUnder).toBe(0);
  });

  it("404s a project outside the workspace", async () => {
    const res = await app.request(`/projects/prj_other/run-sheet-context?workflow=review`);
    expect(res.status).toBe(404);
  });

  it("a scoped reader does NOT block a differently-scoped reader's sheet (G22)", async () => {
    await seedRun(db, {
      runId: "run_scoped_a",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      lockSet: [`draft:read:${seed.draftId}`, `corr:${seed.draftId}:review:1:section:III`],
    });
    const { body } = await ctx("?workflow=review&scope=section:IV");
    expect(body.blockedBy).toBeNull();
  });

  it("an identical scope collides — the sheet renders the in-progress state", async () => {
    await seedRun(db, {
      runId: "run_scoped_same",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      lockSet: [`draft:read:${seed.draftId}`, `corr:${seed.draftId}:review:1:section:III`],
    });
    const { body } = await ctx("?workflow=review&scope=section:III");
    expect(body.blockedBy).toEqual({ runId: "run_scoped_same", state: "running" });
  });

  it("a writer run blocks any sheet (ns:write is exclusive, scope-free)", async () => {
    await seedRun(db, {
      runId: "run_writer",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "revise",
      state: "running",
      lockSet: [`ns:write:agent:author:${seed.projectId}`, "draft:write:dft_next"],
    });
    // a reader sheet's keys (draft:read + corr) share nothing with the writer's — readers run beside
    // writers under §12.4 (the writer's draft:read is the shared kind).
    const { body } = await ctx("?workflow=review&scope=section:III");
    expect(body.blockedBy).toBeNull();
    // a writer sheet collides on the exclusive ns:write key — writers stay exclusive.
    const revise = await ctx("?workflow=revise&scope=section:III");
    expect(revise.body.blockedBy).toEqual({ runId: "run_writer", state: "running" });
  });
});
