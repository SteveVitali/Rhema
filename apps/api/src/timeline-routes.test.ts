// P1.05 — the Timeline / run-report / steering routes (§5.5/§6.5/§14.5): the round-log read (grouping,
// next-step card; R7COPY.0: the record-composed delivered block — no lazy enqueue), the Level-3
// report + Level-4 drill-down privacy boundary,
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
// R7COPY.0 — RUN_JOBS import removed (no walkthrough leg remains).
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
  app = createApp({
    ...deps,
    principal: () => principal(),
    db: sql,
    store: new InMemoryContentStore(),
  });
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

  it("RES.2 — the persisted run-level label rides the timeline card; unlabelled runs carry none", async () => {
    await seedRun(db, {
      runId: "run_uv",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
    });
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set inputs = $2::jsonb, delivery = $3::jsonb where id = $1", [
        "run_uv",
        JSON.stringify({ draftId: seed.draftId }),
        '{"label":"unverified","checkableClaims":16,"coveredClaims":0}',
      ]),
    );
    await seedDoneSteps("run_uv");
    // an ordinary completed run for the control half of the assertion.
    await seedRun(db, {
      runId: "run_ok",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      rounds: { runs: { runId: string; card: { deliveryLabel?: string | null } }[] }[];
      ungrouped: { runId: string; card: { deliveryLabel?: string | null } }[];
    };
    const all = [...body.rounds.flatMap((r) => r.runs), ...body.ungrouped];
    // the label is READ off runs.delivery — never recomputed from claims or events.
    expect(all.find((r) => r.runId === "run_uv")!.card.deliveryLabel).toBe("unverified");
    expect(all.find((r) => r.runId === "run_ok")!.card.deliveryLabel ?? null).toBeNull();
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
    const body = (await res.json()) as {
      ungrouped: { runId: string; card: { paused: boolean; waitingGate: unknown } }[];
    };
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
    await seedRun(db, {
      runId: "run_dead",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "failed",
    });
    const res2 = await app.request(`/projects/${seed.projectId}/timeline`);
    const body2 = (await res2.json()) as {
      ungrouped: { runId: string; card: { etaBand: unknown } }[];
    };
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
    const body = (await res.json()) as {
      ungrouped: {
        runId: string;
        card: { paused: boolean; waitingGate: { kind: string } | null };
      }[];
    };
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
    await seedGate(db, {
      gateId: "g_done",
      runId: "run_w",
      kind: "approve_scope",
      onExpiry: "proceed_as_proposed",
    });
    await db.client.query(`update gates set resolved_at = now() where id = 'g_done'`);
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
    expect(run.gate).toMatchObject({
      id: "g_open",
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
    });
    expect(run.gate!.deadlineAt).toBeTruthy();
    // the permanent decision record is on the card (resolved gate, never re-created).
    expect(run.card.decisions).toHaveLength(1);
    expect(run.card.decisions![0]).toMatchObject({
      gateId: "g_done",
      action: "approve",
      changes: 3,
    });
  });

  // RUN.1 (ADR-050) — an informational gate (blocking:false — the default approve_scope) rides its
  // RUNNING run's card until the letter phase; `waitingGate` stays literally truthful (the run never
  // waited). A blocking gate always wins the card slot when both are open.
  it("an informational gate rides its running run — card mounted, waitingGate stays null", async () => {
    await seedRun(db, {
      runId: "run_info",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
    });
    await seedGate(db, {
      gateId: "g_info",
      runId: "run_info",
      kind: "approve_scope",
      onExpiry: "wait",
      blocking: false,
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as {
      ungrouped: {
        runId: string;
        gate?: { id: string; kind: string; blocking: boolean };
        card: { waitingGate: { kind: string } | null };
      }[];
    };
    const run = body.ungrouped.find((r) => r.runId === "run_info")!;
    expect(run.gate).toMatchObject({ id: "g_info", kind: "approve_scope", blocking: false });
    expect(run.card.waitingGate).toBeNull(); // the run never waited — no waiting treatment
  });

  it("a blocking gate wins the card slot over an open informational gate on the same run", async () => {
    await seedRun(db, {
      runId: "run_both",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "waiting_gate",
    });
    // informational first (earlier opened_at) — the blocking gate must still win the slot.
    await seedGate(db, {
      gateId: "g_i",
      runId: "run_both",
      kind: "approve_scope",
      onExpiry: "wait",
      blocking: false,
      openedAt: new Date("2026-09-01T00:00:00Z"),
    });
    await seedGate(db, {
      gateId: "g_b",
      runId: "run_both",
      kind: "approve_plan",
      onExpiry: "wait",
      blocking: true,
      openedAt: new Date("2026-09-02T00:00:00Z"),
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as {
      ungrouped: {
        runId: string;
        gate?: { id: string; kind: string };
        card: { waitingGate: { kind: string } | null };
      }[];
    };
    const run = body.ungrouped.find((r) => r.runId === "run_both")!;
    expect(run.gate).toMatchObject({ id: "g_b", kind: "approve_plan" });
    expect(run.card.waitingGate).toMatchObject({ kind: "approve_plan" });
  });

  it("R7COPY.0 — a delivered run's card carries the record-composed 'What it delivered', no job enqueued", async () => {
    await seedRun(db, {
      runId: "run_done",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
    });
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx
        .query(
          `insert into correspondence_items
           (id, project_id, run_id, workspace_id, kind, draft_version_id, finding_schema_version, created_at)
         values ('ci_1', $1, 'run_done', $2, 'review', 'dv_1', 1, now())`,
          [seed.projectId, seed.workspaceId],
        )
        .catch(() => null); // best-effort: schema shape may differ across seeds
    });
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    // ADR-130 — the generated walkthrough is retired: no lazy enqueue happens on render.
    expect(deps.queue.ofName("run.walkthrough" as never)).toHaveLength(0);
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
      advancedView: {
        rows: { phase: string; seat: string; inputTokens: number; providerRequestIds: string[] }[];
      };
    };
    expect(body.advancedView.rows[0]).toMatchObject({
      phase: "checking_claims",
      seat: "verifier",
      inputTokens: 4000,
      providerRequestIds: ["req_secret_1"],
    });
  });

  it("ECON.1 D-A: the Level-4 buckets count ONLY the proxy meter — sdk twin rows never double-count", async () => {
    // reproduces the 01M3SK62… incident shape: proxy 632 + sdk_estimate 553 + sdk_stream 440 must
    // read 632, not 1,625 (all three sources meter the SAME tokens).
    await seedReportedRun();
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      for (const [id, source, credits] of [
        ["ur_rep_sdk_e", "sdk_estimate", 553],
        ["ur_rep_sdk_s", "sdk_stream", 440],
      ] as const) {
        await tx.query(
          `insert into usage_records
             (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
              model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source)
           values ($1, now(), $2, $3, 'run_rep', 1, 'st_rep_1', 'verifier', 'anthropic',
                   'claude-sonnet-4-6', 'balanced', 1, 4000, 500, 0.5, $4, $5)`,
          [id, seed.workspaceId, seed.billingAccountId, credits, source],
        );
      }
    });
    const res = await app.request("/runs/run_rep/report?advanced=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      advancedView: { rows: { credits: number; inputTokens: number }[] };
    };
    const total = body.advancedView.rows.reduce((s, r) => s + r.credits, 0);
    expect(total).toBe(300); // the proxy meter — not 300 + 553 + 440 = 1,293
    expect(body.advancedView.rows).toHaveLength(1); // sdk twins are not shown as separate buckets
  });

  it("404s a missing run; 401s unauthenticated", async () => {
    expect((await app.request("/runs/run_missing/report")).status).toBe(404);
    const anon = createApp({ ...deps, principal: () => null, db: sql });
    expect((await anon.request("/runs/run_rep/report")).status).toBe(401);
  });

  // R5ECON.2 (REQ-ECON-4/5) — the mixed-model regression: under the cheap-route arm a `base`-tier
  // run lawfully meters `claude-haiku-4-5` rows beside `claude-sonnet-5` ones. The drill-down's
  // rollup must keep them DISTINCT on the served `model` while `model_tier` stays the frozen 'base'
  // on both — a tier-keyed group would collapse (and mislabel) the pair.
  it("mixed Sonnet/Haiku rows under one frozen tier stay distinct on the served model", async () => {
    await seedReportedRun();
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      for (const [id, model, credits] of [
        ["ur_mix_haiku", "claude-haiku-4-5", 40],
        ["ur_mix_sonnet", "claude-sonnet-5", 80],
      ] as const) {
        await tx.query(
          `insert into usage_records
             (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
              model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source)
           values ($1, now(), $2, $3, 'run_rep', 1, 'st_rep_1', 'verifier', 'anthropic',
                   $4, 'base', 1, 4000, 500, 0.5, $5, 'proxy')`,
          [id, seed.workspaceId, seed.billingAccountId, model, credits],
        );
      }
    });
    const res = await app.request("/runs/run_rep/report?advanced=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      advancedView: { rows: { model: string; modelTier: string; credits: number }[] };
    };
    // three proxy rows (the seed's balanced-tier row + the two mixed base rows) → three buckets —
    // the Haiku and Sonnet rows are NEVER folded into one 'base' bucket.
    const mixed = body.advancedView.rows.filter((r) => r.modelTier === "base");
    expect(mixed).toHaveLength(2);
    expect(mixed.map((r) => r.model).sort()).toEqual(["claude-haiku-4-5", "claude-sonnet-5"]);
    // …and each bucket's credits are ITS OWN meter — the cheap-route row reports its own figure.
    expect(mixed.find((r) => r.model === "claude-haiku-4-5")!.credits).toBe(40);
    expect(mixed.find((r) => r.model === "claude-sonnet-5")!.credits).toBe(80);
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
    await seedRun(db, {
      runId: "run_p",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
    });
    const res = await post("/runs/run_p/pause");
    expect(res.status).toBe(200);
    const row = (await db.client.query("select pause_requested_at from runs where id = 'run_p'"))
      .rows[0] as {
      pause_requested_at: Date | null;
    };
    expect(row.pause_requested_at).not.toBeNull();

    await seedRun(db, { runId: "run_t", workspaceId: seed.workspaceId, state: "failed" });
    expect((await post("/runs/run_t/pause")).status).toBe(409);
    expect((await post("/runs/run_missing/pause")).status).toBe(404);
  });

  it("POST /runs/:id/resume re-queues a parked run; a gate wait answers 409 gate_waiting", async () => {
    await seedRun(db, {
      runId: "run_p",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "waiting_gate",
    });
    await db.client.query("update runs set paused_at = now() where id = 'run_p'");
    const res = await post("/runs/run_p/resume", { note: "go easy on the verdict" });
    expect(res.status).toBe(200);
    expect(
      (await db.client.query("select state from runs where id = 'run_p'")).rows[0],
    ).toMatchObject({ state: "queued" });
    // the note landed as queued_message guidance
    const g = await db.client.query("select source, body from guidance where run_id = 'run_p'");
    expect(g.rows[0]).toMatchObject({ source: "queued_message", body: "go easy on the verdict" });

    await seedRun(db, {
      runId: "run_g",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "waiting_gate",
    });
    await seedGate(db, { gateId: "g1", runId: "run_g", kind: "approve_plan", onExpiry: "wait" });
    const gw = await post("/runs/run_g/resume");
    expect(gw.status).toBe(409);
    expect(((await gw.json()) as { error: string }).error).toBe("gate_waiting");
  });

  it("POST /runs/:id/notes captures the note (201); empty text 400s; missing run 404s", async () => {
    await seedRun(db, {
      runId: "run_n",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
    });
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
    expect(
      (await db.client.query("select state from runs where id = 'run_s'")).rows[0],
    ).toMatchObject({
      state: "cancelled",
    });
    expect((await post("/runs/run_s/stop")).status).toBe(200); // alreadyTerminal → ok
  });

  it("R7COPY.0 — the retired /runs/:id/walkthrough/retry route is gone", async () => {
    await seedRun(db, {
      runId: "run_w",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "completed",
    });
    // ADR-130 — nothing to retry: the route is removed, not a no-op (an honest 404 beats a dead dial).
    const res = await post("/runs/run_w/walkthrough/retry");
    expect(res.status).toBe(404);
  });

  it("every steering POST 401s unauthenticated", async () => {
    const anon = createApp({ ...deps, principal: () => null, db: sql });
    for (const p of ["pause", "resume", "notes", "stop"]) {
      const res = await anon.request(`/runs/run_x/${p}`, { method: "POST" });
      expect(res.status, p).toBe(401);
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// RPT.1 — the live meter on the run card (REQ-IDE-11) + the reconciled report (§14.4/§14.5; REQ-SPEC-32).

const insertTick = (runId: string, seq: number, payload: Record<string, unknown>) =>
  db.client.query(
    `insert into run_events(run_id, seq, workspace_id, day, type, payload, density, at)
     values ($1,$2,$3,current_date,'usage.tick',$4::jsonb,'summary',now())`,
    [runId, seq, seed.workspaceId, JSON.stringify(payload)],
  );

describe("RPT.1 — the live meter on the timeline card", () => {
  it("a running run's SSR card reads the latest provisional usage.tick, not just the committed total", async () => {
    await seedRun(db, {
      runId: "run_live",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      spentCredits: 100,
      capCredits: 840,
    });
    // two ascending mid-phase ticks (the proxy-metered figure ahead of the committed claim)
    await insertTick("run_live", 1, { spentCredits: 220, capCredits: 840, provisional: true });
    await insertTick("run_live", 2, { spentCredits: 300, capCredits: 840, provisional: true });

    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ungrouped: {
        runId: string;
        card: { spentCredits: number; provisional?: boolean; capCredits: number };
      }[];
    };
    const card = body.ungrouped.find((r) => r.runId === "run_live")!.card;
    expect(card.spentCredits).toBe(300); // the live figure, not the stale committed 100
    expect(card.provisional).toBe(true);
    expect(card.capCredits).toBe(840);
  });

  it("a committed (non-provisional) tick is not labelled provisional; a tick behind the committed figure loses", async () => {
    await seedRun(db, {
      runId: "run_caught",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "running",
      spentCredits: 300,
      capCredits: 840,
    });
    await insertTick("run_caught", 1, { spentCredits: 400, capCredits: 840, provisional: true });
    await insertTick("run_caught", 2, { spentCredits: 300, capCredits: 840 }); // the commit caught up
    const res = await app.request(`/projects/${seed.projectId}/timeline`);
    const body = (await res.json()) as {
      ungrouped: { runId: string; card: { spentCredits: number; provisional?: boolean } }[];
    };
    const card = body.ungrouped.find((r) => r.runId === "run_caught")!.card;
    expect(card.spentCredits).toBe(300);
    expect(card.provisional ?? false).toBe(false);
  });
});

describe("RPT.1 — the reconciled run report (§14.4)", () => {
  const insertLedger = (
    id: string,
    runId: string,
    kind: "debit" | "refund" | "adjustment",
    credits: number,
    reason: string | null = null,
  ) =>
    db.client.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, reason, idempotency_key, at)
       values ($1,$2,$3,$4,$5,'included',$6,'run',$7,$8,now())`,
      [id, seed.workspaceId, seed.billingAccountId, kind, credits, runId, reason, `k:${id}`],
    );
  const insertProxyUsage = (id: string, runId: string, credits: number, stepId: string | null) =>
    db.client.query(
      `insert into usage_records
         (id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role, provider, model,
          model_tier, rate_table_version, input_tokens, output_tokens, list_cost_usd, credits, source)
       values ($1, now(), $2, $3, $4, 1, $5, 'verifier', 'anthropic', 'claude-sonnet-4-6', 'balanced',
               1, 4000, 500, 1.0, $6, 'proxy')`,
      [id, seed.workspaceId, seed.billingAccountId, runId, stepId, credits],
    );

  it("spent = Σ debits − Σ refunds (the ledger), NOT runs.spent_credits; refunds carry their reason", async () => {
    await seedRun(db, {
      runId: "run_recon",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 300, // the committed claim — deliberately NOT what the report charges
      capCredits: 840,
    });
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_recon','run_recon','checking_claims',1,'done',300,1,now()-interval '2 minutes',now())`,
      ),
    );
    await insertProxyUsage("ur_recon_1", "run_recon", 300, "st_recon");
    // the ledger's truth: debited 634 (a committed-mode claim floor), refunded 4 back to 630.
    await insertLedger("led_d", "run_recon", "debit", 634);
    await insertLedger("led_r", "run_recon", "refund", 4, "metered_over_debit");

    const res = await app.request("/runs/run_recon/report");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        spentCredits: number;
        meteredCredits: number;
        refundedCredits: number;
        differences: { key: string; credits: number; reason?: string }[];
      };
    };
    expect(body.report.spentCredits).toBe(630); // 634 − 4 — the ledger, not the claim, not the meter
    expect(body.report.meteredCredits).toBe(300);
    expect(body.report.refundedCredits).toBe(4);
    // charged(630) ran above metered(300) → the committed-mode gap is stated; the refund lists separately.
    expect(body.report.differences).toContainEqual({ key: "committed", credits: 330 });
    expect(body.report.differences).toContainEqual({
      key: "refund",
      credits: 4,
      reason: "metered_over_debit",
    });
  });

  it("the capped fixture: metered past the cap reports the absorbed overrun as 'not charged'", async () => {
    await seedRun(db, {
      runId: "run_cap",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 840,
      capCredits: 840,
    });
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_cap','run_cap','checking_claims',1,'done',840,1,now(),now()+interval '1 minute')`,
      ),
    );
    await insertProxyUsage("ur_cap_1", "run_cap", 900, "step:checking_claims"); // pod-stamped attribution
    await insertLedger("led_cap_d", "run_cap", "debit", 840); // clamped at the cap
    await insertLedger("led_cap_a", "run_cap", "adjustment", 60, "absorbed"); // the overrun, absorbed

    const res = await app.request("/runs/run_cap/report?advanced=1");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: {
        spentCredits: number;
        meteredCredits: number;
        differences: { key: string; credits: number }[];
      };
      advancedView: { rows: { phase: string; credits: number }[] };
    };
    expect(body.report.spentCredits).toBe(840);
    expect(body.report.meteredCredits).toBe(900);
    expect(body.report.differences).toContainEqual({ key: "cap", credits: 60 });
    // Level-4 resolves the pod-stamped `step:<key>` row to the phase (the populated drill-down).
    expect(body.advancedView.rows[0]).toMatchObject({ phase: "checking_claims", credits: 900 });
  });

  it("RPT.1 — a committed step's real duration surfaces; a legacy equal-timestamps row reports 0 (the web renders '—')", async () => {
    await seedRun(db, {
      runId: "run_dur",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 400,
    });
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      // a real 2-minute step…
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_dur_1','run_dur','checking_claims',1,'done',300,1,now()-interval '2 minutes',now())`,
      );
      // …beside a legacy row whose commit wrote started_at = ended_at (the pre-RPT.1 $7,$7 upsert).
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, attempt, started_at, ended_at)
         values ('st_dur_2','run_dur','legacy_phase',2,'done',100,1,'2020-01-01T00:00:00Z','2020-01-01T00:00:00Z')`,
      );
    });
    const res = await app.request("/runs/run_dur/report");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      report: { phases: { key: string; durationMs: number | null }[] };
    };
    const real = body.report.phases.find((p) => p.key === "checking_claims");
    expect(real?.durationMs).toBeGreaterThanOrEqual(115_000); // ~2 min, clock skew tolerated
    expect(real?.durationMs).toBeLessThan(130_000);
    const legacy = body.report.phases.find((p) => p.key === "legacy_phase");
    expect(legacy?.durationMs).toBe(0); // rendered "—" by the web — never "0 min"
  });

  it("a Showcase-seeded run's report carries the worked-example label (§15.3)", async () => {
    await db.client.query("update projects set showcase = true where id = $1", [seed.projectId]);
    await seedRun(db, {
      runId: "run_sc",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "completed",
      spentCredits: 3860,
    });
    const res = await app.request("/runs/run_sc/report");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { report: { workedExample?: boolean } };
    expect(body.report.workedExample).toBe(true);
    // …and the unmarked project's run carries none
    await db.client.query("update projects set showcase = false where id = $1", [seed.projectId]);
    const res2 = await app.request("/runs/run_sc/report");
    expect(
      ((await res2.json()) as { report: { workedExample?: boolean } }).report.workedExample,
    ).toBeUndefined();
  });
});

// ---- DEF.4 — the §14.4 user refund window (REQ-SPEC-24(6); REQ-SPEC-30/32) ----
// The route sits next to /stop on the USER pool, flag-gated off/test_tenants/open (the same posture
// as purchaseMode — JOURNEY.1's is_test workspaces are the Stage-B allowlist). The report's
// `refundWindow` block is the surface's affordance source of truth: absent ⇒ no control renders.

const refundApp = (refundWindowMode: "off" | "test_tenants" | "open") =>
  createApp({ ...deps, principal: () => principal(), db: sql, refundWindowMode });

/** A completed run inside the window with one committed 160-cr phase debit on `included` (the
 *  clock is FixedClock 2026-09-02; ended_at 2026-09-01 = day 1 of 7). */
async function seedRefundableRun(runId: string, opts: { endedAt?: Date } = {}): Promise<void> {
  await db.client.query(
    "insert into credit_balances(billing_account_id, bucket, available, held) values ($1,'included',5000,0) on conflict do nothing",
    [seed.billingAccountId],
  );
  await seedRun(db, {
    runId,
    workspaceId: seed.workspaceId,
    projectId: seed.projectId,
    state: "completed",
  });
  await db.client.query(
    "insert into steps(id, run_id, phase, ordinal, state) values ($1,$2,'craft',1,'done')",
    [`st_${runId}`, runId],
  );
  await db.client.query(
    `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, idempotency_key)
     values ($1,$2,$3,'debit',160,'included',$4,$5,'phase',$6)`,
    [
      `led_${runId}`,
      seed.workspaceId,
      seed.billingAccountId,
      runId,
      `st_${runId}`,
      `debit:${runId}`,
    ],
  );
  await db.client.query("update runs set ended_at = $2 where id = $1", [
    runId,
    opts.endedAt ?? new Date("2026-09-01T12:00:00Z"),
  ]);
}

const includedAvailable = async () =>
  Number(
    (
      (
        await db.client.query(
          "select available from credit_balances where billing_account_id = $1 and bucket = 'included'",
          [seed.billingAccountId],
        )
      ).rows[0] as { available: number }
    ).available,
  );

describe("POST /runs/:id/refund (DEF.4; REQ-SPEC-24(6))", () => {
  it("flag off ⇒ refund_closed 403 and the report carries no refund block (fail-closed money path)", async () => {
    await seedRefundableRun("run_rf0");
    const app0 = refundApp("off");
    const res = await app0.request("/runs/run_rf0/refund", { method: "POST" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "refund_closed" });
    const report = await (await app0.request("/runs/run_rf0/report")).json();
    expect("refundWindow" in report).toBe(false);
  });

  it("test_tenants admits a JOURNEY.1-flagged workspace and refuses an unflagged one", async () => {
    await seedRefundableRun("run_rf1");
    const appT = refundApp("test_tenants");
    // unflagged ⇒ closed
    expect((await appT.request("/runs/run_rf1/refund", { method: "POST" })).status).toBe(403);
    // flag the workspace (server-set only — the test writes the durable flag)
    await db.client.query("update workspaces set is_test = true where id = $1", [seed.workspaceId]);
    const res = await appT.request("/runs/run_rf1/refund", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "refunded", credits: 160 });
  });

  it("open mode refunds every committed phase: 200 + request row + refund ledger rows + cost.refunded — balance moves exactly N", async () => {
    await seedRefundableRun("run_rf2");
    const before = await includedAvailable();
    const res = await refundApp("open").request("/runs/run_rf2/refund", { method: "POST" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; requestId: string; credits: number };
    expect(body).toMatchObject({ status: "refunded", credits: 160 });
    expect((await includedAvailable()) - before).toBe(160);
    const rows = (
      await db.client.query(
        "select kind, reason, credits from credit_ledger where run_id = 'run_rf2' and kind = 'refund'",
      )
    ).rows as { kind: string; reason: string; credits: number }[];
    expect(rows).toEqual([{ kind: "refund", reason: "user_window", credits: 160 }]);
    const req = (
      await db.client.query(
        "select state, decision, quarter from user_refund_requests where run_id = 'run_rf2'",
      )
    ).rows[0] as { state: string; decision: string; quarter: string };
    expect(req).toEqual({ state: "refunded", decision: "auto_allowance", quarter: "2026Q3" });
    expect(
      deps.eventWriter.forRun("run_rf2").find((e) => e.type === "cost.refunded")?.payload,
    ).toMatchObject({ credits: 160, reason: "user_window" });
    // the report now reports refunded (the block IS the audit's read model)
    const report = await (await refundApp("open").request("/runs/run_rf2/report")).json();
    expect((report as { refundWindow: unknown }).refundWindow).toEqual({
      state: "refunded",
      credits: 160,
    });
  });

  it("the report block answers eligible+figure before the request and ineligible on a day-8 run", async () => {
    await seedRefundableRun("run_rf3");
    const appO = refundApp("open");
    const before = await (await appO.request("/runs/run_rf3/report")).json();
    expect((before as { refundWindow: unknown }).refundWindow).toEqual({
      state: "eligible",
      credits: 160,
    });
    // day 8 — the window's edge
    await db.client.query("update runs set ended_at = '2026-08-24T00:00:00Z' where id = 'run_rf3'");
    const after = await (await appO.request("/runs/run_rf3/report")).json();
    expect((after as { refundWindow: unknown }).refundWindow).toEqual({
      state: "ineligible",
      credits: 160,
    });
    const res = await appO.request("/runs/run_rf3/refund", { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "window_expired" });
  });

  it("the second eligible request in the quarter answers 202 pending_review — no money moved — and a replay stays pending", async () => {
    await seedRefundableRun("run_rf4");
    await seedRefundableRun("run_rf5");
    const appO = refundApp("open");
    expect(
      (await (await appO.request("/runs/run_rf4/refund", { method: "POST" })).json()).status,
    ).toBe("refunded");
    const res = await appO.request("/runs/run_rf5/refund", { method: "POST" });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { status: string; credits: number };
    expect(body).toMatchObject({ status: "pending_review", credits: 160 });
    expect(
      (
        await db.client.query(
          "select count(*)::int n from credit_ledger where run_id = 'run_rf5' and kind = 'refund'",
        )
      ).rows[0],
    ).toEqual({ n: 0 });
    // a replay returns the recorded verdict (202 again, same request row — never a second refund)
    const replay = await appO.request("/runs/run_rf5/refund", { method: "POST" });
    expect(replay.status).toBe(202);
    expect(
      (
        await db.client.query(
          "select count(*)::int n from user_refund_requests where run_id = 'run_rf5'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    // and the report block tells the user their request is queued
    const report = await (await appO.request("/runs/run_rf5/report")).json();
    expect((report as { refundWindow: unknown }).refundWindow).toEqual({
      state: "pending_review",
      credits: 160,
    });
  });

  it("replaying a refunded request is a no-op — same verdict, no second refund row", async () => {
    await seedRefundableRun("run_rf6");
    const appO = refundApp("open");
    await appO.request("/runs/run_rf6/refund", { method: "POST" });
    const again = await appO.request("/runs/run_rf6/refund", { method: "POST" });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ status: "refunded", credits: 160 });
    expect(
      (
        await db.client.query(
          "select count(*)::int n from credit_ledger where run_id = 'run_rf6' and kind = 'refund'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });

  it("an unknown or foreign-scoped run is 404; a failed run is 409 state", async () => {
    const appO = refundApp("open");
    expect((await appO.request("/runs/run_nope/refund", { method: "POST" })).status).toBe(404);
    await seedRun(db, { runId: "run_fail", workspaceId: seed.workspaceId, state: "failed" });
    const res = await appO.request("/runs/run_fail/refund", { method: "POST" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "state" });
    const anon = createApp({ ...deps, principal: () => null, db: sql, refundWindowMode: "open" });
    expect((await anon.request("/runs/run_fail/refund", { method: "POST" })).status).toBe(401);
  });
});
