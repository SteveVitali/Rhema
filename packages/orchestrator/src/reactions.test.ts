import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { recordReplan, reopenApprovePlan, pauseRun, handleHookControl, MAX_REPLANS } from "./reactions.js";

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
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id=$1", [runId]));
  return (r.rows[0] as { state: string }).state;
}
async function gateKind(runId: string): Promise<string> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select kind from gates where run_id=$1", [runId]));
  return (r.rows[0] as { kind: string }).kind;
}

describe("phase-loop reactions", () => {
  it("recordReplan counts back-edges and caps at 2 (REQ-WF-5)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const r1 = await recordReplan(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(r1).toEqual({ replans: 1, capExceeded: false });
    const r2 = await recordReplan(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(r2).toEqual({ replans: 2, capExceeded: false });
    const r3 = await recordReplan(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(r3).toEqual({ replans: 3, capExceeded: true });
    expect(MAX_REPLANS).toBe(2);
  });

  it("reopenApprovePlan (named policy) takes running → waiting_gate and opens an approve_plan gate", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const { gateId, autoApproved } = await reopenApprovePlan(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(gateId).toBeTruthy();
    expect(autoApproved).toBe(false);
    expect(await stateOf("run1")).toBe("waiting_gate");
    expect(await gateKind("run1")).toBe("approve_plan");
  });

  it("reopenApprovePlan under Run-to-completion auto-approves within the cap (Decision{by:'policy'}, stays running)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const { gateId, autoApproved } = await reopenApprovePlan(deps, { runId: "run1", workspaceId: seed.workspaceId, policy: "run_to_completion" });
    expect(autoApproved).toBe(true);
    expect(await stateOf("run1")).toBe("running"); // the run keeps going (REQ-GATE-6)
    const d = (await db.client.query("select by_actor, resolved_at from decisions join gates on gates.id = decisions.gate_id where gates.id = $1", [gateId])).rows[0] as { by_actor: string } | undefined;
    expect(d?.by_actor).toBe("policy");
    const resolved = (await db.client.query("select resolved_at from gates where id=$1", [gateId])).rows[0] as { resolved_at: Date | null };
    expect(resolved.resolved_at).not.toBeNull();
  });

  it("pauseRun (REQ-ARCH-32) parks the run at a refusal card on a suspicious_query", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await pauseRun(deps, { runId: "run1", workspaceId: seed.workspaceId, reason: "suspicious_query" });
    expect(await stateOf("run1")).toBe("waiting_gate");
    expect(await gateKind("run1")).toBe("refusal");
    // a parked run consumes no compute — waiting_gate is a no-op-compute state (Q-7).
  });

  it("handleHookControl abort_failed_boundary → failed(boundary)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const res = await handleHookControl(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      control: "abort_failed_boundary",
    });
    expect(res.action).toBe("failed_boundary");
    expect(await stateOf("run1")).toBe("failed");
  });

  it("handleHookControl hiccup_retry emits a run.hiccup (the phase loop then retries)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, state: "running" });
    const res = await handleHookControl(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      control: "hiccup_retry",
    });
    expect(res.action).toBe("hiccup");
    expect(deps.eventWriter.typesForRun("run1")).toContain("run.hiccup");
    expect(await stateOf("run1")).toBe("running"); // not a failure
  });
});
