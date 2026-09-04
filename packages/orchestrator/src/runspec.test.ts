// D-P0.15c-6 — the server-authored harness run spec. Over PGlite + fakes: for each ported workflow on a seeded
// project, `buildHarnessRunSpec` assembles a spec whose `request` names the right phase-0 skill, whose
// `manifest` matches `hydration()`, whose `hookPolicyInput` is the run's seat's policy, and — the load-bearing
// invariant — carries NO secret (REQ-SPEC-10/11). Plus: resume advances to the next uncommitted phase.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentTypesSeed } from "@rhema/db";
import { compileSeatPolicy } from "@rhema/hooks";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import type { WorkflowKey } from "@rhema/contracts";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { buildHarnessRunSpec, DEFAULT_SKILLS_DIR } from "./runspec.js";
import { hydration } from "./internal-api.js";
import { seatForWorkflow } from "./run-shape.js";
import { mintProxyCredential } from "./provision.js";
import { authorRunAllowlist } from "./allowlist.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  // real seat tool sets + phase manifests need the agent_types rows (buildHarnessRunSpec reads the seat's tools).
  await agentTypesSeed({ exec: (sql) => db.pg.exec(sql), query: (sql, params) => db.pg.query(sql, params as unknown[]) });
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

/** Seed a run for `workflow` with an agent_instance for its seat, so hydration derives the right seat. */
async function seedWorkflowRun(runId: string, workflow: WorkflowKey): Promise<string> {
  const seat = seatForWorkflow(workflow);
  const instanceId = `ai_${workflow}`;
  await db.pg.query(
    `insert into agent_instances(id, project_id, type_key, namespace) values ($1,$2,$3,$4)
       on conflict (project_id, type_key) do nothing`,
    [instanceId, seed.projectId, seat, `agent:${seat}`],
  );
  await seedRun(db, {
    runId,
    workspaceId: seed.workspaceId,
    projectId: seed.projectId,
    workflow,
    state: "running",
    agentInstanceId: instanceId,
  });
  return runId;
}

const WORKFLOWS: WorkflowKey[] = ["review", "revise", "fact_check", "profile_voice"];

describe("buildHarnessRunSpec — the server-authored run spec (D-P0.15c-6)", () => {
  for (const workflow of WORKFLOWS) {
    it(`${workflow}: request names the right phase-0 skill, manifest matches hydration, hookPolicy is the seat's`, async () => {
      const runId = await seedWorkflowRun(`run_${workflow}`, workflow);
      const manifest = WORKFLOW_MANIFESTS[workflow]!;
      const phase0 = manifest.phases[0]!;
      const seat = seatForWorkflow(workflow);

      const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });

      // request: the ported skill + its phase-0, with `phase` pinned to run exactly phase 0 then stop.
      expect(spec.request.skill).toBe(manifest.skill);
      expect(spec.request.phase.key).toBe(phase0.key);
      expect(spec.request.phase.skillPhase).toBe(phase0.skillPhase);
      expect(spec.request.ordinal).toBe(0);
      expect(spec.request.of).toBe(manifest.phases.length);
      expect(spec.request.inputs.phase).toBe(phase0.skillPhase);
      expect(spec.request.seat).toBe(seat);
      expect(spec.request.maxBudgetUsd).toBeGreaterThan(0);
      expect(spec.tier).toBe("balanced"); // seedRun's model_tier
      expect(spec.skillsDir).toBe(DEFAULT_SKILLS_DIR);

      // fact_check's manifest defaults flow into the inputs (REQ-WF-13).
      for (const [k, v] of Object.entries(manifest.defaultInputs ?? {})) {
        expect(spec.request.inputs[k]).toEqual(v);
      }

      // manifest matches an independent hydration() (same server-side fact), and serverFiles carry manifest.md.
      const hyd = await hydration(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
      expect(spec.manifest).toEqual(hyd.manifest);
      expect(spec.serverFiles["manifest.md"]).toBeTypeOf("string");
      expect(spec.serverFiles["manifest.md"]!.length).toBeGreaterThan(0);

      // hookPolicyInput is the run's seat's policy (JSON-safe) and compiles to a valid SeatPolicy.
      expect(spec.hookPolicyInput.seat).toBe(seat);
      expect(spec.hookPolicyInput.phase.key).toBe(phase0.key);
      expect(spec.hookPolicyInput.phase.phaseClass).toBe(phase0.phaseClass);
      expect(spec.hookPolicyInput.phase.allowsSubagents).toBe(phase0.allowsSubagents);
      const seatTools = (await db.pg.query("select tools from agent_types where key=$1", [seat])).rows[0] as { tools: string[] };
      expect([...spec.hookPolicyInput.tools]).toEqual(seatTools.tools);
      const policy = compileSeatPolicy(spec.hookPolicyInput);
      expect(policy.seat).toBe(seat);
      expect(policy.tools).toEqual(new Set(seatTools.tools));
    });
  }

  it("carries NO secret — the run token and proxy credential never enter the spec (REQ-SPEC-10/11)", async () => {
    const runId = await seedWorkflowRun("run_secret", "review");
    // mint a real proxy credential so proxy_credentials + proxy_allowlists rows exist for this run.
    const secret = await mintProxyCredential(deps, {
      runId,
      attempt: 1,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      projectId: seed.projectId,
      role: "editor",
      agentId: "editor",
      provider: "anthropic",
      modelTier: "balanced",
      rateTableVersion: 1,
      capCredits: 840,
      allowlist: authorRunAllowlist({ modelTier: "balanced" }),
    });
    const token = deps.tokens.mint({ runId, attempt: 1, workspaceId: seed.workspaceId, seat: "harness" });

    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    const serialized = JSON.stringify(spec);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(token);
    expect(serialized.toLowerCase()).not.toContain("bearer");
    // no credential/token-shaped keys leaked into the spec structure.
    for (const banned of ["runToken", "run_token", "proxyCredential", "credential_hash"]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("honors an explicit `phase` pin in the frozen inputs (REQ-SPEC-13 — run exactly phase N)", async () => {
    const runId = await seedWorkflowRun("run_pin", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    const craft = review.phases[1]!; // index 1, skillPhase "4" (the skill's native craft phase)
    // freeze a `phase` pin on the run's inputs — the run was created to run exactly that skill phase.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ phase: craft.skillPhase })]),
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    // the pin selects the phase whose skillPhase matches — NOT the committed-count default (which would be 0).
    expect(spec.request.phase.key).toBe(craft.key);
    expect(spec.request.phase.skillPhase).toBe(craft.skillPhase);
    expect(spec.request.ordinal).toBe(craft.index);
    expect(spec.request.inputs.phase).toBe(craft.skillPhase); // the pin is preserved, never clobbered
  });

  it("resume: advances to the next uncommitted phase (a committed phase 0 → phase 1)", async () => {
    const runId = await seedWorkflowRun("run_resume", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    // commit phase 0 (ordinal 0) as done — a distinct committed ordinal advances the run spec to phase index 1.
    await db.pg.query(
      `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
       values ($1,$2,$3,0,'done',1, now(), now(), 10)`,
      ["stp_0", runId, review.phases[0]!.key],
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.ordinal).toBe(1);
    expect(spec.request.phase.key).toBe(review.phases[1]!.key);
    expect(spec.request.inputs.phase).toBe(review.phases[1]!.skillPhase);
  });
});
