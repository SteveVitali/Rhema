import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryContentStore } from "@rhema/mirror";
import { listCostUsd, platformCredits, RATE_TABLE_V1, type MeteredUsage } from "@rhema/contracts";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import {
  audit,
  commitStep,
  failStep,
  finalizeRun,
  harvestStep,
  heartbeat,
  hydration,
  postEvents,
  StaleTaskError,
} from "./internal-api.js";
import { rateTableCreditRenderer, TIER_MODEL } from "./credit-renderer.js";

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
      costUsd: 0,
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

    // the provisional row + the usage.tick event carry it; the row is a display figure, never the meter.
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select credits, list_cost_usd, source from usage_records where run_id='run1'", []),
      )
    ).rows[0] as { credits: number; list_cost_usd: number; source: string };
    expect(row.source).toBe("sdk_stream");
    expect(Number(row.list_cost_usd)).toBe(0);
    const tick = deps.eventWriter.forRun("run1").find((e) => e.type === "usage.tick");
    expect(tick?.payload).toMatchObject({ spentCredits: 200 + Number(row.credits), capCredits: 2091 });
  });
});
