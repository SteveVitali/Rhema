import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, seedGate, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import { agentTypesSeed } from "@rhema/db";
import { provisionTrial } from "@rhema/ledger";
import { testEntryDeps } from "@rhema/ledger/testing";
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

  it("PRB.21 / D-PRB.20-1 — a second create on a project with a non-terminal run → 409 run_in_progress + the active id", async () => {
    const r1 = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody()),
    });
    expect(r1.status).toBe(201);
    const { runId } = (await r1.json()) as { runId: string };

    const r2 = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-http-2" })),
    });
    expect(r2.status).toBe(409);
    const b2 = (await r2.json()) as { error: string; runId: string };
    expect(b2.error).toBe("run_in_progress");
    expect(b2.runId).toBe(runId);
    // exactly one run row + one hold (the in-memory ledger records the coupling point).
    expect((await db.client.query("select count(*)::int n from runs")).rows[0]).toMatchObject({ n: 1 });
    expect(deps.ledger.opsOf("hold")).toHaveLength(1);
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

  it("PRB.13 — the verified-email gate: unbound ⇒ inert; false ⇒ 403 email_unverified; true ⇒ creates", async () => {
    // unbound (no user lookup): the gate is inert — fixtures without a db keep working.
    expect(
      (
        await app.request(`/projects/${seed.projectId}/runs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(runBody({ idempotencyKey: "idem-gate-0" })),
        })
      ).status,
    ).toBe(201);

    const gated = (verified: boolean) =>
      createApp({ ...deps, principal: () => principal(), userEmailVerified: async () => verified });
    const blocked = await gated(false).request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-gate-1" })),
    });
    expect(blocked.status).toBe(403);
    expect(await blocked.json()).toEqual({ error: "email_unverified" });
    expect((await db.client.query("select count(*)::int n from runs")).rows[0]).toMatchObject({ n: 1 }); // only the unbound one

    // PRB.21 — the gate-0 run is still `queued` (non-terminal); land it terminal so this create passes
    // the one-active-run guard and exercises the verified branch alone.
    await db.client.query("update runs set state = 'completed'", []);

    const ok = await gated(true).request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-gate-2" })),
    });
    expect(ok.status).toBe(201);
  });

  it("PRB.23 — the sheet's resolved toggles freeze into run inputs as phase opt-out flags", async () => {
    // The D-PRB.21-1 divergence: the estimate priced rigor-default toggles while `inputs:{}`
    // meant `runspec.isOptedOut` could never fire — a quick review ran all seven phases. Now the
    // same resolved set prices AND gates: quick defaults → verification on, the two optional
    // phases frozen off.
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        runBody({ idempotencyKey: "idem-tgl-1", rigor: "quick", modelTier: "base", modelProfile: { tier: "base" } }),
      ),
    });
    expect(r.status).toBe(201);
    const row = (await db.client.query("select inputs, estimate_credits, cap_credits from runs")).rows[0] as {
      inputs: Record<string, unknown>;
      estimate_credits: number;
      cap_credits: number;
    };
    expect(row.inputs.verification).toBe(true);
    expect(row.inputs.discourse).toBe(false);
    expect(row.inputs.second_read).toBe(false);
    // the estimate was re-derived from the SAME resolved set (quick review, 5 active phases):
    // (40 + 0.012×5180 + 24×21 + 5×100 churn) + (200 + 16×21 research incl. PRB.24 loop churn)
    // = 1642.16, ×1.25 PRB.25 coverage ×0.6 → 1232; cap 1848.
    expect(row.estimate_credits).toBe(1232);
    expect(row.cap_credits).toBe(1848);
  });

  it("PRB.23 — submitted toggle overrides win over rigor defaults (explicit off survives)", async () => {
    // fact_check off at standard: the verification phase opts out (and is not priced).
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-tgl-2", toggles: { fact_check: false } })),
    });
    expect(r.status).toBe(201);
    const row = (await db.client.query("select inputs from runs")).rows[0] as { inputs: Record<string, unknown> };
    expect(row.inputs.verification).toBe(false);
    expect(row.inputs.discourse).toBe(true);
    expect(row.inputs.second_read).toBe(true);
  });

  it("PRB.23 — a client cannot smuggle a phase flag through `inputs` (server-authored flags win)", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        runBody({ idempotencyKey: "idem-tgl-3", inputs: { draftId: seed.draftId, sidecar: true, verification: false } }),
      ),
    });
    expect(r.status).toBe(201);
    const row = (await db.client.query("select inputs from runs")).rows[0] as { inputs: Record<string, unknown> };
    // standard defaults keep verification on — the crafted input was overridden.
    expect(row.inputs.verification).toBe(true);
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
    // review/standard/base on 8k words + 45 claims = 3154 credits (base 1916 + 920 research incl.
    // PRB.24 loop churn + 278 discourse + 40 second read — the 7×100 PRB.24 churn is inside base)
    // ×1.25 PRB.25 metered coverage = 3943; cap = ceil(1.5 × 3943) = 5915.
    expect(row.estimate_credits).toBe(3943);
    expect(row.cap_credits).toBe(5915);
  });

  // D-P0.11-1 / REQ-SPEC-24.5 — a tripped circuit breaker scales the NEW run's server-derived cap by the
  // `capMultiplier` (deploy binds the seam to `circuitBreakerState`; a 2× trip doubles the safety band while
  // the estimator re-fits). Unbound ⇒ 1× (fixtures and a breaker-less deploy stay unchanged).
  it("a tripped circuit breaker doubles the new run's cap (capMultiplier consumed at creation)", async () => {
    const tripped = createApp({ ...deps, principal: () => principal(), circuitBreaker: async () => ({ capMultiplier: 2 }) });
    const r = await tripped.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        runBody({ idempotencyKey: "idem-breaker", modelTier: "base", inputSnapshot: { wordCount: 8000, claimCount: 45 } }),
      ),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const row = (await db.pg.query("select estimate_credits, cap_credits from runs where id = $1", [runId])).rows[0] as {
      estimate_credits: number;
      cap_credits: number;
    };
    // same levers as the re-derive test above: estimate 3943, base cap 5915 — the tripped breaker doubles it.
    expect(row.estimate_credits).toBe(3943);
    expect(row.cap_credits).toBe(11830);
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

// P1.16 — the §14.2 plan gates (REQ-PERSONA-5/DATA-42): tier, concurrency and chat-only are
// server-derived from the account's effective plan — never client-trusted. `plan:null` seeds an
// account with NO subscription (the post-beta Free default: chat only, Base, zero run concurrency).
describe("POST /projects/:id/runs — the plan gate (P1.16; §14.2)", () => {
  it("a free account's non-chat run is 402 upgrade_required — never a silent run", async () => {
    const free = await seedProject(db, {
      userId: "usr_free", billingAccountId: "ba_free", workspaceId: "ws_free", projectId: "prj_free",
      draftN: 1, plan: null,
    });
    const gated = createApp({
      ...deps,
      principal: () => ({ userId: free.userId, workspaceId: free.workspaceId, billingAccountId: free.billingAccountId }),
    });
    const r = await gated.request(`/projects/${free.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-free-1", inputs: { draftId: free.draftId }, draftId: free.draftId })),
    });
    expect(r.status).toBe(402);
    expect(((await r.json()) as { error: string }).error).toBe("upgrade_required");
    const runs = (await db.pg.query("select count(*)::int as n from runs where workspace_id = 'ws_free'")).rows[0] as { n: number };
    expect(runs.n).toBe(0);
  });

  it("a free account's chat on a paid model tier is 402 model_tier_requires_upgrade", async () => {
    const free = await seedProject(db, {
      userId: "usr_free2", billingAccountId: "ba_free2", workspaceId: "ws_free2", projectId: "prj_free2",
      plan: null,
    });
    const gated = createApp({
      ...deps,
      principal: () => ({ userId: free.userId, workspaceId: free.workspaceId, billingAccountId: free.billingAccountId }),
    });
    const r = await gated.request(`/projects/${free.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-free-2", workflow: "chat_turn", modelTier: "balanced" })),
    });
    expect(r.status).toBe(402);
    expect(((await r.json()) as { error: string }).error).toBe("model_tier_requires_upgrade");
  });

  it("a concurrency-bound plan 429s at the cap (Writer: 2 live runs)", async () => {
    const w = await seedProject(db, {
      userId: "usr_w", billingAccountId: "ba_w", workspaceId: "ws_w", projectId: "prj_w",
      draftN: 1, plan: "writer",
    });
    await seedRun(db, { runId: "run_w1", workspaceId: w.workspaceId, projectId: w.projectId, state: "running" });
    await seedRun(db, { runId: "run_w2", workspaceId: w.workspaceId, projectId: w.projectId, state: "queued" });
    const gated = createApp({
      ...deps,
      principal: () => ({ userId: w.userId, workspaceId: w.workspaceId, billingAccountId: w.billingAccountId }),
    });
    const r = await gated.request(`/projects/${w.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(runBody({ idempotencyKey: "idem-w-1", modelTier: "base", inputs: { draftId: w.draftId }, draftId: w.draftId })),
    });
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toBe("concurrency_limit");
  });
});

// P1.16 — the §14.3 trial gate (REQ-GROWTH-10/15; REQ-SPEC-8). A trial account carries the LOCKED
// entitlement from signup; the first run claiming `entitlementId` goes through the identity-before-spend
// unlock gate (fingerprint/disposable/risk/daily-ceiling, every decision audited in
// trial_unlock_checks), must be exactly the included shape (Review · Standard · Base · ≤6,000 words),
// and never touches the credit ledger for the entitlement itself.
describe("POST /projects/:id/runs — the trial gate (P1.16; §14.3)", () => {
  async function seedTrial(opts: { userId?: string; disposable?: boolean; asnRisk?: number } = {}) {
    const s = await seedProject(db, {
      userId: opts.userId ?? "usr_t",
      billingAccountId: "ba_t",
      workspaceId: "ws_t",
      projectId: "prj_t",
      draftN: 1,
      plan: null,
    });
    if (opts.disposable) {
      await db.pg.query(`update "user" set email = 'trial@mailinator.com' where id = $1`, [s.userId]);
    }
    await db.txRunner.run(s.workspaceId, (tx) =>
      provisionTrial(tx, testEntryDeps(), { billingAccountId: s.billingAccountId }),
    );
    const entitlement = (
      await db.client.query("select id from trial_entitlements where billing_account_id = $1", [s.billingAccountId])
    ).rows[0] as { id: string };
    const tapp = createApp({
      ...deps,
      principal: () => ({ userId: s.userId, workspaceId: s.workspaceId, billingAccountId: s.billingAccountId }),
      ...(opts.asnRisk !== undefined ? { asnRiskScorer: async () => opts.asnRisk } : {}),
    });
    const post = (over: Record<string, unknown> = {}, entitlementId: string | undefined = entitlement.id) =>
      tapp.request(`/projects/${s.projectId}/runs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          runBody({
            idempotencyKey: "idem-trial-1",
            modelTier: "base",
            modelProfile: { tier: "base" },
            rigor: "standard",
            ...(entitlementId ? { entitlementId } : {}),
            draftId: s.draftId,
            inputs: { draftId: s.draftId, sidecar: true },
            ...over,
          }),
        ),
      });
    return { s, tapp, entitlementId: entitlement.id, post };
  }

  it("the entitlement run unlocks the gate and creates queued — entitlement_id on the run, audit row written", async () => {
    const { s, entitlementId, post } = await seedTrial();
    const r = await post();
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const run = (
      await db.pg.query("select entitlement_id, state from runs where id = $1", [runId])
    ).rows[0] as { entitlement_id: string | null; state: string };
    expect(run).toMatchObject({ entitlement_id: entitlementId, state: "queued" });
    // the §14.3 unlock ran: account active, the audited allow decision, the 150-credit pocket granted.
    expect(
      (await db.client.query("select trial_state from billing_accounts where id = $1", [s.billingAccountId])).rows[0],
    ).toMatchObject({ trial_state: "trial_active" });
    const checks = (
      await db.client.query("select decision from trial_unlock_checks where billing_account_id = $1", [s.billingAccountId])
    ).rows as { decision: string }[];
    expect(checks.map((c) => c.decision)).toEqual(["allow"]);
    expect(
      (
        await db.client.query(
          "select available::int a from credit_balances where billing_account_id = $1 and bucket = 'trial_pocket'",
          [s.billingAccountId],
        )
      ).rows[0],
    ).toMatchObject({ a: 150 });
    // the hold carried the entitlement — the SqlHoldLedger claims it (trial.test.ts); no credit-bucket hold.
    expect(deps.ledger.opsOf("hold")[0]?.args.entitlementId).toBe(entitlementId);
  });

  it("a >6,000-word draft is 422 trial_word_cap — the first-6,000-words-or-upgrade offer (REQ-SPEC-8)", async () => {
    const { post } = await seedTrial();
    const r = await post({ inputSnapshot: { wordCount: 7000 } });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string; wordCap: number })).toMatchObject({
      error: "trial_word_cap",
      wordCap: 6000,
    });
    expect((await db.pg.query("select count(*)::int n from runs")).rows[0]).toMatchObject({ n: 0 });
  });

  it("a non-Standard/non-review entitlement claim is 422 trial_shape", async () => {
    const { post } = await seedTrial();
    const r = await post({ rigor: "full_board" });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("trial_shape");
  });

  it("a disposable email domain denies the unlock — 403 trial_denied, audited", async () => {
    const { s, post } = await seedTrial({ userId: "usr_tdisp", disposable: true });
    const r = await post();
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe("trial_denied");
    expect(
      (await db.client.query("select trial_state from billing_accounts where id = $1", [s.billingAccountId])).rows[0],
    ).toMatchObject({ trial_state: "trial_denied" });
    const checks = (
      await db.client.query("select decision, reason from trial_unlock_checks where billing_account_id = $1", [s.billingAccountId])
    ).rows as { decision: string; reason: string }[];
    expect(checks[0]).toMatchObject({ decision: "deny", reason: "disposable_domain" });
  });

  it("a high ASN risk score asks for the phone challenge — 403, entitlement stays locked", async () => {
    const { s, entitlementId, post } = await seedTrial({ userId: "usr_trisk", asnRisk: 0.9 });
    const r = await post();
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string }).error).toBe("phone_challenge_required");
    expect(
      (
        await db.client.query("select state from trial_entitlements where id = $1", [entitlementId])
      ).rows[0],
    ).toMatchObject({ state: "locked" });
    void s;
  });

  it("the global daily trial-spend ceiling pauses the unlock — 429 trial_ceiling", async () => {
    const { post } = await seedTrial({ userId: "usr_tceil" });
    // deps.clock is fixed at 2026-09-02 — exhaust today's counter.
    await db.client.query("insert into trial_spend_daily (day, credits) values ('2026-09-02', 250000)", []);
    const r = await post();
    expect(r.status).toBe(429);
    expect(((await r.json()) as { error: string }).error).toBe("trial_ceiling");
  });

  it("a killed account's entitlement run is 403 trial_denied (the kill switch is read live)", async () => {
    const { s, post } = await seedTrial({ userId: "usr_tkill" });
    await db.client.query("update billing_accounts set trial_killed_at = now() where id = $1", [s.billingAccountId]);
    const r = await post();
    expect(r.status).toBe(403);
    expect(((await r.json()) as { error: string; reason: string })).toMatchObject({
      error: "trial_denied",
      reason: "killed",
    });
  });

  it("an already-consumed entitlement is 422 entitlement_unavailable — one trial run, ever", async () => {
    const { entitlementId, post } = await seedTrial({ userId: "usr_tused" });
    // the first claim consumed the entitlement; the account is still inside the window (trial_active
    // — trial concurrency, not the post-window free floor).
    await db.client.query(
      "update trial_entitlements set state = 'consumed' where id = $1",
      [entitlementId],
    );
    await db.client.query("update billing_accounts set trial_state = 'trial_active' where id = 'ba_t'", []);
    const r = await post();
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toBe("entitlement_unavailable");
  });
});

describe("POST /projects/:id/runs — Draft (P1.10; REQ-WF-4)", () => {
  function draftBody(over: Record<string, unknown> = {}) {
    return runBody({
      idempotencyKey: "idem-draft-1",
      workflow: "draft",
      draftId: seed.draftId, // the OUTLINE the intake phase reads
      corrKind: "drafting_note",
      ...over,
    });
  }

  it("creates a draft run with server-reserved nextDraftId/nextDraftN frozen into inputs", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftBody()),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const row = (
      await db.pg.query("select workflow, inputs from runs where id = $1", [runId])
    ).rows[0] as { workflow: string; inputs: Record<string, unknown> };
    expect(row.workflow).toBe("draft");
    const ins = row.inputs;
    expect(ins.draftId).toBe(seed.draftId); // the outline, server-verified against the project
    expect(typeof ins.nextDraftId).toBe("string");
    // seed.draftN = 1 → the born-frozen row reserves v2.
    expect(ins.nextDraftN).toBe(2);
  });

  it("rejects a draft run with no outline (400 draft_outline_required) — and a foreign outline id", async () => {
    const noOutline = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftBody({ idempotencyKey: "idem-draft-no-outline", draftId: undefined })),
    });
    expect(noOutline.status).toBe(400);
    expect(((await noOutline.json()) as { error: string }).error).toBe("draft_outline_required");
    const foreign = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftBody({ idempotencyKey: "idem-draft-foreign", draftId: "dft_nonexistent" })),
    });
    expect(foreign.status).toBe(400);
  });

  it("preview:true freezes inputs.preview {sections:1} + forces grounding/audit off (the §7.6 ≈60-cr shape)", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftBody({ idempotencyKey: "idem-draft-preview", preview: true, rigor: "full_board" })),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const ins = (
      (await db.pg.query("select inputs from runs where id = $1", [runId])).rows[0] as {
        inputs: Record<string, unknown>;
      }
    ).inputs;
    expect(ins.preview).toEqual({ sections: 1 });
    expect(ins.grounding).toBe(false);
    expect(ins.audit).toBe(false);
  });
});

// P1.13 — the `figure` run's creation branch (§7.5; REQ-VIZ-1/4): the api mints/verifies the figure
// id (a client-invented id 404s), seeds `figures.provenance` from the entry point's sourceRefs
// (insist ⇒ kind:"none"; @claim: ⇒ claim_ledger; …), and freezes the figure facts into run inputs.
describe("POST /projects/:id/runs — Figure (P1.13; §7.5)", () => {
  function figureBody(over: Record<string, unknown> = {}, figure: Record<string, unknown> = {}) {
    return runBody({
      idempotencyKey: "idem-fig-1",
      workflow: "figure",
      figure: { request: "a chart of the visibility scores", ...figure },
      ...over,
    });
  }

  it("a first visualize mints the figures row with the entry-point provenance seed + freezes the facts", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(figureBody({}, { entryPoint: "chat", sourceRefs: { claimIds: ["v2/41"] } })),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const run = (
      await db.pg.query("select workflow, inputs from runs where id = $1", [runId])
    ).rows[0] as { workflow: string; inputs: Record<string, unknown> };
    expect(run.workflow).toBe("figure");
    expect(typeof run.inputs.figureId).toBe("string"); // server-minted
    expect(run.inputs.entryPoint).toBe("chat");
    expect(run.inputs.request).toBe("a chart of the visibility scores");
    // the minted row carries the claim_ledger seed (the honesty step re-classifies at finalize)
    const fig = (
      await db.pg.query("select spec_kind, provenance from figures where id = $1", [run.inputs.figureId])
    ).rows[0] as { spec_kind: string; provenance: { kind: string; refs: { claimId: string }[] } };
    expect(fig.provenance.kind).toBe("claim_ledger");
    expect(fig.provenance.refs[0]!.claimId).toBe("v2/41");
  });

  it("the insist path seeds kind:\"none\" — the REFUSE-default, never an approval", async () => {
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(figureBody({ idempotencyKey: "idem-fig-insist" }, { sourceRefs: { insisted: true } })),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const ins = ((await db.pg.query("select inputs from runs where id = $1", [runId])).rows[0] as { inputs: { figureId: string } }).inputs;
    const fig = (
      await db.pg.query("select provenance from figures where id = $1", [ins.figureId])
    ).rows[0] as { provenance: { kind: string; verification: string } };
    expect(fig.provenance.kind).toBe("none");
    expect(fig.provenance.verification).toBe("unverified");
  });

  it("a missing figure.request is 400; a client-invented figureId is 404 figure_not_found", async () => {
    const noReq = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(figureBody({ idempotencyKey: "idem-fig-noreq" }, { request: "  " })),
    });
    expect(noReq.status).toBe(400);
    const invented = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(figureBody({ idempotencyKey: "idem-fig-inv" }, { figureId: "01ARZ3NDEKTSV4RRFFQ69G5FFF" })),
    });
    expect(invented.status).toBe(404);
    expect(((await invented.json()) as { error: string }).error).toBe("figure_not_found");
  });

  it("an iterate run reuses the named row and freezes figureId + priorVersion", async () => {
    await db.pg.query(
      `insert into figures(id, project_id, spec_kind, provenance) values ($1,$2,'vega_lite','{}'::jsonb)`,
      ["01ARZ3NDEKTSV4RRFFQ69G5FBF", seed.projectId],
    );
    const r = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        figureBody({ idempotencyKey: "idem-fig-iter" }, { figureId: "01ARZ3NDEKTSV4RRFFQ69G5FBF", priorVersion: 1 }),
      ),
    });
    expect(r.status).toBe(201);
    const { runId } = (await r.json()) as { runId: string };
    const ins = ((await db.pg.query("select inputs from runs where id = $1", [runId])).rows[0] as {
      inputs: { figureId: string; priorVersion: number };
    }).inputs;
    expect(ins.figureId).toBe("01ARZ3NDEKTSV4RRFFQ69G5FBF");
    expect(ins.priorVersion).toBe(1);
    // no new figures row was minted
    const count = await db.pg.query("select count(*)::int n from figures where project_id = $1", [seed.projectId]);
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });
});
