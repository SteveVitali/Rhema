import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryContentStore, type NewVersion } from "@rhema/mirror";
import { listCostUsd, platformCredits, sha256Hex, RATE_TABLE_V1, type MeteredUsage } from "@rhema/contracts";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import {
  audit,
  beginStep,
  commitStep,
  failRun,
  failStep,
  finalizeRun,
  harvestStep,
  heartbeat,
  hydration,
  postEvents,
  StaleTaskError,
} from "./internal-api.js";
import { rateTableCreditRenderer, TIER_MODEL } from "./credit-renderer.js";
import { SqlEventWriter } from "./event-store.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

async function stateOf(runId: string): Promise<string> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id = $1", [runId]));
  return (r.rows[0] as { state: string }).state;
}

describe("internal run API — heartbeat & first-beat transition", () => {
  it("first heartbeat takes provisioning → running and pairs the event (REQ-DATA-33)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "provisioning" });
    const res = await heartbeat(deps, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    expect(res.state).toBe("running");
    expect(await stateOf("run1")).toBe("running");
    expect(deps.eventWriter.typesForRun("run1")).toContain("run.state_changed");
    // a fresh token is returned (refresh on heartbeat).
    expect(deps.tokens.verify(res.token)?.attempt).toBe(1);
  });

  it("heartbeat returns cancelRequested once Stop has flagged it", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    await deps.heartbeats.beat({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, at: deps.clock.now() });
    await deps.heartbeats.requestCancel("run1");
    const res = await heartbeat(deps, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect(res.cancelRequested).toBe(true);
  });
});

describe("attempt fencing (REQ-RUN-15; AC2) — 409 stale_task from a superseded attempt", () => {
  beforeEach(async () => {
    // a run that has been re-enqueued: current_attempt = 2. Calls from attempt 1 are stale.
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running", currentAttempt: 2 });
  });

  it("a commit from attempt N−1 → stale_task (the task self-terminates)", async () => {
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    expect(res).toMatchObject({ ok: false, code: "stale_task", currentAttempt: 2 });
  });

  it("a heartbeat from attempt N−1 → StaleTaskError (409)", async () => {
    await expect(
      heartbeat(deps, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId }),
    ).rejects.toBeInstanceOf(StaleTaskError);
  });

  it("a POST events batch from attempt N−1 → StaleTaskError (409)", async () => {
    await expect(
      postEvents(deps, {
        runId: "run1",
        attempt: 1,
        workspaceId: seed.workspaceId,
        events: [{ type: "agent.note", payload: { template: "running_phase", text: "x" } }],
      }),
    ).rejects.toBeInstanceOf(StaleTaskError);
  });

  it("the current attempt is accepted", async () => {
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 2,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    expect(res.ok).toBe(true);
  });
});

describe("commitStep — atomicity, idempotency, gate-open", () => {
  beforeEach(async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
  });

  it("advance: records the step, accrues credits, resets the resume budget, stays running", async () => {
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 60,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    expect(res).toMatchObject({ ok: true, idempotent: false, state: "running" });
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select spent_credits, resume_count from runs where id = 'run1'", []),
      )
    ).rows[0] as { spent_credits: number; resume_count: number };
    expect(row.spent_credits).toBe(60);
    expect(deps.eventWriter.typesForRun("run1")).toContain("step.finished");
    // per-step debit coupling fired inside the commit tx (REQ-DATA-34).
    expect(deps.ledger.opsOf("debit")).toHaveLength(1);
  });

  it("is idempotent on (run, step, attempt) — a replay does not double-advance", async () => {
    const args = {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 60,
      result: { status: "done" as const, sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" as const },
    };
    await commitStep(deps, args);
    const replay = await commitStep(deps, args);
    expect(replay).toMatchObject({ ok: true, idempotent: true });
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select spent_credits from runs where id='run1'", []))
    ).rows[0] as { spent_credits: number };
    expect(row.spent_credits).toBe(60); // not doubled
  });

  it("gate: opens the gate inside the commit tx and takes running → waiting_gate (task exits)", async () => {
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 60,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "gate", gateKind: "approve_scope", blocking: false, onExpiry: "proceed_as_proposed" },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    if (res.ok) expect(res.gateId).toBeTruthy();
    expect(await stateOf("run1")).toBe("waiting_gate");
    // the parked run has a parked_until horizon (30-day auto-cancel) and no compute.
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select parked_until from runs where id='run1'", []))
    ).rows[0] as { parked_until: Date | null };
    expect(row.parked_until).not.toBeNull();
  });

  // PRB.16b LIVE FINDING 17 — the resume_partial path: a prior attempt's failStep leaves a `steps` row for
  // the ordinal, so the retried phase's commit takes the ON CONFLICT update path and the minted id never
  // lands. `gates.step_id` / `runs.current_step_id` / `debit.phaseId` must use the row that EXISTS — the
  // live 01M2SH38 attempt-5 verdict was complete and the commit 500'd on `gates_step_id_fkey`, orphaning
  // the run on resume_partial with zero step trace.
  it("a re-committed step binds the gate to the EXISTING step row id (F17)", async () => {
    await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "triage",
      ordinal: 2,
      errorClass: "artifact_missing",
      reason: "attempt 1 predicates failed",
    });
    const existing = (
      await db.client.query("select id from steps where run_id='run1' and ordinal=2", [])
    ).rows[0] as { id: string };
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "triage",
      ordinal: 2,
      of: 7,
      credits: 60,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "gate", gateKind: "approve_triage", blocking: false, onExpiry: "proceed_as_proposed" },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    const gate = (
      await db.client.query("select step_id from gates where run_id='run1'", [])
    ).rows[0] as { step_id: string };
    expect(gate.step_id).toBe(existing.id); // the row that exists — never the discarded minted id
    const run = (
      await db.client.query("select current_step_id, state from runs where id='run1'", [])
    ).rows[0] as { current_step_id: string; state: string };
    expect(run.current_step_id).toBe(existing.id);
    expect(run.state).toBe("waiting_gate");
  });

  // PRB.16b LIVE FINDING 21 — `next.deadlineAt` is a `Date` pod-side but crosses the JSON commit body
  // as an ISO STRING: `openGate`'s `deadlineAt.toISOString()` threw `TypeError: … is not a function`
  // and rolled the commit back — EVERY deadline-bearing gate kind (approve_sample & co.) was
  // uncommittable over the wire while the wait kinds (approve_triage, `deadlineMs: null`) survived.
  // Live: Quick Voice run 01M2T65W5PZ3174FPVFNQRVKZS — census harvested clean, the approve_sample
  // open 500'd, the pod recorded "commit rejected: unknown".
  it("gate: a wire-STRING deadlineAt is coerced to a Date — deadline-bearing gates commit (F21)", async () => {
    const deadline = new Date("2026-09-19T12:00:00.000Z");
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "census",
      ordinal: 0,
      of: 4,
      credits: 40,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      // the JSON body shape the pod actually POSTs — the string is the wire encoding, not a Date.
      next: {
        kind: "gate",
        gateKind: "approve_sample",
        blocking: true,
        onExpiry: "proceed_as_proposed",
        deadlineAt: deadline.toISOString() as unknown as Date,
      },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    const gate = (
      await db.client.query("select deadline_at from gates where run_id='run1'", [])
    ).rows[0] as { deadline_at: Date | null };
    expect(gate.deadline_at?.getTime()).toBe(deadline.getTime());
  });

  it("gate: a malformed wire deadlineAt degrades to wait semantics rather than crashing (F21)", async () => {
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "census",
      ordinal: 0,
      of: 4,
      credits: 40,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: {
        kind: "gate",
        gateKind: "approve_sample",
        blocking: true,
        onExpiry: "proceed_as_proposed",
        deadlineAt: "not-a-date" as unknown as Date,
      },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    const gate = (
      await db.client.query("select deadline_at from gates where run_id='run1'", [])
    ).rows[0] as { deadline_at: Date | null };
    expect(gate.deadline_at).toBeNull();
  });
});

describe("finalize, fail, hydration, audit", () => {
  it("finalizeRun: finalizing → completed, releases the hold, emits cost.final, revokes the credential", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "finalizing", holdLedgerId: "led_hold", spentCredits: 500 });
    await db.client.query(
      "insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_x','run1',1,'h')",
      [],
    );
    const res = await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      holdLedgerId: "led_hold",
      spentCredits: 500,
      capCredits: 840,
    });
    expect(res.state).toBe("completed");
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
    expect(deps.eventWriter.typesForRun("run1")).toContain("cost.final");
    // terminal revocation of the per-run proxy credential (REQ-SPEC-11).
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id='run1'", [])).rows[0] as {
      revoked_at: Date | null;
    };
    expect(cred.revoked_at).not.toBeNull();
  });

  it("hydration returns the frozen inputs + seat, fenced by attempt", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const h = await hydration(deps, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect(h.runId).toBe("run1");
    expect(h.workflow).toBe("review");
    expect(h.seat).toBe("editor");
    expect(h.overlays).toEqual([]);
  });

  // PRB.16b LIVE FINDING 14 — `runs.agent_instance_id` is never populated by run creation, so the old
  // `?? "editor"` fallback hydrated EVERY workflow as the editor seat: a Revise ran without its
  // `agents/author/**` working memory (unmounted → unharvestable → blocked predicates) while the
  // editor's private namespace was mounted instead (a boundary inversion). The workflow's declared
  // seat is the frozen authority when no agent instance is bound.
  it("hydration resolves the workflow's declared seat when no agent instance is bound", async () => {
    await seedRun(db, { runId: "rev1", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "revise", state: "running" });
    await seedRun(db, { runId: "pv1", workspaceId: seed.workspaceId, personaId: "per_t1", workflow: "profile_voice", state: "running" });
    await seedRun(db, { runId: "rv1", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "review", state: "running" });
    const revise = await hydration(deps, { runId: "rev1", attempt: 1, workspaceId: seed.workspaceId });
    const voice = await hydration(deps, { runId: "pv1", attempt: 1, workspaceId: seed.workspaceId });
    const review = await hydration(deps, { runId: "rv1", attempt: 1, workspaceId: seed.workspaceId });
    expect(revise.seat).toBe("author");
    expect(voice.seat).toBe("persona_builder");
    expect(review.seat).toBe("editor");
    // the author manifest's entries carry the author seat — never the editor's private namespace.
    expect(revise.manifest.seat).toBe("author");
    expect(revise.manifest.entries.every((e) => !e.path.startsWith("agents/editor/"))).toBe(true);
  });

  it("hydration: a bound agent instance's type_key still wins over the workflow default", async () => {
    await db.client.query(
      `insert into agent_types(key, display_name, readable, writable, persona_view, tools, skills, default_model_profile, subagents)
       values ('assistant','Assistant','{}','{}','{}','{}','{}','balanced','{}')`,
      [],
    );
    await db.client.query(
      "insert into agent_instances(id, project_id, type_key, namespace) values ('ai_a',$1,'assistant','agent:assistant')",
      [seed.projectId],
    );
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "revise", agentInstanceId: "ai_a", state: "running" });
    const h = await hydration(deps, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect(h.seat).toBe("assistant");
  });

  it("audit appends fetch_log rows carrying run/attempt", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const res = await audit(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      rows: { fetch: [{ ts: deps.clock.now(), agentLabel: "editor", kind: "fetch", url: "https://x.test", decision: "allow" }] },
    });
    expect(res.written).toBe(1);
    const row = (await db.client.query("select run_id, attempt from fetch_log where run_id='run1'", [])).rows[0] as {
      run_id: string;
      attempt: number;
    };
    expect(row).toMatchObject({ run_id: "run1", attempt: 1 });
  });
});

describe("failStep — records the failure AND surfaces it (D-P0.15e-4 observability sink)", () => {
  it("writes the steps row with {errorClass, reason} AND emits an engine.error event carrying the reason", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const reason = "SDK result subtype error_during_execution (not success) — agent error [Error]: proxy connect ETIMEDOUT";
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      errorClass: "infra",
      reason,
    });
    expect(res).toEqual({ ok: true });

    // the step row is queryable with the error class + the folded agent message.
    const step = (await db.client.query("select state, result from steps where run_id='run1' and ordinal=0", []))
      .rows[0] as { state: string; result: { errorClass: string; reason: string } };
    expect(step.state).toBe("failed");
    expect(step.result).toMatchObject({ errorClass: "infra", reason });

    // and an engine.error run event (INTERNAL) is paired in the same tx, carrying the class/phase/reason.
    expect(deps.eventWriter.typesForRun("run1")).toContain("engine.error");
    const ev = deps.eventWriter.forRun("run1").find((e) => e.type === "engine.error")!;
    expect(ev.visibility).toBe("internal"); // never streamed to the user SSE
    expect(ev.payload).toMatchObject({ errorClass: "infra", phase: "intake", ordinal: 0, reason });
  });

  it("a superseded attempt fails with stale_task and writes nothing", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running", currentAttempt: 2 });
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      errorClass: "infra",
    });
    expect(res).toEqual({ ok: false, code: "stale_task", currentAttempt: 2 });
    expect(deps.eventWriter.typesForRun("run1")).not.toContain("engine.error");
  });
});

describe("failStep — terminal phase failures finalize the run in one tx (PRB.16b; LIVE FINDING 13)", () => {
  // The live defect: a pod that died on `402 cap reached` (or a phase that self-reported blocked) left the
  // run `running`; the heartbeat went stale → orphaned → stranded-sweep re-enqueue → new pod → instant 402.
  // The step-fail endpoint now takes `running → failed` + reconciles spend + releases the hold + revokes the
  // credential inside the SAME transaction, so the reaper sees a terminal run.
  async function seedTerminalFixture(state = "running"): Promise<void> {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state,
      holdLedgerId: "led_hold",
    });
    await db.client.query(
      "insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_1','run1',1,'h')",
      [],
    );
    // the proxy's usage rows of record: 65 credits metered but never committed (the phase died mid-flight).
    await db.client.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values ('ur_1', now(), $1, $2, 'run1', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, 65, 'proxy')`,
      [seed.workspaceId, seed.billingAccountId],
    );
  }

  async function runRow(): Promise<{ state: string; spent_credits: number; failure: { code: string } | null; ended_at: Date | null }> {
    return (
      await db.client.query("select state, spent_credits, failure, ended_at from runs where id = 'run1'", [])
    ).rows[0] as { state: string; spent_credits: number; failure: { code: string } | null; ended_at: Date | null };
  }

  it("a cap-402 reason takes running → failed + releases the hold + revokes the credential + reconciles spend", async () => {
    await seedTerminalFixture();
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "craft",
      ordinal: 1,
      errorClass: "infra",
      reason: "SDK result subtype error_during_execution — agent error [api_error]: run run1 has reached its cap of 60 credits (402)",
    });
    expect(res).toEqual({ ok: true, terminal: "cap_reached" });

    const row = await runRow();
    expect(row.state).toBe("failed");
    expect(row.failure).toMatchObject({ code: "cap_reached" });
    expect(row.ended_at).not.toBeNull();
    expect(row.spent_credits).toBe(65); // reconciled from the proxy's usage rows
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id='run1'", [])).rows[0] as {
      revoked_at: Date | null;
    };
    expect(cred.revoked_at).not.toBeNull();
    // the paired state_changed event rode the same tx; the step row still records the failure.
    expect(deps.eventWriter.typesForRun("run1")).toEqual(
      expect.arrayContaining(["engine.error", "run.state_changed"]),
    );
    const step = (await db.client.query("select state from steps where run_id='run1' and ordinal=1", [])).rows[0] as {
      state: string;
    };
    expect(step.state).toBe("failed");
  });

  it("a `budget` error class terminalizes identically (the engine's 402 subtype)", async () => {
    await seedTerminalFixture();
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "verification",
      ordinal: 2,
      errorClass: "budget",
      reason: "SDK result subtype budget (not success)",
    });
    expect(res).toEqual({ ok: true, terminal: "cap_reached" });
    const row = await runRow();
    expect(row.state).toBe("failed");
    expect(row.spent_credits).toBe(65);
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("a `blocked` phase result terminalizes as phase_blocked (the dossier-visibility block)", async () => {
    await seedTerminalFixture();
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "bootstrap",
      ordinal: 0,
      errorClass: "blocked",
      reason: "phase-result blocked [sdk=success]",
    });
    expect(res).toEqual({ ok: true, terminal: "phase_blocked" });
    const row = await runRow();
    expect(row.state).toBe("failed");
    expect(row.failure).toMatchObject({ code: "phase_blocked" });
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("a `research_preflight_failed` class terminalizes the run — zero debit, hold released (RES.1)", async () => {
    // REQ-SPEC-31(3): a refused model × tool pair fails the run BEFORE any phase debits — the hold
    // releases, the probe burn is absorbed, and `runs.failure.code` is the sweep's alert dedupe key.
    await seedTerminalFixture();
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "bootstrap",
      ordinal: 0,
      errorClass: "research_preflight_failed",
      reason: "research preflight failed — claude-b×web_fetch HTTP 400 (invalid_request_error)",
    });
    expect(res).toEqual({ ok: true, terminal: "research_preflight_failed" });
    const row = await runRow();
    expect(row.state).toBe("failed");
    expect(row.failure).toMatchObject({ code: "research_preflight_failed" });
    expect(row.spent_credits).toBe(65); // reconciled metered burn, never a user debit
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("a provider outage after the retry budget terminalizes failed and refunds committed spend", async () => {
    await seedTerminalFixture();
    // Attempt 3 is the exhausted-retries leg (engine retry + orchestrator re-attempts). The pod reports
    // provider_transient only once it can no longer retry the same provider failure.
    await db.client.query("update runs set current_attempt = 3 where id = 'run1'", []);
    await db.client.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
       values ('led_d1', $1, $2, 'debit', 30, 'included', 'run1', 'run', 'debit:run1:intake:3#included', now())`,
      [seed.workspaceId, seed.billingAccountId],
    );

    const res = await failStep(deps, {
      runId: "run1",
      attempt: 3,
      workspaceId: seed.workspaceId,
      stepKey: "triage",
      ordinal: 1,
      errorClass: "provider_transient",
      reason: "provider returned 529 through the exhausted retry budget",
    });
    expect(res).toEqual({ ok: true, terminal: "provider_outage" });
    const row = await runRow();
    expect(row.state).toBe("failed");
    expect(row.failure).toMatchObject({ code: "provider_outage" });
    expect(deps.ledger.opsOf("refund").map((o) => (o.args as { credits: number }).credits)).toEqual([30]);
    expect(deps.eventWriter.typesForRun("run1")).toContain("cost.refunded");
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("a non-terminal class leaves the run running for the caller/reaper to decide", async () => {
    await seedTerminalFixture();
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "intake",
      ordinal: 0,
      errorClass: "infra",
      reason: "SDK result subtype error_during_execution — agent error [Error]: socket hangup",
    });
    expect(res).toEqual({ ok: true });
    const row = await runRow();
    expect(row.state).toBe("running");
    expect(row.ended_at).toBeNull();
    expect(deps.ledger.opsOf("release")).toHaveLength(0);
  });

  it("a terminal report on a run no longer `running` records the step but does not transition", async () => {
    // the pod was mid-cancel: `cancelling` has no →failed edge; the step fact still lands and the
    // cancellation path owns the terminal settle.
    await seedTerminalFixture("cancelling");
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "craft",
      ordinal: 1,
      errorClass: "budget",
    });
    expect(res).toEqual({ ok: true });
    const row = await runRow();
    expect(row.state).toBe("cancelling");
    expect(deps.ledger.opsOf("release")).toHaveLength(0);
    const step = (await db.client.query("select state from steps where run_id='run1' and ordinal=1", [])).rows[0] as {
      state: string;
    };
    expect(step.state).toBe("failed");
  });
});

describe("harvest — provisional sdk_stream usage priced by the rate table (D-P0.08-2; REQ-PROD-15)", () => {
  it("the provisional usage.tick lands within ±2% of the proxy-metered figure at production scale", async () => {
    // The production pod posts each phase's SDK usage here (POST /internal/runs/:id/steps/:key/harvest), and
    // run-routes binds `rateTableCreditRenderer`. Drive the REAL handler + the REAL renderer over a
    // production-scale snapshot and compare against the figure the egress proxy would meter for the same
    // usage — list cost under the run's pinned table at the tier's representative model × the platform peg.
    // This is the deterministic half of §12.7 cross-check-1 (the live ±2% leg is PRB.17's).
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
      currentAttempt: 1,
      spentCredits: 200,
      capCredits: 2091,
    });
    const usage = {
      inputTokens: 1_800_000,
      outputTokens: 120_000,
      cacheReadTokens: 3_000_000,
      cacheCreationTokens: 250_000,
      webSearchRequests: 4,
      webFetchRequests: 2,
      // The SDK's own cost figure (what a real result message reports) — distinct from the rate-table
      // price above so the sdk_estimate row proves it records THIS number, not the rendered figure.
      costUsd: 4.213,
    };
    const res = await harvestStep(
      { ...deps, store: new InMemoryContentStore(), renderCredits: rateTableCreditRenderer },
      {
        runId: "run1",
        attempt: 1,
        workspaceId: seed.workspaceId,
        stepKey: "intake",
        ordinal: 0,
        seat: "editor",
        versions: [],
        usage,
      },
    );
    expect(res.ok).toBe(true);

    const metered: MeteredUsage = {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheCreationTokens,
      webSearchRequests: usage.webSearchRequests,
      webFetchRequests: usage.webFetchRequests,
    };
    const proxyCredits = platformCredits(listCostUsd(metered, RATE_TABLE_V1, TIER_MODEL.balanced!));
    expect(proxyCredits).toBeGreaterThan(0);
    if (res.ok) {
      const divergence = Math.abs(res.provisionalCredits - proxyCredits) / proxyCredits;
      expect(divergence).toBeLessThanOrEqual(0.02); // within the §17 exit tolerance — only the display round
    }

    // the provisional rows + the usage.tick event carry it; the sdk_stream row is a display figure,
    // never the meter. The sdk_estimate row lands beside it (D-P0.15-2): the SDK's own costUsd
    // platform-priced — the figure of record the ±2% cross-check diffs the proxy's list_cost_usd
    // against on live runs.
    const rows = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select credits, list_cost_usd, source from usage_records where run_id='run1' order by source", []),
      )
    ).rows as { credits: number; list_cost_usd: number; source: string }[];
    const stream = rows.find((r) => r.source === "sdk_stream");
    const estimate = rows.find((r) => r.source === "sdk_estimate");
    expect(stream).toBeDefined();
    expect(Number(stream!.list_cost_usd)).toBe(0);
    expect(estimate).toBeDefined();
    expect(Number(estimate!.list_cost_usd)).toBe(usage.costUsd);
    expect(Number(estimate!.credits)).toBe(Math.round(platformCredits(usage.costUsd)));
    const tick = deps.eventWriter.forRun("run1").find((e) => e.type === "usage.tick");
    expect(tick?.payload).toMatchObject({ spentCredits: 200 + Number(stream!.credits), capCredits: 2091 });
  });
});

describe("P1.10 — Draft grounding back-edge: bounded re-plan, then a refusal Approval (REQ-WF-5)", () => {
  const commitPhase = (stepKey: string, ordinal: number) =>
    commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey,
      ordinal,
      of: 8,
      credits: 1,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });

  const stepRows = () =>
    db.client
      .query("select ordinal, state, result from steps where run_id='run1' order by ordinal", [])
      .then((r) => r.rows as { ordinal: number; state: string; result: { reset?: string; fromPhase?: string; reason?: string } | null }[]);
  const replans = () =>
    db.client
      .query("select replans from runs where id='run1'", [])
      .then((r) => (r.rows[0] as { replans: number }).replans);

  it("a 'replan' self-report on grounding resets the committed plan step (failure rides as context) + counts runs.replans", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    await commitPhase("intake", 0);
    await commitPhase("voice", 1);
    await commitPhase("plan", 2);

    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "grounding",
      ordinal: 3,
      errorClass: "replan",
      reason: "claims C2,C5 could not be verified",
    });
    expect(res).toMatchObject({ ok: true, backEdge: { to: ["plan"], replans: 1 } });
    expect(await stateOf("run1")).toBe("running"); // never parks, never finalizes
    expect(await replans()).toBe(1);
    const steps = await stepRows();
    // the back-edge target's committed row resets (the runspec reads the marker into the re-plan's input);
    // the failing grounding row stays 'failed' (a re-run upserts it).
    expect(steps.find((s) => s.ordinal === 2)).toMatchObject({
      state: "reset",
      result: { reset: "replan", fromPhase: "grounding", reason: "claims C2,C5 could not be verified" },
    });
    expect(steps.find((s) => s.ordinal === 3)?.state).toBe("failed");
    // intake + voice stay committed — the back-edge re-runs from plan only.
    expect(steps.find((s) => s.ordinal === 0)?.state).toBe("done");
    expect(steps.find((s) => s.ordinal === 1)?.state).toBe("done");
  });

  it("the (cap+1)-th grounding failure opens a blocking refusal Approval and parks waiting_gate — never a silent continue", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    await db.client.query("update runs set replans = 2 where id = 'run1'", []); // ITERATION_CAPS.replan consumed
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "grounding",
      ordinal: 3,
      errorClass: "replan",
      reason: "claim C9 still unverifiable",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(typeof res.gateId).toBe("string");
    expect(await stateOf("run1")).toBe("waiting_gate");
    const gate = (
      await db.client.query("select kind, blocking, on_expiry, resolved_at from gates where run_id='run1'", [])
    ).rows[0] as { kind: string; blocking: boolean; on_expiry: string; resolved_at: unknown } | undefined;
    expect(gate).toMatchObject({ kind: "refusal", blocking: true, on_expiry: "cancel", resolved_at: null });
    expect(await replans()).toBe(2); // the refusal does NOT consume a fourth re-plan
    expect(deps.eventWriter.typesForRun("run1")).toContain("gate.opened");
  });

  it("a 'replan' self-report on a workflow WITHOUT backEdges stays terminal (phase_replan — regression)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "verification",
      ordinal: 2,
      errorClass: "replan",
      reason: "replan",
    });
    expect(res).toMatchObject({ ok: true });
    expect(await stateOf("run1")).toBe("failed");
  });
});

describe("P1.10 — trial preview pre-resolves Approve plan by:'trial' (§6.4 item 3; REQ-CHAT-30)", () => {
  it("commitStep's approve_plan gate on a preview run resolves immediately + re-queues", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    await db.client.query("update runs set inputs = $2::jsonb where id = $1", [
      "run1",
      JSON.stringify({ preview: { sections: 1 }, grounding: false, audit: false }),
    ]);
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "plan",
      ordinal: 2,
      of: 8,
      credits: 4,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "gate", gateKind: "approve_plan", blocking: true, onExpiry: "proceed_conservative" },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    const gateId = res.ok ? res.gateId : undefined;
    expect(gateId).toBeTruthy();
    // the gate resolved post-commit with the trial mechanism's decision, and the run re-queued.
    const dec = (
      await db.client.query("select by_actor, action from decisions where gate_id = $1", [gateId])
    ).rows[0] as { by_actor: string; action: string } | undefined;
    expect(dec).toMatchObject({ by_actor: "trial", action: "proceed_as_proposed" });
    expect(await stateOf("run1")).toBe("queued");
    expect(deps.queue.sent.some((j) => j.name === "run.resume")).toBe(true);
    // the plan step committed (the gate resolved, it did not reset).
    const step = (
      await db.client.query("select state from steps where run_id='run1' and ordinal=2", [])
    ).rows[0] as { state: string };
    expect(step.state).toBe("done");
  });

  it("a non-preview draft run's Approve plan stays open (no trial pre-resolution)", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    const res = await commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "plan",
      ordinal: 2,
      of: 8,
      credits: 4,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "gate", gateKind: "approve_plan", blocking: true, onExpiry: "proceed_conservative" },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });
    const gate = (
      await db.client.query("select resolved_at from gates where run_id='run1'", [])
    ).rows[0] as { resolved_at: unknown };
    expect(gate.resolved_at).toBeNull();
  });
});

describe("P1.10 — harvest emits section.drafted from the committed 04-draft-ledger (REQ-WF-4/7)", () => {
  const LEDGER = [
    "# Draft ledger — piece v3",
    "",
    "## Sections",
    "",
    "| # | Section | Function | Budget | Actual | Status | Claim rows | Deviation |",
    "|---|---|---|---|---|---|---|---|",
    "| 1 | Opening | intro | 700 | 720 | verified | C1 | — |",
    "| 2 | Middle | develop | 900 | 880 | drafted | C2 | — |",
    "| 3 | Close | land it | 400 | — | planned | — | — |",
    "",
  ].join("\n");
  const USAGE = {
    inputTokens: 10,
    outputTokens: 5,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    webSearchRequests: 0,
    webFetchRequests: 0,
    costUsd: 0.01,
  };
  function ledgerVersion(): NewVersion {
    const bytes = Buffer.from(LEDGER, "utf8");
    return {
      path: "agents/author/drafting/v3/04-draft-ledger.md",
      root: "project",
      kind: "draft_ledger",
      namespace: "agent:author",
      sha256: sha256Hex(bytes),
      bytes,
      wordCount: 24,
    };
  }
  async function sectionRows(): Promise<{ sectionRef: string; words: number; budget?: number }[]> {
    return (
      await db.client.query(
        "select payload from run_events where run_id='run1' and type='section.drafted' order by seq",
        [],
      )
    ).rows.map((r) => (r as { payload: { sectionRef: string; words: number; budget?: number } }).payload);
  }

  it("emits drafted rows in plan order with words + budget — 'planned' rows are NOT emitted", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    // The DURABLE writer — the dedupe query reads `run_events`, which only SqlEventWriter populates.
    const res = await harvestStep(
      { ...deps, store: new InMemoryContentStore(), eventWriter: new SqlEventWriter() },
      {
        runId: "run1",
        attempt: 1,
        workspaceId: seed.workspaceId,
        stepKey: "draft",
        ordinal: 4,
        seat: "author",
        versions: [ledgerVersion()],
        usage: USAGE,
      },
    );
    expect(res.ok).toBe(true);
    expect(await sectionRows()).toEqual([
      { sectionRef: "Opening", words: 720, budget: 700 },
      { sectionRef: "Middle", words: 880, budget: 900 },
    ]);
  });

  it("a re-harvest of the same ledger does NOT double-emit a sectionRef (dedupe on the durable row)", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
    });
    const writerDeps = { ...deps, store: new InMemoryContentStore(), eventWriter: new SqlEventWriter() };
    const args = {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "draft",
      ordinal: 4,
      seat: "author" as const,
      versions: [ledgerVersion()],
      usage: USAGE,
    };
    expect((await harvestStep(writerDeps, args)).ok).toBe(true);
    // a retried phase / ledger re-harvest commits the same rows again — the dedupe must hold.
    expect((await harvestStep(writerDeps, args)).ok).toBe(true);
    expect(await sectionRows()).toHaveLength(2);
  });
});

// DEF.2/F5 — the committed-vs-metered fix: commits debit the proxy-metered incremental (the pod's figure
// is the floor + the unmetered-environment fallback), completed runs settle the remainder before the
// release, failed runs refund net debits by default, and every terminal settle books the un-paid metered
// burn `absorbed` (platform COGS — REQ-SPEC-24.8). The TestHoldLedger records the port calls; seeded
// credit_ledger rows stand in for the ledger writes a real SqlHoldLedger persists.
describe("DEF.2/F5 — committed vs metered: incremental debits + terminal settles", () => {
  const DONE = { status: "done" as const, sdkSubtype: "success", predicatesPassed: true, compactions: 0 };
  const seedUsage = (id: string, runId: string, attempt: number, credits: number) =>
    db.client.query(
      `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values ($1, now(), $2, $3, $4, $5, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, $6, 'proxy')`,
      [id, seed.workspaceId, seed.billingAccountId, runId, attempt, credits],
    );
  const seedDebit = (id: string, runId: string, key: string, credits: number) =>
    db.client.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
       values ($1, $2, $3, 'debit', $4, 'included', $5, 'run', $6, now())`,
      [id, seed.workspaceId, seed.billingAccountId, credits, runId, key],
    );
  const debitCredits = () => deps.ledger.opsOf("debit").map((o) => (o.args as { credits: number }).credits);
  const commit = (stepKey: string, ordinal: number, credits: number) =>
    commitStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey,
      ordinal,
      of: 3,
      credits,
      result: DONE,
      next: { kind: "advance" },
    });

  it("commitStep debits the proxy-metered delta when it outruns the pod's figure (REQ-SPEC-11)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await seedUsage("ur_1", "run1", 1, 65);
    await commit("intake", 0, 10);
    // pod said 10; the meter says 65 — the commit charges the metered total, not the claim.
    expect(debitCredits()).toEqual([65]);

    // mirror what a real ledger persisted (the test double records ops without writing rows).
    await seedDebit("led_c1", "run1", "debit:run1:intake:1#included", 65);
    await seedUsage("ur_2", "run1", 1, 8); // attempt-metered total now 73
    await commit("triage", 1, 8);
    // incremental: 73 − 65 = 8 — only the uncommitted burn is charged (no double-charge).
    expect(debitCredits()).toEqual([65, 8]);
  });

  it("commitStep falls back to the pod figure where no proxy rows exist (unmetered env)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await commit("intake", 0, 42);
    expect(debitCredits()).toEqual([42]);
    // a replayed commit stays a no-op — the idempotent path never reaches the debit.
    await commit("intake", 0, 42);
    expect(debitCredits()).toEqual([42]);
  });

  it("a terminal failStep refunds the run's net committed debits, then absorbs the metered burn", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
      holdLedgerId: "led_hold",
    });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_1','run1',1,'h')", []);
    await seedUsage("ur_1", "run1", 1, 65); // 65 metered; only 30 ever committed
    await seedDebit("led_d1", "run1", "debit:run1:intake:1#included", 30);

    const res = await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "craft",
      ordinal: 1,
      errorClass: "budget",
      reason: "SDK result subtype budget (not success)",
    });
    expect(res).toEqual({ ok: true, terminal: "cap_reached" });
    // §12.4 step 9 — a failed run refunds its debits; the settle owns the figure (no caller-provided number).
    expect(deps.ledger.opsOf("refund").map((o) => (o.args as { credits: number }).credits)).toEqual([30]);
    // post-refund the charge is 0 and the whole metered burn absorbs — under a real SqlHoldLedger the
    // refund rows persist in-tx (gap = 65 − 0). The recording double writes no rows, so the gap read
    // still nets the seeded debit: 65 − 30 = 35. The row-level math is covered in the spend tests.
    expect(deps.ledger.opsOf("absorb").map((o) => (o.args as { credits: number }).credits)).toEqual([35]);
    expect(deps.eventWriter.typesForRun("run1")).toContain("cost.refunded");
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });

  it("failRun refunds net debited BY DEFAULT (an explicit 0 is the only opt-out)", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "running",
      holdLedgerId: "led_hold",
    });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_1','run1',1,'h')", []);
    await seedUsage("ur_1", "run1", 1, 50);
    await seedDebit("led_d1", "run1", "debit:run1:intake:1#included", 40);
    await failRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      from: "running",
      failure: { code: "validation", message: "sidecar parse", retryable: false },
      holdLedgerId: "led_hold",
    });
    // no refundCredits passed → the settle refunds the whole net committed charge.
    expect(deps.ledger.opsOf("refund").map((o) => (o.args as { credits: number }).credits)).toEqual([40]);
    // absorb = metered − still-visible net debits (the double's refund writes no rows): 50 − 40 = 10.
    expect(deps.ledger.opsOf("absorb").map((o) => (o.args as { credits: number }).credits)).toEqual([10]);
    expect(deps.eventWriter.typesForRun("run1")).toContain("cost.refunded");
  });

  it("finalizeRun debits the attempt's metered remainder BEFORE releasing the hold", async () => {
    await seedRun(db, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "finalizing",
      holdLedgerId: "led_hold",
      spentCredits: 40,
    });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_1','run1',1,'h')", []);
    await seedUsage("ur_1", "run1", 1, 65); // 65 metered; the phase commits debited 40
    await seedDebit("led_d1", "run1", "debit:run1:intake:1#included", 40);

    const res = await finalizeRun(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      holdLedgerId: "led_hold",
      spentCredits: 40,
      capCredits: 840,
    });
    expect(res.state).toBe("completed");
    // the catch-up debit: 65 metered − 40 committed = 25, keyed debit:<run>:settle:<attempt>.
    const settles = deps.ledger.opsOf("debit");
    expect(settles.map((o) => (o.args as { credits: number }).credits)).toEqual([25]);
    expect((settles[0]!.args as { idempotencyKey: string }).idempotencyKey).toBe("debit:run1:settle:1");
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// RPT.1 — the intra-phase meter (heartbeat-carried provisional usage.tick), the phase's real start
// (beginStep), and truthful committed durations (server-derived ended−started).

describe("RPT.1 — beginStep + the live intra-phase meter (REQ-IDE-11; §12.7; Manifest #10)", () => {
  const seedUsage = (id: string, runId: string, credits: number, stepId = "step:intake") =>
    db.client.query(
      `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, attempt, step_id, role,
         provider, model, model_tier, rate_table_version, list_cost_usd, credits, source)
       values ($1, now(), $2, $3, $4, 1, $5, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, $6, 'proxy')`,
      [id, seed.workspaceId, seed.billingAccountId, runId, stepId, credits],
    );
  // the heartbeat's tick dedupe reads the DURABLE run_events rows — so tests bind the SqlEventWriter
  // (the in-memory writer would never back the "last tick" read) and read ticks back off the table.
  const sqlDeps = (): TestDeps => ({ ...deps, eventWriter: new SqlEventWriter() });
  const usageTicks = async (runId: string) =>
    (
      (await db.client.query(
        "select payload from run_events where run_id = $1 and type = 'usage.tick' order by seq",
        [runId],
      )).rows as { payload: string | { spentCredits: number; capCredits: number; provisional?: boolean } }[]
    ).map((r) => (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload));

  it("beats emit ascending provisional usage.tick payloads as proxy rows land mid-phase", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running", capCredits: 840 });
    await beginStep(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3 });

    // three metered proxy responses land inside ONE phase — each beat publishes the new total.
    await seedUsage("ur_1", "run1", 12);
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    await seedUsage("ur_2", "run1", 18);
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    await seedUsage("ur_3", "run1", 25);
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });

    const ticks = await usageTicks("run1");
    expect(ticks.map((t) => t.spentCredits)).toEqual([12, 30, 55]); // strictly ascending, ≥3
    expect(ticks.every((t) => t.provisional === true)).toBe(true);
    expect(ticks.every((t) => t.capCredits === 840)).toBe(true);

    // a beat with no new metered usage appends NOTHING (the meter is dedup'd, not noisy).
    const before = (await usageTicks("run1")).length;
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect((await usageTicks("run1")).length).toBe(before);

    // the committed figure replaces the provisional one: after commit the tick loses its marker.
    await commitStep(d, {
      runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3,
      credits: 55, result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    const last = (await usageTicks("run1")).at(-1)!;
    expect(last.provisional).toBe(false);
    expect(last.spentCredits).toBe(55);
  });

  it("the provisional figure never exceeds the cap line", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running", capCredits: 40 });
    await seedUsage("ur_1", "run1", 90); // metered past the cap — the clamp keeps the tick at 40
    await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect((await usageTicks("run1")).at(-1)!.spentCredits).toBe(40);
  });

  it("no tick emits on the first beat (provisioning → running) or for a missing run", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "provisioning" });
    const res = await heartbeat(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId });
    expect(res.state).toBe("running");
    expect(await usageTicks("run1")).toHaveLength(0);
  });

  it("beginStep stamps steps.state='running' + emits step.started once; a duplicate is a no-op", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const t0 = deps.clock.now();
    const res = await beginStep(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3 });
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select state, started_at, ended_at from steps where run_id = 'run1' and ordinal = 0")).rows[0] as {
      state: string; started_at: Date; ended_at: Date | null;
    };
    expect(row.state).toBe("running");
    expect(new Date(row.started_at).getTime()).toBe(t0.getTime());
    expect(row.ended_at).toBeNull();
    const started = (await db.client.query(
      "select payload from run_events where run_id = 'run1' and type = 'step.started'",
    )).rows;
    expect(started).toHaveLength(1);
    expect((started[0] as { payload: { phase: string; ordinal: number; of: number } }).payload).toMatchObject(
      { phase: "intake", ordinal: 0, of: 3 },
    );

    // a second begin while running: no re-stamp, no duplicate event.
    deps.clock.advance(5_000);
    await beginStep(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3 });
    const after = (await db.client.query("select started_at from steps where run_id = 'run1' and ordinal = 0")).rows[0] as { started_at: Date };
    expect(new Date(after.started_at).getTime()).toBe(t0.getTime());
    expect((await db.client.query("select 1 from run_events where run_id = 'run1' and type = 'step.started'")).rows).toHaveLength(1);
  });

  it("beginStep fences a stale attempt (REQ-RUN-15)", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running", currentAttempt: 2 });
    await expect(
      beginStep(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3 }),
    ).rejects.toBeInstanceOf(StaleTaskError);
  });

  it("a committed step's ended_at − started_at is the phase's real duration; step.finished carries it", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await beginStep(d, { runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3 });
    deps.clock.advance(2 * 60_000); // the phase ran 2 minutes
    await commitStep(d, {
      runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3,
      credits: 12, result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    const row = (await db.client.query(
      "select extract(epoch from (ended_at - started_at)) * 1000 as ms from steps where run_id = 'run1' and ordinal = 0",
    )).rows[0] as { ms: number };
    expect(Math.round(row.ms)).toBe(120_000);
    const finished = (await db.client.query(
      "select payload from run_events where run_id = 'run1' and type = 'step.finished'",
    )).rows[0] as { payload: { phase: string; durationMs?: number } };
    expect(finished.payload).toMatchObject({ phase: "intake", durationMs: 120_000 });
  });

  it("a commit WITHOUT a begin stamps now for both ends → equal timestamps → no durationMs (renders —)", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await commitStep(d, {
      runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3,
      credits: 12, result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    const row = (await db.client.query(
      "select started_at, ended_at from steps where run_id = 'run1' and ordinal = 0",
    )).rows[0] as { started_at: Date; ended_at: Date };
    expect(new Date(row.ended_at).getTime()).toBe(new Date(row.started_at).getTime()); // legacy shape
    const finished = (await db.client.query(
      "select payload from run_events where run_id = 'run1' and type = 'step.finished'",
    )).rows[0] as { payload: { durationMs?: number } };
    expect(finished.payload.durationMs).toBeUndefined();
  });

  it("the caller-measured durationMs is the fallback when no begin row exists", async () => {
    const d = sqlDeps();
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await commitStep(d, {
      runId: "run1", attempt: 1, workspaceId: seed.workspaceId, stepKey: "intake", ordinal: 0, of: 3,
      credits: 12, durationMs: 90_000,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
    const row = (await db.client.query(
      "select extract(epoch from (ended_at - started_at)) * 1000 as ms from steps where run_id = 'run1' and ordinal = 0",
    )).rows[0] as { ms: number };
    expect(Math.round(row.ms)).toBe(90_000); // started_at back-derived → a real span, not equal stamps
  });
});
