// D-P0.15c-6 — the server-authored harness run spec. Over PGlite + fakes: for each ported workflow on a seeded
// project, `buildHarnessRunSpec` assembles a spec whose `request` names the right phase-0 skill, whose
// `manifest` matches `hydration()`, whose `hookPolicyInput` is the run's seat's policy, and — the load-bearing
// invariant — carries NO secret (REQ-SPEC-10/11). Plus: resume advances to the next uncommitted phase.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { agentTypesSeed } from "@rhema/db";
import { classifyPath, compileSeatPolicy } from "@rhema/hooks";
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
      // residue 1: `phase_output` names the phase's declared artifact(s) from the manifest, so the agent's
      // write target can never drift from the completion oracle's predicate.
      expect(spec.request.inputs.phase_output).toBe(phase0.artifacts.join(", "));
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

  // PRB.16b F23 — the ported skill's declared args are `persona` + `personas_dir` (SKILL.md
  // frontmatter); the spec must pin them, with personas_dir the ABSOLUTE mount base the harness
  // materializes into — the conventions file that documents the layout is not shipped in the pod's
  // skillsDir, so a run whose agent can't resolve the persona dir produces nothing (live: Quick
  // Voice 01M2T65W5PZ3174FPVFNQRVKZS attempt-1, two zero-output sub-runs).
  it("persona-builder spec pins `persona` + `personas_dir` in the phase inputs (F23)", async () => {
    const runId = await seedWorkflowRun("run_pv", "profile_voice");
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set persona_id = $2 where id = $1`, [runId, "per_1"]),
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.inputs.persona).toBe("per_1");
    expect(spec.request.inputs.personas_dir).toBe("/work/personas");
    // a persona-less run carries neither key.
    const specNp = await buildHarnessRunSpec(deps, { runId: await seedWorkflowRun("run_rv", "review"), attempt: 1, workspaceId: seed.workspaceId });
    expect(specNp.request.inputs.persona).toBeUndefined();
    expect(specNp.request.inputs.personas_dir).toBeUndefined();
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

  it("threads the pinned phase's declared artifact as `phase_output` (residue 1 — the write target)", async () => {
    const runId = await seedWorkflowRun("run_phaseout", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    const craft = review.phases[1]!; // artifacts: ["04-craft-notes.md"]
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ phase: craft.skillPhase })]),
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.inputs.phase_output).toBe("04-craft-notes.md");
    expect(spec.request.inputs.phase_output).toBe(craft.artifacts.join(", "));
  });

  it("residue 2: maxUsdPerRun scales the per-phase SDK budget brake (default → configured), with a $0.5 floor", async () => {
    const runId = await seedWorkflowRun("run_budget", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    const intakeShare = review.phases[0]!.budgetShare; // 0.1

    // default (dev max_usd $10): budgetShare × 10.
    const dflt = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(dflt.request.maxBudgetUsd).toBeCloseTo(intakeShare * 10, 5);

    // a configured ceiling scales the brake linearly (the frontier-tier bump).
    const bumped = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId, maxUsdPerRun: 60 });
    expect(bumped.request.maxBudgetUsd).toBeCloseTo(intakeShare * 60, 5);
    expect(bumped.request.maxBudgetUsd).toBeGreaterThan(dflt.request.maxBudgetUsd);

    // the $0.5 floor holds when the share × ceiling would round below it (a tiny ceiling never zeroes a phase).
    const tiny = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId, maxUsdPerRun: 1 });
    expect(tiny.request.maxBudgetUsd).toBe(0.5);
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

  it("skips an opted-out phase (second_read=false) — the committed count selects the next ACTIVE phase (D-P0.15d-1)", async () => {
    const runId = await seedWorkflowRun("run_optout", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    const argument = review.phases.find((p) => p.key === "argument")!; // index 5, the active phase AFTER second_read
    // freeze the second_read opt-out on the run inputs, and commit phases 0..3 (through discourse) as done.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ second_read: false })]),
    );
    for (let i = 0; i < 4; i++) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_optout_${i}`, runId, review.phases[i]!.key, i],
      );
    }
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    // committed count = 4 → the 4th ACTIVE phase is `argument` (second_read, manifest index 4, is skipped).
    expect(spec.request.phase.key).toBe("argument");
    expect(spec.request.ordinal).toBe(argument.index); // ordinal stays the manifest index (5), not the position
    // `of` stays the full manifest length so the delivery trigger (index === of-1, the always-active letter) holds.
    expect(spec.request.of).toBe(review.phases.length);
  });

  it("profile_voice{tier: quick} omits substance + calibration — after close_reading the next ACTIVE phase is voice (PRB.10; §9.2)", async () => {
    const runId = await seedWorkflowRun("run_quick_voice", "profile_voice");
    const manifest = WORKFLOW_MANIFESTS.profile_voice!;
    // The build froze inputs.tier = 'quick' — the `optional: "quick"` phases (substance, calibration)
    // drop out of the ACTIVE set; census + close_reading committed → voice runs next.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ tier: "quick" })]),
    );
    for (const [key, i] of [["census", 0], ["close_reading", 1]] as const) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_qv_${i}`, runId, key, i],
      );
    }
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.phase.key).toBe("voice"); // manifest index 2 — substance (3) is skipped
    expect(spec.request.ordinal).toBe(2);
    expect(spec.request.of).toBe(manifest.phases.length); // still 6 — package stays the delivery trigger
  });

  it("profile_voice{tier: quick} — voice + package committed ⇒ no active phase remains (Quick runs 4 phases)", async () => {
    const runId = await seedWorkflowRun("run_quick_done", "profile_voice");
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ tier: "quick" })]),
    );
    // The four ACTIVE phases done (package is manifest ordinal 5 — substance/calibration never ran).
    for (const [key, i] of [["census", 0], ["close_reading", 1], ["voice", 2], ["package", 5]] as const) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_qd_${i}`, runId, key, i],
      );
    }
    await expect(
      buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId }),
    ).rejects.toThrow(/no phase to run/);
  });

  it("profile_voice{tier: full} keeps all six phases — after voice the next phase is substance (Quick would jump to package)", async () => {
    const runId = await seedWorkflowRun("run_full_voice", "profile_voice");
    const manifest = WORKFLOW_MANIFESTS.profile_voice!;
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ tier: "full" })]),
    );
    for (const [key, i] of [["census", 0], ["close_reading", 1], ["voice", 2]] as const) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_fv_${i}`, runId, key, i],
      );
    }
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.phase.key).toBe("substance"); // no tier opt-out — all 6 phases active
    expect(spec.request.of).toBe(manifest.phases.length);
  });

  it("F15 — a sidecar-declaring phase injects `sidecar_output` + `sidecar_contract` (the entries-not-rows fix)", async () => {
    const runId = await seedWorkflowRun("run_triage_sc", "revise");
    const revise = WORKFLOW_MANIFESTS.revise!;
    const triage = revise.phases.find((p) => p.key === "triage")!;
    // commit bootstrap + research so the selected phase is triage (the sidecar-declaring one).
    for (const [key, i] of [["bootstrap", 0], ["research", 1]] as const) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_sc_${i}`, runId, key, i],
      );
    }
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.phase.key).toBe("triage");
    // `sidecar: true` (revise defaultInputs) + the contract hint — the exact envelope reaches the prompt.
    expect(spec.request.inputs.sidecar).toBe(true);
    expect(spec.request.inputs.sidecar_output).toBe(triage.sidecars.join(", "));
    const contract = String(spec.request.inputs.sidecar_contract);
    expect(contract).toContain("response-ledger.json");
    expect(contract).toContain('"entries"');
    expect(contract).toContain("findingOrdinal");
    // the phase-result enum is pinned too (live: the agent wrote "success" — the oracle's
    // non-blocked/non-replan fall-through was the only thing that passed leg b).
    expect(String(spec.request.inputs.phase_result_contract)).toContain('"done"');
  });

  it("F15 — a phase with NO declared sidecars carries no sidecar_contract input", async () => {
    const runId = await seedWorkflowRun("run_no_sc", "revise");
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.phase.key).toBe("bootstrap"); // sidecars: []
    expect(spec.request.inputs.sidecar_output).toBeUndefined();
    expect(spec.request.inputs.sidecar_contract).toBeUndefined();
    // …but `sidecar: true` is still in effect (revise defaultInputs), so the phase-result enum hint lands
    // on EVERY phase of the run — it is the input that makes the skill write the file at all.
    expect(String(spec.request.inputs.phase_result_contract)).toContain('"done"');
  });

  it("F16 — run-scope guidance is delivered into `inputs.guidance` at the phase boundary + marked consumed", async () => {
    const runId = await seedWorkflowRun("run_guid", "revise");
    // the pretriage-style note captured at run creation (run-scope, queued_message source).
    const gdnId = deps.ids("gdn"); // a real ULID — the guidance.delivered payload validates ids
    await db.pg.query(
      `insert into guidance(id, project_id, run_id, source, anchors, body, standing, workflows, consumed_by, active, created_by, created_at)
       values ($1,$2,$3,'queued_message',null,'rows marked actor:user are authoritative and must not be overridden',false,null,'[]'::jsonb,true,'"usr_1"',now())`,
      [gdnId, seed.projectId, runId],
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(String(spec.request.inputs.guidance)).toContain("actor:user are authoritative");
    // consumed: the row records this run+phase, and a guidance.delivered event was appended.
    const row = (await db.pg.query(`select consumed_by from guidance where id = $1`, [gdnId])).rows[0] as { consumed_by: { runId: string; phase: string }[] };
    expect(row.consumed_by).toEqual([{ runId, phase: "bootstrap" }]);
    const ev = deps.eventWriter.forRun(runId).filter((e) => e.type === "guidance.delivered");
    expect(ev).toHaveLength(1);
  });

  it("F16 — an independence phase (review second_read) is delivered NO guidance (REQ-RUN-18)", async () => {
    const runId = await seedWorkflowRun("run_indep", "review");
    const review = WORKFLOW_MANIFESTS.review!;
    const gdnId = deps.ids("gdn");
    await db.pg.query(
      `insert into guidance(id, project_id, run_id, source, anchors, body, standing, workflows, consumed_by, active, created_by, created_at)
       values ($1,$2,$3,'queued_message',null,'do not deliver me into second read',false,null,'[]'::jsonb,true,'"usr_1"',now())`,
      [gdnId, seed.projectId, runId],
    );
    // commit phases 0..3 so the selected phase is second_read (manifest index 4).
    for (let i = 0; i < 4; i++) {
      await db.pg.query(
        `insert into steps(id, run_id, phase, ordinal, state, attempt, started_at, ended_at, credits)
         values ($1,$2,$3,$4,'done',1, now(), now(), 10)`,
        [`stp_indep_${i}`, runId, review.phases[i]!.key, i],
      );
    }
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.request.phase.key).toBe("second_read");
    expect(spec.request.inputs.guidance).toBeUndefined();
    // and the record was NOT consumed (it stays deliverable for the next non-independence phase).
    const row = (await db.pg.query(`select consumed_by from guidance where id = $1`, [gdnId])).rows[0] as { consumed_by: unknown[] };
    expect(row.consumed_by).toEqual([]);
  });

  // -----------------------------------------------------------------------------------------------
  // PRB.19 (F26) — the revise delivery gate + declared-output writability.
  // -----------------------------------------------------------------------------------------------

  /** Promote the seeded draft to a real artifact version + file a `review` correspondence on it. */
  async function seedReviewedDraft(): Promise<{ reviewCorrId: string; versionId: string }> {
    const draftId = seed.draftId!;
    const versionId = "av_seed_v1";
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_seed_v1',$1,$2,'draft','shared','drafts/v1.md',$3)`,
      [seed.workspaceId, seed.projectId, versionId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ($1,'art_seed_v1',1,'sha_seed_v1','k',10,'text/markdown','{"kind":"system"}'::jsonb)`,
      [versionId],
    );
    await db.pg.query(`update drafts set promoted_version_id = $2 where id = $1`, [draftId, versionId]);
    const reviewCorrId = deps.ids("corr");
    await db.pg.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ($1,$2,'review',$3,'run_rev', now(), '{}')`,
      [reviewCorrId, seed.projectId, draftId],
    );
    return { reviewCorrId, versionId };
  }

  it("F26a — a revise-shaped run (priorReviewId + nextDraftId, NO draftId) produces a delivery spec", async () => {
    const runId = await seedWorkflowRun("run_revise_del", "revise");
    const { reviewCorrId, versionId } = await seedReviewedDraft();
    const nextDraftId = deps.ids("dft");
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [
        runId,
        JSON.stringify({ priorReviewId: reviewCorrId, nextDraftId }),
      ]),
    );

    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });

    // the delivery spec fires on the REVIEWED draft (resolved via priorReviewId → the working head) —
    // pre-fix this was undefined because revise inputs carry no `draftId` (the bare-finalize defect).
    expect(spec.delivery).toBeDefined();
    expect(spec.delivery).toMatchObject({
      projectId: seed.projectId,
      draftId: seed.draftId,
      correspondenceKind: "response",
      draftPromotedVersionId: versionId,
      priorReviewId: reviewCorrId,
      newDraftId: nextDraftId,
    });
  });

  it("F26b — the revise run's declared shared outputs are granted writable (drafts/v2.md + v1-response)", async () => {
    const runId = await seedWorkflowRun("run_revise_w", "revise");
    const { reviewCorrId } = await seedReviewedDraft();
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [
        runId,
        JSON.stringify({ priorReviewId: reviewCorrId, nextDraftId: deps.ids("dft") }),
      ]),
    );

    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });

    // the declared `phase.artifacts` resolve to the concrete shared paths the skill writes (SKILL.md:
    // `drafts/v(N+1).md`, `correspondence/vN-response.md`) — granted writable for THIS run.
    expect(spec.writablePaths).toEqual(["correspondence/v1-response.md", "drafts/v2.md"]);
    expect(spec.hookPolicyInput.writableArtifacts).toEqual(spec.writablePaths);
    // the compiled seat policy now classifies those paths readwrite while every OTHER shared file stays
    // read-only (the §12.6 table is unchanged — the grant is per-run, path-precise).
    const policy = compileSeatPolicy(spec.hookPolicyInput);
    expect(classifyPath("drafts/v2.md", policy).rule?.mode).toBe("readwrite");
    expect(classifyPath("correspondence/v1-response.md", policy).rule?.mode).toBe("readwrite");
    expect(classifyPath("drafts/v1.md", policy).rule?.mode).toBe("read"); // the evidence mount is untouched
    // the hydration manifest mounts the committed seed draft at its granted path as readwrite when the
    // declared output IS that artifact (not the case here — v1 is not a declared output — stays `read`).
    const entry = spec.manifest.entries.find((e) => e.path === "drafts/v1.md");
    expect(entry?.mode).toBe("read");
  });

  it("F26 — a review run's delivery spec still resolves via inputs.draftId (unchanged)", async () => {
    const runId = await seedWorkflowRun("run_review_del", "review");
    const { versionId } = await seedReviewedDraft();
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [runId, JSON.stringify({ draftId: seed.draftId })]),
    );
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.delivery).toMatchObject({
      draftId: seed.draftId,
      correspondenceKind: "review",
      draftPromotedVersionId: versionId,
    });
    // a review declares no shared-path outputs → no writable grant.
    expect(spec.writablePaths).toEqual([]);
    expect(spec.hookPolicyInput.writableArtifacts).toBeUndefined();
  });

  it("F26 — a revise run whose manualRevision names a divergent head delivers on THAT head", async () => {
    const runId = await seedWorkflowRun("run_revise_man", "revise");
    const { reviewCorrId } = await seedReviewedDraft();
    // the human's saved edits forked a working v2 head (the frozen v1 stays reviewed).
    await db.pg.query(`update drafts set state='frozen' where id = $1`, [seed.draftId]);
    const headId = deps.ids("dft");
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id)
       values ($1,$2,2,'human_revision','working',$3,'av_seed_v1')`,
      [headId, seed.projectId, seed.draftId],
    );
    const nextDraftId = deps.ids("dft");
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query(`update runs set inputs = $2::jsonb where id = $1`, [
        runId,
        JSON.stringify({
          priorReviewId: reviewCorrId,
          nextDraftId,
          manualRevision: { baseDraftId: headId, mootedFindingIds: [], note: "n" },
        }),
      ]),
    );

    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    // the base is the divergent head (NOT the reviewed draft) — the revision builds on the user's edits.
    expect(spec.delivery).toMatchObject({ draftId: headId, newDraftId: nextDraftId, correspondenceKind: "response" });
    // and the writability grant keys off BOTH ordinals: the correspondence names the reviewed draft (v1)
    // or the head (v2), and `v(N+1)` expands to v2 (in-place revision of the head) + v3 (the next draft).
    expect(spec.writablePaths).toEqual([
      "correspondence/v1-response.md",
      "correspondence/v2-response.md",
      "drafts/v2.md",
      "drafts/v3.md",
    ]);
  });

  it("F26 — a revise run on a project with no draft produces no delivery spec + no grant", async () => {
    const runId = await seedWorkflowRun("run_revise_none", "revise");
    const empty = await seedProject(db, { projectId: "prj_nodraft", workspaceId: seed.workspaceId });
    await db.pg.query(`update runs set project_id = $2 where id = $1`, [runId, empty.projectId]);
    const spec = await buildHarnessRunSpec(deps, { runId, attempt: 1, workspaceId: seed.workspaceId });
    expect(spec.delivery).toBeUndefined();
    expect(spec.writablePaths).toEqual([]);
  });
});
