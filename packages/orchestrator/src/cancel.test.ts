// PRB.07 AC2 — "Cancel run to edit": the run-level cancel releases the writer lock, resolves any open gates
// as user `stop` decisions, releases the credit hold, and revokes credentials — all through the same seams a
// gate card's Stop composes (REQ-DATA-41; §6.3). Plus the pure `editorLockForRuns` read-only rule.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cancelRun } from "./cancel.js";
import { editorLockForRuns, lockKeys } from "./locks.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  seedGate,
  readDecision,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";

describe("cancelRun — the Page's 'Cancel run to edit' (PRB.07; §6.3)", () => {
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

  it("a running run steps through cancelling → cancelled; the writer lock + hold + credentials release", async () => {
    await db.pg.query("update projects set active_writer_run_id = $1 where id = 'prj_seed'", ["run_w"]);
    await seedRun(db, {
      runId: "run_w",
      workspaceId: ws,
      projectId: "prj_seed",
      workflow: "draft",
      state: "running",
      holdLedgerId: "hold_w",
      lockSet: [lockKeys.nsWrite("prj_seed"), lockKeys.draftWrite("dft_x")],
    });
    await db.client.query(`insert into proxy_credentials(id, run_id) values ('cred_w','run_w')`);

    const r = await cancelRun(deps, { runId: "run_w", workspaceId: ws });
    expect(r).toEqual({ ok: true, state: "cancelled", alreadyTerminal: false });

    const run = (await db.client.query("select state from runs where id = 'run_w'")).rows[0] as { state: string };
    expect(run.state).toBe("cancelled");
    // the per-project writer lock cleared at the terminal edge (§6.3 "Never two writers of one draft")
    const prj = (await db.client.query("select active_writer_run_id from projects where id = 'prj_seed'"))
      .rows[0] as { active_writer_run_id: string | null };
    expect(prj.active_writer_run_id).toBeNull();
    // hold released through the ledger seam; credentials revoked
    expect(deps.ledger.ops.filter((o) => o.op === "release")).toHaveLength(1);
    const cred = (await db.client.query("select revoked_at from proxy_credentials where run_id = 'run_w'"))
      .rows[0] as { revoked_at: Date | null };
    expect(cred.revoked_at).not.toBeNull();
    // the paired state-changed events rode the tx (running → cancelling → cancelled)
    const events = deps.eventWriter.events.filter((e) => e.type === "run.state_changed");
    expect(events.map((e) => (e.payload as { to: string }).to)).toEqual(["cancelling", "cancelled"]);
  });

  it("a waiting_gate run cancels directly and its open gates resolve as user `stop` decisions", async () => {
    await seedRun(db, { runId: "run_g", workspaceId: ws, projectId: "prj_seed", state: "waiting_gate", holdLedgerId: "hold_g" });
    await seedGate(db, { gateId: "g1", runId: "run_g", kind: "approve_plan", onExpiry: "wait" });
    await seedGate(db, { gateId: "g2", runId: "run_g", kind: "approve_triage", onExpiry: "wait" });

    const r = await cancelRun(deps, { runId: "run_g", workspaceId: ws });
    expect(r).toEqual({ ok: true, state: "cancelled", alreadyTerminal: false });

    for (const g of ["g1", "g2"]) {
      expect(await readDecision(db, g)).toMatchObject({ by_actor: "user", action: "stop" });
      const gate = (await db.client.query("select resolved_at from gates where id = $1", [g])).rows[0] as {
        resolved_at: Date | null;
      };
      expect(gate.resolved_at).not.toBeNull();
    }
    expect(deps.ledger.ops.filter((o) => o.op === "release")).toHaveLength(1);
  });

  it("reconciles runs.spent_credits from the usage rows of record at the cancelled edge (PRB.16b)", async () => {
    // the carry-over finding: a mid-phase cancel committed no step, so the accumulated figure missed the
    // in-flight spend the proxy already metered — `usage_records` held the truth while spent_credits stayed 0.
    const seed = await seedProject(db); // billing account for the usage row
    await seedRun(db, { runId: "run_s", workspaceId: ws, projectId: "prj_seed", state: "running", spentCredits: 0 });
    await db.client.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values
         ('ur_a', now(), $1, $2, 'run_s', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, 41, 'proxy'),
         ('ur_b', now(), $1, $2, 'run_s', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.3, 24, 'proxy')`,
      [ws, seed.billingAccountId],
    );

    const r = await cancelRun(deps, { runId: "run_s", workspaceId: ws });
    expect(r).toMatchObject({ ok: true, state: "cancelled" });
    const row = (await db.client.query("select spent_credits from runs where id = 'run_s'")).rows[0] as {
      spent_credits: number;
    };
    expect(row.spent_credits).toBe(65); // folded from the proxy's usage rows at the terminal settle
  });

  it("DEF.2/F5 — release-ONLY: committed debits stand; the uncommitted metered burn absorbs as COGS", async () => {
    // the explicit cancel settle (REQ-SPEC-24.6/24.8): a user cancel keeps partials resumable → the
    // committed phases stay paid (no refund), while the in-flight phase's metered burn is platform COGS.
    const seed = await seedProject(db);
    await seedRun(db, { runId: "run_c", workspaceId: ws, projectId: "prj_seed", state: "running", holdLedgerId: "hold_c" });
    await db.client.query("insert into proxy_credentials(id, run_id) values ('cred_c','run_c')", []);
    await db.client.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values ('ur_c', now(), $1, $2, 'run_c', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, 65, 'proxy')`,
      [ws, seed.billingAccountId],
    );
    await db.client.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key, at)
       values ('led_c1', $1, $2, 'debit', 30, 'included', 'run_c', 'run', 'debit:run_c:intake:1#included', now())`,
      [ws, seed.billingAccountId],
    );

    const r = await cancelRun(deps, { runId: "run_c", workspaceId: ws });
    expect(r).toMatchObject({ ok: true, state: "cancelled" });
    // the committed debit is NOT refunded — the kept partials stay paid for (resumable, REQ-SPEC-24.6).
    expect(deps.ledger.ops.filter((o) => o.op === "refund")).toHaveLength(0);
    // the hold releases as ever…
    expect(deps.ledger.ops.filter((o) => o.op === "release")).toHaveLength(1);
    // …and the uncommitted metered residue books absorbed: 65 metered − 30 committed = 35 platform COGS.
    expect(
      deps.ledger.ops.filter((o) => o.op === "absorb").map((o) => (o.args as { credits: number }).credits),
    ).toEqual([35]);
    const row = (await db.client.query("select spent_credits from runs where id = 'run_c'")).rows[0] as {
      spent_credits: number;
    };
    expect(row.spent_credits).toBe(65); // the usage surface still reads metered truth
  });

  it("the proxy's usage rows are the meter of record — sdk-side rows stand in only when none metered", async () => {
    const seed = await seedProject(db);
    await seedRun(db, { runId: "run_p", workspaceId: ws, projectId: "prj_seed", state: "running" });
    await db.client.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
         rate_table_version, list_cost_usd, credits, source)
       values
         ('ur_px', now(), $1, $2, 'run_p', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, 65, 'proxy'),
         ('ur_sdk', now(), $1, $2, 'run_p', 1, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0, 999, 'sdk_stream')`,
      [ws, seed.billingAccountId],
    );
    const r = await cancelRun(deps, { runId: "run_p", workspaceId: ws });
    expect(r).toMatchObject({ ok: true, state: "cancelled" });
    const row = (await db.client.query("select spent_credits from runs where id = 'run_p'")).rows[0] as {
      spent_credits: number;
    };
    expect(row.spent_credits).toBe(65); // the meter of record wins — the sdk twin is never double-counted
  });

  it("is idempotent: a terminal run reports its state; a second cancel is a no-op", async () => {
    await seedRun(db, { runId: "run_t", workspaceId: ws, projectId: "prj_seed", state: "cancelled" });
    const r = await cancelRun(deps, { runId: "run_t", workspaceId: ws });
    expect(r).toEqual({ ok: true, state: "cancelled", alreadyTerminal: true });
    expect(deps.ledger.ops).toHaveLength(0);
  });

  it("reports not_cancellable for states with no legal cancel edge (orphaned, finalizing, created)", async () => {
    for (const [i, state] of ["orphaned", "finalizing", "created"].entries()) {
      await seedRun(db, { runId: `run_nc_${i}`, workspaceId: ws, projectId: "prj_seed", state });
      const r = await cancelRun(deps, { runId: `run_nc_${i}`, workspaceId: ws });
      expect(r).toMatchObject({ ok: false, reason: "not_cancellable", state });
    }
  });

  it("not_found for a run outside the tenant's workspace (RLS-shaped guard)", async () => {
    await seedRun(db, { runId: "run_x", workspaceId: ws, state: "running" });
    const r = await cancelRun(deps, { runId: "run_x", workspaceId: "ws_other" });
    expect(r).toEqual({ ok: false, reason: "not_found" });
  });
});

describe("editorLockForRuns — the editor's read-only rule (§5.4/§6.3)", () => {
  const mk = (id: string, workflow: string, lockSet: string[]) => ({ id, workflow, lockSet });
  const args = { projectId: "prj_1", draftId: "dft_1" };

  it("a writer run anywhere in the project locks the editor (ns:write)", () => {
    const runs = [mk("r_w", "draft", [lockKeys.nsWrite("writer", "prj_1"), lockKeys.draftWrite("dft_2")])];
    expect(editorLockForRuns(runs, args)).toEqual({ runId: "r_w", kind: "writer", workflow: "draft" });
  });

  it("a writer run holding draft:write on the head locks the editor", () => {
    const runs = [mk("r_w", "revise", [lockKeys.draftWrite("dft_1")])];
    expect(editorLockForRuns(runs, args)?.kind).toBe("writer");
  });

  it("a reader holding draft:read on the head locks it (frozen-head read)", () => {
    const runs = [mk("r_r", "review", [lockKeys.draftRead("dft_1"), lockKeys.corr("dft_1", "issues", 1)])];
    expect(editorLockForRuns(runs, args)).toEqual({ runId: "r_r", kind: "reader", workflow: "review" });
  });

  it("a reader on a DIFFERENT head does not lock this one", () => {
    const runs = [mk("r_r", "review", [lockKeys.draftRead("dft_9")])];
    expect(editorLockForRuns(runs, args)).toBeNull();
  });

  it("writers win over readers", () => {
    const runs = [
      mk("r_r", "review", [lockKeys.draftRead("dft_1")]),
      mk("r_w", "revise", [lockKeys.nsWrite("writer", "prj_1")]),
    ];
    expect(editorLockForRuns(runs, args)).toMatchObject({ runId: "r_w", kind: "writer" });
  });

  it("no holding runs → the editor is writable", () => {
    expect(editorLockForRuns([], args)).toBeNull();
  });
});
