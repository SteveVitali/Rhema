import type { BenchmarkArm, BenchmarkDeps, JudgeModel, ModelFamily, SqlExecutor } from "./types.js";
import { SEVERITY_LEVELS, weightedKappa } from "@rhema/benchmark";

// LLM-judge hardening (REQ-EVAL-9), SECONDARY metrics only. The verified-literature requirements C-a…C-g are
// binding on judge design and implemented here as enforceable gates + report-blocking checks:
//   C-a randomize/swap presentation order in pairwise judgments + report position-consistency (see adjudication.ts)
//   C-b report chance-corrected agreement (κ), never raw agreement, for judge↔editor comparisons (calibration is κ)
//   C-c leniency is worst on weak drafts → calibrate per severity STRATUM, not on average
//   C-d different-model-family judges vs every arm under test
//   C-e style-perturbed controls (laundered draft must not score materially higher) — @rhema/benchmark styleControl
//   C-f inter-arm finding diversity is first-class — @rhema/benchmark findingDiversity
//   C-g deterministic scorers before LLM judges; a holistic LLM score without an anchored decomposition is untrusted
// AC3: a judge below weighted κ 0.6 on the calibration subset is DISQUALIFIED and its metrics WITHHELD;
// position-consistency reported; a same-family judge/arm pairing is REJECTED.

/** The pre-registered disqualification floor (REQ-EVAL-9): weighted κ vs the human-adjudicated subset. */
export const JUDGE_KAPPA_FLOOR = 0.6;

/** Raised when a judge is the SAME model family as an arm it would score (C-d). */
export class SameFamilyJudgeError extends Error {
  constructor(
    public readonly judgeId: string,
    public readonly family: ModelFamily,
    public readonly arm: BenchmarkArm,
  ) {
    super(
      `benchmark-runner: judge ${judgeId} (family ${family}) may not score arm ${arm} of the same family — ` +
        `judges must be a DIFFERENT model family than every arm they score (REQ-EVAL-9 C-d)`,
    );
    this.name = "SameFamilyJudgeError";
  }
}

/** Assert a judge is cross-family to every arm it scores (C-d). `armFamilies` maps arm → its model family. */
export function assertCrossFamily(
  judge: Pick<JudgeModel, "id" | "family">,
  armFamilies: ReadonlyArray<{ arm: BenchmarkArm; family: ModelFamily | null }>,
): void {
  for (const a of armFamilies) {
    if (a.family && a.family === judge.family) throw new SameFamilyJudgeError(judge.id, judge.family, a.arm);
  }
}

/** An aligned (judge label, human label) pair on one unit, tagged with the human/gold severity stratum (C-c). */
export interface CalibrationPair {
  readonly judgeLabel: string;
  readonly humanLabel: string;
  /** the severity stratum this unit falls in (for the per-stratum validation — C-c). */
  readonly stratum: string;
}

export interface JudgeCalibration {
  readonly judgeId: string;
  readonly weightedKappa: number;
  readonly disqualified: boolean;
  /** per-severity-stratum weighted κ (C-c): leniency is worst on weak drafts, so validate per stratum. */
  readonly perStratum: Readonly<Record<string, { pairs: number; kappa: number | null }>>;
  readonly positionConsistency?: number;
}

/**
 * Calibrate one LLM judge against the human-adjudicated subset (REQ-EVAL-9; C-b, C-c). Computes the OVERALL
 * quadratic-weighted κ (chance-corrected — never raw agreement, C-b) plus a PER-STRATUM κ (C-c). A judge below the
 * floor is disqualified. The overall κ is the disqualification test; the per-stratum breakdown surfaces the leniency
 * pattern the literature warns of (a judge fine on average but blind on weak drafts).
 */
export function calibrateJudge(
  judgeId: string,
  pairs: readonly CalibrationPair[],
  opts: { floor?: number; levels?: readonly string[]; positionConsistency?: number } = {},
): JudgeCalibration {
  const floor = opts.floor ?? JUDGE_KAPPA_FLOOR;
  const levels = opts.levels ?? SEVERITY_LEVELS;
  const overall = pairs.length === 0 ? 0 : weightedKappa(pairs.map((p) => p.judgeLabel), pairs.map((p) => p.humanLabel), levels, "quadratic");

  const byStratum = new Map<string, CalibrationPair[]>();
  for (const p of pairs) {
    const arr = byStratum.get(p.stratum) ?? [];
    arr.push(p);
    byStratum.set(p.stratum, arr);
  }
  const perStratum: Record<string, { pairs: number; kappa: number | null }> = {};
  for (const [stratum, arr] of byStratum) {
    perStratum[stratum] =
      arr.length < 2
        ? { pairs: arr.length, kappa: null } // κ is undefined on <2 pairs — reported, not scored
        : { pairs: arr.length, kappa: weightedKappa(arr.map((p) => p.judgeLabel), arr.map((p) => p.humanLabel), levels, "quadratic") };
  }

  return {
    judgeId,
    weightedKappa: overall,
    disqualified: overall < floor,
    perStratum,
    positionConsistency: opts.positionConsistency,
  };
}

/**
 * Persist a judge's per-wave calibration (REQ-EVAL-9). `family` is stored so the report can show the cross-family
 * pairing was honoured (C-d); `disqualified` is what the report guard reads to WITHHOLD the judge's metrics (AC3).
 */
export async function recordJudgeCalibration(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; judge: Pick<JudgeModel, "id" | "model" | "family">; calibration: JudgeCalibration },
): Promise<void> {
  await exec.query(
    `insert into benchmark_judge_calibrations
       (id, wave_id, judge_id, model, family, weighted_kappa, kappa_floor, disqualified, position_consistency, calibrated_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (wave_id, judge_id) do update set
       model = excluded.model, family = excluded.family, weighted_kappa = excluded.weighted_kappa,
       kappa_floor = excluded.kappa_floor, disqualified = excluded.disqualified,
       position_consistency = excluded.position_consistency`,
    [
      deps.ids("bmcal"),
      input.waveId,
      input.judge.id,
      input.judge.model,
      input.judge.family,
      input.calibration.weightedKappa,
      JUDGE_KAPPA_FLOOR,
      input.calibration.disqualified,
      input.calibration.positionConsistency ?? null,
      deps.clock.now(),
    ],
  );
}

/**
 * An anchored rubric with exemplars (REQ-EVAL-9; C-g). A holistic LLM score with no anchored decomposition is
 * untrusted — so a rubric must carry a decomposition (named dimensions) and exemplars per dimension. `assertAnchored`
 * enforces both before a judge prompt is built.
 */
export interface AnchoredRubric {
  readonly metric: string;
  readonly dimensions: readonly string[];
  /** exemplars anchoring the scale — at least one per rubric (C-g). */
  readonly exemplars: ReadonlyArray<{ score: number; text: string }>;
}

export class UnanchoredRubricError extends Error {
  constructor(metric: string, detail: string) {
    super(`benchmark-runner: rubric for '${metric}' is not anchored — ${detail} (REQ-EVAL-9 C-g)`);
    this.name = "UnanchoredRubricError";
  }
}

export function assertAnchoredRubric(rubric: AnchoredRubric): void {
  if (rubric.dimensions.length === 0) throw new UnanchoredRubricError(rubric.metric, "no decomposition dimensions");
  if (rubric.exemplars.length === 0) throw new UnanchoredRubricError(rubric.metric, "no exemplars anchoring the scale");
}

/**
 * A SECONDARY-metric judge score, per finding-unit with length reported (REQ-EVAL-9). Refuses a HEADLINE metric key
 * — LLM judges are barred from the headline path (REQ-EVAL-11; AC5). The set of headline metric keys is the report's
 * reference-based metrics; this module owns the bar at write time.
 */
export const HEADLINE_METRIC_KEYS: ReadonlySet<string> = new Set([
  "material_recall",
  "false_positive_rate",
  "anchoring",
  "severity_calibration",
  "novelty",
  "second_read_contribution",
  "voice_conformance",
  "meaning_preservation",
  "recall_per_dollar",
]);

export class HeadlineMetricJudgeError extends Error {
  constructor(metric: string) {
    super(
      `benchmark-runner: LLM judge may not score headline metric '${metric}' — the headline path is reference-based, ` +
        `never LLM-judged (REQ-EVAL-11; AC5)`,
    );
    this.name = "HeadlineMetricJudgeError";
  }
}

export async function recordJudgeScore(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; draftId: string; arm: BenchmarkArm; judgeId: string; metric: string; score: number; lengthUnits?: number },
): Promise<string> {
  if (HEADLINE_METRIC_KEYS.has(input.metric)) throw new HeadlineMetricJudgeError(input.metric);
  const id = deps.ids("bmjs");
  await exec.query(
    `insert into benchmark_judge_scores (id, wave_id, draft_id, arm, judge_id, metric, score, length_units, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, input.waveId, input.draftId, input.arm, input.judgeId, input.metric, input.score, input.lengthUnits ?? null, deps.clock.now()],
  );
  return id;
}

/** The judge ids DISQUALIFIED this wave (κ below floor) — the report withholds their scores (AC3). */
export async function disqualifiedJudges(exec: SqlExecutor, waveId: string): Promise<Set<string>> {
  const rows = (
    await exec.query(`select judge_id from benchmark_judge_calibrations where wave_id = $1 and disqualified = true`, [waveId])
  ).rows as { judge_id: string }[];
  return new Set(rows.map((r) => r.judge_id));
}

/** A judge's SECONDARY scores that survive the disqualification filter (qualified judges only — AC3). */
export async function qualifiedJudgeScores(
  exec: SqlExecutor,
  waveId: string,
): Promise<Array<{ arm: BenchmarkArm; judgeId: string; metric: string; score: number; lengthUnits: number | null }>> {
  const disq = await disqualifiedJudges(exec, waveId);
  const rows = (
    await exec.query(
      `select arm, judge_id, metric, score, length_units from benchmark_judge_scores where wave_id = $1 order by id`,
      [waveId],
    )
  ).rows as { arm: BenchmarkArm; judge_id: string; metric: string; score: number; length_units: number | null }[];
  return rows
    .filter((r) => !disq.has(r.judge_id))
    .map((r) => ({ arm: r.arm, judgeId: r.judge_id, metric: r.metric, score: r.score, lengthUnits: r.length_units }));
}
