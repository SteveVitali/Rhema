import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { reap } from "./reaper.js";
import { RUN_JOBS } from "./queue.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db);
});
afterEach(() => db.close());

/** Put the run into `running` at `attempt` and beat a STALE heartbeat (4 min old). */
async function runningWithStaleBeat(attempt: number): Promise<void> {
  await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query("update runs set state='running', current_attempt=$1 where id='run1'", [attempt]),
  );
  await deps.heartbeats.beat({
    runId: "run1",
    attempt,
    workspaceId: seed.workspaceId,
    at: new Date(deps.clock.now().getTime() - 4 * 60_000),
  });
}

async function runRow(): Promise<{ state: string; current_attempt: number; resume_count: number }> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query("select state, current_attempt, resume_count from runs where id='run1'", []),
  );
  return r.rows[0] as { state: string; current_attempt: number; resume_count: number };
}

describe("orphan reaper (§12.4; REQ-RUN-14; AC3)", () => {
  beforeEach(async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running", currentAttempt: 1 });
  });

  it("AC3: killed heartbeat → orphaned → resume as attempt N+1; the third re-enqueue opens resume_partial", async () => {
    // cycle 1: stale beat @ attempt 1 → re-enqueued as attempt 2.
    await runningWithStaleBeat(1);
    let out = await reap(deps);
    expect(out).toEqual([{ runId: "run1", action: "reenqueued", attempt: 2 }]);
    let row = await runRow();
    expect(row).toMatchObject({ state: "queued", current_attempt: 2, resume_count: 1 });
    // rotated token: run.resume enqueued with the per-run singleton key and a StopTask grace before launch.
    const resumeJobs = deps.queue.ofName(RUN_JOBS.resume);
    expect(resumeJobs).toHaveLength(1);
    expect(resumeJobs[0].singletonKey).toBe("run1");
    expect(resumeJobs[0].startAfterMs).toBe(60_000);
    // a user-facing hiccup event was appended.
    expect(deps.eventWriter.typesForRun("run1")).toContain("run.hiccup");

    // cycle 2: attempt 2 goes stale → re-enqueued as attempt 3.
    await runningWithStaleBeat(2);
    out = await reap(deps);
    expect(out).toEqual([{ runId: "run1", action: "reenqueued", attempt: 3 }]);
    row = await runRow();
    expect(row).toMatchObject({ state: "queued", current_attempt: 3, resume_count: 2 });

    // cycle 3: attempt 3 goes stale → re-enqueues exhausted → resume_partial (waiting_gate).
    await runningWithStaleBeat(3);
    out = await reap(deps);
    expect(out).toEqual([{ runId: "run1", action: "resume_partial" }]);
    row = await runRow();
    expect(row.state).toBe("waiting_gate");
    const gate = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select kind, on_expiry from gates where run_id='run1'", []))
    ).rows[0] as { kind: string; on_expiry: string };
    expect(gate).toMatchObject({ kind: "resume_partial", on_expiry: "accept_partial" });
  });

  it("a stale heartbeat from a SUPERSEDED attempt is skipped (already re-enqueued)", async () => {
    // run is at attempt 2 but a stale beat lingers from attempt 1.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update runs set current_attempt=2 where id='run1'", []),
    );
    await deps.heartbeats.beat({
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      at: new Date(deps.clock.now().getTime() - 4 * 60_000),
    });
    const out = await reap(deps);
    expect(out).toEqual([{ runId: "run1", action: "skipped", reason: "superseded" }]);
    expect((await runRow()).state).toBe("running");
  });

  it("a fresh heartbeat is not reaped", async () => {
    await deps.heartbeats.beat({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, at: deps.clock.now() });
    const out = await reap(deps);
    expect(out).toEqual([]);
  });
});
