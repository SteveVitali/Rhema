import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GATE_DEFAULTS, GATE_KINDS, type GateKind } from "@rhema/contracts";
import { resolveGate, skipGateByPolicy, preApproveGateByTrial } from "./gate-resolution.js";
import { handleGateExpiry, holdGate } from "./gate-expiry.js";
import { RUN_JOBS } from "./queue.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  readDecision,
  countDecisions,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";

const PAST = new Date("2026-09-02T00:00:00Z"); // before the FixedClock's 2026-09-02T12:00:00Z

describe("gate resolution — the conditional-update mechanics (§12.4 step 7; REQ-DATA-35/36)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = makeDeps(db);
  });
  afterEach(() => db.close());

  // AC1: over all twelve kinds × the resolution mechanisms, exactly one resolution wins the conditional-update
  // race and leaves exactly one Decision row naming its mechanism.
  it("AC1 — exactly one resolution wins the race, for every one of the twelve kinds", async () => {
    let i = 0;
    for (const kind of GATE_KINDS) {
      const runId = `run_race_${i}`;
      const gateId = `gate_race_${i}`;
      i++;
      const state = kind === "confirm_cost" ? "awaiting_consent" : "waiting_gate";
      await seedRun(db, { runId, workspaceId: ws, projectId: "prj_seed", state });
      await seedGate(db, { gateId, runId, kind, onExpiry: GATE_DEFAULTS[kind].onExpiry, deadlineAt: PAST });

      // user resolve wins; the expiry job then fires as a no-op (already resolved / wait).
      const r1 = await resolveGate(deps, { runId, gateId, workspaceId: ws, userId: "usr_seed", action: "approve" });
      const r2 = await handleGateExpiry(deps, { gateId, workspaceId: ws });

      expect(r1).toMatchObject({ ok: true, resolved: true });
      expect(r2.action).toBe("noop");
      expect(await countDecisions(db, gateId)).toBe(1); // exactly one resolution
      expect((await readDecision(db, gateId))!.by_actor).toBe("user");
    }
  });

  it("AC1 (reverse order) — timeout wins first; a later user resolve is a no-op", async () => {
    await seedRun(db, { runId: "run_rev", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "gate_rev", runId: "run_rev", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });

    const e = await handleGateExpiry(deps, { gateId: "gate_rev", workspaceId: ws });
    const u = await resolveGate(deps, { runId: "run_rev", gateId: "gate_rev", workspaceId: ws, userId: "usr_seed", action: "approve" });

    expect(e.action).toBe("resolved");
    expect(u).toMatchObject({ ok: true, resolved: false, reason: "already_resolved" });
    expect(await countDecisions(db, "gate_rev")).toBe(1);
    expect((await readDecision(db, "gate_rev"))!.by_actor).toBe("timeout");
  });

  it("every path writes a Decision naming its mechanism (user / timeout / hold→user / policy)", async () => {
    // user resolve (a wait-default kind)
    await seedRun(db, { runId: "run_u", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_u", runId: "run_u", kind: "approve_triage", onExpiry: "wait" });
    await resolveGate(deps, { runId: "run_u", gateId: "g_u", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect((await readDecision(db, "g_u"))!.by_actor).toBe("user");

    // timeout expire (proceed_conservative)
    await seedRun(db, { runId: "run_t", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_t", runId: "run_t", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    await handleGateExpiry(deps, { gateId: "g_t", workspaceId: ws });
    expect(await readDecision(db, "g_t")).toMatchObject({ by_actor: "timeout", action: "proceed_conservative" });

    // hold (Wait for me) removes the deadline; the expiry job no-ops; then the user resolves.
    await seedRun(db, { runId: "run_h", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_h", runId: "run_h", kind: "approve_outline", onExpiry: "wait", deadlineAt: PAST });
    expect(await holdGate(deps, { gateId: "g_h", workspaceId: ws })).toEqual({ held: true });
    expect((await handleGateExpiry(deps, { gateId: "g_h", workspaceId: ws })).action).toBe("noop");
    await resolveGate(deps, { runId: "run_h", gateId: "g_h", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(await countDecisions(db, "g_h")).toBe(1);
    expect((await readDecision(db, "g_h"))!.by_actor).toBe("user");

    // policy skip (a named gate)
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_p", runId: "run_p", kind: "approve_scope", onExpiry: "wait" });
    await skipGateByPolicy(deps, { runId: "run_p", gateId: "g_p", workspaceId: ws, reason: "run_to_completion" });
    expect(await readDecision(db, "g_p")).toMatchObject({ by_actor: "policy", action: "skipped" });

    // trial pre-approval of Approve plan (REQ-SPEC-1's fourth mechanism)
    await seedRun(db, { runId: "run_tr", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_tr", runId: "run_tr", kind: "approve_plan", onExpiry: "proceed_conservative" });
    await preApproveGateByTrial(deps, { runId: "run_tr", gateId: "g_tr", workspaceId: ws });
    expect(await readDecision(db, "g_tr")).toMatchObject({ by_actor: "trial", action: "proceed_as_proposed" });
  });

  it("resolve → queued as a fresh attempt and enqueues run.resume", async () => {
    await seedRun(db, { runId: "run_q", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate", currentAttempt: 1 });
    await seedGate(db, { gateId: "g_q", runId: "run_q", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    const r = await resolveGate(deps, { runId: "run_q", gateId: "g_q", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: true, state: "queued" });
    const attempt = (await db.client.query("select current_attempt from runs where id='run_q'", [])).rows[0] as { current_attempt: number };
    expect(attempt.current_attempt).toBe(2); // fresh attempt on resume
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(1);
  });

  it("confirm_cost consent from awaiting_consent places the hold and enqueues run.start", async () => {
    await seedRun(db, { runId: "run_c", workspaceId: ws, projectId: "prj_seed", state: "awaiting_consent" });
    await seedGate(db, { gateId: "g_c", runId: "run_c", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    const r = await resolveGate(deps, { runId: "run_c", gateId: "g_c", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: true, state: "queued" });
    expect(deps.ledger.opsOf("hold")).toHaveLength(1);
    expect(deps.queue.ofName(RUN_JOBS.start)).toHaveLength(1);
  });

  it("stop cancels the run, releases the hold and revokes the credential", async () => {
    await seedRun(db, { runId: "run_s", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate", holdLedgerId: "led_h" });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_s','run_s',1,'h')", []);
    await seedGate(db, { gateId: "g_s", runId: "run_s", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    const r = await resolveGate(deps, { runId: "run_s", gateId: "g_s", workspaceId: ws, userId: "usr_seed", action: "stop" });
    expect(r).toMatchObject({ ok: true, state: "cancelled" });
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id='run_s'", [])).rows[0] as { revoked_at: Date | null };
    expect(cred.revoked_at).not.toBeNull();
  });

  it("the autonomous action sets runs.gates_off (later named gates are turned off)", async () => {
    await seedRun(db, { runId: "run_a", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g_a", runId: "run_a", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: PAST });
    await resolveGate(deps, { runId: "run_a", gateId: "g_a", workspaceId: ws, userId: "usr_seed", action: "approve_autonomous" });
    const row = (await db.client.query("select gates_off from runs where id='run_a'", [])).rows[0] as { gates_off: boolean };
    expect(row.gates_off).toBe(true);
  });
});

// A guard the property test relies on: the never-auto-proceed set is exactly the spend/refusal kinds.
it("GATE_KINDS covers twelve kinds", () => {
  expect(GATE_KINDS).toHaveLength(12);
  expect(GATE_DEFAULTS[GATE_KINDS[0] as GateKind]).toBeDefined();
});

// P1.10 / REQ-GATE-6 — Approve plan's **Keep planning** re-runs the plan step EXACTLY ONCE: the first
// request resets the gate's step row (the committed-phase count serves plan again on resume) and counts
// `runs.replans`; a second keep_planning — on the gate re-opened after the re-run — resolves WITHOUT a
// reset, so the run proceeds to the next phase instead of looping.
describe("keep_planning — the bounded one-shot re-plan (REQ-GATE-6)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = makeDeps(db);
  });
  afterEach(() => db.close());

  async function seedCommittedPlan(runId: string): Promise<string> {
    const stepId = `step_${runId}`;
    await db.client.query(
      `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at)
       values ($1,$2,'plan',2,'done',1,now(),now())`,
      [stepId, runId],
    );
    return stepId;
  }
  const stepState = (stepId: string) =>
    db.client
      .query("select state from steps where id = $1", [stepId])
      .then((r) => (r.rows[0] as { state: string }).state);
  const replans = (runId: string) =>
    db.client
      .query("select replans from runs where id = $1", [runId])
      .then((r) => (r.rows[0] as { replans: number }).replans);

  it("the first keep_planning resets the plan step + counts a replan; the run re-queues", async () => {
    await seedRun(db, { runId: "run_k", workspaceId: ws, projectId: "prj_seed", workflow: "draft", state: "waiting_gate" });
    const stepId = await seedCommittedPlan("run_k");
    await seedGate(db, { gateId: "g_k", runId: "run_k", kind: "approve_plan", onExpiry: "proceed_conservative", stepId });

    const r = await resolveGate(deps, { runId: "run_k", gateId: "g_k", workspaceId: ws, userId: "usr_seed", action: "keep_planning" });
    expect(r).toMatchObject({ ok: true, resolved: true, state: "queued" });
    expect(await stepState(stepId)).toBe("reset");
    expect(await replans("run_k")).toBe(1);
    expect(await readDecision(db, "g_k")).toMatchObject({ by_actor: "user", action: "keep_planning" });
    // the resume job re-runs the CURRENT (reset) step, not the next phase.
    expect(deps.queue.sent.some((j) => j.name === "run.resume" && (j.payload as { fromStep?: string }).fromStep === "current")).toBe(true);
  });

  it("a SECOND keep_planning does not reset again — the run proceeds to the next phase (≤1)", async () => {
    await seedRun(db, { runId: "run_k2", workspaceId: ws, projectId: "prj_seed", workflow: "draft", state: "waiting_gate" });
    const stepId = await seedCommittedPlan("run_k2");
    // the FIRST keep_planning already landed (on the gate the re-plan re-opened's predecessor).
    await seedGate(db, { gateId: "g_k1", runId: "run_k2", kind: "approve_plan", onExpiry: "proceed_conservative", stepId });
    await resolveGate(deps, { runId: "run_k2", gateId: "g_k1", workspaceId: ws, userId: "usr_seed", action: "keep_planning" });
    // the plan re-ran + recommitted; the gate re-opened on the new plan version.
    await db.client.query("update steps set state='done' where id = $1", [stepId]);
    await db.client.query("update runs set state='waiting_gate' where id='run_k2'", []);
    await seedGate(db, { gateId: "g_k2", runId: "run_k2", kind: "approve_plan", onExpiry: "proceed_conservative", stepId });

    const r = await resolveGate(deps, { runId: "run_k2", gateId: "g_k2", workspaceId: ws, userId: "usr_seed", action: "keep_planning" });
    expect(r).toMatchObject({ ok: true, resolved: true, state: "queued" });
    expect(await stepState(stepId)).toBe("done"); // NOT reset a second time
    expect(await replans("run_k2")).toBe(1); // still one re-plan
    // (the second resume job shares the first's singletonKey — the InMemoryQueue dedupes it, as pg-boss
    // would in prod; the `state:"queued"` above is the proceed-past-plan assertion.)
  });

  it("resolving a re-plan-cap refusal proceeds past the failed grounding step (REQ-WF-5)", async () => {
    await seedRun(db, { runId: "run_r", workspaceId: ws, projectId: "prj_seed", workflow: "draft", state: "waiting_gate" });
    // the failed grounding step the refusal gate is bound to.
    await db.client.query(
      `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at)
       values ('step_g3','run_r','grounding',3,'failed',1,now(),now())`,
      [],
    );
    await seedGate(db, { gateId: "g_r", runId: "run_r", kind: "refusal", onExpiry: "cancel", stepId: "step_g3" });
    const r = await resolveGate(deps, { runId: "run_r", gateId: "g_r", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: true, resolved: true, state: "queued" });
    expect(await stepState("step_g3")).toBe("done"); // completed-with-marks; the run advances past it
    expect(deps.queue.sent.some((j) => j.name === "run.resume" && (j.payload as { fromStep?: string }).fromStep === "next")).toBe(true);
  });
});

// P1.16 §14.6 — a `confirm_cost` gate on a waiting_gate run is the parked-resume re-price (steering's
// reprice seam opened it): the run kept its original hold, so consenting places an ADDITIONAL hold for
// the delta (new cap − still-held), keyed on the gate id, then the normal resume edge fires.
describe("confirm_cost on waiting_gate — the reprice delta hold (P1.16 §14.6)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = makeDeps(db);
  });
  afterEach(() => db.close());

  it("consent holds ONLY the delta (new cap − still-held) and resumes as a fresh attempt", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    // the run's original hold: 300 held of which 40 already debited → 260 still held; reprice lifted the
    // cap to 360 → the consent holds 100.
    await db.client.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
       values ('led_h1',$1,'ba_seed','hold',300,'included','run_p','hold','hold:run_p#included'),
              ('led_d1',$1,'ba_seed','debit',40,'included','run_p','run','debit:run_p:ph1#included')`,
      [ws],
    );
    await db.client.query("update runs set cap_credits = 360 where id = 'run_p'");
    await seedGate(db, { gateId: "g_rp", runId: "run_p", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });

    const r = await resolveGate(deps, { runId: "run_p", gateId: "g_rp", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: true, resolved: true, state: "queued" });
    const holds = deps.ledger.opsOf("hold");
    expect(holds).toHaveLength(1);
    expect(holds[0]!.args.credits).toBe(100); // the delta, not the full cap
    expect(holds[0]!.args.idempotencyKey).toBe("hold-delta:run_p:g_rp");
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(1); // the resume edge, not run.start
    expect(deps.queue.ofName(RUN_JOBS.start)).toHaveLength(0);
  });

  it("a delta the balance can't cover rolls the consent back — insufficient_balance, gate stays open", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await db.client.query("update runs set cap_credits = 360 where id = 'run_p'");
    await seedGate(db, { gateId: "g_rp", runId: "run_p", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    deps.ledger.primeInsufficient(true);
    const r = await resolveGate(deps, { runId: "run_p", gateId: "g_rp", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: false, reason: "insufficient_balance" });
    const g = await db.client.query("select resolved_at from gates where id = 'g_rp'");
    expect((g.rows[0] as { resolved_at: Date | null }).resolved_at).toBeNull(); // the decision rolled back
    expect(await countDecisions(db, "g_rp")).toBe(0);
  });

  it("a suspended account's consent rolls back — account_suspended", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await db.client.query("update runs set cap_credits = 360 where id = 'run_p'");
    await seedGate(db, { gateId: "g_rp", runId: "run_p", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    deps.ledger.primeSuspended(true);
    const r = await resolveGate(deps, { runId: "run_p", gateId: "g_rp", workspaceId: ws, userId: "usr_seed", action: "approve" });
    expect(r).toMatchObject({ ok: false, reason: "account_suspended" });
  });

  it("stop on a reprice gate cancels the run and releases the original hold — no delta hold is placed", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate", holdLedgerId: "led_h1" });
    await seedGate(db, { gateId: "g_rp", runId: "run_p", kind: "confirm_cost", onExpiry: "cancel", deadlineAt: PAST });
    const r = await resolveGate(deps, { runId: "run_p", gateId: "g_rp", workspaceId: ws, userId: "usr_seed", action: "stop" });
    expect(r).toMatchObject({ ok: true, state: "cancelled" });
    expect(deps.ledger.opsOf("hold")).toHaveLength(0);
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });
});
