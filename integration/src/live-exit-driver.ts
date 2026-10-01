import type { SqlClient } from "@rhema/orchestrator";
import { estimatorsAreProvisional, type EstimatorSpec } from "@rhema/protocols";
import { assessPhase0ExitForRun, type Phase0ExitAssessment } from "./harness.js";

// The LIVE-exit driver (P0.15b item 6). Given a deployed `dev`, it drives the §17 exit criterion for real:
// a Review of each of the three real projects, a Revise / Fact-check / Quick Voice, the instrumented cost
// runs, the pilot wave, and the start-latency measurement — then runs the ALREADY-BUILT asserters
// (`assessPhase0ExitForRun`, `proxyVsSdkCrossCheck` via it, `estimatorsAreProvisional`, the pilot power
// estimate) over the live rows and rolls the result up into the readout the operator flags G1 from.
//
// It is deliberately fail-closed and seam-driven: the workflow launcher (the dev api) and the pilot driver
// (the real six-arm wave) are DI'd, so the ORCHESTRATION + rollup logic is unit-tested offline with fakes,
// while the live bindings are the operator-gated Stage-B work. Without an explicitly authorized dev target
// the driver refuses to run (it never fabricates a pass) — this is the [OPERATOR GATE] surfaced in code.

export type WorkflowKind = "review" | "revise" | "fact_check" | "quick_voice" | "profile_voice";
export type Rigor = "standard" | "full";

/** A launched-and-completed workflow run on dev, with the queued→running latency for the p95 SLO. */
export interface LaunchedRun {
  readonly runId: string;
  readonly attempt: number;
  /** queued→running wall-clock (ms) — the §13.5 start-latency SLO input (D-P0.15-5). */
  readonly queuedToRunningMs: number;
}

/** Launch a workflow on the deployed dev and resolve once it reaches a terminal state. */
export interface WorkflowLauncher {
  launch(input: {
    readonly projectId: string;
    readonly workflow: WorkflowKind;
    readonly rigor?: Rigor;
    /** an instrumented cost run (one per workflow×rigor) whose measured credits fold into the estimator. */
    readonly instrumented?: boolean;
    /** RES.1 — word/claim counts for `runs.input_snapshot` (sizes the web-research bound at provision). */
    readonly inputSnapshot?: Record<string, unknown>;
  }): Promise<LaunchedRun>;
}

/** One instrumented cost run to fold into the estimator (§16.3 #1). */
export interface InstrumentedRunRef {
  readonly runId: string;
  readonly attempt: number;
  readonly workflow: WorkflowKind;
  readonly rigor: Rigor;
}

/**
 * Fold ONE instrumented run's measured cost into the estimator registry and return the folded spec (AC2 /
 * D-P0.15-2). Reads the run's measured proxy credits + estimator inputs and calls `recordInstrumentedFold`,
 * so `estimatorsAreProvisional()` reflects the fold. Returns `null` when the run has no proxy cost yet to
 * measure (never a fabricated fold). The real DB-backed binding is `createDbInstrumentedFolder`
 * (`instrumented-folder.ts`), wired by the live entry; unit tests inject a fake.
 */
export type InstrumentedFolder = (exec: SqlClient, run: InstrumentedRunRef) => Promise<EstimatorSpec | null>;

/** Drive the §18 pilot wave with the real six-arm executors and return its power result. */
export interface PilotDriver {
  run(): Promise<{
    readonly waveId: string;
    /** σ_d estimated on the REAL paired-difference variance (REQ-EVAL-5). */
    readonly sigmaD: number;
    /** the fixed benchmark n. */
    readonly n: number;
    /** every deterministic scorer green (the report rendered ⇒ C-a…C-g passed). */
    readonly scorersGreen: boolean;
    readonly preregistrationHash?: string;
  }>;
}

export interface LiveExitDeps {
  /** the dev DB executor (a pg.Pool-backed SqlClient — Stage B). */
  readonly exec: SqlClient;
  readonly launcher: WorkflowLauncher;
  /** the three real projects' ids on dev. */
  readonly projectIds: readonly string[];
  /** the pilot-wave driver (optional; when absent the pilot line reads "not run"). */
  readonly pilot?: PilotDriver;
  /**
   * Explicit operator authorization that a real dev target is in play + budget approved. The driver REFUSES
   * to run without it — it never asserts a live pass against an absent deployment.
   */
  readonly devTargetAuthorized: boolean;
  /** injectable for tests; defaults to the real estimator check over the ported workflows. */
  readonly estimatorsProvisional?: (workflows?: readonly string[]) => boolean;
  /** injectable for tests; defaults to the real `assessPhase0ExitForRun` over the persisted dev rows. */
  readonly assess?: (exec: SqlClient, args: { runId: string; attempt: number }) => Promise<Phase0ExitAssessment>;
  /**
   * Fold each instrumented run into the estimator (§16.3 #1 / D-P0.15-2). When present, the driver calls it
   * per instrumented run so `estimatorsAreProvisional()` flips to false; when absent, no fold is recorded (the
   * estimators stay provisional and `ready` is false — an unfolded run never fakes a non-provisional estimate).
   * The live entry wires `createDbInstrumentedFolder`.
   */
  readonly foldInstrumented?: InstrumentedFolder;
}

export interface ReviewResult extends Phase0ExitAssessment {
  readonly projectId: string;
  readonly queuedToRunningMs: number;
}

export interface LiveExitReadout {
  readonly reviews: readonly ReviewResult[];
  /** the Revise / Fact-check / Quick Voice runs (AC-supporting workflows), with their exit assessments. */
  readonly otherWorkflows: ReadonlyArray<{ workflow: WorkflowKind; assessment: Phase0ExitAssessment }>;
  /** AC1–AC3/AC5 green on every one of the three real projects. */
  readonly allReviewsPassed: boolean;
  /** AC9 — queued→running p95 across the live runs, vs the ≤45 s SLO (D-P0.15-5). */
  readonly startLatency: { p95Ms: number; sloMs: number; withinSlo: boolean; samples: number };
  /** AC7 — instrumented constants merged ⇒ estimators no longer provisional for the ported workflows. */
  readonly estimatorsProvisional: boolean;
  /** AC7 / D-P0.15-2 — the instrumented runs folded into the estimator (the measured constants to persist durably). */
  readonly estimatorFolds: ReadonlyArray<{ workflow: WorkflowKind; rigor: Rigor; runId: string; spec: EstimatorSpec }>;
  /** AC6 — the pilot-wave power result (absent when no pilot driver was supplied). */
  readonly pilot?: Awaited<ReturnType<PilotDriver["run"]>>;
  /** every applicable exit criterion green — the input to flagging G1 ready. */
  readonly ready: boolean;
}

export class OperatorGateError extends Error {
  constructor(message: string) {
    super(`live-exit-driver [OPERATOR GATE]: ${message}`);
    this.name = "OperatorGateError";
  }
}

/** The §13.5 start-latency SLO: queued→running p95 ≤ 45 s. */
export const START_LATENCY_SLO_MS = 45_000;

/** Nearest-rank p95 (deterministic; no interpolation). Empty ⇒ 0. */
export function p95(samplesMs: readonly number[]): number {
  if (samplesMs.length === 0) return 0;
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length); // 1-based nearest-rank
  return sorted[Math.min(rank, sorted.length) - 1]!;
}

/**
 * Drive the live Phase-0 exit criterion on a deployed dev and assess it from the persisted rows. Fail-closed:
 * throws `OperatorGateError` unless a dev target is explicitly authorized. The three Reviews are the core
 * criterion (AC1–AC3/AC5); a Revise / Fact-check / Quick Voice exercise the rest of the loop; the pilot wave
 * and instrumented-constants checks complete the readout.
 */
export async function driveLiveExit(deps: LiveExitDeps): Promise<LiveExitReadout> {
  if (!deps.devTargetAuthorized) {
    throw new OperatorGateError(
      "no authorized dev target — this launches paid runs on billable infra. Deploy dev (pulumi up), " +
        "confirm the budget, then re-run with devTargetAuthorized:true.",
    );
  }
  if (deps.projectIds.length !== 3) {
    throw new OperatorGateError(`expected the three real projects, got ${deps.projectIds.length}`);
  }

  const latencies: number[] = [];
  const assess = deps.assess ?? assessPhase0ExitForRun;

  // --- The three Reviews (AC1–AC3/AC5): launch each, assess from the live rows. ---
  const reviews: ReviewResult[] = [];
  for (const projectId of deps.projectIds) {
    const run = await deps.launcher.launch({ projectId, workflow: "review" });
    latencies.push(run.queuedToRunningMs);
    const assessment = await assess(deps.exec, { runId: run.runId, attempt: run.attempt });
    reviews.push({ ...assessment, projectId, queuedToRunningMs: run.queuedToRunningMs });
  }
  const allReviewsPassed = reviews.every((r) => r.passed);

  // --- Revise / Fact-check / Quick Voice on the first project (exercise the rest of the loop). ---
  const otherWorkflows: Array<{ workflow: WorkflowKind; assessment: Phase0ExitAssessment }> = [];
  for (const workflow of ["revise", "fact_check", "quick_voice"] as const) {
    const run = await deps.launcher.launch({ projectId: deps.projectIds[0]!, workflow });
    latencies.push(run.queuedToRunningMs);
    otherWorkflows.push({
      workflow,
      assessment: await assess(deps.exec, { runId: run.runId, attempt: run.attempt }),
    });
  }

  // --- Instrumented cost runs (one per ported workflow × rigor): launch, then FOLD each measured run into the
  //     estimator so it sheds `provisional` (§16.3 #1 / D-P0.15-2). ---
  const estimatorFolds: Array<{ workflow: WorkflowKind; rigor: Rigor; runId: string; spec: EstimatorSpec }> = [];
  for (const workflow of ["review", "revise", "fact_check", "profile_voice"] as const) {
    for (const rigor of ["standard", "full"] as const) {
      const run = await deps.launcher.launch({ projectId: deps.projectIds[0]!, workflow, rigor, instrumented: true });
      latencies.push(run.queuedToRunningMs);
      if (deps.foldInstrumented) {
        const spec = await deps.foldInstrumented(deps.exec, { runId: run.runId, attempt: run.attempt, workflow, rigor });
        if (spec) estimatorFolds.push({ workflow, rigor, runId: run.runId, spec });
      }
    }
  }
  const provisional = (deps.estimatorsProvisional ?? estimatorsAreProvisional)();

  // --- The pilot wave (AC6) — real six-arm executors + power estimate. ---
  const pilot = deps.pilot ? await deps.pilot.run() : undefined;

  // --- Start-latency p95 (AC9). ---
  const p95Ms = p95(latencies);
  const startLatency = { p95Ms, sloMs: START_LATENCY_SLO_MS, withinSlo: p95Ms <= START_LATENCY_SLO_MS, samples: latencies.length };

  const ready =
    allReviewsPassed &&
    !provisional &&
    startLatency.samples > 0 &&
    (pilot ? pilot.scorersGreen : false);

  return { reviews, otherWorkflows, allReviewsPassed, startLatency, estimatorsProvisional: provisional, estimatorFolds, pilot, ready };
}

/** Render the readout as the markdown block the operator drops into `docs/phase0-exit-readout.md`. */
export function formatLiveExitReadout(r: LiveExitReadout): string {
  const yn = (b: boolean) => (b ? "✅" : "❌");
  const lines: string[] = ["## Live Phase-0 exit readout (measured on dev)", ""];
  lines.push("| # | Criterion | Result |", "|---|---|---|");
  for (const rev of r.reviews) {
    lines.push(
      `| 1–3 | Review \`${rev.projectId}\`: boundary=${rev.boundaryViolations}, sidecars ${rev.sidecars.failed}/${rev.sidecars.total} failed, cited⇒fetched ${rev.citedFetched.misses} miss | ${yn(rev.passed)} |`,
    );
  }
  lines.push(`| 5 | Proxy vs SDK cost (±2%) on the three | ${yn(r.reviews.every((x) => (x.cost.comparable ? x.cost.withinTolerance : true)))} |`);
  lines.push(`| 6 | Pilot wave (σ_d, n, scorers) | ${r.pilot ? `${yn(r.pilot.scorersGreen)} σ_d=${r.pilot.sigmaD.toFixed(3)}, n=${r.pilot.n}` : "not run"} |`);
  lines.push(`| 7 | Estimators no longer provisional (${r.estimatorFolds.length} instrumented run(s) folded) | ${yn(!r.estimatorsProvisional)} |`);
  lines.push(
    `| 9 | Start-latency p95 ${(r.startLatency.p95Ms / 1000).toFixed(1)}s vs ${(r.startLatency.sloMs / 1000).toFixed(0)}s SLO (${r.startLatency.samples} runs) | ${yn(r.startLatency.withinSlo)} |`,
  );
  lines.push("", `**G1 ready:** ${yn(r.ready)}`);
  return lines.join("\n");
}
