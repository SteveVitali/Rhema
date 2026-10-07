import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";
import {
  sweepStrandedRuns,
  STUCK_PROVISIONING_MS,
  STRANDED_QUEUED_MS,
  type StrandedSweepDeps,
} from "./stranded-sweep.js";
import { handleGateExpiry } from "./gate-expiry.js";
import { RUN_JOBS, GATE_EXPIRY_QUEUE } from "./queue.js";

// D-P0.08-4 + D-P0.10-2 (PRB.14): the system-scoped stranded-run sweep. A worker crash in the
// commit→enqueue window (or before a provisioning run's first heartbeat) leaves a row the heartbeat
// reaper can never see; this sweep fails the stuck launch / re-sends the lost job / re-arms the parked
// gate's expiry — every mutation through the ordinary transitions + singleton-keyed sends.

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

const NOW = new Date("2026-09-16T12:00:00Z");
const AGO = (ms: number) => new Date(NOW.getTime() - ms);

const sweepDeps = (): StrandedSweepDeps => ({ ...deps, systemExec: db.client });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

async function stateOf(runId: string): Promise<string> {
  const r = await db.client.query("select state from runs where id = $1", [runId]);
  return (r.rows[0] as { state: string }).state;
}

describe("leg A — stuck provisioning (D-P0.08-4)", () => {
  it("fails a provisioning run past the launch SLO, releasing writer lock + hold + credential", async () => {
    await seedRun(db, {
      runId: "run_stuck",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "provisioning",
      stateSince: AGO(STUCK_PROVISIONING_MS + 60_000),
      holdLedgerId: "led_hold",
    });
    // the writer lock a stuck provisioning run holds (admitRun took it before the launch died)
    await db.client.query("update projects set active_writer_run_id = 'run_stuck' where id = $1", [seed.projectId]);
    // and the proxy credential it minted before the launch
    await db.client.query(
      "insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_1','run_stuck',1,'h')",
      [],
    );

    const out = await sweepStrandedRuns(sweepDeps());
    expect(out).toEqual([
      { kind: "provisioning_failed", runId: "run_stuck", workspaceId: seed.workspaceId },
    ]);
    expect(await stateOf("run_stuck")).toBe("failed");

    // ordinary terminal-transition cleanup: writer lock released, hold released, credential revoked,
    // the run.state_changed event paired with the edge, ended_at stamped.
    const proj = (await db.client.query("select active_writer_run_id from projects where id = $1", [seed.projectId]))
      .rows[0] as { active_writer_run_id: string | null };
    expect(proj.active_writer_run_id).toBeNull();
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id = 'run_stuck'"))
      .rows[0] as { revoked_at: Date | null };
    expect(cred.revoked_at).not.toBeNull();
    const run = (await db.client.query("select ended_at, failure from runs where id = 'run_stuck'")).rows[0] as {
      ended_at: Date | null;
      failure: { code: string };
    };
    expect(run.ended_at).not.toBeNull();
    expect(run.failure.code).toBe("provisioning_timeout");
    expect(
      deps.eventWriter
        .forRun("run_stuck")
        .some((e) => e.type === "run.state_changed" && (e.payload as { to: string }).to === "failed"),
    ).toBe(true);
  });

  it("leaves a provisioning run inside the SLO and a live (running) run alone", async () => {
    await seedRun(db, {
      runId: "run_fresh",
      workspaceId: seed.workspaceId,
      state: "provisioning",
      stateSince: AGO(60_000), // inside the 15-min SLO
    });
    await seedRun(db, {
      runId: "run_live",
      workspaceId: seed.workspaceId,
      state: "running",
      stateSince: AGO(STUCK_PROVISIONING_MS + 60_000), // old, but heartbeating — the reaper's job
    });
    const out = await sweepStrandedRuns(sweepDeps());
    expect(out.filter((o) => o.kind === "provisioning_failed")).toEqual([]);
    expect(await stateOf("run_fresh")).toBe("provisioning");
    expect(await stateOf("run_live")).toBe("running");
  });
});

describe("leg B — stranded queued (D-P0.10-2)", () => {
  it("re-enqueues a queued run past the threshold as run.start (attempt 1)", async () => {
    await seedRun(db, {
      runId: "run_q",
      workspaceId: seed.workspaceId,
      state: "queued",
      stateSince: AGO(STRANDED_QUEUED_MS + 5_000),
    });
    const out = await sweepStrandedRuns(sweepDeps());
    expect(out).toEqual([
      { kind: "queued_reenqueued", runId: "run_q", workspaceId: seed.workspaceId, attempt: 1 },
    ]);
    const jobs = deps.queue.ofName(RUN_JOBS.start);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ payload: { runId: "run_q" }, singletonKey: "run_q" });
    expect(await stateOf("run_q")).toBe("queued"); // the row is unchanged — the job re-drives admission
  });

  it("re-enqueues a resumed run (attempt > 1) as run.resume so reDebitOnResume still fires", async () => {
    await seedRun(db, {
      runId: "run_res",
      workspaceId: seed.workspaceId,
      state: "queued",
      currentAttempt: 3,
      stateSince: AGO(STRANDED_QUEUED_MS + 5_000),
    });
    await sweepStrandedRuns(sweepDeps());
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(1);
    expect(deps.queue.ofName(RUN_JOBS.start)).toHaveLength(0);
  });

  it("singleton dedup makes a re-sweep a no-op while the job is still active; a fresh queued run is left", async () => {
    await seedRun(db, {
      runId: "run_q",
      workspaceId: seed.workspaceId,
      state: "queued",
      stateSince: AGO(STRANDED_QUEUED_MS + 5_000),
    });
    await seedRun(db, {
      runId: "run_new",
      workspaceId: seed.workspaceId,
      state: "queued",
      stateSince: AGO(10_000), // just queued — its post-commit send is still landing
    });
    await sweepStrandedRuns(sweepDeps());
    await sweepStrandedRuns(sweepDeps()); // the second pass re-scans but the send dedupes
    expect(deps.queue.ofName(RUN_JOBS.start)).toHaveLength(1);
    const jobs = deps.queue.ofName(RUN_JOBS.start);
    expect(jobs[0]!.payload).toMatchObject({ runId: "run_q" });
  });

  it("a stranded consent (queued with a hold, send lost) re-launches so the hold is CONSUMED by the run", async () => {
    // resolveGate committed awaiting_consent→queued + hold, then crashed before queue.send(run.start).
    await seedRun(db, {
      runId: "run_consent",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "queued",
      stateSince: AGO(STRANDED_QUEUED_MS + 5_000),
      holdLedgerId: "led_consent",
    });
    await sweepStrandedRuns(sweepDeps());
    expect(deps.queue.ofName(RUN_JOBS.start)[0]).toMatchObject({ payload: { runId: "run_consent" } });
    // the hold stays held — it is consumed by the launched run (never released; it pays for the work).
    expect(deps.ledger.opsOf("release")).toHaveLength(0);
  });
});

describe("leg C — parked-gate expiry re-arm (D-P0.10-2 consent half)", () => {
  it("re-arms an overdue confirm_cost gate; the fired job cancels the run and releases its hold", async () => {
    // awaiting_consent run whose confirm_cost expiry was never armed / its send was lost.
    await seedRun(db, {
      runId: "run_ac",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      state: "awaiting_consent",
      stateSince: AGO(8 * 24 * 60 * 60 * 1000),
      holdLedgerId: "led_ac",
    });
    await seedGate(db, {
      gateId: "gate_ac",
      runId: "run_ac",
      kind: "confirm_cost",
      onExpiry: "cancel",
      deadlineAt: AGO(24 * 60 * 60 * 1000), // the 7-day window already lapsed
    });

    const out = await sweepStrandedRuns(sweepDeps());
    expect(out).toContainEqual({
      kind: "gate_rearmed",
      gateId: "gate_ac",
      runId: "run_ac",
      workspaceId: seed.workspaceId,
    });
    const armed = deps.queue.sent.find((j) => j.name === GATE_EXPIRY_QUEUE && j.payload.gateId === "gate_ac");
    expect(armed).toBeDefined();
    expect(armed!.startAfterMs).toBe(0); // overdue ⇒ fires immediately

    // the re-armed job now runs the real expiry handler: confirm_cost cancel → cancelled + hold released.
    const expiry = await handleGateExpiry(deps, { gateId: "gate_ac", workspaceId: seed.workspaceId });
    expect(expiry).toMatchObject({ action: "resolved", onExpiry: "cancel", state: "cancelled" });
    expect(await stateOf("run_ac")).toBe("cancelled");
    expect(deps.ledger.opsOf("release")).toHaveLength(1); // the stranded consent's hold is released
  });

  it("re-arms a not-yet-due gate at its deadline (deduped while its job is active) and skips held/resolved gates", async () => {
    await seedRun(db, { runId: "run_wg", workspaceId: seed.workspaceId, state: "waiting_gate" });
    const deadline = new Date(NOW.getTime() + 60 * 60 * 1000);
    await seedGate(db, { gateId: "gate_wg", runId: "run_wg", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: deadline });
    // a held gate (deadline cleared by holdGate) and an already-resolved gate are not re-armed
    await seedGate(db, { gateId: "gate_held", runId: "run_wg", kind: "approve_plan", onExpiry: "wait", deadlineAt: null, held: true });

    const out = await sweepStrandedRuns(sweepDeps());
    expect(out).toEqual([
      { kind: "gate_rearmed", gateId: "gate_wg", runId: "run_wg", workspaceId: seed.workspaceId },
    ]);
    const armed = deps.queue.sent.filter((j) => j.name === GATE_EXPIRY_QUEUE && j.payload.gateId === "gate_wg");
    expect(armed).toHaveLength(1);
    expect(armed[0]!.startAfterMs).toBe(60 * 60 * 1000);
    expect(deps.queue.sent.some((j) => j.payload.gateId === "gate_held")).toBe(false);

    // a second pass dedupes against the active job — no duplicate sends.
    await sweepStrandedRuns(sweepDeps());
    expect(deps.queue.sent.filter((j) => j.name === GATE_EXPIRY_QUEUE && j.payload.gateId === "gate_wg")).toHaveLength(1);
  });
});

describe("leg D — the research_preflight_failed alert (RES.1; REQ-SPEC-31(3))", () => {
  it("pages the ops sink ONCE for a preflight-failed run (id-only payload, send-then-mark)", async () => {
    await seedRun(db, {
      runId: "run_pf",
      workspaceId: seed.workspaceId,
      state: "failed",
      stateSince: AGO(5 * 60 * 1000),
    });
    await db.client.query(
      `update runs set failure = '{"code":"research_preflight_failed","message":"pair refused"}'::jsonb
        where id = 'run_pf'`,
      [],
    );
    const alerts: unknown[] = [];
    const out = await sweepStrandedRuns({ ...sweepDeps(), alert: (a) => void alerts.push(a) });
    expect(out).toEqual([
      { kind: "preflight_alerted", runId: "run_pf", workspaceId: seed.workspaceId },
    ]);
    expect(alerts).toEqual([
      { kind: "research_preflight_failed", runId: "run_pf", workspaceId: seed.workspaceId },
    ]);
    // the durable marker landed — a second pass sends nothing and pages nothing.
    const out2 = await sweepStrandedRuns({ ...sweepDeps(), alert: (a) => void alerts.push(a) });
    expect(out2).toEqual([]);
    expect(alerts).toHaveLength(1);
  });

  it("never re-pages a run already marked, and leaves other failures alone", async () => {
    await seedRun(db, { runId: "run_marked", workspaceId: seed.workspaceId, state: "failed", stateSince: AGO(60_000) });
    await db.client.query(
      `update runs set failure = '{"code":"research_preflight_failed","alerted":true}'::jsonb where id = 'run_marked'`,
      [],
    );
    await seedRun(db, { runId: "run_other", workspaceId: seed.workspaceId, state: "failed", stateSince: AGO(60_000) });
    await db.client.query(
      `update runs set failure = '{"code":"cap_reached"}'::jsonb where id = 'run_other'`,
      [],
    );
    const alerts: unknown[] = [];
    const out = await sweepStrandedRuns({ ...sweepDeps(), alert: (a) => void alerts.push(a) });
    expect(out).toEqual([]);
    expect(alerts).toHaveLength(0);
  });
});
