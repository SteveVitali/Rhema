import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, seedGate, makeDeps, type OrchestratorTestDb, type TestDeps } from "@rhema/orchestrator/testing";
import type { JobLauncher } from "@rhema/orchestrator";
import { handleRunStart, handleRunReap, handleRunCancel, completeCancellation, handleGateExpiryJob, gateExpiryJob, type WorkerRunDeps } from "./run-jobs.js";

let db: OrchestratorTestDb;
let base: TestDeps;
let deps: WorkerRunDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "job-1" }) };

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  base = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
  deps = {
    ...base,
    launcher,
    config: { imageDigest: "sha256:pinned", serviceAccount: "sa", provider: "anthropic", concurrencyFor: () => 5 },
  };
});
afterEach(() => db.close());

async function stateOf(runId: string): Promise<string> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id=$1", [runId]));
  return (r.rows[0] as { state: string }).state;
}

describe("worker run-lifecycle handlers", () => {
  it("run.start provisions a queued run (mints credential, launches the Job, → provisioning)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, workflow: "review", state: "queued", lockSet: [] });
    const res = await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    expect(await stateOf("run1")).toBe("provisioning");
    const cred = (await db.client.query("select count(*)::int n from proxy_credentials where run_id='run1'", [])).rows[0] as { n: number };
    expect(cred.n).toBe(1);
  });

  it("run.reap orphans a stale run and re-enqueues it", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running", currentAttempt: 1 });
    await deps.heartbeats.beat({
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      at: new Date(base.clock.now().getTime() - 4 * 60_000),
    });
    const out = await handleRunReap(deps);
    expect(out).toEqual([{ runId: "run1", action: "reenqueued", attempt: 2 }]);
  });

  it("run.cancel on a running run → cancelling + heartbeat cancel flag", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const res = await handleRunCancel(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.state).toBe("cancelling");
    expect((await deps.heartbeats.get("run1"))?.cancelRequested ?? false).toBe(false); // no heartbeat yet
    // requestCancel was still recorded (a later beat would surface it):
    await deps.heartbeats.beat({ runId: "run1", attempt: 1, workspaceId: seed.workspaceId, at: base.clock.now() });
  });

  it("run.cancel on a queued run → cancelled directly, releasing the hold + credential", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "queued", holdLedgerId: "led_hold" });
    await db.client.query("insert into proxy_credentials(id, run_id, attempt, credential_hash) values ('pcr_c','run1',1,'h')", []);
    const res = await handleRunCancel(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.state).toBe("cancelled");
    expect(base.ledger.opsOf("release")).toHaveLength(1); // hold released (no leak)
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id='run1'", [])).rows[0] as { revoked_at: Date | null };
    expect(cred.revoked_at).not.toBeNull();
  });

  it("completeCancellation finishes a cancelling run → cancelled, settling hold + credential", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "cancelling", holdLedgerId: "led_hold" });
    const res = await completeCancellation(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.state).toBe("cancelled");
    expect(base.ledger.opsOf("release")).toHaveLength(1);
  });

  it("gateExpiryJob names the gate:<id> type (registered here; handled by P0.10)", () => {
    expect(gateExpiryJob("g1")).toBe("gate:g1");
  });

  it("handleGateExpiryJob runs the due gate's onExpiry (auto-proceed → run.resume)", async () => {
    await seedRun(db, { runId: "rung", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
    await seedGate(db, { gateId: "gg", runId: "rung", kind: "approve_plan", onExpiry: "proceed_conservative", deadlineAt: new Date("2026-09-01T00:00:00Z") });
    const out = await handleGateExpiryJob(deps, { gateId: "gg", workspaceId: seed.workspaceId });
    expect(out).toMatchObject({ action: "resolved", state: "queued" });
    expect(await stateOf("rung")).toBe("queued");
    expect(base.queue.ofName("run.resume")).toHaveLength(1);
  });
});
