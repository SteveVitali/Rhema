// P1.05 — the Timeline / run-report / steering routes (§5.5/§6.5/§14.5): the round-log read (grouping,
// next-step card, lazy walkthrough enqueue), the Level-3 report + Level-4 drill-down privacy boundary,
// and the five steering endpoints' status codes — all over real migrations via PGlite.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { RUN_JOBS } from "@rhema/orchestrator";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

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

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store: new InMemoryContentStore() });
});
afterEach(() => db.close());

const seedDoneSteps = (runId: string) =>
  db.txRunner.run(seed.workspaceId, async (tx) => {
    for (const [i, phase] of ["reading_the_piece", "checking_claims", "editors_letter"].entries()) {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ($1,$2,$3,$4,'done',100,1,now(),now()+interval '1 minute')`,
        [`st_${runId}_${phase}`, runId, phase, i + 1],
      );
    }
  });

describe("GET /projects/:id/timeline (§5.5)", () => {
  it("401s unauthenticated; 404s a missing project", async () => {
    const anon = createApp({ ...deps, principal: () => null, db: sql });
    expect((await anon.request(`/projects/${seed.projectId}/timeline`)).status).toBe(401);
    expect((await app.request("/projects/prj_missing/timeline")).status).toBe(404);
  });

  it("returns the round log: drafts grouped by subject, run cards, the next-step card", async () => {
    await seedRun(db, {
      runId: "run_rev",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 520,
    });
    // the review consumed v1 (subjectN resolves via inputs.draftId)
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set inputs = $2::jsonb where id = $1", [
        "run_rev",
        JSON.stringify({ draftId: seed.draftId }),
      ]),
    );
    await seedDoneSteps("run_rev");

    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      project: { id: string };
      nextStep: { verb: string };
      rounds: { n: number; runs: { runId: string; card: { state: string } }[] }[];
      ungrouped: unknown[];
    };
    expect(body.project.id).toBe(seed.projectId);
    expect(body.rounds).toHaveLength(1);
    expect(body.rounds[0]!.n).toBe(1);
    expect(body.rounds[0]!.runs[0]!.runId).toBe("run_rev");
    expect(body.rounds[0]!.runs[0]!.card.state).toBe("completed");
    expect(body.nextStep.verb).toBeTruthy();
  });

  it("a steering-parked waiting_gate run shows paused (not gate_waiting) on its card", async () => {
    await seedRun(db, {
      runId: "run_p",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "waiting_gate",
    });
    await db.client.query("update runs set paused_at = now() where id = 'run_p'");
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as { ungrouped: { runId: string; card: { paused: boolean; waitingGate: unknown } }[] };
    const card = body.ungrouped.find((r) => r.runId === "run_p")!.card;
    expect(card.paused).toBe(true);
    expect(card.waitingGate).toBeNull();
  });

  it("a running run's card carries an ETA band off its committed-step durations (ledger K4)", async () => {
    await seedRun(db, {
      runId: "run_eta",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
    });
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_eta_1','run_eta','reading_the_piece',1,'done',100,1,now(),now()+interval '10 minutes')`,
      );
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at)
         values ('st_eta_2','run_eta','checking_claims',2,'running',50,1,now())`,
      );
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as {
      ungrouped: { runId: string; card: { etaBand: { lowMin: number; highMin: number } | null } }[];
    };
    const card = body.ungrouped.find((r) => r.runId === "run_eta")!.card;
    // one 10-min committed step → mean 10 min over the phases still to run → a sane low<high band
    expect(card.etaBand).not.toBeNull();
    expect(card.etaBand!.lowMin).toBeGreaterThan(0);
    expect(card.etaBand!.highMin).toBeGreaterThan(card.etaBand!.lowMin);

    // a terminal run's card carries no band
    await seedRun(db, { runId: "run_dead", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "failed" });
    const res2 = await app.request(`/projects/${seed.projectId}/timeline`);
    const body2 = (await res2.json()) as { ungrouped: { runId: string; card: { etaBand: unknown } }[] };
    expect(body2.ungrouped.find((r) => r.runId === "run_dead")!.card.etaBand).toBeNull();
  });

  it("a gate-waiting run (paused_at null) carries the gate kind on its card", async () => {
    await seedRun(db, {
      runId: "run_g",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "waiting_gate",
    });
    await seedGate(db, { gateId: "g1", runId: "run_g", kind: "approve_plan", onExpiry: "wait" });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as { ungrouped: { runId: string; card: { paused: boolean; waitingGate: { kind: string } | null } }[] };
    const card = body.ungrouped.find((r) => r.runId === "run_g")!.card;
    expect(card.paused).toBe(false);
    expect(card.waitingGate).toMatchObject({ kind: "approve_plan" });
  });

  it("P1.09 — the waiting run carries the FULL gate DTO + its permanent decision records (§6.4)", async () => {
    await seedRun(db, {
      runId: "run_w",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "waiting_gate",
    });
    // the open gate (the card the Timeline mounts — the same DTO the Needs-you list reads)
    await seedGate(db, {
      gateId: "g_open",
      runId: "run_w",
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: new Date("2026-09-18T12:00:00Z"),
    });
    // a resolved gate → the run's permanent decision row (§6.4 item 8; REQ-RUN-5/6)
    await seedGate(db, { gateId: "g_done", runId: "run_w", kind: "approve_scope", onExpiry: "proceed_as_proposed" });
    await db.client.query(
      `update gates set resolved_at = now() where id = 'g_done'`,
    );
    await db.client.query(
      `insert into decisions(gate_id, by_actor, action, changes, overlay_version_ids, at)
       values ('g_done','user','approve',3,'{}',now())`,
    );

    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as {
      ungrouped: {
        runId: string;
        gate?: { id: string; kind: string; deadlineAt?: string; onExpiry: string };
        card: { decisions?: { gateId: string; action: string; changes?: number }[] };
      }[];
    };
    const run = body.ungrouped.find((r) => r.runId === "run_w")!;
    // the open gate DTO rides the run — identical fields to the Needs-you read (one loader).
    expect(run.gate).toMatchObject({ id: "g_open", kind: "approve_plan", onExpiry: "proceed_conservative" });
    expect(run.gate!.deadlineAt).toBeTruthy();
    // the permanent decision record is on the card (resolved gate, never re-created).
    expect(run.card.decisions).toHaveLength(1);
    expect(run.card.decisions![0]).toMatchObject({ gateId: "g_done", action: "approve", changes: 3 });
  });

  it("lazily enqueues the walkthrough for a delivered run with no record (§5.5 D20), once", async () => {
    await seedRun(db, {
      runId: "run_done",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    const sent = deps.queue.ofName(RUN_JOBS.walkthrough);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.singletonKey).toBe("walkthrough:run_done");
    // a second render does not re-send (the singleton is still active in the in-memory queue)
    await app.request(`/projects/${seed.projectId}/timeline`);
    expect(deps.queue.ofName(RUN_JOBS.walkthrough)).toHaveLength(1);
  });
});

describe("GET /runs/:id/report (§14.5)", () => {
  const seedReportedRun = async () => {
    await seedRun(db, {
      runId: "run_rep",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 300,
    });
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_rep_1','run_rep','checking_claims',1,'done',300,1,now(),now()+interval '2 minutes')`,
      );
      await tx.query(
        `insert into usage_records
           (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
            model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source,
            provider_request_id, searches, fetches)
         values ('ur_rep_1', now(), $1, $2, 'run_rep', 1, 'st_rep_1', 'verifier', 'anthropic',
                 'claude-sonnet-4-6', 'balanced', 1, 4000, 500, 1.0, 300, 'proxy', 'req_secret_1', 12, 40)`,
        [seed.workspaceId, seed.billingAccountId],
      );
    });
  };

  it("Level 3 carries phases/seats/claims but NO tokens or provider ids", async () => {
    await seedReportedRun();
    const res = await app.request("/runs/run_rep/report");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: Record<string, unknown>; advancedView?: unknown };
    expect(body.report.runId).toBe("run_rep");
    expect(body.advancedView).toBeUndefined();
    const json = JSON.stringify(body);
    expect(json).not.toContain("inputTokens");
    expect(json).not.toContain("req_secret_1");
  });

  it("?advanced=1 adds the Level-4 drill-down with tokens + provider ids", async () => {
    await seedReportedRun();
    const res = await app.request("/runs/run_rep/report?advanced=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      advancedView: { rows: { phase: string; seat: string; inputTokens: number; providerRequestIds: string[] }[] };
    };
    expect(body.advancedView.rows[0]).toMatchObject({
      phase: "checking_claims",
      seat: "verifier",
      inputTokens: 4000,
      providerRequestIds: ["req_secret_1"],
    });
  });

  it("404s a missing run; 401s unauthenticated", async () => {
    expect((await app.request("/runs/run_missing/report")).status).toBe(404);
    const anon = createApp({ ...deps, principal: () => null, db: sql });
    expect((await anon.request("/runs/run_rep/report")).status).toBe(401);
  });
});

describe("steering endpoints (§6.5)", () => {
  const post = (path: string, body?: unknown) =>
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body == null ? "{}" : JSON.stringify(body),
    });

  it("POST /runs/:id/pause flags a running run; 409s a terminal one; 404s a missing one", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const res = await post("/runs/run_p/pause");
    expect(res.status).toBe(200);
    const row = (await db.client.query("select pause_requested_at from runs where id = 'run_p'")).rows[0] as {
      pause_requested_at: Date | null;
    };
    expect(row.pause_requested_at).not.toBeNull();

    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, state: "failed" });
    expect((await post("/runs/run_t/pause")).status).toBe(409);
    expect((await post("/runs/run_missing/pause")).status).toBe(404);
  });

  it("POST /runs/:id/resume re-queues a parked run; a gate wait answers 409 gate_waiting", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await db.client.query("update runs set paused_at = now() where id = 'run_p'");
    const res = await post("/runs/run_p/resume", { note: "go easy on the verdict" });
    expect(res.status).toBe(200);
    expect((await db.client.query("select state from runs where id = 'run_p'")).rows[0]).toMatchObject({ state: "queued" });
    // the note landed as queued_message guidance
    const g = await db.client.query("select source, body from guidance where run_id = 'run_p'");
    expect(g.rows[0]).toMatchObject({ source: "queued_message", body: "go easy on the verdict" });

    await seedRun(db, { runId: "run_g", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "g1", runId: "run_g", kind: "approve_plan", onExpiry: "wait" });
    const gw = await post("/runs/run_g/resume");
    expect(gw.status).toBe(409);
    expect(((await gw.json()) as { error: string }).error).toBe("gate_waiting");
  });

  it("POST /runs/:id/notes captures the note (201); empty text 400s; missing run 404s", async () => {
    await seedRun(db, { runId: "run_n", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    expect((await post("/runs/run_n/notes", { text: "check the §2 stat" })).status).toBe(201);
    expect((await post("/runs/run_n/notes", { text: "   " })).status).toBe(400);
    expect((await post("/runs/run_n/notes", {})).status).toBe(400);
    expect((await post("/runs/run_missing/notes", { text: "x" })).status).toBe(404);
  });

  it("POST /runs/:id/stop cancels a running run (the canonical cancel path)", async () => {
    await seedRun(db, {
      runId: "run_s",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
      holdLedgerId: "hold_s",
    });
    const res = await post("/runs/run_s/stop");
    expect(res.status).toBe(200);
    expect((await db.client.query("select state from runs where id = 'run_s'")).rows[0]).toMatchObject({
      state: "cancelled",
    });
    expect((await post("/runs/run_s/stop")).status).toBe(200); // alreadyTerminal → ok
  });

  it("POST /runs/:id/walkthrough/retry clears a failed record and re-enqueues; ready is a no-op", async () => {
    await seedRun(db, {
      runId: "run_w",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "completed",
    });
    await db.client.query(
      `update runs set walkthrough = '{"status":"failed","attempts":1,"lastError":"boom"}'::jsonb where id = 'run_w'`,
    );
    const res = await post("/runs/run_w/walkthrough/retry");
    expect(res.status).toBe(202);
    expect(((await res.json()) as { status: string }).status).toBe("requeued");
    expect((await db.client.query("select walkthrough from runs where id = 'run_w'")).rows[0]).toMatchObject({
      walkthrough: null,
    });
    expect(deps.queue.ofName(RUN_JOBS.walkthrough)).toHaveLength(1);

    // a ready record: 200 {status:'ready'}, no re-enqueue
    await db.client.query(
      `update runs set walkthrough = '{"status":"ready","text":"done","attempts":2}'::jsonb where id = 'run_w'`,
    );
    const res2 = await post("/runs/run_w/walkthrough/retry");
    expect(res2.status).toBe(200);
    expect(deps.queue.ofName(RUN_JOBS.walkthrough)).toHaveLength(1);

    // a live run refuses
    await seedRun(db, { runId: "run_live", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    expect((await post("/runs/run_live/walkthrough/retry")).status).toBe(409);
    expect((await post("/runs/run_missing/walkthrough/retry")).status).toBe(404);
  });

  it("every steering POST 401s unauthenticated", async () => {
    const anon = createApp({ ...deps, principal: () => null, db: sql });
    for (const p of ["pause", "resume", "notes", "stop", "walkthrough/retry"]) {
      const res = await anon.request(`/runs/run_x/${p}`, { method: "POST" });
      expect(res.status, p).toBe(401);
    }
  });
});
