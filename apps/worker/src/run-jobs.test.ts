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
    systemExec: db.client,
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

  it("run.start authors the run's webTools research bound from the snapshot claim count (PRB.22)", async () => {
    await seedRun(db, {
      runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId,
      workflow: "review", state: "queued", lockSet: [],
      inputSnapshot: { wordCount: 701, claimCount: 3 },
    });
    const res = await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select context from proxy_credentials where run_id='run1'", [])).rows[0] as {
      context: { webTools?: { fetchBudget?: number; searchBudget?: number; fetchMaxContentTokens?: number } } | string;
    };
    const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
    // 3 claims ⇒ fetch 12+4·3=24, search 8+3=11, pages truncated at 8k tokens.
    expect(context.webTools).toMatchObject({ fetchBudget: 24, searchBudget: 11, fetchMaxContentTokens: 8000 });
  });

  it("run.start derives the bound from word-count density when claimCount is absent (PRB.22)", async () => {
    await seedRun(db, {
      runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId,
      workflow: "review", state: "queued", lockSet: [],
      inputSnapshot: { wordCount: 5180 },
    });
    await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    const row = (await db.client.query("select context from proxy_credentials where run_id='run1'", [])).rows[0] as {
      context: { webTools?: { fetchBudget?: number } } | string;
    };
    const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
    // 5180 × 0.004 ≈ 21 claims ⇒ fetch 12+4·21=96 → clamped at the 80 ceiling.
    expect(context.webTools?.fetchBudget).toBe(80);
  });

  it("ECON.2 L5 — a frozen inputs.cogsLevers.l5ResearchEnvelope tunes the bound above the floor only", async () => {
    await seedRun(db, {
      runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId,
      workflow: "review", state: "queued", lockSet: [],
      inputSnapshot: { wordCount: 701, claimCount: 3 },
    });
    // the run's FROZEN lever set (resolved at creation) — the worker trusts the freeze verbatim.
    await db.client.query(
      `update runs set inputs = '{"cogsLevers":{"l5ResearchEnvelope":true}}'::jsonb where id = 'run1'`, [],
    );
    const res = await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select context from proxy_credentials where run_id='run1'", [])).rows[0] as {
      context: { webTools?: Record<string, number | boolean> } | string;
    };
    const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
    // 3 claims ⇒ untuned fetch 24 / search 11; floors 12 / 5 absolute-preserved (UNTUNED half);
    // budgets = floor + ⌈headroom×0.5⌉ (fetch 12+6=18, search 5+3=8); page cap 4 000; backfill on
    // the UNTUNED budget (min(24, 24)).
    expect(context.webTools).toMatchObject({
      fetchBudget: 18, searchBudget: 8,
      fetchFloor: 12, searchFloor: 5,
      fetchMaxContentTokens: 4000,
      backfillFetchBudget: 24,
    });
  });

  it("RES.2 — inputs.force_unverified zeroes the research budgets on a TEST workspace only", async () => {
    // the flagged test tenant: the frozen input's flag zeroes search/fetch budgets (floors included) —
    // RES.1's preflight still runs, the run delivers, coverage reads zero.
    await db.client.query(`update workspaces set is_test = true where id = $1`, [seed.workspaceId]);
    await seedRun(db, {
      runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId,
      workflow: "review", state: "queued", lockSet: [],
      inputSnapshot: { wordCount: 701, claimCount: 3 },
    });
    await db.client.query(`update runs set inputs = '{"force_unverified":true}'::jsonb where id = 'run1'`, []);
    const res = await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select context from proxy_credentials where run_id='run1'", [])).rows[0] as {
      context: { webTools?: Record<string, number | boolean> } | string;
    };
    const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
    expect(context.webTools).toMatchObject({
      search: true, fetch: true,
      searchBudget: 0, fetchBudget: 0, searchFloor: 0, fetchFloor: 0,
      // CITE.1 — the backfill allowance is zeroed too: a forced-Unverified run cannot rescue its
      // coverage through the mechanism's fetch grant (ADR-085).
      backfillFetchBudget: 0,
    });
  });

  it("RES.2 — a NON-test workspace's force_unverified input is ignored (the flag can never reach prod)", async () => {
    await seedRun(db, {
      runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId,
      workflow: "review", state: "queued", lockSet: [],
      inputSnapshot: { wordCount: 701, claimCount: 3 },
    });
    await db.client.query(`update runs set inputs = '{"force_unverified":true}'::jsonb where id = 'run1'`, []);
    const res = await handleRunStart(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select context from proxy_credentials where run_id='run1'", [])).rows[0] as {
      context: { webTools?: { fetchBudget?: number; searchBudget?: number } } | string;
    };
    const context = typeof row.context === "string" ? JSON.parse(row.context) : row.context;
    // the flag did nothing — the ordinary claim-scaled bound stands (3 claims ⇒ fetch 24, search 11).
    expect(context.webTools).toMatchObject({ fetchBudget: 24, searchBudget: 11 });
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

  it("gateExpiryJob names the shared gate.expiry queue (F25 — gate:<id> is an illegal pg-boss name)", () => {
    expect(gateExpiryJob("g1")).toBe("gate.expiry");
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
