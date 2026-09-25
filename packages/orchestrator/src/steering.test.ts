// P1.05 — §6.5 user steering (REQ-IDE-18; REQ-GATE-12 amended / REQ-GATE-13 / REQ-RUN-18): the
// phase-boundary pause flag honored inside commitStep, Resume (with optional note), and the
// next-phase note — all against the real migrations via PGlite.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requestPause, resumePausedRun, queueRunNote } from "./steering.js";
import { commitStep } from "./internal-api.js";
import { RUN_JOBS } from "./queue.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";

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

const runRow = async (runId: string) =>
  (
    await db.client.query(
      "select state, pause_requested_at, paused_at, parked_until, current_attempt from runs where id = $1",
      [runId],
    )
  ).rows[0] as {
    state: string;
    pause_requested_at: Date | null;
    paused_at: Date | null;
    parked_until: Date | null;
    current_attempt: number;
  };

const DONE_RESULT = { status: "done" as const, sdkSubtype: "success", predicatesPassed: true, compactions: 0 };

describe("requestPause — 'Pause after this phase' (§6.5)", () => {
  it("flags a running run; the flag is a marker, not a transition", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "running" });
    const r = await requestPause(deps, { runId: "run_p", workspaceId: ws });
    expect(r).toEqual({ ok: true, state: "running" });
    const row = await runRow("run_p");
    expect(row.state).toBe("running");
    expect(row.pause_requested_at).not.toBeNull();
    expect(row.paused_at).toBeNull();
  });

  it("is idempotent on an already-parked run and re-stamps a re-request", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, state: "waiting_gate" });
    await db.client.query("update runs set paused_at = now() where id = 'run_p'");
    expect(await requestPause(deps, { runId: "run_p", workspaceId: ws })).toEqual({
      ok: true,
      state: "waiting_gate",
    });
  });

  it("refuses terminal and not-running states", async () => {
    await seedRun(db, { runId: "run_done", workspaceId: ws, state: "completed" });
    expect(await requestPause(deps, { runId: "run_done", workspaceId: ws })).toEqual({
      ok: false,
      reason: "terminal",
      state: "completed",
    });
    await seedRun(db, { runId: "run_q", workspaceId: ws, state: "queued" });
    expect(await requestPause(deps, { runId: "run_q", workspaceId: ws })).toEqual({
      ok: false,
      reason: "not_running",
      state: "queued",
    });
    expect(await requestPause(deps, { runId: "run_missing", workspaceId: ws })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("commitStep — the flag is honored at the NEXT committed boundary (§6.5)", () => {
  it("a flagged run parks running → waiting_gate with paused_at + steer.paused, no gate row", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "running" });
    await requestPause(deps, { runId: "run_p", workspaceId: ws });

    const res = await commitStep(deps, {
      runId: "run_p",
      attempt: 1,
      workspaceId: ws,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: DONE_RESULT,
      next: { kind: "advance" },
    });
    expect(res).toMatchObject({ ok: true, state: "waiting_gate" });

    const row = await runRow("run_p");
    expect(row.state).toBe("waiting_gate");
    expect(row.pause_requested_at).toBeNull(); // consumed
    expect(row.paused_at).not.toBeNull();
    expect(row.parked_until).not.toBeNull(); // the ≤30-day steering park
    expect(deps.eventWriter.typesForRun("run_p")).toContain("steer.paused");
    // no gate row opened — a steering park is not an approval wait
    const gates = await db.client.query("select count(*)::int n from gates where run_id = 'run_p'");
    expect((gates.rows[0] as { n: number }).n).toBe(0);
    // the in-flight phase committed first — the park lands AFTER the step row
    const step = await db.client.query("select state, credits from steps where run_id = 'run_p'");
    expect(step.rows[0]).toMatchObject({ state: "done", credits: 10 });
  });

  it("an unflagged run advances normally", async () => {
    await seedRun(db, { runId: "run_n", workspaceId: ws, projectId: "prj_seed", state: "running" });
    const res = await commitStep(deps, {
      runId: "run_n",
      attempt: 1,
      workspaceId: ws,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: DONE_RESULT,
      next: { kind: "advance" },
    });
    expect(res).toMatchObject({ ok: true, state: "running" });
    expect((await runRow("run_n")).paused_at).toBeNull();
  });
});

describe("resumePausedRun — Resume / Resume-with-note (§6.5)", () => {
  const park = async (runId: string) => {
    await seedRun(db, { runId, workspaceId: ws, projectId: "prj_seed", state: "running" });
    await requestPause(deps, { runId, workspaceId: ws });
    await commitStep(deps, {
      runId,
      attempt: 1,
      workspaceId: ws,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: DONE_RESULT,
      next: { kind: "advance" },
    });
  };

  it("a parked run re-queues as a fresh attempt and run.resume is sent post-commit", async () => {
    await park("run_p");
    const r = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
    });
    expect(r).toEqual({ ok: true, state: "queued" });
    const row = await runRow("run_p");
    expect(row.state).toBe("queued");
    expect(row.paused_at).toBeNull();
    expect(row.current_attempt).toBe(2); // a fresh attempt — the gate-resume edge
    expect(deps.eventWriter.typesForRun("run_p")).toContain("run.resumed");
    const sent = deps.queue.ofName(RUN_JOBS.resume);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.singletonKey).toBe("run_p");
  });

  it("Resume-with-note captures Guidance{queued_message} IN the resume tx and emits steer.queued", async () => {
    await park("run_p");
    const r = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      note: "weaken the verdict",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.guidanceId).toBeTruthy();
    const g = await db.client.query(
      "select source, body, run_id from guidance where run_id = 'run_p'",
    );
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0]).toMatchObject({ source: "queued_message", body: "weaken the verdict" });
    expect(deps.eventWriter.typesForRun("run_p")).toContain("steer.queued");
  });

  it("a real gate wait is NOT resumable here — gate_waiting (the approval card owns it)", async () => {
    await seedRun(db, { runId: "run_g", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await seedGate(db, { gateId: "g1", runId: "run_g", kind: "approve_plan", onExpiry: "wait" });
    const r = await resumePausedRun(deps, {
      runId: "run_g",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
    });
    expect(r).toEqual({ ok: false, reason: "gate_waiting" });
  });

  it("refuses runs that are not waiting_gate", async () => {
    await seedRun(db, { runId: "run_r", workspaceId: ws, state: "running" });
    expect(
      await resumePausedRun(deps, { runId: "run_r", workspaceId: ws, projectId: "prj_seed", userId: "usr_seed" }),
    ).toEqual({ ok: false, reason: "not_paused" });
    expect(
      await resumePausedRun(deps, { runId: "run_x", workspaceId: ws, projectId: "prj_seed", userId: "usr_seed" }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("resumePausedRun — the parked-resume re-price (P1.16 §14.6)", () => {
  const park = async (runId: string) => {
    await seedRun(db, { runId, workspaceId: ws, projectId: "prj_seed", state: "running" });
    await requestPause(deps, { runId, workspaceId: ws });
    await commitStep(deps, {
      runId,
      attempt: 1,
      workspaceId: ws,
      stepKey: "intake",
      ordinal: 0,
      of: 7,
      credits: 10,
      result: { status: "done" as const, sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });
  };

  it("a positive cap delta opens a confirm_cost gate instead of re-queueing (rate table moved while parked)", async () => {
    await park("run_p");
    const r = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      reprice: async () => ({ changed: true, deltaCredits: 60, newEstimateCredits: 240, newCapCredits: 360 }),
    });
    expect(r.ok).toBe(true);
    if (r.ok && "repriced" in r) {
      expect(r.state).toBe("waiting_gate");
      expect(r.deltaCredits).toBe(60);
    } else {
      throw new Error("expected a repriced result");
    }
    const row = await runRow("run_p");
    expect(row.state).toBe("waiting_gate"); // stays parked — now behind the gate row
    expect(row.paused_at).toBeNull(); //       a real gate wait, not a steering park
    const gates = await db.client.query(
      "select kind, on_expiry, deadline_at from gates where run_id = 'run_p'",
    );
    expect(gates.rows).toHaveLength(1);
    expect(gates.rows[0]).toMatchObject({ kind: "confirm_cost", on_expiry: "cancel" });
    expect((gates.rows[0] as { deadline_at: Date | null }).deadline_at).not.toBeNull();
    expect(deps.eventWriter.typesForRun("run_p")).toContain("run.repriced");
    // NO resume was sent — the consent path owns the next step
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(0);
    // a second /resume sees the gate, not a park
    const again = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
    });
    expect(again).toEqual({ ok: false, reason: "gate_waiting" });
  });

  it("a non-positive delta (a cheaper table) resumes normally — no consent needed", async () => {
    await park("run_p");
    const r = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      reprice: async () => ({ changed: true, deltaCredits: -40, newEstimateCredits: 160, newCapCredits: 240 }),
    });
    expect(r).toMatchObject({ ok: true, state: "queued" });
    expect(deps.queue.ofName(RUN_JOBS.resume)).toHaveLength(1);
  });

  it("an unchanged table (changed:false) resumes normally and never opens a gate", async () => {
    await park("run_p");
    const r = await resumePausedRun(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      reprice: async () => ({ changed: false, deltaCredits: 0, newEstimateCredits: 200, newCapCredits: 300 }),
    });
    expect(r).toMatchObject({ ok: true, state: "queued" });
    const gates = await db.client.query("select count(*)::int n from gates where run_id = 'run_p'");
    expect((gates.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("queueRunNote — a note for the next phase (§6.5; REQ-RUN-18)", () => {
  it("captures run-scope Guidance and emits steer.queued on a running run", async () => {
    await seedRun(db, { runId: "run_n", workspaceId: ws, projectId: "prj_seed", state: "running" });
    const r = await queueRunNote(deps, {
      runId: "run_n",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      text: "check the §2 stat",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.guidanceId).toBeTruthy();
    const g = await db.client.query("select source, body, run_id, standing from guidance where run_id = 'run_n'");
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0]).toMatchObject({ source: "queued_message", body: "check the §2 stat", standing: false });
    expect(deps.eventWriter.typesForRun("run_n")).toContain("steer.queued");
  });

  it("a parked run takes a note too (delivered at resume's first boundary)", async () => {
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate" });
    await db.client.query("update runs set paused_at = now() where id = 'run_p'");
    const r = await queueRunNote(deps, {
      runId: "run_p",
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      text: "prioritise the letter",
    });
    expect(r.ok).toBe(true);
  });

  it("refuses empty text, terminal runs, and foreign/missing runs", async () => {
    await seedRun(db, { runId: "run_n", workspaceId: ws, projectId: "prj_seed", state: "running" });
    await seedRun(db, { runId: "run_t", workspaceId: ws, projectId: "prj_seed", state: "failed" });
    expect(
      await queueRunNote(deps, { runId: "run_n", workspaceId: ws, projectId: "prj_seed", userId: "usr_seed", text: "  " }),
    ).toEqual({ ok: false, reason: "empty" });
    expect(
      await queueRunNote(deps, { runId: "run_t", workspaceId: ws, projectId: "prj_seed", userId: "usr_seed", text: "x" }),
    ).toEqual({ ok: false, reason: "terminal" });
    expect(
      await queueRunNote(deps, { runId: "run_missing", workspaceId: ws, projectId: "prj_seed", userId: "usr_seed", text: "x" }),
    ).toEqual({ ok: false, reason: "not_found" });
  });
});
