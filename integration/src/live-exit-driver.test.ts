import { describe, it, expect } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import type { EstimatorSpec } from "@rhema/protocols";
import type { Phase0ExitAssessment } from "./harness.js";
import {
  driveLiveExit,
  formatLiveExitReadout,
  p95,
  OperatorGateError,
  START_LATENCY_SLO_MS,
  type LiveExitDeps,
  type WorkflowLauncher,
  type LaunchedRun,
} from "./live-exit-driver.js";

const foldedSpec = (workflow: string): EstimatorSpec =>
  ({ workflow, provisional: false, source: "instrumented", version: "instrumented@2026-09-11" }) as EstimatorSpec;

const EXEC = {} as SqlClient; // the assessor is stubbed, so the executor is never touched in these tests.

function assessment(passed: boolean): Phase0ExitAssessment {
  return {
    runId: "r", attempt: 1, terminalState: "completed", delivered: true,
    boundaryViolations: passed ? 0 : 2, boundaryOk: passed,
    sidecars: { total: 3, failed: passed ? 0 : 1, allOk: passed },
    citedFetched: { checked: 5, misses: passed ? 0 : 1, ok: passed },
    cost: { runId: "r", proxyListUsd: 1, sdkListUsd: 1, divergencePct: 0.5, comparable: true, withinTolerance: true, flagged: false, alert: false },
    passed,
  };
}

/** A launcher that hands back a fixed queued→running latency per call (cycling through `latencies`). */
function fakeLauncher(latencies: number[]): WorkflowLauncher {
  let i = 0;
  return {
    launch: (): Promise<LaunchedRun> => {
      const queuedToRunningMs = latencies[i % latencies.length]!;
      i++;
      return Promise.resolve({ runId: `run_${i}`, attempt: 1, queuedToRunningMs });
    },
  };
}

const baseDeps = (over: Partial<LiveExitDeps> = {}): LiveExitDeps => ({
  exec: EXEC,
  launcher: fakeLauncher([1000]),
  projectIds: ["p1", "p2", "p3"],
  devTargetAuthorized: true,
  estimatorsProvisional: () => false,
  assess: () => Promise.resolve(assessment(true)),
  ...over,
});

describe("driveLiveExit — fail-closed operator gate", () => {
  it("refuses to run without an authorized dev target (never fabricates a pass)", async () => {
    await expect(driveLiveExit(baseDeps({ devTargetAuthorized: false }))).rejects.toBeInstanceOf(OperatorGateError);
  });
  it("refuses when the three real projects are not supplied", async () => {
    await expect(driveLiveExit(baseDeps({ projectIds: ["p1", "p2"] }))).rejects.toThrow(/three real projects/);
  });
});

describe("driveLiveExit — orchestration + rollup", () => {
  it("runs 3 reviews + revise/fact_check/quick_voice + instrumented runs and rolls up ready", async () => {
    const deps = baseDeps({
      launcher: fakeLauncher([5000]),
      pilot: { run: () => Promise.resolve({ waveId: "w", sigmaD: 0.12, n: 24, scorersGreen: true }) },
    });
    const out = await driveLiveExit(deps);
    expect(out.reviews).toHaveLength(3);
    expect(out.reviews.map((r) => r.projectId)).toEqual(["p1", "p2", "p3"]);
    expect(out.otherWorkflows.map((w) => w.workflow)).toEqual(["revise", "fact_check", "quick_voice"]);
    expect(out.allReviewsPassed).toBe(true);
    // 3 reviews + 3 other + (4 workflows × 2 rigors) instrumented = 14 latency samples.
    expect(out.startLatency.samples).toBe(14);
    expect(out.startLatency.p95Ms).toBe(5000);
    expect(out.startLatency.withinSlo).toBe(true);
    expect(out.estimatorsProvisional).toBe(false);
    expect(out.pilot?.n).toBe(24);
    expect(out.ready).toBe(true);
  });

  it("is NOT ready when a review fails", async () => {
    let n = 0;
    const out = await driveLiveExit(
      baseDeps({
        pilot: { run: () => Promise.resolve({ waveId: "w", sigmaD: 0.1, n: 24, scorersGreen: true }) },
        assess: () => Promise.resolve(assessment(n++ !== 1)), // the 2nd review fails
      }),
    );
    expect(out.allReviewsPassed).toBe(false);
    expect(out.ready).toBe(false);
  });

  it("is NOT ready when estimators are still provisional or the pilot is absent", async () => {
    const stillProvisional = await driveLiveExit(baseDeps({ estimatorsProvisional: () => true, pilot: { run: () => Promise.resolve({ waveId: "w", sigmaD: 0.1, n: 24, scorersGreen: true }) } }));
    expect(stillProvisional.ready).toBe(false);
    const noPilot = await driveLiveExit(baseDeps()); // no pilot driver
    expect(noPilot.pilot).toBeUndefined();
    expect(noPilot.ready).toBe(false);
  });

  it("flags a start-latency SLO miss", async () => {
    const out = await driveLiveExit(baseDeps({ launcher: fakeLauncher([START_LATENCY_SLO_MS + 1]) }));
    expect(out.startLatency.withinSlo).toBe(false);
  });

  it("folds each instrumented run via the injected folder and surfaces the folds (§16.3 #1 / D-P0.15-2)", async () => {
    const seen: string[] = [];
    const out = await driveLiveExit(
      baseDeps({
        pilot: { run: () => Promise.resolve({ waveId: "w", sigmaD: 0.1, n: 24, scorersGreen: true }) },
        foldInstrumented: (_exec, run) => {
          seen.push(`${run.workflow}:${run.rigor}`);
          return Promise.resolve(foldedSpec(run.workflow));
        },
      }),
    );
    // 4 ported workflows × 2 rigors = 8 instrumented folds.
    expect(out.estimatorFolds).toHaveLength(8);
    expect(seen).toEqual([
      "review:standard", "review:full",
      "revise:standard", "revise:full",
      "fact_check:standard", "fact_check:full",
      "profile_voice:standard", "profile_voice:full",
    ]);
    expect(out.estimatorFolds[0]).toMatchObject({ workflow: "review", rigor: "standard" });
  });

  it("records no fold for a run the folder returns null for (unmetered) — never a fabricated fold", async () => {
    const out = await driveLiveExit(baseDeps({ foldInstrumented: () => Promise.resolve(null) }));
    expect(out.estimatorFolds).toHaveLength(0);
  });

  it("records no folds when no folder is injected (estimators stay provisional by default)", async () => {
    const out = await driveLiveExit(baseDeps({ estimatorsProvisional: undefined, foldInstrumented: undefined }));
    expect(out.estimatorFolds).toHaveLength(0);
    // with no fold recorded, the real estimatorsAreProvisional() is true ⇒ not ready.
    expect(out.estimatorsProvisional).toBe(true);
    expect(out.ready).toBe(false);
  });
});

describe("p95 (nearest-rank) + readout formatting", () => {
  it("computes nearest-rank p95", () => {
    expect(p95([])).toBe(0);
    expect(p95([10])).toBe(10);
    expect(p95([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(10); // ceil(0.95*10)=10th
    expect(p95([5, 1, 3, 2, 4])).toBe(5);
  });

  it("renders the operator readout markdown", async () => {
    const out = await driveLiveExit(baseDeps({ pilot: { run: () => Promise.resolve({ waveId: "w", sigmaD: 0.123, n: 24, scorersGreen: true }) } }));
    const md = formatLiveExitReadout(out);
    expect(md).toContain("Live Phase-0 exit readout");
    expect(md).toContain("σ_d=0.123");
    expect(md).toContain("**G1 ready:** ✅");
  });
});
