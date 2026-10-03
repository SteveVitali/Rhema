import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FakeEngine, FIXTURES, type PhaseRequest } from "@rhema/engine";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import { listCostUsd, platformCredits, RATE_TABLE_V1, type MeteredUsage } from "@rhema/contracts";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { runPhase, type OracleInputs } from "./phase-loop.js";
import { rateTableCreditRenderer, TIER_MODEL } from "./credit-renderer.js";
import { createRun, type CreateRunInput } from "./run-creation.js";
import { provisionRun, type JobLauncher, type ProvisionArgs } from "./provision.js";
import { commitStep, heartbeat, finalizeRun, failStep } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import type { RunAllowlistData } from "./resolver.js";

const review = WORKFLOW_MANIFESTS.review!;
const intake = review.phases[0]; // gateAfter approve_scope; predicate thesis_and_inventory_present
const happyFixture = FIXTURES.find((f) => f.name === "intake-happy")!;

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

function makeReq(phase: PhaseManifest, attempt: number, ordinal: number, of: number): PhaseRequest {
  return {
    runId: "run1",
    attempt,
    cwd: "/work/project",
    phase,
    ordinal,
    of,
    skill: review.skill,
    inputs: {},
    seat: "editor",
    maxBudgetUsd: 5,
    maxTurns: 40,
  };
}

describe("phase loop — completion oracle + guided retry (AC8; REQ-SPEC-13)", () => {
  beforeEach(async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
  });

  it("AC8: success + failing predicate → artifact_missing, ONE guided retry, then incomplete (→ failed-with-partials)", async () => {
    let calls = 0;
    const readOracleInputs = (): Promise<OracleInputs> => {
      calls++;
      // both attempts: the SDK says success and the phase-result says done, but the predicate keeps failing.
      return Promise.resolve({ phaseResult: { status: "done" }, facts: { thesisPresent: false, inventoryPresent: false } });
    };
    const outcome = await runPhase(deps, new FakeEngine(happyFixture), {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 0,
      of: 7,
      phase: intake,
      request: makeReq(intake, 1, 0, 7),
      readOracleInputs,
    });
    expect(outcome).toMatchObject({ kind: "incomplete", errorClass: "artifact_missing", retries: 1 });
    expect(calls).toBe(2); // the original attempt + exactly one guided retry

    // the caller marks the step failed and keeps partials: running → completed_partial.
    await failStep(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: intake.key,
      ordinal: 0,
      errorClass: "artifact_missing",
    });
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyTransition(tx, deps, { runId: "run1", from: "running", to: "completed_partial", reason: "artifact_missing" }),
    );
    const state = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id='run1'", []))
    ).rows[0] as { state: string };
    expect(state.state).toBe("completed_partial");
    const step = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from steps where run_id='run1'", []))
    ).rows[0] as { state: string };
    expect(step.state).toBe("failed");
  });

  it("complete: success + done + predicate passes → complete on the first try (no retry)", async () => {
    let calls = 0;
    const outcome = await runPhase(deps, new FakeEngine(happyFixture), {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 0,
      of: 7,
      phase: intake,
      request: makeReq(intake, 1, 0, 7),
      readOracleInputs: () => {
        calls++;
        return Promise.resolve({ phaseResult: { status: "done" }, facts: { thesisPresent: true, inventoryPresent: true } });
      },
    });
    expect(outcome).toMatchObject({ kind: "complete", retries: 0 });
    expect(calls).toBe(1);
    // a provisional usage.tick was emitted for the running phase.
    expect(deps.eventWriter.typesForRun("run1")).toContain("usage.tick");
  });

  it("wires an injected CreditRenderer into the provisional sdk_stream row + usage.tick (D-P0.11-1 call-site)", async () => {
    // the phase-loop's `renderCredits` seam is what apps bind to `rateTableCreditRenderer` at deploy; inject a
    // sentinel renderer and prove the running phase's provisional credits flow from it (not the 0 default).
    const withRenderer = makeDeps(db, { renderCredits: () => 777 });
    await runPhase(withRenderer, new FakeEngine(happyFixture), {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 0,
      of: 7,
      phase: intake,
      request: makeReq(intake, 1, 0, 7),
      readOracleInputs: () => Promise.resolve({ phaseResult: { status: "done" }, facts: { thesisPresent: true, inventoryPresent: true } }),
    });
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select credits from usage_records where run_id='run1' and source='sdk_stream'", []),
      )
    ).rows[0] as { credits: number };
    expect(Number(row.credits)).toBe(777);
    const tick = withRenderer.eventWriter.forRun("run1").find((e) => e.type === "usage.tick");
    expect((tick?.payload as { spentCredits: number }).spentCredits).toBe(777);
  });

  it("the provisional usage.tick carries the proxy-priced figure (D-P0.08-2; §12.7 cross-check-1 machinery)", async () => {
    // The deploy binds `rateTableCreditRenderer`; the proxy meters the SAME usage at the SAME pinned table +
    // platform peg. This drives a real fixture through the loop and asserts the provisional sdk_stream row /
    // usage.tick figure is EXACTLY the proxy's price for the snapshot (modulo the integer display round) —
    // the run-scale ±2% check is in internal-api.test.ts's harvest test (per-phase fixtures are small enough
    // that the display round dominates; the live leg is PRB.17's).
    const withReal = makeDeps(db, { renderCredits: rateTableCreditRenderer });
    const engine = new FakeEngine(happyFixture);
    const outcome = await runPhase(withReal, engine, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 0,
      of: 7,
      phase: intake,
      request: makeReq(intake, 1, 0, 7),
      readOracleInputs: () => Promise.resolve({ phaseResult: { status: "done" }, facts: { thesisPresent: true, inventoryPresent: true } }),
    });
    expect(outcome.kind).toBe("complete");

    // the proxy's figure for the same snapshot: list cost under the run's pinned table at the tier's
    // representative model, × the platform peg — exactly what a `source:'proxy'` row would carry.
    const u = engine.usage();
    const metered: MeteredUsage = {
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
      cacheReadTokens: u.cacheReadTokens,
      cacheWriteTokens: u.cacheCreationTokens,
      webSearchRequests: u.webSearchRequests,
      webFetchRequests: u.webFetchRequests,
    };
    const proxyCredits = platformCredits(listCostUsd(metered, RATE_TABLE_V1, TIER_MODEL.balanced!));
    expect(proxyCredits).toBeGreaterThan(0); // the fixture drives a non-trivial snapshot

    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select credits, list_cost_usd from usage_records where run_id='run1' and source='sdk_stream'", []),
      )
    ).rows[0] as { credits: number; list_cost_usd: number };
    expect(Number(row.credits)).toBe(Math.round(proxyCredits)); // display-round only — never double-charged
    expect(Number(row.list_cost_usd)).toBe(0); // provisional rows never pretend to meter dollars

    const tick = withReal.eventWriter.forRun("run1").find((e) => e.type === "usage.tick");
    expect((tick?.payload as { spentCredits: number }).spentCredits).toBe(Number(row.credits));
  });

  it("rateTableCreditRenderer (the deploy default) prices a token snapshot into non-zero credits", () => {
    // the exact rate math is covered in credit-renderer.test.ts; here we assert the exported default renderer
    // apps wire is non-trivial (a real running-phase snapshot yields > 0 provisional credits).
    const credits = rateTableCreditRenderer(
      { inputTokens: 50_000, outputTokens: 4_000, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 },
      "balanced",
      1,
    );
    expect(credits).toBeGreaterThan(0);
  });
});

describe("AC1: full FakeEngine lifecycle traversal — every transition event-paired", () => {
  const allowlist: RunAllowlistData = {
    endpoints: [{ host: "api.anthropic.com", pathPrefix: "/v1/" }],
    models: ["claude-sonnet-5"],
    urlPolicy: { blockedDomains: [] },
  };
  const launcher: JobLauncher = { launch: () => Promise.resolve({ jobId: "job" }) };

  function createInput(): CreateRunInput {
    return {
      idempotencyKey: "idem-ac1",
      workflow: "review",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      requestedBy: seed.userId,
      projectId: seed.projectId,
      seat: "editor",
      modelProfile: { tier: "balanced" },
      modelTier: "balanced",
      rigor: "standard",
      estimateCredits: 560,
      capCredits: 840,
      rateTableVersion: 1,
      phaseClassesUsed: ["research", "judge", "generate", "package"],
      inputs: { draftId: seed.draftId, phases: {}, sidecar: true },
      inputSnapshot: { draftSha256: "abc", wordCount: 5180, claimCount: 21 },
      sheetLaunched: true,
      lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1 },
    };
  }
  function provArgs(over: Partial<ProvisionArgs>): ProvisionArgs {
    return {
      runId: "",
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      workflow: "review",
      projectId: seed.projectId,
      concurrencyLimit: 10,
      seat: "editor",
      imageDigest: "sha256:pinned",
      serviceAccount: "sa",
      modelTier: "balanced",
      provider: "anthropic",
      rateTableVersion: 1,
      capCredits: 840,
      allowlist,
      ...over,
    };
  }
  const oracleOk = (): Promise<OracleInputs> =>
    Promise.resolve({ phaseResult: { status: "done" }, facts: { thesisPresent: true, inventoryPresent: true } });

  async function stateChanges(runId: string): Promise<string[]> {
    // the ordered run.state_changed transitions from the event writer (the durable, event-paired history).
    return deps.eventWriter
      .forRun(runId)
      .filter((e) => e.type === "run.state_changed")
      .map((e) => `${(e.payload as { from: string }).from}→${(e.payload as { to: string }).to}`);
  }

  it("created → queued → provisioning → running → waiting_gate → queued → provisioning → running → finalizing → completed", async () => {
    // 1. create (created → queued)
    const created = await createRun(deps, createInput());
    expect(created.ok).toBe(true);
    const runId = created.ok ? created.runId : "";

    // 2. provision (queued → provisioning)
    const prov1 = await provisionRun(deps, launcher, provArgs({ runId }));
    expect(prov1.ok).toBe(true);

    // 3. first heartbeat (provisioning → running)
    await heartbeat(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });

    // 4. run the intake phase → complete → commit with a gate (running → waiting_gate; task exits)
    const p1 = await runPhase(deps, new FakeEngine(happyFixture), {
      runId,
      attempt: 1,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 0,
      of: 2,
      phase: intake,
      request: makeReq(intake, 1, 0, 2),
      readOracleInputs: oracleOk,
    });
    expect(p1.kind).toBe("complete");
    const c1 = await commitStep(deps, {
      runId,
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: intake.key,
      ordinal: 0,
      of: 2,
      credits: 60,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "gate", gateKind: "approve_scope", blocking: true, onExpiry: "proceed_as_proposed" },
    });
    expect(c1).toMatchObject({ ok: true, state: "waiting_gate" });

    // 5. gate resolved (P0.10's job; here we take waiting_gate → queued and bump the attempt for the resume)
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyTransition(tx, deps, {
        runId,
        from: "waiting_gate",
        to: "queued",
        reason: "approved",
        fields: { currentAttempt: 2 },
      }),
    );

    // 6. provision the resume (queued → provisioning) as the new attempt
    const prov2 = await provisionRun(deps, launcher, provArgs({ runId }));
    expect(prov2.ok).toBe(true);

    // 7. first heartbeat of the resume (provisioning → running)
    await heartbeat(deps, { runId, attempt: 2, workspaceId: seed.workspaceId });

    // 8. run the final phase → complete → commit finalize (running → finalizing)
    const p2 = await runPhase(deps, new FakeEngine(happyFixture), {
      runId,
      attempt: 2,
      workspaceId: seed.workspaceId,
      modelTier: "balanced",
      rateTableVersion: 1,
      ordinal: 1,
      of: 2,
      phase: intake,
      request: makeReq(intake, 2, 1, 2),
      readOracleInputs: oracleOk,
    });
    expect(p2.kind).toBe("complete");
    const c2 = await commitStep(deps, {
      runId,
      attempt: 2,
      workspaceId: seed.workspaceId,
      stepKey: "letter",
      ordinal: 1,
      of: 2,
      credits: 80,
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "finalize" },
    });
    expect(c2).toMatchObject({ ok: true, state: "finalizing" });

    // 9. finalize (finalizing → completed)
    const fin = await finalizeRun(deps, {
      runId,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      holdLedgerId: "led_0001",
      spentCredits: 140,
      capCredits: 840,
    });
    expect(fin.state).toBe("completed");

    // the durable, event-paired transition chain (REQ-DATA-33) contains every §12.4 milestone in order.
    const chain = await stateChanges(runId);
    expect(chain).toEqual([
      "created→queued",
      "queued→provisioning",
      "provisioning→running",
      "running→waiting_gate",
      "waiting_gate→queued",
      "queued→provisioning",
      "provisioning→running",
      "running→finalizing",
      "finalizing→completed",
    ]);

    // final DB state is completed; the hold was released and cost.final emitted.
    const finalState = (
      await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select state from runs where id=$1", [runId]))
    ).rows[0] as { state: string };
    expect(finalState.state).toBe("completed");
    expect(deps.ledger.opsOf("release")).toHaveLength(1);
    expect(deps.eventWriter.typesForRun(runId)).toContain("cost.final");
  });
});
