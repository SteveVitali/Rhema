import { describe, it, expect } from "vitest";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import type { HarnessRunSpec } from "@rhema/orchestrator";
import type { PredicateFacts } from "@rhema/orchestrator";
import { emptyUsage } from "@rhema/engine";
import {
  runCommitLoop,
  type CommitCall,
  type FailCall,
  type HarnessApiClient,
  type HarvestCall,
  type PhaseRunOutputs,
  type WorkDeliveryContent,
} from "./harness-loop.js";
import type { DeliveryArgs } from "@rhema/mirror";

const review = WORKFLOW_MANIFESTS.review!;
const OF = review.phases.length; // 7
const byKey = (k: string): PhaseManifest => review.phases.find((p) => p.key === k)!;

/** A minimal but shape-valid run spec the loop consumes (it reads only request/stopAfterPhase/delivery). */
function makeSpec(phase: PhaseManifest, over: Partial<HarnessRunSpec> = {}): HarnessRunSpec {
  const base = {
    request: {
      runId: "run1",
      attempt: 1,
      cwd: "/work/project",
      phase,
      ordinal: phase.index,
      of: OF,
      skill: review.skill,
      inputs: {},
      seat: "editor" as const,
      maxBudgetUsd: 5,
      maxTurns: 40,
    },
    skillsDir: "/app/skills",
    manifest: { seat: "editor", entries: [] },
    serverFiles: {},
    hookPolicyInput: { seat: "editor", tools: [], urlPolicy: { blockedDomains: [], knownDomains: [] }, phase: { key: phase.key, phaseClass: phase.phaseClass, allowsSubagents: phase.allowsSubagents }, runId: "run1" },
    ...over,
  };
  return base as unknown as HarnessRunSpec;
}

/** A complete-phase outputs bundle (SDK success, phase-result done, facts satisfying the phase's predicates). */
function completeOutputs(facts: PredicateFacts, over: Partial<PhaseRunOutputs> = {}): PhaseRunOutputs {
  return { subtype: "success", usage: emptyUsage(), phaseResult: { status: "done" }, versions: [], facts, ...over };
}

const INTAKE_FACTS: PredicateFacts = { thesisPresent: true, inventoryPresent: true };
const NONEMPTY = (artifact: string): PredicateFacts => ({ nonempty: { [artifact]: true } });

interface Recorder {
  readonly commits: CommitCall[];
  readonly harvests: HarvestCall[];
  readonly fails: FailCall[];
  readonly delivers: DeliveryArgs[];
  finalizeCount: number;
  runPhaseGuidance: (string | undefined)[];
}

/** A scripted in-process api client + runPhase driver — the seams the pod loop calls. */
function makeHarness(specs: HarnessRunSpec[], outputsFor: (spec: HarnessRunSpec, guidance?: string) => PhaseRunOutputs) {
  const rec: Recorder = { commits: [], harvests: [], fails: [], delivers: [], finalizeCount: 0, runPhaseGuidance: [] };
  let specIdx = 0;
  let versionCounter = 0;

  const client: HarnessApiClient = {
    fetchRunSpec: () => Promise.resolve(specs[specIdx++]!),
    harvest: (args: HarvestCall) => {
      rec.harvests.push(args);
      const byPath: Record<string, string> = {};
      for (const v of args.versions) byPath[v.path] = `av_${++versionCounter}`;
      return Promise.resolve({ producedVersionIds: Object.values(byPath), byPath, provisionalCredits: 7 });
    },
    commit: (args: CommitCall) => {
      rec.commits.push(args);
      const state = args.next.kind === "gate" ? "waiting_gate" : args.next.kind === "finalize" ? "finalizing" : "running";
      return Promise.resolve({ ok: true, state });
    },
    failStep: (args: FailCall) => {
      rec.fails.push(args);
      return Promise.resolve();
    },
    deliver: (args: { delivery: DeliveryArgs }) => {
      rec.delivers.push(args.delivery);
      return Promise.resolve({ ok: true, state: "completed" });
    },
    finalize: () => {
      rec.finalizeCount++;
      return Promise.resolve({ ok: true, state: "completed" });
    },
  };

  const runPhase = (spec: HarnessRunSpec, opts: { guidance?: string }) => {
    rec.runPhaseGuidance.push(opts.guidance);
    return Promise.resolve(outputsFor(spec, opts.guidance));
  };

  return { rec, client, runPhase };
}

describe("runCommitLoop — the pod→server commit/deliver loop", () => {
  it("advances + commits each non-gate phase and delivers on the final phase", async () => {
    // three gate-free phases in sequence: craft → argument → letter (letter is the last, index OF-1).
    const letter = { ...byKey("letter"), index: OF - 1 };
    const specs = [makeSpec(byKey("craft")), makeSpec(byKey("argument")), makeSpec(letter, { delivery: DELIVERY_FACTS })];
    const dossier: WorkDeliveryContent = {
      deliveredPaths: ["correspondence/editors-letter.md"],
      sidecars: [{ filename: "findings.json", json: { sidecar: "findings", version: 1, findings: [] } }],
      coversAllObligations: true,
    };
    const { rec, client, runPhase } = makeHarness(specs, (spec) => {
      if (spec.request.phase.key === "letter") {
        return completeOutputs(
          { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
          { versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }], delivery: dossier },
        );
      }
      return completeOutputs(NONEMPTY(spec.request.phase.key === "craft" ? "04-craft-notes.md" : "03-argument-notes.md"));
    });

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(res).toEqual({ kind: "delivered", phasesCommitted: 3, state: "completed" });
    expect(rec.commits.map((c) => c.next.kind)).toEqual(["advance", "advance", "finalize"]);
    expect(rec.commits.map((c) => c.stepKey)).toEqual(["craft", "argument", "letter"]);
    expect(rec.delivers).toHaveLength(1);
    expect(rec.delivers[0]!.deliveredVersionIds.length).toBe(1);
    expect(rec.commits.every((c) => c.credits === 7)).toBe(true); // the provisional credits from harvest
  });

  it("opens the approve_scope gate after intake and exits (no delivery); a resume then delivers", async () => {
    // loop 1: the intake phase carries gateAfter=approve_scope → commit with next=gate, pod exits.
    const gate = makeHarness([makeSpec(byKey("intake"))], () => completeOutputs(INTAKE_FACTS));
    const res1 = await runCommitLoop({ client: gate.client, runPhase: gate.runPhase, workspaceId: "ws1" });
    expect(res1).toEqual({ kind: "gated", phasesCommitted: 1 });
    expect(gate.rec.commits).toHaveLength(1);
    expect(gate.rec.commits[0]!.next.kind).toBe("gate");
    expect(gate.rec.delivers).toHaveLength(0);
    expect(gate.rec.finalizeCount).toBe(0);

    // loop 2 (resume, a fresh pod): the next phases run to delivery.
    const letter = { ...byKey("letter"), index: OF - 1 };
    const resume = makeHarness([makeSpec(byKey("craft")), makeSpec(letter, { delivery: DELIVERY_FACTS })], (spec) =>
      spec.request.phase.key === "letter"
        ? completeOutputs(
            { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
            {
              versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }],
              delivery: { deliveredPaths: ["correspondence/editors-letter.md"], sidecars: [], coversAllObligations: true },
            },
          )
        : completeOutputs(NONEMPTY("04-craft-notes.md")),
    );
    const res2 = await runCommitLoop({ client: resume.client, runPhase: resume.runPhase, workspaceId: "ws1" });
    expect(res2.kind).toBe("delivered");
    expect(resume.rec.delivers).toHaveLength(1);
  });

  it("a pinned phase:N run commits exactly one phase then stops (no advance, no delivery)", async () => {
    const spec = makeSpec({ ...byKey("verification"), index: 2 }, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ claimRowCount: 3, inventoryCount: 2, sidecarValidates: { "01-claim-ledger.json": true } }),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res).toEqual({ kind: "stopped", phasesCommitted: 1 });
    expect(rec.commits).toHaveLength(1);
    expect(rec.commits[0]!.next.kind).toBe("finalize");
    expect(rec.finalizeCount).toBe(1);
    expect(rec.delivers).toHaveLength(0);
  });

  it("re-runs a phase ONCE with guidance on a re-runnable incomplete verdict, then commits", async () => {
    // attempt 1: the SDK succeeded but the declared artifact is missing (artifact_missing) → guided retry.
    // craft as the last phase so a single commit finalizes (bare, no dossier) rather than advancing off the end.
    let attempt = 0;
    const { rec, client, runPhase } = makeHarness([makeSpec({ ...byKey("craft"), index: OF - 1 })], () => {
      attempt++;
      return attempt === 1
        ? completeOutputs({ nonempty: { "04-craft-notes.md": false } }) //  fails the nonempty predicate
        : completeOutputs(NONEMPTY("04-craft-notes.md")); //                 passes on the guided re-run
    });
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(attempt).toBe(2); // ran exactly twice
    expect(rec.runPhaseGuidance[0]).toBeUndefined();
    expect(rec.runPhaseGuidance[1]).toMatch(/incomplete/i); // the second run carried guidance
    expect(rec.commits).toHaveLength(1); // committed after the successful re-run
    expect(res.kind).toBe("completed");
  });

  it("fails the step (and stops) when the phase stays incomplete after the guided retry", async () => {
    const { rec, client, runPhase } = makeHarness([makeSpec({ ...byKey("craft"), index: 5 })], () =>
      completeOutputs({ nonempty: { "04-craft-notes.md": false } }),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(rec.commits).toHaveLength(0);
    expect(rec.fails).toHaveLength(1);
    expect(rec.fails[0]!.errorClass).toBe("artifact_missing");
  });

  it("folds a captured agent error into the failStep reason (D-P0.15e-4 observability sink)", async () => {
    // the agent crashed: subtype error_during_execution (→ infra) + a captured error fact. The loop must fail
    // the step and surface the CLASS + message so it reaches run_events/steps without pod exec.
    const { rec, client, runPhase } = makeHarness([makeSpec({ ...byKey("craft"), index: 5 })], () => ({
      subtype: "error_during_execution",
      usage: emptyUsage(),
      phaseResult: null,
      versions: [],
      facts: {},
      agentError: { class: "TypeError", message: "query() is not a function" },
    }));
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(rec.commits).toHaveLength(0);
    expect(rec.fails).toHaveLength(1);
    expect(rec.fails[0]!.errorClass).toBe("infra");
    expect(rec.fails[0]!.reason).toContain("TypeError");
    expect(rec.fails[0]!.reason).toContain("query() is not a function");
    // no guided retry is worth it for an SDK crash (infra is re-runnable ONCE, so it ran twice) — but it still fails.
    if (res.kind === "failed") expect(res.reason).toContain("query() is not a function");
  });

  it("a phase incomplete WITHOUT an agent error keeps the plain oracle reason (no message appended)", async () => {
    const { rec, client, runPhase } = makeHarness([makeSpec({ ...byKey("craft"), index: 5 })], () =>
      completeOutputs({ nonempty: { "04-craft-notes.md": false } }),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(rec.fails[0]!.reason).not.toContain("agent error");
  });

  it("never sees the run token or any secret — the loop's inputs carry only server-authored data", async () => {
    const spec = makeSpec({ ...byKey("craft"), index: OF - 1 });
    const { client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
    // the run spec the loop consumes (from fetchRunSpec) must contain no credential material (REQ-SPEC-10/11).
    const serialized = JSON.stringify(spec).toLowerCase();
    expect(serialized).not.toContain("bearer");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
    expect(serialized).not.toContain("api_key");
    await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
  });
});

const DELIVERY_FACTS = {
  projectId: "prj1",
  draftId: "dft1",
  correspondenceKind: "review" as const,
  draftPromotedVersionId: "av_draft_head",
};
