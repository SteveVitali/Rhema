import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RUN_JOBS, retryPolicyFor } from "@rhema/orchestrator";
import {
  createG21Harness,
  handleRunReap,
  handleRunCancel,
  completeCancellation,
  assessPhase0ExitForRun,
  INTAKE_STEP_KEY,
  type G21Harness,
} from "./harness.js";

// ledger G21: api + worker + FakeEngine + PGlite end-to-end. Each scenario drives the REAL api HTTP routes (run
// creation, gate resolution, the fenced internal API) and the REAL worker lifecycle handlers, with FakeEngine
// replaying recorded fixtures — no live model, proxy, or cost. This is the deterministic composition proof the CI
// `integration` job runs; the LIVE three-project dev runs are the H0-deferred half (see the exit readout).

let h: G21Harness;
beforeEach(async () => { h = await createG21Harness(); });
afterEach(() => h.close());

const GATE_NEXT = { kind: "gate", gateKind: "approve_scope", blocking: false, onExpiry: "proceed_as_proposed" } as const;

/** create → provision → heartbeat → (running). Returns the runId + the attempt-1 run token. */
async function toRunning(): Promise<{ runId: string; token: string; attempt: number }> {
  const created = await h.createRunHttp();
  expect(created.status).toBe(201);
  const runId = created.runId!;
  const started = await h.startRun(runId);
  expect(started.ok).toBe(true);
  expect(started.state).toBe("provisioning");
  const hb = await h.heartbeatHttp(runId, started.token!);
  expect(hb.status).toBe(200);
  expect(await h.stateOf(runId)).toBe("running");
  return { runId, token: started.token!, attempt: started.attempt! };
}

describe("G21 — gates (a phase commits with a gate; the human resolves it via the api)", () => {
  it("running → waiting_gate → (approve) → queued + run.resume enqueued", async () => {
    const { runId, token, attempt } = await toRunning();
    const phase = await h.runFakePhase(runId, attempt, "intake-happy");
    expect(phase.kind).toBe("complete");

    const commit = await h.commitHttp(runId, token, { stepKey: INTAKE_STEP_KEY, ordinal: 0, of: 2, credits: 60, next: GATE_NEXT });
    expect(commit.status).toBe(200);
    expect(commit.body.state).toBe("waiting_gate");
    expect(await h.stateOf(runId)).toBe("waiting_gate");

    const gateId = await h.openGateId(runId);
    expect(gateId).toBeTruthy();
    const before = h.deps.queue.ofName(RUN_JOBS.resume).length;
    const resolved = await h.resolveGateHttp(runId, gateId!, "approve");
    expect(resolved.status).toBe(200);
    expect((resolved.body as { resolved: boolean }).resolved).toBe(true);
    expect(await h.stateOf(runId)).toBe("queued");
    expect(h.deps.queue.ofName(RUN_JOBS.resume).length).toBe(before + 1); // the resume is enqueued after commit
  });
});

describe("G21 — orphan resume (the reaper re-enqueues a stale run)", () => {
  it("a running run whose heartbeat went stale → orphaned → queued (attempt 2) + run.resume", async () => {
    const { runId } = await toRunning();
    // backdate the heartbeat well past the stale threshold
    await h.deps.heartbeats.beat({ runId, attempt: 1, workspaceId: h.seed.workspaceId, at: new Date(h.deps.clock.now().getTime() - 4 * 60_000) });
    const out = await handleRunReap(h.worker);
    expect(out).toEqual([{ runId, action: "reenqueued", attempt: 2 }]);
    expect(await h.stateOf(runId)).toBe("queued");
    const resumes = h.deps.queue.ofName(RUN_JOBS.resume);
    expect(resumes.length).toBeGreaterThanOrEqual(1);
    expect(resumes.some((j) => (j as { singletonKey?: string }).singletonKey === runId)).toBe(true);
  });
});

describe("G21 — cancel (Stop quiesces a running run, then it settles)", () => {
  it("running → cancelling → cancelled; the hold is released", async () => {
    const { runId } = await toRunning();
    const cancel = await handleRunCancel(h.worker, { runId, workspaceId: h.seed.workspaceId });
    expect(cancel.state).toBe("cancelling");

    const done = await completeCancellation(h.worker, { runId, workspaceId: h.seed.workspaceId });
    expect(done.state).toBe("cancelled");
    expect(await h.stateOf(runId)).toBe("cancelled");
    // the unused hold was released at the terminal transition (no credit leak)
    expect(h.deps.ledger.opsOf("release").length).toBeGreaterThanOrEqual(1);
  });
});

describe("G21 — cap exhaustion (proxy 402 surfaces as `budget` → resume_partial)", () => {
  it("a budget-stop phase → incomplete{budget}; the retry policy is resume_partial", async () => {
    const { runId, attempt } = await toRunning();
    const phase = await h.runFakePhase(runId, attempt, "budget-stop");
    expect(phase).toMatchObject({ kind: "incomplete", errorClass: "budget" });
    // the cap-exhaustion contract: budget is NOT retried in-loop; the run opens resume_partial (§12.4).
    expect(retryPolicyFor("budget").onExhaust).toBe("resume_partial");
  });
});

describe("G21 — stale-task fencing (a superseded attempt is rejected 409)", () => {
  it("after the reaper bumps the attempt, the old attempt's token is fenced with 409 stale_task", async () => {
    const { runId, token } = await toRunning();
    // bump the attempt via the reaper (running → orphaned → queued, current_attempt 2)
    await h.deps.heartbeats.beat({ runId, attempt: 1, workspaceId: h.seed.workspaceId, at: new Date(h.deps.clock.now().getTime() - 4 * 60_000) });
    await handleRunReap(h.worker);

    // the attempt-1 token now hits the fence on the internal api
    const hb = await h.heartbeatHttp(runId, token);
    expect(hb.status).toBe(409);
    expect((hb.body as { code: string }).code).toBe("stale_task");

    const commit = await h.commitHttp(runId, token, { stepKey: INTAKE_STEP_KEY, ordinal: 0, of: 2, credits: 10, next: { kind: "advance" } });
    expect(commit.status).toBe(409);
    expect(commit.body.code).toBe("stale_task");
    expect(commit.body.currentAttempt).toBe(2);
  });
});

// ---------------------------------------------------------------- Phase-0 exit assessment (AC1–AC5) ----

describe("Phase-0 exit assessment over a delivered run's rows (AC1–AC5)", () => {
  const runId = "run_delivered";

  async function seedDeliveredRun(opts: { parseStatus?: string; missCited?: boolean; proxyUsd?: number; sdkUsd?: number } = {}) {
    const { seed, db } = h;
    const parseStatus = opts.parseStatus ?? "ok";
    const proxyUsd = opts.proxyUsd ?? 1.0;
    const sdkUsd = opts.sdkUsd ?? 1.0;

    // a completed run (RLS)
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(
        `insert into runs(id, workspace_id, project_id, workflow, state, state_since, current_attempt, inputs,
           model_profile, model_tier, rigor, estimate_credits, cap_credits, spent_credits, rate_table_version, created_at)
         values ($1,$2,$3,'review','completed', now(), 1, '{}'::jsonb,'balanced','balanced','standard',100,840,140,1, now())`,
        [runId, seed.workspaceId, seed.projectId],
      ),
    );
    // an artifact + version carrying a sidecar parse_status (artifacts is RLS; artifact_versions is not)
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art1',$1,$2,'letter','editor','correspondence/letter.md')`,
        [seed.workspaceId, seed.projectId],
      ),
    );
    await db.client.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, parse_status)
       values ('av1','art1',1,'sha','k',100,'application/json','{"type":"agent"}'::jsonb,$1)`,
      [parseStatus],
    );
    await db.client.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('corr1',$1,'review',$2,$3, now(), array['av1'])`,
      [seed.projectId, seed.draftId, runId],
    );
    // a cited claim + the proxy fetch of that url (cited ⇒ fetched). A miss variant omits the fetch.
    await db.client.query(
      `insert into claims(id, correspondence_id, draft_id, ordinal, text, verdict, url, normalized_url)
       values ('cl1','corr1',$1,1,'a claim','verified','https://example.org/a','https://example.org/a')`,
      [seed.draftId],
    );
    if (!opts.missCited) {
      await db.client.query(
        `insert into fetch_log(run_id, ts, agent_label, kind, url, normalized_url, decision)
         values ($1, now(), 'editor','fetch','https://example.org/a','https://example.org/a','allow')`,
        [runId],
      );
    }
    // the meter of record + the SDK-reported figure (usage_records is RLS)
    for (const [source, usd] of [["proxy", proxyUsd], ["sdk_estimate", sdkUsd]] as const) {
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query(
          `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier, rate_table_version, list_cost_usd, credits, source)
           values ($1, now(), $2, $3, $4, 'editor','anthropic','sonnet-5','balanced',1,$5,$6,$7)`,
          [`ur_${source}`, seed.workspaceId, seed.billingAccountId, runId, usd, Math.ceil(Number(usd) * 140), source],
        ),
      );
    }
  }

  const assess = () => h.db.txRunner.run(h.seed.workspaceId, (tx) => assessPhase0ExitForRun(tx, { runId, attempt: 1 }));

  it("a clean delivered run passes every Phase-0 exit check", async () => {
    await seedDeliveredRun();
    const a = await assess();
    expect(a.delivered).toBe(true);
    expect(a.boundaryViolations).toBe(0);
    expect(a.boundaryOk).toBe(true);
    expect(a.sidecars).toEqual({ total: 1, failed: 0, allOk: true });
    expect(a.citedFetched).toMatchObject({ misses: 0, ok: true });
    expect(a.citedFetched.checked).toBeGreaterThanOrEqual(1);
    expect(a.cost.comparable).toBe(true);
    expect(a.cost.withinTolerance).toBe(true);
    expect(a.passed).toBe(true);
  });

  it("a failed sidecar (parseStatus = failed) fails the assessment (AC3)", async () => {
    await seedDeliveredRun({ parseStatus: "failed" });
    const a = await assess();
    expect(a.sidecars.allOk).toBe(false);
    expect(a.passed).toBe(false);
  });

  it("a cited url absent from the proxy fetch log fails cited⇒fetched (AC2)", async () => {
    await seedDeliveredRun({ missCited: true });
    const a = await assess();
    expect(a.citedFetched.ok).toBe(false);
    expect(a.citedFetched.misses).toBeGreaterThanOrEqual(1);
    expect(a.passed).toBe(false);
  });

  it("a proxy vs SDK divergence > 2% fails the cost cross-check (AC5)", async () => {
    await seedDeliveredRun({ proxyUsd: 1.0, sdkUsd: 1.1 }); // 10% high
    const a = await assess();
    expect(a.cost.flagged).toBe(true);
    expect(a.passed).toBe(false);
  });
});
