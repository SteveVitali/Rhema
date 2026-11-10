import { describe, expect, it } from "vitest";
import {
  createMirrorTestDb,
  InMemoryContentStore,
  seedBase,
  seedMirrorProject,
  testDeps,
  type MirrorTestDb,
} from "@rhema/mirror/testing";
import { collectStatementFacts } from "./facts.js";
import { generatedSentences, templateForProtocol } from "./statement.js";
import { appendAddition, listAdditions, AdditionError } from "./additions.js";
import { loadStatement, statementMarkdown, attachmentSection } from "./compose.js";

// PRB.11 AC2 — the AI-use statement is generated from run rows only: the fixture (2 reviews + 1 revise +
// a human-revision version + recorded decisions + steps) must produce exactly those facts; user additions
// survive regeneration; there is no API path that removes a generated sentence (the generated half is never
// persisted — recomputed every read — and the additions table is insert-only below this API).

const USER = { kind: "user", userId: "usr_mirror" } as const;

async function seedRunWithSteps(
  db: MirrorTestDb,
  args: {
    runId: string;
    workspaceId: string;
    projectId: string;
    workflow: string;
    tier?: string;
    createdAt: string;
    phases: string[];
  },
): Promise<void> {
  await db.exec.query(
    `insert into runs(id, workspace_id, project_id, workflow, state, current_attempt, inputs, model_profile,
       model_tier, rigor, estimate_credits, cap_credits, rate_table_version, created_at)
     values ($1,$2,$3,$4,'completed',1,'{}'::jsonb,'balanced',$5,'standard',100,840,1,$6)`,
    [args.runId, args.workspaceId, args.projectId, args.workflow, args.tier ?? "balanced", args.createdAt],
  );
  for (const [i, phase] of args.phases.entries()) {
    await db.exec.query(
      `insert into steps(id, run_id, phase, ordinal, state) values ($1,$2,$3,$4,'completed')`,
      [`st_${args.runId}_${i}`, args.runId, phase, i + 1],
    );
  }
}

async function seedApproval(
  db: MirrorTestDb,
  args: { gateId: string; runId: string; action: string; byActor: string; at: string },
): Promise<void> {
  await db.exec.query(
    `insert into gates(id, run_id, kind, opened_at, on_expiry) values ($1,$2,'deliver',$3,'proceed_as_proposed')`,
    [args.gateId, args.runId, args.at],
  );
  // decisions.by_actor stores the GATE_RESOLUTION_BY enum verbatim (gate-resolution.ts writeDecision).
  await db.exec.query(
    `insert into decisions(gate_id, by_actor, action, at) values ($1,$2,$3,$4)`,
    [args.gateId, args.byActor, args.action, args.at],
  );
}

/** The AC2 fixture: 2 reviews + 1 revise + a human-revision draft head + decisions + phases. */
async function seedFixture() {
  const db = await createMirrorTestDb();
  const { workspaceId } = await seedBase(db.exec);
  const project = await seedMirrorProject(db.exec, new InMemoryContentStore(), workspaceId, {
    id: "proj_pv",
    personaId: "prs_pv",
    tag: "fixture",
  });
  await seedRunWithSteps(db, {
    runId: "run_r1", workspaceId, projectId: project.projectId, workflow: "review",
    createdAt: "2026-09-01T10:00:00Z", phases: ["intake", "letter"],
  });
  await seedRunWithSteps(db, {
    runId: "run_v1", workspaceId, projectId: project.projectId, workflow: "revise",
    createdAt: "2026-09-02T10:00:00Z", phases: ["triage", "draft"],
  });
  await seedRunWithSteps(db, {
    runId: "run_r2", workspaceId, projectId: project.projectId, workflow: "review",
    tier: "frontier", createdAt: "2026-09-03T10:00:00Z", phases: ["intake", "letter"],
  });
  // the human-revision head (§5.4): the working child of the frozen v1 base.
  await db.exec.query(
    `insert into drafts(id, project_id, n, origin, state, base_draft_id)
     values ('dft_hr', $1, 2, 'human_revision', 'working', $2)`,
    [project.projectId, project.draftId],
  );
  await seedApproval(db, {
    gateId: "gt_1", runId: "run_r1", action: "approve", byActor: "user", at: "2026-09-01T11:00:00Z",
  });
  await seedApproval(db, {
    gateId: "gt_2", runId: "run_r2", action: "edit", byActor: "user", at: "2026-09-03T11:00:00Z",
  });
  // a non-human resolution must NOT count as an author approval.
  await seedApproval(db, {
    gateId: "gt_3", runId: "run_r2", action: "proceed_as_proposed", byActor: "timeout",
    at: "2026-09-03T12:00:00Z",
  });
  return { db, workspaceId, project };
}

describe("collectStatementFacts — run rows only (AC2)", () => {
  it("lists exactly the seeded facts: 2 reviews + 1 revise + the human-revision version", async () => {
    const { db, project } = await seedFixture();
    const facts = await collectStatementFacts(db.exec, project.projectId);
    expect(facts).not.toBeNull();
    expect(facts!.runs.map((r) => r.workflow)).toEqual(["review", "revise", "review"]);
    expect(facts!.runs.map((r) => r.modelTier)).toEqual(["balanced", "balanced", "frontier"]);
    expect(facts!.phases).toEqual(["intake", "letter", "triage", "draft"]);
    expect(facts!.humanRevisionNs).toEqual([2]);
    expect(facts!.approvals.map((a) => a.action)).toEqual(["approve", "edit", "proceed_as_proposed"]);
    await db.close();
  });

  it("returns null for an unknown project", async () => {
    const { db } = await seedFixture();
    expect(await collectStatementFacts(db.exec, "proj_nope")).toBeNull();
    await db.close();
  });
});

describe("generatedSentences — the general template (REQ-VIS-10, REQ-POS-6)", () => {
  it("renders workflows, tiers, date span, phases, human approvals, and the human-revision version", async () => {
    const { db, project } = await seedFixture();
    const facts = (await collectStatementFacts(db.exec, project.projectId))!;
    const sentences = generatedSentences(facts, { openObligations: 0, blockingOpen: 0 });
    expect(sentences).toEqual([
      "This manuscript was prepared in Rhēma, an editorial-review environment that runs editorial workflows on the text.",
      // R7COPY.1a (REQ-COPY-1; R5 G6) — workflow/phase keys render their UI_LABELS names.
      "Rhēma ran 3 editorial workflows on the manuscript between 2026-09-01 and 2026-09-03: 2 Review, 1 Revise.",
      "The workflows used the Balanced and Frontier model tiers.",
      "Workflow phases on record: Intake, Letter, Triage, Draft.",
      "The author made 2 recorded decisions at the workflows' approval points (approve, edit).",
      "The author revised the manuscript directly, outside any workflow (version v2).",
    ]);
    // no obligation sentence when nothing is open.
    expect(sentences.join(" ")).not.toContain("obligation");
    await db.close();
  });

  it("adds the obligation-count sentence when obligations are open (AC3)", async () => {
    const { db, project } = await seedFixture();
    const facts = (await collectStatementFacts(db.exec, project.projectId))!;
    const sentences = generatedSentences(facts, { openObligations: 3, blockingOpen: 2 });
    expect(sentences.at(-1)).toBe(
      "At the time this statement was generated, 3 review obligations remained open, 2 of them blocking.",
    );
    await db.close();
  });

  it("essay renders the general template; the P1.21 protocols render their own (REQ-GENRE-5)", async () => {
    await import("./templates.js"); // the registration side-effect index.ts performs for callers
    expect(templateForProtocol(null)).toBe("general");
    expect(templateForProtocol("essay")).toBe("general");
    expect(templateForProtocol("academic")).toBe("icmje");
    expect(templateForProtocol("op-ed")).toBe("op-ed");
    expect(templateForProtocol("memo")).toBe("memo");
  });

  it("a registered protocol template selects + renders its own heading; others keep general", async () => {
    const { registerStatementTemplate, templateDef } = await import("./statement.js");
    registerStatementTemplate("proto-test", {
      key: "proto-disclosure",
      heading: "Disclosure statement",
    });
    expect(templateForProtocol("proto-test")).toBe("proto-disclosure");
    expect(templateForProtocol("essay")).toBe("general");
    expect(templateDef("proto-disclosure").heading).toBe("Disclosure statement");
    // an unregistered template key degrades to general rather than throwing (never a gate).
    expect(templateDef("ghost")).toBe(templateDef("general"));
  });
});

describe("append-only additions (REQ-VIS-10)", () => {
  it("additions persist across regeneration and render after the generated sentences", async () => {
    const { db, workspaceId, project } = await seedFixture();
    const deps = testDeps();
    await appendAddition(db.exec, deps, {
      workspaceId, projectId: project.projectId,
      sentence: "I rewrote the conclusion by hand.", byActor: USER,
    });
    // regenerate — the generated half is recomputed; the addition is re-read.
    const statement = (await loadStatement(db.exec, {
      projectId: project.projectId, openObligations: 0, blockingOpen: 0,
      now: new Date("2026-09-04T00:00:00Z"),
    }))!;
    expect(statement.template).toBe("general");
    expect(statement.generated).toHaveLength(6);
    expect(statement.additions.map((a) => a.sentence)).toEqual(["I rewrote the conclusion by hand."]);
    const md = statementMarkdown(statement, { standalone: true });
    expect(md).toContain("# AI-use statement");
    expect(md).toContain("The author adds: I rewrote the conclusion by hand.");
    expect(md).toContain("run record on 2026-09-04");
    // the attached section rides inside the manuscript with a level-2 heading.
    expect(attachmentSection(statement)).toContain("## AI-use statement");
    await db.close();
  });

  it("rejects an empty addition", async () => {
    const { db, workspaceId, project } = await seedFixture();
    await expect(
      appendAddition(db.exec, testDeps(), {
        workspaceId, projectId: project.projectId, sentence: "   ", byActor: USER,
      }),
    ).rejects.toBeInstanceOf(AdditionError);
    expect(await listAdditions(db.exec, project.projectId)).toEqual([]);
    await db.close();
  });
});
