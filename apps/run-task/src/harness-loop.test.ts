import { describe, it, expect, vi } from "vitest";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import { HEARTBEAT_INTERVAL_MS, type HarnessRunSpec } from "@rhema/orchestrator";
import type { PredicateFacts } from "@rhema/orchestrator";
import { emptyUsage } from "@rhema/engine";
import {
  runCommitLoop,
  type CheckpointCall,
  type CommitCall,
  type FailCall,
  type HarnessApiClient,
  type HarvestCall,
  type PhaseRunOutputs,
  type WorkDeliveryContent,
} from "./harness-loop.js";
import type { ResearchBudgetConsult } from "@rhema/orchestrator";
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
  /** RPT.1 — the per-phase begin calls (step key + ordinal) in call order. */
  readonly begins: { stepKey: string; ordinal: number; of: number }[];
  /** the interleaved call order across seams ("begin:<key>" / "runPhase:<key>") — ordering assertions. */
  readonly calls: string[];
  finalizeCount: number;
  runPhaseGuidance: (string | undefined)[];
  /** CITE.1 — the full runPhase opts (guidance + phaseClass) per call, in order. */
  runPhaseOpts: { guidance?: string; phaseClass?: string }[];
}

/** A scripted in-process api client + runPhase driver — the seams the pod loop calls. */
function makeHarness(specs: HarnessRunSpec[], outputsFor: (spec: HarnessRunSpec, guidance?: string) => PhaseRunOutputs) {
  const rec: Recorder = { commits: [], harvests: [], fails: [], delivers: [], begins: [], calls: [], finalizeCount: 0, runPhaseGuidance: [], runPhaseOpts: [] };
  let specIdx = 0;
  let versionCounter = 0;

  const client: HarnessApiClient = {
    fetchRunSpec: () => Promise.resolve(specs[specIdx++]!),
    // RPT.1 — the phase's real start fact (the server's beginStep stamps steps.started_at).
    beginStep: (args) => {
      rec.begins.push(args);
      rec.calls.push(`begin:${args.stepKey}`);
      return Promise.resolve({ ok: true });
    },
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
      return Promise.resolve({ ok: true as const });
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

  const runPhase = (spec: HarnessRunSpec, opts: { guidance?: string; phaseClass?: string }) => {
    rec.runPhaseGuidance.push(opts.guidance);
    rec.runPhaseOpts.push({ ...(opts.guidance !== undefined ? { guidance: opts.guidance } : {}), ...(opts.phaseClass !== undefined ? { phaseClass: opts.phaseClass } : {}) });
    rec.calls.push(`runPhase:${spec.request.phase.key}`);
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

  it("RPT.1 — begins each phase before its runPhase call and commits the measured durationMs", async () => {
    const letter = { ...byKey("letter"), index: OF - 1 };
    const specs = [makeSpec(byKey("craft")), makeSpec(letter, { delivery: DELIVERY_FACTS })];
    const dossier: WorkDeliveryContent = {
      deliveredPaths: ["correspondence/editors-letter.md"],
      sidecars: [],
      coversAllObligations: true,
    };
    const { rec, client, runPhase } = makeHarness(specs, (spec) =>
      spec.request.phase.key === "letter"
        ? completeOutputs(
            { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
            { versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }], delivery: dossier },
          )
        : completeOutputs(NONEMPTY("04-craft-notes.md")),
    );
    let t = 1_000;
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1", now: () => new Date((t += 5_000)) });
    expect(res.kind).toBe("delivered");
    // begin lands BEFORE the phase's model traffic for every phase (the card's live phase flip).
    expect(rec.begins.map((b) => b.stepKey)).toEqual(["craft", "letter"]);
    expect(rec.calls).toEqual(["begin:craft", "runPhase:craft", "begin:letter", "runPhase:letter"]);
    // the commit carries the pod-measured span (the server prefers its own begin row when present).
    expect(rec.commits.every((c) => typeof c.durationMs === "number" && c.durationMs >= 0)).toBe(true);
  });

  it("RPT.1 — a beginStep-less client still commits (the seam is optional for old wiring)", async () => {
    const spec = makeSpec({ ...byKey("verification"), index: 2 }, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ claimRowCount: 3, inventoryCount: 2, unclosedClaimOrdinals: [], sidecarValidates: { "01-claim-ledger.json": true } }),
    );
    delete client.beginStep; // a client that predates the seam
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res).toEqual({ kind: "stopped", phasesCommitted: 1 });
    expect(rec.begins).toHaveLength(0);
    expect(typeof rec.commits[0]!.durationMs).toBe("number");
  });

  it("opens a BLOCKING approve_scope gate after intake and exits (no delivery); a resume then delivers", async () => {
    // loop 1: the intake phase carries gateAfter=approve_scope; under Wait-for-me-each the gate is
    // blocking (RUN.1) → commit with next=gate{blocking:true}, the run parks, the pod exits.
    const waits = () => ({ policy: "wait_each" as const, now: new Date() });
    const gate = makeHarness([makeSpec(byKey("intake"))], () => completeOutputs(INTAKE_FACTS));
    const res1 = await runCommitLoop({ client: gate.client, runPhase: gate.runPhase, workspaceId: "ws1", gateContext: waits });
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

  it("RUN.1 — an INFORMATIONAL approve_scope gate records the card and the pod keeps moving", async () => {
    // the default `named` policy resolves approve_scope informational (blocking:false, then:advance):
    // the commit opens the gate card server-side but the same pod takes the advance leg — no exit.
    const letter = { ...byKey("letter"), index: OF - 1 };
    const { rec, client, runPhase } = makeHarness(
      [makeSpec(byKey("intake")), makeSpec(letter, { delivery: DELIVERY_FACTS })],
      (spec) =>
        spec.request.phase.key === "letter"
          ? completeOutputs(
              { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
              {
                versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }],
                delivery: { deliveredPaths: ["correspondence/editors-letter.md"], sidecars: [], coversAllObligations: true },
              },
            )
          : completeOutputs(INTAKE_FACTS),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("delivered");
    const gateCommit = rec.commits.find((c) => c.next.kind === "gate");
    expect(gateCommit?.next).toMatchObject({ kind: "gate", gateKind: "approve_scope", blocking: false, then: "advance" });
    expect(rec.calls).toEqual(["begin:intake", "runPhase:intake", "begin:letter", "runPhase:letter"]);
  });

  it("a pinned phase:N run commits exactly one phase then stops (no advance, no delivery)", async () => {
    const spec = makeSpec({ ...byKey("verification"), index: 2 }, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ claimRowCount: 3, inventoryCount: 2, unclosedClaimOrdinals: [], sidecarValidates: { "01-claim-ledger.json": true } }),
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

  it("enriches the failStep reason with the SDK subtype, failed leg, and the missing artifact (residue 1 observability)", async () => {
    // the live craft case: the agent exited clean (SDK success, phase-result done) but wrote no
    // `04-craft-notes.md`, so leg (c) fails. The reason reaching run_events must name WHICH artifact was
    // missing (not just "1 completion predicate(s) failed"), so the non-committing phase is diagnosable.
    const { rec, client, runPhase } = makeHarness([makeSpec({ ...byKey("craft"), index: 5 })], () =>
      completeOutputs({ nonempty: { "04-craft-notes.md": false } }),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    const reason = rec.fails[0]!.reason!;
    expect(reason).toContain("sdk=success"); // the SDK result subtype
    expect(reason).toContain("leg=predicate"); // the failed oracle leg
    expect(reason).toContain("artifact_nonempty:04-craft-notes.md"); // the exact missing artifact
    expect(reason).toContain("(nonempty)"); // the evaluator detail
  });

  it("posts failStep on a NON-stale commit rejection so the failure leaves a DB trace (PRB.16b F17)", async () => {
    // the live 01M2SH38 case: a complete verdict whose commit rolled back server-side (a `gates_step_id_fkey`
    // violation) previously exited the pod with NO step row and NO engine.error — the run just orphaned onto
    // `resume_partial`. The loop must failStep the rejection reason instead (stale_task excepted — that
    // attempt no longer owns the write).
    const spec = makeSpec({ ...byKey("craft"), index: 5 });
    const { rec, client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
    client.commit = () => Promise.resolve({ ok: false, code: "conflict" });
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(rec.fails).toHaveLength(1);
    expect(rec.fails[0]!.errorClass).toBe("infra");
    expect(rec.fails[0]!.reason).toContain("commit rejected: conflict");
  });

  it("does NOT failStep on a stale_task commit rejection — the live attempt owns the write", async () => {
    const spec = makeSpec({ ...byKey("craft"), index: 5 });
    const { rec, client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
    client.commit = () => Promise.resolve({ ok: false, code: "stale_task" });
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(rec.fails).toHaveLength(0);
  });

  it("keeps beating every HEARTBEAT_INTERVAL_MS while a phase runs, so a minutes-long phase is never reaped as stale", async () => {
    // PRB.16 prod finding: a pod that beat only once at start was orphaned mid-phase (stale > 3 min), the
    // run re-queued, and the live pod's commits were then fenced as stale_task — a crash loop. The loop
    // must beat on an interval through the whole commit/deliver loop.
    vi.useFakeTimers();
    try {
      let beats = 0;
      let resolvePhase: ((o: PhaseRunOutputs) => void) | undefined;
      const spec = makeSpec({ ...byKey("craft"), index: OF - 1 });
      const { client } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
      client.heartbeat = () => {
        beats++;
        return Promise.resolve({ ok: true });
      };
      const runPhase = () =>
        new Promise<PhaseRunOutputs>((r) => {
          resolvePhase = r;
        });
      const loop = runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      // phase still running well past the stale threshold: the beats must keep landing.
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 10);
      expect(beats).toBeGreaterThanOrEqual(1 + 10); // first beat + 10 interval beats
      resolvePhase!(completeOutputs(NONEMPTY("04-craft-notes.md")));
      const res = await loop;
      expect(res.kind).toBe("completed"); // single pinned-phase? no — last phase (index OF-1) → finalize
      // the interval must stop with the loop (no dangling timer)
      const beatsAtEnd = beats;
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 3);
      expect(beats).toBe(beatsAtEnd);
    } finally {
      vi.useRealTimers();
    }
  });

  it("exits between phases when a heartbeat reports cancelRequested (Stop reaches the task)", async () => {
    vi.useFakeTimers();
    try {
      let beats = 0;
      const spec = makeSpec({ ...byKey("craft"), index: 5 }); // non-final phase → loop iterates after commit
      const { client } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
      client.heartbeat = () => {
        beats++;
        return Promise.resolve({ ok: true, cancelRequested: beats > 1 });
      };
      let resolvePhase: ((o: PhaseRunOutputs) => void) | undefined;
      const runPhase = () =>
        new Promise<PhaseRunOutputs>((r) => {
          resolvePhase = r;
        });
      const loop = runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      await vi.advanceTimersByTimeAsync(HEARTBEAT_INTERVAL_MS * 2); // a beat reports the cancel flag
      resolvePhase!(completeOutputs(NONEMPTY("04-craft-notes.md")));
      const res = await loop;
      // the phase's commit may land, but the next iteration sees the flag and the pod exits
      expect(res.kind).toBe("failed");
      expect(res.kind === "failed" ? res.reason : "").toContain("cancel");
    } finally {
      vi.useRealTimers();
    }
  });

  it("binds the produced gateArtifact version onto the gate decision (PRB.16b F19)", async () => {
    // The live 01M2T29P… gap: revise triage opened `approve_triage` with artifact_version_id NULL —
    // `decideCommitNext` never carried a version — so the card's merged ledger and the write-back
    // overlay (loadLedgerEntries → serializeGateOverlay) were dead code. The phase declares
    // `gateArtifact`; the loop must look the produced version up in the harvest's byPath map.
    const triage = WORKFLOW_MANIFESTS.revise!.phases.find((p) => p.key === "triage")!;
    const spec = makeSpec(triage);
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs(
        { responseLedgerRowPerFinding: true, sidecarValidates: { "response-ledger.json": true } },
        {
          versions: [
            {
              path: "agents/author/ledgers/v1-response-ledger.md",
              root: "project",
              kind: "response_ledger",
              namespace: "author",
              sha256: "s",
              bytes: Buffer.from("# ledger"),
              wordCount: 2,
            },
          ],
        },
      ),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("gated");
    expect(rec.commits).toHaveLength(1);
    const next = rec.commits[0]!.next;
    expect(next.kind).toBe("gate");
    // the produced md's version id (the mock harvest mints `av_1`) rides the gate into gates.artifact_version_id.
    expect(next.artifactVersionId).toBe("av_1");
  });

  it("a gate WITHOUT a produced gateArtifact still opens — with no artifact binding (F19 fallback)", async () => {
    const triage = WORKFLOW_MANIFESTS.revise!.phases.find((p) => p.key === "triage")!;
    const { rec, client, runPhase } = makeHarness([makeSpec(triage)], () =>
      completeOutputs({ responseLedgerRowPerFinding: true, sidecarValidates: { "response-ledger.json": true } }),
    );
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("gated");
    expect(rec.commits[0]!.next.artifactVersionId).toBeUndefined();
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

  // RES.1 (REQ-SPEC-31(3)) — the research preflight: prove every server-authored model × server-tool
  // pair through the run's own proxy BEFORE the first phase's model traffic. A refused pair (the
  // 2026-09-30 incident's failure class) terminalizes the run instead of charging an Unverifiable run.
  describe("the research preflight (RES.1)", () => {
    const PAIRS = {
      models: ["m1", "m2"],
      tools: ["web_search" as const],
      toolTypes: { web_search: "web_search_20250305", web_fetch: "web_fetch_20250910" },
      pairs: [
        { model: "m1", tool: "web_search" as const },
        { model: "m2", tool: "web_search" as const },
      ],
    };

    it("a passing preflight runs once, then every phase in the pod rides the proven pairs", async () => {
      let probes = 0;
      const letter = { ...byKey("letter"), index: OF - 1 };
      const specs = [
        makeSpec(byKey("craft"), { researchPreflight: PAIRS }),
        makeSpec(letter, { researchPreflight: PAIRS, delivery: DELIVERY_FACTS }),
      ];
      const dossier: WorkDeliveryContent = {
        deliveredPaths: ["correspondence/editors-letter.md"],
        sidecars: [{ filename: "findings.json", json: { sidecar: "findings", version: 1, findings: [] } }],
        coversAllObligations: true,
      };
      const { rec, client, runPhase } = makeHarness(specs, (spec) =>
        spec.request.phase.key === "letter"
          ? completeOutputs(
              { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
              {
                versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }],
                delivery: dossier,
              },
            )
          : completeOutputs(NONEMPTY("04-craft-notes.md")),
      );
      const res = await runCommitLoop({
        client,
        runPhase,
        workspaceId: "ws1",
        preflight: () => {
          probes++;
          return Promise.resolve({ ok: true });
        },
      });
      expect(res.kind).toBe("delivered");
      expect(probes).toBe(1); // once per pod, not once per phase
      expect(rec.fails).toHaveLength(0);
    });

    it("a refused pair terminalizes the run via failStep BEFORE any phase runs", async () => {
      const spec = makeSpec(byKey("craft"), { researchPreflight: PAIRS });
      const { rec, client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("x.md")));
      let phasesRun = 0;
      const res = await runCommitLoop({
        client,
        runPhase: (s, o) => {
          phasesRun++;
          return runPhase(s, o);
        },
        workspaceId: "ws1",
        preflight: () =>
          Promise.resolve({
            ok: false as const,
            failures: [{ model: "m2", tool: "web_search", status: 400, reason: "invalid_request_error" }],
          }),
      });
      expect(res).toEqual({
        kind: "failed",
        phasesCommitted: 0,
        errorClass: "research_preflight_failed",
        reason: expect.stringContaining("m2×web_search HTTP 400"),
      });
      expect(phasesRun).toBe(0); // no paid model traffic before the guard
      expect(rec.fails).toHaveLength(1);
      expect(rec.fails[0]!.errorClass).toBe("research_preflight_failed");
      expect(rec.fails[0]!.reason).toContain("invalid_request_error");
    });

    it("a spec demanding preflight with an UNBOUND seam fails closed — never a silent skip", async () => {
      const spec = makeSpec(byKey("craft"), { researchPreflight: PAIRS });
      const { rec, client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("x.md")));
      const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" }); // no preflight dep
      expect(res.kind).toBe("failed");
      expect(rec.fails[0]!.errorClass).toBe("research_preflight_failed");
      expect(rec.fails[0]!.reason).toContain("unbound");
    });

    it("a RESUME re-preflights — each pod start is a fresh loop and a fresh probe", async () => {
      let probes = 0;
      const preflight = () => {
        probes++;
        return Promise.resolve({ ok: true as const });
      };
      // pod 1: a BLOCKING gate phase commits and the pod exits; pod 2 (the resume) probes again.
      const waits = () => ({ policy: "wait_each" as const, now: new Date() });
      const gate = makeHarness([makeSpec(byKey("intake"), { researchPreflight: PAIRS })], () => completeOutputs(INTAKE_FACTS));
      const res1 = await runCommitLoop({ client: gate.client, runPhase: gate.runPhase, workspaceId: "ws1", preflight, gateContext: waits });
      expect(res1.kind).toBe("gated");
      const letter = { ...byKey("letter"), index: OF - 1 };
      const resume = makeHarness(
        [makeSpec(letter, { researchPreflight: PAIRS, delivery: DELIVERY_FACTS })],
        () =>
          completeOutputs(
            { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
            {
              versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }],
              delivery: { deliveredPaths: ["correspondence/editors-letter.md"], sidecars: [], coversAllObligations: true },
            },
          ),
      );
      const res2 = await runCommitLoop({ client: resume.client, runPhase: resume.runPhase, workspaceId: "ws1", preflight });
      expect(res2.kind).toBe("delivered");
      expect(probes).toBe(2); // one per pod lifetime
    });

    it("a spec with NO researchPreflight never invokes the seam (legacy probes unchanged)", async () => {
      const spec = makeSpec({ ...byKey("craft"), index: OF - 1 });
      const { client, runPhase } = makeHarness([spec], () => completeOutputs(NONEMPTY("04-craft-notes.md")));
      let probes = 0;
      const res = await runCommitLoop({
        client,
        runPhase,
        workspaceId: "ws1",
        preflight: () => {
          probes++;
          return Promise.resolve({ ok: true });
        },
      });
      expect(res.kind).toBe("completed");
      expect(probes).toBe(0);
    });
  });

  // ---- CITE.1 (ADR-085) — mechanism A: the pre-delivery cited⇒retrieved check + bounded re-entry ----
  describe("CITE.1 — the pre-delivery citation backfill (mechanism A)", () => {
    const letter = { ...byKey("letter"), index: OF - 1 };
    const dossierWith = (claims: { url?: string; sources?: { url: string }[] }[]): WorkDeliveryContent => ({
      deliveredPaths: ["correspondence/editors-letter.md"],
      sidecars: [],
      coversAllObligations: true,
      claimLedger: {
        sidecar: "claim_ledger",
        version: 1,
        claims: claims.map((c, i) => ({ ordinal: i + 1, text: `c${i + 1}`, tier: 2, verdict: "verified", ...c, humanAdded: false })),
      } as WorkDeliveryContent["claimLedger"],
    });
    const letterOutputs = (dossier: WorkDeliveryContent): PhaseRunOutputs =>
      completeOutputs(
        { letterSectionsComplete: true, rubricDimensionCount: 8, sidecarValidates: { "findings.json": true, "rubric.json": true } },
        {
          versions: [{ path: "correspondence/editors-letter.md", root: "project", kind: "letter", namespace: "editor", sha256: "s", bytes: Buffer.from("L"), wordCount: 1 }],
          delivery: dossier,
        },
      );

    it("re-enters the final phase stamped 'backfill' with the missed urls, then delivers", async () => {
      // the ledger cites two urls; the retrieved set covers only one → one backfill re-entry.
      const { rec, client, runPhase } = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () =>
        letterOutputs(dossierWith([{ url: "https://a.example/got" }, { url: "https://b.example/missed" }])),
      );
      client.retrievedUrls = () =>
        Promise.resolve({ ok: true, urls: ["https://a.example/got"] });
      const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      expect(res.kind).toBe("delivered");
      // the committed run + ONE backfill re-entry — the SAME spec re-run, stamped backfill, guidance
      // naming the missed url; its outputs are discarded (the delivered dossier is the committed one).
      expect(rec.runPhaseOpts).toHaveLength(2);
      expect(rec.runPhaseOpts[0]).toEqual({});
      expect(rec.runPhaseOpts[1]?.phaseClass).toBe("backfill");
      expect(rec.runPhaseOpts[1]?.guidance).toContain("https://b.example/missed");
      expect(rec.runPhaseOpts[1]?.guidance).not.toContain("https://a.example/got");
      expect(rec.delivers).toHaveLength(1);
    });

    it("skips the re-entry entirely when every cited url is already retrieved", async () => {
      const { rec, client, runPhase } = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () =>
        letterOutputs(dossierWith([{ url: "https://a.example/got" }])),
      );
      client.retrievedUrls = () => Promise.resolve({ ok: true, urls: ["https://a.example/got", "https://x.example/other"] });
      const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      expect(res.kind).toBe("delivered");
      expect(rec.runPhaseOpts).toHaveLength(1); // no re-entry — a miss-free ledger costs nothing
    });

    it("skips the re-entry when the retrieved-urls seam is unbound or fails (Path B fallback — never a regression)", async () => {
      // unbound seam.
      const noSeam = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () =>
        letterOutputs(dossierWith([{ url: "https://b.example/missed" }])),
      );
      const res1 = await runCommitLoop({ client: noSeam.client, runPhase: noSeam.runPhase, workspaceId: "ws1" });
      expect(res1.kind).toBe("delivered");
      expect(noSeam.rec.runPhaseOpts).toHaveLength(1);

      // a failing route degrades the same way — delivery proceeds to the strip.
      const failing = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () =>
        letterOutputs(dossierWith([{ url: "https://b.example/missed" }])),
      );
      failing.client.retrievedUrls = () => Promise.resolve({ ok: false, urls: [] });
      const res2 = await runCommitLoop({ client: failing.client, runPhase: failing.runPhase, workspaceId: "ws1" });
      expect(res2.kind).toBe("delivered");
      expect(failing.rec.runPhaseOpts).toHaveLength(1);
    });

    it("a crashed re-entry still delivers (best-effort — the strip stays the residual)", async () => {
      let calls = 0;
      const { rec, client, runPhase } = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () => {
        calls += 1;
        if (calls === 2) throw new Error("backfill phase crashed");
        return letterOutputs(dossierWith([{ url: "https://b.example/missed" }]));
      });
      client.retrievedUrls = () => Promise.resolve({ ok: true, urls: [] });
      const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      expect(res.kind).toBe("delivered");
      expect(rec.delivers).toHaveLength(1);
    });

    it("a cited url variant the canonical set covers is NOT a miss (guard-identity parity)", async () => {
      // cited carries the query; the stored retrieved row drops it on canonical read.
      const { rec, client, runPhase } = makeHarness([makeSpec(letter, { delivery: DELIVERY_FACTS })], () =>
        letterOutputs(dossierWith([{ url: "https://a.example/p?id=7" }])),
      );
      client.retrievedUrls = () => Promise.resolve({ ok: true, urls: ["https://a.example/p"] });
      const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
      expect(res.kind).toBe("delivered");
      expect(rec.runPhaseOpts).toHaveLength(1); // canonical parity — no false-positive re-entry
    });
  });
});

const DELIVERY_FACTS = {
  projectId: "prj1",
  draftId: "dft1",
  correspondenceKind: "review" as const,
  draftPromotedVersionId: "av_draft_head",
};

// RES.3 (REQ-ENG-3) — the verification checkpoint + budget-aware retry gate. The live sequence
// (run 01M48VNKY6F263TCQRVBJ8JRQA / D-RES.3-1): a research exec consumed 12 searches + 12 fetches
// and wrote ZERO files; the guided retry and two stranded re-drives re-ran verification with fresh
// sessions against the SAME claim-scaled bound until it hit exactly 17/48 — only the last tool-less
// exec wrote the honest 9/9-unverifiable ledger. These tests pin the fix: produced work checkpoints
// durably, every re-execution consults the bound first, and a dead bound resolves honestly —
// checkpoint-commit when the checkpointed artifacts satisfy the phase contract, else the terminal
// `research_budget_exhausted` — never a silent re-drain.
describe("RES.3 — research-phase checkpointing + the budget retry gate", () => {
  const verification = { ...byKey("verification"), index: 2 };
  const CKPT_PATH = "agents/editor/correspondence/v1-review/01-claim-ledger.md";
  const ckptVersion = {
    path: CKPT_PATH,
    root: "project" as const,
    kind: "claim_ledger",
    namespace: "agent:editor",
    sha256: "s_ck",
    bytes: Buffer.from("# ledger\n"),
    wordCount: 2,
  };
  const DEAD: ResearchBudgetConsult = {
    searchesUsed: 17, fetchesUsed: 48, searchBudget: 17, fetchBudget: 48,
    searchesRemaining: 0, fetchesRemaining: 0, exhausted: true,
  };
  const ALIVE: ResearchBudgetConsult = {
    searchesUsed: 12, fetchesUsed: 12, searchBudget: 17, fetchBudget: 48,
    searchesRemaining: 5, fetchesRemaining: 36, exhausted: false,
  };
  /** facts that satisfy verification's coverage + closure + sidecar_validates predicates. */
  const PASSING_FACTS: PredicateFacts = {
    claimRowCount: 9,
    inventoryCount: 9,
    unclosedClaimOrdinals: [],
    sidecarValidates: { "01-claim-ledger.json": true },
  };

  it("the D-RES.3-1 drain sequence — a dead bound refuses the guided retry (NO second runPhase)", async () => {
    // exec 1: researched (the proxy now reads 17/48) but the verdict is artifact_missing — the
    // pre-RES.3 loop would have re-run the phase whole. Now: checkpoint → consult → gate.
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ claimRowCount: 0, inventoryCount: 9 }, { versions: [ckptVersion] }),
    );
    const checkpoints: CheckpointCall[] = [];
    client.checkpoint = (args) => {
      checkpoints.push(args);
      return Promise.resolve({ producedVersionIds: ["av_ck1"], byPath: { [CKPT_PATH]: "av_ck1" } });
    };
    client.researchBudget = () => Promise.resolve(DEAD);
    // the checkpointed ledger is still under inventory — the contract is NOT satisfied → terminal.
    const inspectWork = () =>
      Promise.resolve(completeOutputs({ claimRowCount: 4, inventoryCount: 9, unclosedClaimOrdinals: [], sidecarValidates: { "01-claim-ledger.json": true } }));

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1", inspectWork });

    expect(res).toMatchObject({ kind: "failed", errorClass: "research_budget_exhausted" });
    expect(checkpoints).toHaveLength(1); // the exec's produced work persisted BEFORE the retry decision
    expect(checkpoints[0]!.versions).toHaveLength(1);
    // THE drain killer: exactly ONE exec — the guided retry never spawned.
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(1);
    expect(rec.fails).toHaveLength(1);
    expect(rec.fails[0]!.errorClass).toBe("research_budget_exhausted");
    expect(rec.fails[0]!.reason).toContain("17/17 searches");
    expect(rec.commits).toHaveLength(0);
  });

  it("stranded re-drive (gate 1) — a spec-stamped dead bound never spawns an exec; the checkpoint commits", async () => {
    // A fresh pod on a run whose bound is already dead: the consult rides the spec; the remounted
    // checkpoint satisfies the phase contract → the step COMMITS (the REQ-SPEC-31 Unverified path —
    // a dead-boundary fact_check rides this into delivery; review commits + advances).
    const spec = makeSpec(verification, {
      stopAfterPhase: true,
      researchBudget: DEAD,
      checkpoint: { producedVersionIds: ["av_ck1"], byPath: { [CKPT_PATH]: "av_ck1" } },
    });
    const { rec, client, runPhase } = makeHarness([spec], () => {
      throw new Error("runPhase must never run on a dead bound");
    });
    const inspectWork = () => Promise.resolve(completeOutputs(PASSING_FACTS));

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1", inspectWork });

    expect(res).toEqual({ kind: "stopped", phasesCommitted: 1 });
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(0);
    expect(rec.commits).toHaveLength(1);
    expect(rec.commits[0]!.result.sdkSubtype).toBe("research_budget_exhausted"); // honest marker
    expect(rec.commits[0]!.producedVersionIds).toEqual(["av_ck1"]);
  });

  it("gate 1 terminal — a dead bound with NO usable checkpoint fails honestly (never re-executes)", async () => {
    const spec = makeSpec(verification, { stopAfterPhase: true, researchBudget: DEAD });
    const { rec, client, runPhase } = makeHarness([spec], () => {
      throw new Error("runPhase must never run on a dead bound");
    });
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res).toMatchObject({ kind: "failed", errorClass: "research_budget_exhausted" });
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(0);
    expect(rec.fails[0]!.errorClass).toBe("research_budget_exhausted");
  });

  it("gate 2 checkpoint-commit — the exec's own checkpointed work satisfies the contract", async () => {
    // exec 1 wrote the full ledger (all 9/9 rows) but the oracle still reports artifact_missing
    // (e.g. a sidecar path quirk) while the bound is now dead: checkpoint → consult → the SAME
    // artifacts satisfy the predicates on inspect → honest commit instead of a re-drain.
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ nonempty: { "01-claim-ledger.md": false } }, { versions: [ckptVersion] }),
    );
    client.checkpoint = () =>
      Promise.resolve({ producedVersionIds: ["av_ck1"], byPath: { [CKPT_PATH]: "av_ck1" } });
    client.researchBudget = () => Promise.resolve(DEAD);
    const inspectWork = () => Promise.resolve(completeOutputs(PASSING_FACTS));

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1", inspectWork });

    expect(res).toEqual({ kind: "stopped", phasesCommitted: 1 });
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(1); // exec 1 only
    expect(rec.commits[0]!.result.sdkSubtype).toBe("research_budget_exhausted");
    expect(rec.commits[0]!.producedVersionIds).toEqual(["av_ck1"]);
    expect(rec.fails).toHaveLength(0);
  });

  it("a live bound still permits the guided retry (regression: the gate only fires on dead)", async () => {
    let attempt = 0;
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () => {
      attempt++;
      return attempt === 1
        ? completeOutputs({ nonempty: { "01-claim-ledger.md": false } }, { versions: [ckptVersion] })
        : completeOutputs(PASSING_FACTS);
    });
    const checkpoints: CheckpointCall[] = [];
    client.checkpoint = (args) => {
      checkpoints.push(args);
      return Promise.resolve({ producedVersionIds: ["av_ck1"], byPath: { [CKPT_PATH]: "av_ck1" } });
    };
    client.researchBudget = () => Promise.resolve(ALIVE);

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(attempt).toBe(2);
    expect(res.kind).toBe("stopped");
    expect(checkpoints).toHaveLength(1);
    expect(rec.runPhaseGuidance[1]).toMatch(/incomplete/i);
    // the committed produced set is the UNION (checkpoint ids + the retry's harvested ids).
    expect(rec.commits[0]!.producedVersionIds).toEqual(expect.arrayContaining(["av_ck1"]));
  });

  it("a live retry that also fails checkpoints its produced work too (the resume point survives)", async () => {
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ nonempty: { "01-claim-ledger.md": false } }, { versions: [ckptVersion] }),
    );
    const checkpoints: CheckpointCall[] = [];
    client.checkpoint = (args) => {
      checkpoints.push(args);
      return Promise.resolve({ producedVersionIds: [`av_ck${checkpoints.length}`], byPath: {} });
    };
    client.researchBudget = () => Promise.resolve(ALIVE);

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(res.kind).toBe("failed");
    expect(checkpoints).toHaveLength(2); // exec 1's checkpoint + the retry's checkpoint
    expect(rec.fails[0]!.errorClass).toBe("artifact_missing");
  });

  it("a non-research phase never checkpoints (the gate is research-scoped)", async () => {
    const spec = makeSpec({ ...byKey("craft"), index: 5 });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs({ nonempty: { "04-craft-notes.md": false } }, { versions: [ckptVersion] }),
    );
    const checkpoints: CheckpointCall[] = [];
    client.checkpoint = (args) => {
      checkpoints.push(args);
      return Promise.resolve({ producedVersionIds: [], byPath: {} });
    };
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res.kind).toBe("failed");
    expect(checkpoints).toHaveLength(0);
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(2); // old retry path intact
  });

  it("an UNBOUND consult seam falls back to the spec-stamped figure — never an unbounded retry", async () => {
    // researchBudget() route down (null) but the spec says dead → the gate still fires.
    const spec = makeSpec(verification, { stopAfterPhase: true, researchBudget: DEAD });
    const { rec, client, runPhase } = makeHarness([spec], () => {
      throw new Error("runPhase must never run on a dead bound");
    });
    client.researchBudget = () => Promise.resolve(null);
    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });
    expect(res).toMatchObject({ kind: "failed", errorClass: "research_budget_exhausted" });
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(0);
  });
});

// F-R6CNT.3-1 / R6FIX.4 — the $10.68 Showcase defect: verification marked `done` on a schema-valid
// but UNCLOSED claim ledger (14 bare-`unverifiable` placeholder rows, 0 sources, research still in
// flight). The gate must refuse the phase transition — never commit it.
describe("F-R6CNT.3-1 — an unclosed claim ledger cannot go `done`", () => {
  const verification = { ...byKey("verification"), index: 2 };
  // the R6CNT.3 placeholder shape: coverage "satisfied" + schema valid, but every row is unchecked.
  const PLACEHOLDER_FACTS: PredicateFacts = {
    claimRowCount: 14,
    inventoryCount: 14,
    unclosedClaimOrdinals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    sidecarValidates: { "01-claim-ledger.json": true },
  };

  it("a placeholder ledger is refused: guided retry names claim_ledger_closed, then fails honestly", async () => {
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () => completeOutputs(PLACEHOLDER_FACTS));
    client.researchBudget = () =>
      Promise.resolve({
        searchesUsed: 4, fetchesUsed: 4, searchBudget: 17, fetchBudget: 48,
        searchesRemaining: 13, fetchesRemaining: 44, exhausted: false,
      });

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(res).toMatchObject({ kind: "failed", errorClass: "artifact_missing" });
    // two execs ran (the attempt + its ONE guided retry) — the retry carried the closure failure.
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(2);
    expect(rec.runPhaseGuidance[1]).toMatch(/claim_ledger_closed|unchecked/i);
    // the phase NEVER committed — no `done` step, no finalize.
    expect(rec.commits).toHaveLength(0);
    expect(rec.fails).toHaveLength(1);
  });

  it("a retry that closes the ledger commits (a justified unverifiable disposition is not unclosed)", async () => {
    let attempt = 0;
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () => {
      attempt++;
      return attempt === 1
        ? completeOutputs(PLACEHOLDER_FACTS)
        : completeOutputs({ ...PLACEHOLDER_FACTS, unclosedClaimOrdinals: [] }); // justified + evidenced
    });
    client.researchBudget = () =>
      Promise.resolve({
        searchesUsed: 4, fetchesUsed: 4, searchBudget: 17, fetchBudget: 48,
        searchesRemaining: 13, fetchesRemaining: 44, exhausted: false,
      });

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(attempt).toBe(2);
    expect(res).toEqual({ kind: "stopped", phasesCommitted: 1 });
    expect(rec.commits).toHaveLength(1);
    expect(rec.fails).toHaveLength(0);
  });

  it("the R6CNT.3 replay: placeholders + exhausted budget → research_budget_exhausted, never committed", async () => {
    // the live run's actual ending posture — research spent, ledger still unchecked → terminal, honest.
    const spec = makeSpec(verification, { stopAfterPhase: true });
    const { rec, client, runPhase } = makeHarness([spec], () =>
      completeOutputs(PLACEHOLDER_FACTS, { versions: [] }),
    );
    client.researchBudget = () =>
      Promise.resolve({
        searchesUsed: 17, fetchesUsed: 48, searchBudget: 17, fetchBudget: 48,
        searchesRemaining: 0, fetchesRemaining: 0, exhausted: true,
      });

    const res = await runCommitLoop({ client, runPhase, workspaceId: "ws1" });

    expect(res).toMatchObject({ kind: "failed", errorClass: "research_budget_exhausted" });
    expect(rec.calls.filter((c) => c.startsWith("runPhase"))).toHaveLength(1); // no re-drain
    expect(rec.commits).toHaveLength(0);
    expect(rec.fails[0]!.errorClass).toBe("research_budget_exhausted");
  });
});
