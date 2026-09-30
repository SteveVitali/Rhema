import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { captureGuidance, consumeGuidance, retireGuidance, INDEPENDENCE_CONTEXTS } from "./guidance.js";
import { createOrchestratorTestDb, seedProject, seedRun, makeDeps, type OrchestratorTestDb, type TestDeps } from "./testing/index.js";

describe("guidance capture + delivery (§6.5; REQ-GATE-9/10/11; REQ-RUN-18)", () => {
  let db: OrchestratorTestDb;
  let deps: TestDeps;
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = makeDeps(db);
    await seedRun(db, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", state: "running" });
  });
  afterEach(() => db.close());

  it("AC6 — a queued note is Guidance{source:'queued_message'}, delivered at the next boundary, never into an independence context", async () => {
    const { guidanceId } = await captureGuidance(deps, {
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      source: "queued_message",
      text: "Keep §I under 700 words.",
      scope: "run",
      runId: "run1",
    });
    // stored with the right source + scope
    const row = (await db.client.query("select source, standing, run_id from guidance where id=$1", [guidanceId])).rows[0] as {
      source: string;
      standing: boolean;
      run_id: string | null;
    };
    expect(row).toMatchObject({ source: "queued_message", standing: false, run_id: "run1" });

    // NEVER delivered into a judge/independence context.
    for (const context of INDEPENDENCE_CONTEXTS) {
      const r = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "second_read", context });
      expect(r.delivered).toHaveLength(0);
      expect(r.rendered).toBe("");
    }

    // delivered at the next phase boundary (a normal seat).
    const r = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "draft" });
    expect(r.delivered).toHaveLength(1);
    expect(r.delivered[0]).toMatchObject({ guidanceId, source: "queued_message" });
    expect(r.rendered).toContain("Keep §I under 700 words.");
    expect(deps.eventWriter.typesForRun("run1")).toContain("guidance.delivered");

    // consumedBy is populated; a queued note is one-shot (not re-delivered on the next phase).
    const consumed = (await db.client.query("select consumed_by from guidance where id=$1", [guidanceId])).rows[0] as { consumed_by: { runId: string; phase: string }[] | string };
    const cb = typeof consumed.consumed_by === "string" ? JSON.parse(consumed.consumed_by) : consumed.consumed_by;
    expect(cb).toEqual([{ runId: "run1", phase: "draft" }]);
    const again = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "revise" });
    expect(again.delivered).toHaveLength(0);
  });

  it("standing (project-scope) guidance is delivered every applicable phase and is retirable (never deleted)", async () => {
    const { guidanceId } = await captureGuidance(deps, {
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      source: "gate_edit",
      text: "Keep openings under 700 words for this project.",
      scope: "project",
    });
    const a = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "phaseA" });
    const b = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "phaseB" });
    expect(a.delivered).toHaveLength(1); // delivered per phase
    expect(b.delivered).toHaveLength(1);

    expect(await retireGuidance(deps, { workspaceId: ws, guidanceId })).toEqual({ retired: true });
    const afterRetire = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "phaseC" });
    expect(afterRetire.delivered).toHaveLength(0); // retired → not delivered
    // but the row still exists (never deleted).
    const stillThere = (await db.client.query("select active from guidance where id=$1", [guidanceId])).rows[0] as { active: boolean };
    expect(stillThere.active).toBe(false);
  });

  it("run-scope guidance emits guidance.captured on the run stream; project-scope emits none (run_event_seq FK — PRB.16 live finding)", async () => {
    // The run_event_seq.run_id → runs.id FK means the event stream can only attach to a real run: a
    // project-scope capture must NOT append (the prod note path 500'd on the FK; InMemoryEventWriter
    // bypassed the seq table, so only the append/no-append contract is assertable here).
    await captureGuidance(deps, {
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      source: "gate_edit",
      text: "A standing note.",
      scope: "project",
    });
    expect(deps.eventWriter.events.filter((e) => e.type === "guidance.captured")).toHaveLength(0);
    expect(deps.eventWriter.typesForRun("prj_seed")).not.toContain("guidance.captured");

    await captureGuidance(deps, {
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      source: "queued_message",
      text: "A run note.",
      scope: "run",
      runId: "run1",
    });
    expect(deps.eventWriter.typesForRun("run1")).toContain("guidance.captured");
  });

  it("workflows narrow which workflows guidance applies to", async () => {
    await captureGuidance(deps, {
      workspaceId: ws,
      projectId: "prj_seed",
      userId: "usr_seed",
      source: "run_sheet",
      text: "Only for revise runs.",
      scope: "project",
      workflows: ["revise"],
    });
    const draft = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", phase: "p" });
    expect(draft.delivered).toHaveLength(0); // not a revise run
    const revise = await consumeGuidance(deps, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "revise", phase: "p" });
    expect(revise.delivered).toHaveLength(1);
  });
});
