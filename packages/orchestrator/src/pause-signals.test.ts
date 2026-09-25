import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { drainPauseSignals, PAUSE_MAX_ATTEMPTS } from "./pause-signals.js";

// P1.22 (REQ-ARCH-32; §12.8) — the orchestrator half of the pause transport, exercised end-to-end over
// the same `pause_signals` rows the proxy's `SqlSignalSink` writes.

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

async function insertSignal(args: {
  runId: string;
  workspaceId?: string;
  reason?: string;
  detail?: Record<string, unknown>;
}): Promise<number> {
  const res = await db.pg.query(
    `insert into pause_signals(run_id, workspace_id, reason, detail) values ($1,$2,$3,$4) returning id`,
    [args.runId, args.workspaceId ?? seed.workspaceId, args.reason ?? "suspicious_query", JSON.stringify(args.detail ?? {})],
  );
  return Number((res.rows[0] as { id: number }).id);
}
async function stateOf(runId: string): Promise<string> {
  const r = await db.client.query("select state from runs where id=$1", [runId]);
  return (r.rows[0] as { state: string }).state;
}
async function gateKind(runId: string): Promise<string> {
  const r = await db.client.query("select kind from gates where run_id=$1", [runId]);
  return (r.rows[0] as { kind: string }).kind;
}
async function signalRow(id: number): Promise<{ processed_at: Date | null; attempts: number }> {
  const r = await db.client.query("select processed_at, attempts from pause_signals where id=$1", [id]);
  return r.rows[0] as { processed_at: Date | null; attempts: number };
}

describe("drainPauseSignals (REQ-ARCH-32 — the pause-signal reaction, end-to-end)", () => {
  it("a suspicious_query signal pauses the run at a refusal-class gate", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const id = await insertSignal({ runId: "run1", detail: { matchLength: 14 } });
    const r = await drainPauseSignals(deps, { system: db.client });
    expect(r.paused).toEqual(["run1"]);
    expect(await stateOf("run1")).toBe("waiting_gate");
    expect(await gateKind("run1")).toBe("refusal");
    const row = await signalRow(id);
    expect(row.processed_at).not.toBeNull();
    expect(row.attempts).toBe(1);
  });

  it("an egress_denied_spike signal pauses identically", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await insertSignal({ runId: "run1", reason: "egress_denied_spike", detail: { count: 5 } });
    const r = await drainPauseSignals(deps, { system: db.client });
    expect(r.paused).toEqual(["run1"]);
    expect(await stateOf("run1")).toBe("waiting_gate");
  });

  it("a user_source_fetch signal (P1.21 memo boundary) pauses identically", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await insertSignal({ runId: "run1", reason: "user_source_fetch", detail: { domain: "docs.internal.example.com" } });
    const r = await drainPauseSignals(deps, { system: db.client });
    expect(r.paused).toEqual(["run1"]);
    expect(await stateOf("run1")).toBe("waiting_gate");
    expect(await gateKind("run1")).toBe("refusal");
  });

  it("a signal for a non-running run is processed as a no-op (never resurrects a pause)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "completed" });
    const id = await insertSignal({ runId: "run1" });
    const r = await drainPauseSignals(deps, { system: db.client });
    expect(r.paused).toEqual([]);
    expect(r.skipped).toEqual([id]);
    expect(await stateOf("run1")).toBe("completed");
    expect((await signalRow(id)).processed_at).not.toBeNull();
  });

  it("a second drain finds nothing (processed rows are never re-claimed)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await insertSignal({ runId: "run1" });
    await drainPauseSignals(deps, { system: db.client });
    const r2 = await drainPauseSignals(deps, { system: db.client });
    expect(r2.claimed).toBe(0);
  });

  it("a failing row retries on the next drain, then dead-letters past the attempts cap", async () => {
    // a deps bundle whose id factory throws → pauseRun fails deterministically mid-transaction.
    const broken = { ...deps, ids: (): string => { throw new Error("boom"); } };
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const id = await insertSignal({ runId: "run1" });
    const r1 = await drainPauseSignals(broken, { system: db.client });
    expect(r1.errors).toEqual([id]);
    expect((await signalRow(id)).processed_at).toBeNull(); // stays pending — retried later
    // the lease re-arms the row for the next drain (cleared here instead of waiting the 60s lease)
    await db.pg.query("update pause_signals set claimed_at=null where id=$1", [id]);
    const r2 = await drainPauseSignals(deps, { system: db.client });
    expect(r2.paused).toEqual(["run1"]);

    // a row that keeps failing past the cap dead-letters (processed_at stamped, never retried).
    await seedRun(db, { runId: "run2", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const dead = await insertSignal({ runId: "run2" });
    await db.pg.query("update pause_signals set attempts=$1 where id=$2", [PAUSE_MAX_ATTEMPTS - 1, dead]);
    const r3 = await drainPauseSignals(broken, { system: db.client });
    expect(r3.deadLettered).toEqual([dead]);
    expect((await signalRow(dead)).processed_at).not.toBeNull(); // dead-lettered
  });

  it("claiming respects the lease — a just-claimed row is not re-claimed", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    const id = await insertSignal({ runId: "run1" });
    // Simulate an in-flight claim from a crashed/slow drain.
    await db.pg.query("update pause_signals set claimed_at=now(), attempts=1 where id=$1", [id]);
    const r = await drainPauseSignals(deps, { system: db.client });
    expect(r.claimed).toBe(0);
    // lease expired → claimable again
    await db.pg.query("update pause_signals set claimed_at=now() - interval '2 minutes' where id=$1", [id]);
    const r2 = await drainPauseSignals(deps, { system: db.client });
    expect(r2.paused).toEqual(["run1"]);
  });
});
