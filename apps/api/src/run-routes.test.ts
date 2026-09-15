import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, seedGate, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { agentTypesSeed } from "@rhema/db";
import { createApp, type Principal } from "./index.js";

// The HTTP adapter wires correctly onto the orchestrator: run creation, token-authenticated internal routes,
// and attempt fencing surface as the right status codes. Driven via Hono's app.request (no network).

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({ userId: seed.userId, workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal() });
});
afterEach(() => db.close());

function runBody(over: Record<string, unknown> = {}) {
  return {
    idempotencyKey: "idem-http-1",
    workflow: "review",
    modelProfile: { tier: "balanced" },
    modelTier: "balanced",
    rigor: "standard",
    estimateCredits: 560,
    capCredits: 840,
    rateTableVersion: 1,
    inputs: { draftId: seed.draftId, sidecar: true },
    inputSnapshot: { wordCount: 5180 },
    draftId: seed.draftId,
    corrKind: "review",
    corrK: 1,
    ...over,
  };
}

describe("POST /projects/:id/runs", () => {
  it("creates a run (201) then dedups the same idempotency key (200, same run)", async () => {
    const r1 = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody()),
    });
    expect(r1.status).toBe(201);
    const b1 = (await r1.json()) as { runId: string; state: string };
    expect(b1.state).toBe("queued");

    const r2 = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody()),
    });
    expect(r2.status).toBe(200);
    const b2 = (await r2.json()) as { runId: string; deduped: boolean };
    expect(b2.runId).toBe(b1.runId);
    expect(b2.deduped).toBe(true);
  });

  it("rejects a model-profile override lacking capabilities (422)", async () => {
    const res = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ modelProfile: { tier: "balanced", overrides: [{ phaseClass: "research", provider: "openai" }] } })),
    });
    expect(res.status).toBe(422);
  });

  it("401 without a principal", async () => {
    const anon = createApp({ ...deps, principal: () => null });
    const res = await anon.request(`/projects/${seed.projectId}/runs`, { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });
});

describe("internal run API — token auth + fencing", () => {
  it("a valid run token drives the first heartbeat (provisioning → running)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "provisioning" });
    const token = deps.tokens.mint({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
    const res = await app.request("/internal/runs/run1/heartbeat", {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { state: string };
    expect(body.state).toBe("running");
  });

  it("401 without a token", async () => {
    const res = await app.request("/internal/runs/run1/heartbeat", { method: "PUT" });
    expect(res.status).toBe(401);
  });

  it("a commit from a superseded attempt → 409 stale_task", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running", currentAttempt: 2 });
    const staleToken = deps.tokens.mint({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
    const res = await app.request("/internal/runs/run1/steps/intake/commit", {
      method: "POST",
      headers: { authorization: `Bearer ${staleToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        ordinal: 0,
        of: 7,
        credits: 10,
        result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
        next: { kind: "advance" },
      }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "stale_task" });
  });

  it("403 when the token's run does not match the path", async () => {
    const token = deps.tokens.mint({ runId: "other", attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
    const res = await app.request("/internal/runs/run1/heartbeat", { method: "PUT", headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(403);
  });

  it("413 when a POST events batch exceeds the 250-event limit (§12.5)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const token = deps.tokens.mint({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
    const events = Array.from({ length: 251 }, () => ({ type: "usage.tick", payload: { spentCredits: 1, capCredits: 10 } }));
    const res = await app.request("/internal/runs/run1/events", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ events }),
    });
    expect(res.status).toBe(413);
    expect((await res.json()) as { code: string }).toMatchObject({ code: "event_batch_too_large" });
  });

  it("GET /runspec returns the server-authored spec token-authed (D-P0.15c-6), 401 without a token", async () => {
    // the seat's tool set comes from agent_types (the run spec reads it for the hook policy).
    await agentTypesSeed({ exec: (sql) => db.pg.exec(sql), query: (sql, params) => db.pg.query(sql, params as unknown[]) });
    await db.pg.query(
      `insert into agent_instances(id, project_id, type_key, namespace) values ('ai_e',$1,'editor','agent:editor')
         on conflict (project_id, type_key) do nothing`,
      [seed.projectId],
    );
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "review", state: "running", agentInstanceId: "ai_e" });

    const noAuth = await app.request("/internal/runs/run1/runspec");
    expect(noAuth.status).toBe(401);

    const token = deps.tokens.mint({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });
    const res = await app.request("/internal/runs/run1/runspec", { headers: { authorization: `Bearer ${token}` } });
    expect(res.status).toBe(200);
    const spec = (await res.json()) as { request: { skill: string; phase: { skillPhase: string } }; skillsDir: string; hookPolicyInput: { seat: string } };
    expect(spec.request.skill).toBe("editorial-review");
    expect(spec.request.phase.skillPhase).toBe("0");
    expect(spec.hookPolicyInput.seat).toBe("editor");
    expect(JSON.stringify(spec)).not.toContain(token); // no secret leaks over the wire
  });
});

describe("POST /runs/:id/gates/:gid — gate resolution (§6.4; §12.4 step 7)", () => {
  it("resolves an approval, returns queued, and 404s an unknown gate", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "gate1", runId: "run1", kind: "approve_plan", onExpiry: "proceed_conservative" });

    const ok = await app.request("/runs/run1/gates/gate1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    expect(ok.status).toBe(200);
    expect((await ok.json()) as { resolved: boolean; state: string }).toMatchObject({ resolved: true, state: "queued" });

    const missing = await app.request("/runs/run1/gates/nope", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    expect(missing.status).toBe(404);
  });

  it("409 when the gate is already resolved (idempotent second click)", async () => {
    await seedRun(db, { runId: "run2", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "gate2", runId: "run2", kind: "approve_plan", onExpiry: "proceed_conservative" });
    const body = JSON.stringify({ action: "approve" });
    const first = await app.request("/runs/run2/gates/gate2", { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(first.status).toBe(200);
    const second = await app.request("/runs/run2/gates/gate2", { method: "POST", headers: { "content-type": "application/json" }, body });
    expect(second.status).toBe(409);
  });

  it("401 without a principal; activity + hold routes respond", async () => {
    const anon = createApp({ ...deps, principal: () => null });
    const unauth = await anon.request("/runs/run3/gates/g/hold", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(unauth.status).toBe(401);

    await seedRun(db, { runId: "run3", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "gate3", runId: "run3", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: new Date("2026-09-03T00:00:00Z") });
    const hold = await app.request("/runs/run3/gates/gate3/hold", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(hold.status).toBe(200);
    expect((await hold.json()) as { held: boolean }).toEqual({ held: true });
  });

  // PRB.3 — the cap is re-derived server-side from the levers, never trusted from the client (money integrity;
  // REQ-BILL-3/6). A crafted low cap is overridden with `ceil(1.5 × server-estimate)`.
  it("re-derives estimate + cap server-side from the frozen levers (ignores a crafted client cap)", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        runBody({
          idempotencyKey: "idem-recompute",
          workflow: "review",
          modelTier: "base",
          rigor: "standard",
          estimateCredits: 1, // crafted
          capCredits: 1, // crafted — must be overridden
          inputSnapshot: { wordCount: 8000, claimCount: 45 },
        }),
      ),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const row = (await db.pg.query("select estimate_credits, cap_credits from runs where id = $1", [runId])).rows[0] as {
      estimate_credits: number;
      cap_credits: number;
    };
    // review/standard/base on 8k words + 45 claims = 1394 credits; cap = ceil(1.5 × 1394) = 2091.
    expect(row.estimate_credits).toBe(1394);
    expect(row.cap_credits).toBe(2091);
  });

  // AC4 (run path) — insufficient balance returns 402 and creates NO run row (never billed; §5.6 item 6, §14.6).
  it("insufficient balance → 402 and no run row is created", async () => {
    deps.ledger.primeInsufficient();
    const before = (await db.pg.query("select count(*)::int as n from runs")).rows[0] as { n: number };
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-insufficient", capCredits: 999999 })),
    });
    expect(r.status).toBe(402);
    const body = (await r.json()) as { error: string; required: number };
    expect(body.error).toBe("insufficient_balance");
    const after = (await db.pg.query("select count(*)::int as n from runs")).rows[0] as { n: number };
    expect(after.n).toBe(before.n); // the creation transaction rolled back — no abandoned row
  });
});
