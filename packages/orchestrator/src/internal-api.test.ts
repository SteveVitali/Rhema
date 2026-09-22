import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import {
  audit,
  commitStep,
  failStep,
  finalizeRun,
  heartbeat,
  hydration,
  postEvents,
  StaleTaskError,
} from "./internal-api.js";

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
    expect(h.overlays).toEqual([]);
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
