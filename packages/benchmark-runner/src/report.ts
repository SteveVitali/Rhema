import type { BenchmarkArm, BenchmarkDeps, Finding, SqlExecutor } from "./types.js";
import {
  anchoringScore,
  loadGold,
  recallFp,
  recallPerDollar,
  armEconomics,
  secondReadContribution,
  severityCalibration,
  assertHeadlineDrafts,
  findingDiversity,
  type ArmCoverage,
} from "@rhema/benchmark";
import { reportBlockingChecks, assertReportChecks } from "./checks.js";
import { loadNormalizedFindings } from "./normalization.js";
import { loadMatchRecords } from "./matching.js";
import { confirmedNovelties, pairwisePreference } from "./adjudication.js";
import { extractionFidelity } from "./normalization.js";
import { loadArmConfigs } from "./arms.js";
import { assertPreregistered, loadDeviations, detectDrift } from "./preregistration.js";
import { qualifiedJudgeScores } from "./judges.js";

// The wave report (REQ-EVAL-11, REQ-EVAL-15, REQ-EVAL-16, REQ-EVAL-18). Computes the TWELVE metrics per arm (driving
// the P0.13 scorers — never re-implementing them), the REQ-EVAL-15 LIFT readout, stability bands, and splits the
// output into a PUBLIC report (methodology, published baseline prompt/recipe, aggregate per-arm results with bands,
// IAA, pre-registration ref, deviation log, consented examples) and a PRIVATE report (per-draft results, corpus/gold
// content, Rhema protocol content, run prompts) — REQ-EVAL-18. Two guards run at render: the HEADLINE path contains
// no pairwise metric (AC5), and nothing private leaks into the public artifact (REQ-EVAL-18).

// ---- the twelve REQ-EVAL-11 metrics, partitioned. Headline = reference-based against gold, never pairwise. ----
/** Headline metrics (reference-based against gold — REQ-EVAL-11). NO pairwise metric may appear here (AC5). */
export const HEADLINE_METRICS = [
  "material_recall",
  "false_positive_rate",
  "anchoring_specificity",
  "novelty",
  "severity_calibration",
  "voice_meaning_preservation",
  "second_read_contribution",
  "cost_latency",
] as const;
/** Secondary metrics — human-rubric / audited / PAIRWISE (LLM-judgeable). Never in the headline path. */
export const SECONDARY_METRICS = [
  "reviewer_factual_accuracy",
  "source_quality",
  "revision_plan_usefulness",
  "post_revision_improvement",
] as const;
/** The metrics that are PAIRWISE (position-dependent) — barred from the headline path (AC5, REQ-EVAL-11). */
export const PAIRWISE_METRICS: ReadonlySet<string> = new Set(["post_revision_improvement"]);

/** Raised when a headline table would carry a pairwise metric (AC5). */
export class PairwiseInHeadlineError extends Error {
  constructor(public readonly metrics: string[]) {
    super(
      `benchmark-runner: headline path contains pairwise metric(s) [${metrics.join(", ")}] — the headline is ` +
        `reference-based against gold, never pairwise (REQ-EVAL-11; AC5)`,
    );
    this.name = "PairwiseInHeadlineError";
  }
}

/** Assert no headline metric key is a pairwise metric (AC5). Called on the assembled headline structure. */
export function assertHeadlineNoPairwise(headlineKeys: readonly string[]): void {
  const offending = headlineKeys.filter((k) => PAIRWISE_METRICS.has(k));
  if (offending.length > 0) throw new PairwiseInHeadlineError(offending);
}

/** Keys that may only appear in the PRIVATE report (REQ-EVAL-18). Their presence in the public artifact is a leak. */
export const PRIVATE_ONLY_KEYS: ReadonlySet<string> = new Set([
  "perDraft",
  "draftText",
  "corpusText",
  "goldAnnotations",
  "runPrompt",
  "protocolContent",
]);

export class PrivateLeakError extends Error {
  constructor(public readonly keys: string[]) {
    super(
      `benchmark-runner: public report leaks private-only field(s) [${keys.join(", ")}] — corpus/gold texts, ` +
        `per-draft results, Rhema protocol content, and run prompts are always private (REQ-EVAL-18)`,
    );
    this.name = "PrivateLeakError";
  }
}

/** Assert a value carries no private-only key anywhere in its structure (REQ-EVAL-18). */
export function assertPublicClean(value: unknown, found = new Set<string>()): void {
  if (Array.isArray(value)) {
    for (const v of value) assertPublicClean(v, found);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PRIVATE_ONLY_KEYS.has(k)) found.add(k);
      assertPublicClean(v, found);
    }
  }
  if (found.size > 0) throw new PrivateLeakError([...found]);
}

/** A stability band over a metric's per-draft values (REQ-EVAL-11 stability bands). */
export interface Band {
  readonly mean: number;
  readonly low: number;
  readonly high: number;
  readonly n: number;
}

export function band(values: readonly number[]): Band {
  if (values.length === 0) return { mean: 0, low: 0, high: 0, n: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return { mean, low: Math.min(...values), high: Math.max(...values), n: values.length };
}

/** Per-(arm, draft) inputs the SQL layer cannot derive (voice/meaning measurement, human-rubric + audited metrics). */
export interface MetricExtras {
  readonly voiceConformance?: number; // REQ-EVAL-12 band conformance in [0,1]
  readonly meaningPreservation?: number; // 1 − (unlicensed Tier-1 meaning changes) in [0,1]
  readonly reviewerFactualAccuracy?: number; // audited-sample accuracy in [0,1]
  readonly sourceQuality?: number;
  readonly revisionPlanUsefulness?: number; // anchored human rubric
  readonly postRevisionImprovement?: number; // gold-issue resolution count component
}

export interface WaveReportInput {
  readonly waveId: string;
  /** per-(arm,draft) extras keyed `${arm}:${draftId}` (voice/meaning/rubric/audited metrics). */
  readonly extras?: Readonly<Record<string, MetricExtras>>;
  /** arms whose baseline prompt/recipe is published verbatim in the PUBLIC report (REQ-EVAL-18) — usually A1/A2. */
  readonly consentedExamples?: readonly string[];
  /**
   * Style-perturbed control observations (REQ-EVAL-9 C-e): a judge/scorer's score on a draft vs its "laundered"
   * twin (surface-polished, substance unchanged). A laundered score materially HIGHER means the judge measures
   * fluency, not argument — a binding C-e failure that blocks the report. Omitted ⇒ C-e is non-binding this wave.
   */
  readonly styleControls?: readonly { label: string; original: number; laundered: number }[];
}

interface ArmRunRow {
  id: string;
  draft_id: string;
  arm: BenchmarkArm;
}

/** Per-arm aggregated headline + secondary metrics, with per-draft detail (the private half). */
export interface ArmMetrics {
  readonly arm: BenchmarkArm;
  readonly drafts: number;
  readonly headline: {
    material_recall: Band;
    false_positive_rate: Band;
    anchoring_specificity: Band;
    novelty: number;
    severity_calibration: Band;
    voice_meaning_preservation: Band;
    second_read_contribution: Band;
    cost_latency: { listCostUsd: number; latencyMs: number; recallPerDollar: number | null };
  };
  readonly secondary: {
    reviewer_factual_accuracy: Band;
    source_quality: Band;
    revision_plan_usefulness: Band;
    post_revision_improvement: Band;
  };
  /** voice band-conformance ALONE (mean), for the REQ-EVAL-15 guard rail; null when no voice measurement supplied. */
  readonly voiceConformanceMean: number | null;
  /** per-draft material recall, keyed by draft — the paired per-draft LIFT (REQ-EVAL-5) reads this. */
  readonly recallByDraft: Readonly<Record<string, number>>;
  readonly perDraft: ReadonlyArray<Record<string, unknown>>;
}

async function scoreArm(
  exec: SqlExecutor,
  waveId: string,
  arm: BenchmarkArm,
  runs: readonly ArmRunRow[],
  extras: Readonly<Record<string, MetricExtras>>,
): Promise<ArmMetrics> {
  const recallV: number[] = [];
  const fpV: number[] = [];
  const anchorV: number[] = [];
  const sevV: number[] = [];
  const secondReadV: number[] = [];
  const voiceMeaningV: number[] = [];
  const voiceConfV: number[] = []; // voice band-conformance ALONE — the REQ-EVAL-15 guard rail (not voice+meaning)
  const factualV: number[] = [];
  const sourceV: number[] = [];
  const revPlanV: number[] = [];
  const improvementV: number[] = [];
  let novelty = 0;
  const perDraft: Array<Record<string, unknown>> = [];

  for (const run of runs) {
    const findings: Finding[] = (await loadNormalizedFindings(exec, run.id)).map((nf) => nf.finding);
    const gold = await loadGold(exec, run.draft_id);
    const matches = await loadMatchRecords(exec, { waveId, draftId: run.draft_id, arm });
    const rf = recallFp(findings, gold, matches);
    const anchor = anchoringScore(findings);
    const sev = severityCalibration(findings, gold, matches);
    const sr = secondReadContribution(findings, gold, matches);
    const nov = await confirmedNovelties(exec, { waveId, draftId: run.draft_id, arm });
    const ex = extras[`${arm}:${run.draft_id}`] ?? {};
    // voice+meaning is ONE metric (REQ-EVAL-11 #10): the mean of the two components present.
    const vmParts = [ex.voiceConformance, ex.meaningPreservation].filter((x): x is number => x !== undefined);
    const vm = vmParts.length === 0 ? null : vmParts.reduce((a, b) => a + b, 0) / vmParts.length;

    recallV.push(rf.recall);
    fpV.push(rf.falsePositiveRate);
    anchorV.push(anchor.specificity);
    if (sev.kappa !== null) sevV.push(sev.kappa);
    secondReadV.push(sr.marginalContribution);
    if (vm !== null) voiceMeaningV.push(vm);
    if (ex.voiceConformance !== undefined) voiceConfV.push(ex.voiceConformance);
    if (ex.reviewerFactualAccuracy !== undefined) factualV.push(ex.reviewerFactualAccuracy);
    if (ex.sourceQuality !== undefined) sourceV.push(ex.sourceQuality);
    if (ex.revisionPlanUsefulness !== undefined) revPlanV.push(ex.revisionPlanUsefulness);
    if (ex.postRevisionImprovement !== undefined) improvementV.push(ex.postRevisionImprovement);
    novelty += nov;

    perDraft.push({
      draftId: run.draft_id, // PRIVATE: per-draft results
      recall: rf.recall,
      falsePositiveRate: rf.falsePositiveRate,
      materialHits: rf.materialHits,
      materialGold: rf.materialGold,
      anchoringSpecificity: anchor.specificity,
      severityKappa: sev.kappa,
      secondReadContribution: sr.marginalContribution,
      confirmedNovelties: nov,
    });
  }

  const econ = await armEconomics(exec, waveId, arm);
  const recallMean = band(recallV).mean;
  const recallByDraft: Record<string, number> = {};
  for (const run of runs) {
    const r = perDraft.find((p) => p.draftId === run.draft_id);
    if (r) recallByDraft[run.draft_id] = r.recall as number;
  }

  return {
    arm,
    drafts: runs.length,
    voiceConformanceMean: voiceConfV.length === 0 ? null : band(voiceConfV).mean,
    recallByDraft,
    headline: {
      material_recall: band(recallV),
      false_positive_rate: band(fpV),
      anchoring_specificity: band(anchorV),
      novelty,
      severity_calibration: band(sevV),
      voice_meaning_preservation: band(voiceMeaningV),
      second_read_contribution: band(secondReadV),
      cost_latency: {
        listCostUsd: econ.listCostUsd,
        latencyMs: econ.latencyMs,
        recallPerDollar: recallPerDollar(recallMean, econ.listCostUsd),
      },
    },
    secondary: {
      reviewer_factual_accuracy: band(factualV),
      source_quality: band(sourceV),
      revision_plan_usefulness: band(revPlanV),
      post_revision_improvement: band(improvementV),
    },
    perDraft,
  };
}

/** The REQ-EVAL-15 LIFT readout: Rhema Full board (A5) over A1. Single-wave; "sustained across two waves" is the
 *  G2 milestone reading (this computes one wave's contribution to it). */
export interface LiftReadout {
  readonly recallDeltaPp: number; // paired per-draft (A5 − A1) material recall, in percentage points (REQ-EVAL-5)
  readonly meetsRecall: boolean; // ≥ 15 pp
  readonly a1InvalidRate: number;
  readonly a5InvalidRate: number;
  readonly invalidOk: boolean; // A5 invalid rate no worse than A1
  readonly pairwisePreferredFraction: number; // blinded editors preferring A5 over A1 (both orders)
  readonly meetsPairwise: boolean; // ≥ 60%
  readonly a1Voice: number;
  readonly a5Voice: number;
  readonly voiceOk: boolean; // A5 voice conformance not worse than A1
  readonly meetsThisWave: boolean; // all headline + guard-rail conditions this wave
}

const LIFT_RECALL_PP = 15;
const LIFT_PAIRWISE = 0.6;

function armByName(arms: readonly ArmMetrics[], arm: BenchmarkArm): ArmMetrics | undefined {
  return arms.find((a) => a.arm === arm);
}

async function computeLift(exec: SqlExecutor, waveId: string, arms: readonly ArmMetrics[]): Promise<LiftReadout> {
  const a1 = armByName(arms, "A1");
  const a5 = armByName(arms, "A5");
  // PAIRED per-draft recall difference (REQ-EVAL-5: "the primary analysis is paired per-draft"). Averaging each
  // arm's own mean would silently diverge from the paired estimate once a per-arm memorization-probe exclusion makes
  // the two manifests differ; the paired difference over the drafts BOTH arms scored is the pre-registered quantity.
  const a1ByDraft = a1?.recallByDraft ?? {};
  const a5ByDraft = a5?.recallByDraft ?? {};
  const sharedDrafts = Object.keys(a5ByDraft).filter((d) => d in a1ByDraft);
  const pairedDeltas = sharedDrafts.map((d) => a5ByDraft[d]! - a1ByDraft[d]!);
  const meanPairedDelta =
    pairedDeltas.length > 0
      ? pairedDeltas.reduce((s, x) => s + x, 0) / pairedDeltas.length
      : (a5?.headline.material_recall.mean ?? 0) - (a1?.headline.material_recall.mean ?? 0); // fallback: no shared drafts
  const recallDeltaPp = meanPairedDelta * 100;
  const a1InvalidRate = a1?.headline.false_positive_rate.mean ?? 0;
  const a5InvalidRate = a5?.headline.false_positive_rate.mean ?? 0;
  // guard rail is VOICE band-conformance specifically (REQ-EVAL-15), not the combined voice+meaning metric #10.
  const a1Voice = a1?.voiceConformanceMean ?? 0;
  const a5Voice = a5?.voiceConformanceMean ?? 0;
  // blinded editors prefer A5 over A1 (both presentation orders resolved — C-a; human guard rail — REQ-EVAL-15).
  const pref = await pairwisePreference(exec, { waveId, armA: "A5", armB: "A1", judgeKind: "human" });

  const meetsRecall = recallDeltaPp >= LIFT_RECALL_PP;
  const invalidOk = a5InvalidRate <= a1InvalidRate;
  const meetsPairwise = pref.preferredAFraction >= LIFT_PAIRWISE;
  const voiceOk = a5Voice >= a1Voice;
  return {
    recallDeltaPp,
    meetsRecall,
    a1InvalidRate,
    a5InvalidRate,
    invalidOk,
    pairwisePreferredFraction: pref.preferredAFraction,
    meetsPairwise,
    a1Voice,
    a5Voice,
    voiceOk,
    meetsThisWave: meetsRecall && invalidOk && meetsPairwise && voiceOk,
  };
}

export interface WaveReport {
  readonly public: Record<string, unknown>;
  readonly private: Record<string, unknown>;
  readonly lift: LiftReadout;
  /**
   * Per-arm metrics incl. `recallByDraft` — the paired per-draft input the Phase-0 pilot power estimate reads
   * (REQ-EVAL-5; `estimatePilotPower`). Carries private per-draft data (never surfaced publicly); it mirrors what is
   * already in `private.perDraft`, exposed structurally so the pilot glue need not re-query.
   */
  readonly arms: readonly ArmMetrics[];
}

/**
 * Generate + persist a wave report (REQ-EVAL-11/15/18). Refuses to render a SCORED wave without a pre-registration
 * hash-commit (AC4 — dev-set/pilot exempt). Computes all twelve metrics per arm (driving the P0.13 scorers), the
 * LIFT readout, and the public/private split; runs the headline-no-pairwise (AC5) + private-leak (REQ-EVAL-18)
 * guards; and — for a scored wave — asserts every headline draft is a non-dev-set corpus draft (AC6/REQ-EVAL-1).
 */
export async function generateWaveReport(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: WaveReportInput,
): Promise<WaveReport> {
  const { waveId } = input;
  const prereg = await assertPreregistered(exec, waveId); // AC4 (throws for a scored wave w/o hash-commit)
  const isScored = prereg !== null; // a scored (headline-eligible) wave vs a dev-set/pilot dry run (REQ-EVAL-1)

  const runRows = (
    await exec.query(
      `select id, draft_id, arm from benchmark_arm_runs where wave_id = $1 and excluded = false order by arm, draft_id`,
      [waveId],
    )
  ).rows as ArmRunRow[];
  const byArm = new Map<BenchmarkArm, ArmRunRow[]>();
  for (const r of runRows) {
    const arr = byArm.get(r.arm) ?? [];
    arr.push(r);
    byArm.set(r.arm, arr);
  }

  const extras = input.extras ?? {};
  const armMetrics: ArmMetrics[] = [];
  for (const arm of [...byArm.keys()].sort()) {
    armMetrics.push(await scoreArm(exec, waveId, arm, byArm.get(arm)!, extras));
  }

  const lift = await computeLift(exec, waveId, armMetrics);
  const configs = await loadArmConfigs(exec, waveId);
  // detect + log any post-freeze config/manifest drift at RENDER time (REQ-EVAL-10; a scored wave only — a dev-set/
  // pilot wave has no frozen pre-registration to have drifted from), then surface the full deviation log.
  if (isScored) await detectDrift(exec, deps, waveId);
  const deviations = await loadDeviations(exec, waveId);
  const fidelity = await extractionFidelity(exec, waveId);

  // qualified LLM-judge SECONDARY metrics, aggregated per arm × metric (REQ-EVAL-9). Disqualified judges' scores are
  // WITHHELD here (AC3) — `qualifiedJudgeScores` already dropped them; a mean over the survivors is what the report
  // surfaces. Never a headline metric (barred at write time — `recordJudgeScore`).
  const judgeScores = await qualifiedJudgeScores(exec, waveId);
  const judgeAgg = new Map<string, { sum: number; n: number }>();
  for (const s of judgeScores) {
    const key = `${s.arm}:${s.metric}`;
    const cur = judgeAgg.get(key) ?? { sum: 0, n: 0 };
    cur.sum += s.score;
    cur.n += 1;
    judgeAgg.set(key, cur);
  }
  const judgeSecondaryMetrics = [...judgeAgg.entries()].map(([key, v]) => {
    const [arm, metric] = key.split(":");
    return { arm, metric, mean: v.sum / v.n, n: v.n };
  });

  // inter-arm finding diversity (REQ-EVAL-9 C-f, a FIRST-CLASS metric): each arm's covered ground = the gold
  // findings its matched arm findings hit; high pairwise similarity across arms is the hivemind signal.
  const matchedRows = (
    await exec.query(
      `select arm, gold_finding_id from benchmark_match_records
        where wave_id = $1 and verdict = 'matched' and gold_finding_id is not null`,
      [waveId],
    )
  ).rows as { arm: BenchmarkArm; gold_finding_id: string }[];
  const coverageByArm = new Map<BenchmarkArm, Set<string>>();
  for (const r of matchedRows) {
    const s = coverageByArm.get(r.arm) ?? new Set<string>();
    s.add(r.gold_finding_id);
    coverageByArm.set(r.arm, s);
  }
  const coverages: ArmCoverage[] = armMetrics.map((a) => ({ arm: a.arm, ids: coverageByArm.get(a.arm) ?? new Set<string>() }));
  const diversity = findingDiversity(coverages);

  // C-a…C-g report-blocking checks (REQ-EVAL-9): a failed BINDING check blocks the report.
  const checks = await reportBlockingChecks(exec, waveId, { styleControls: input.styleControls });
  assertReportChecks(checks);

  // headline drafts (scored waves): reject dev-set/unknown drafts from the headline (AC6, defence behind the guard).
  const headlineDraftIds = [...new Set(runRows.map((r) => r.draft_id))];
  if (isScored) await assertHeadlineDrafts(exec, headlineDraftIds, waveId);

  // ---- PUBLIC report: aggregate per-arm results with bands + methodology, NO per-draft rows / texts / prompts. ----
  const publicArms = armMetrics.map((a) => ({
    arm: a.arm,
    drafts: a.drafts,
    headline: a.headline, // aggregate bands only
    secondary: a.secondary,
  }));
  const publicReport: Record<string, unknown> = {
    waveId,
    // A dev-set/pilot dry run is NEVER a publishable result: it is stamped preliminary + devSet so a pilot artifact
    // is structurally distinguishable from a scored wave's numbers (REQ-EVAL-1 "dev-set results never appear in
    // headline numbers"; REQ-EVAL-19 "preliminary-corpus results always labeled preliminary"). No superiority claim
    // may cite a report where `preliminary` is true.
    preliminary: !isScored,
    devSet: !isScored,
    preregistrationHash: prereg?.hash ?? null,
    metricsComputed: [...HEADLINE_METRICS, ...SECONDARY_METRICS],
    headlineMetrics: HEADLINE_METRICS,
    arms: publicArms,
    // for a preliminary wave the LIFT is a machinery readout, not a criterion result — flag it so `meetsThisWave`
    // is never read as a pass (REQ-EVAL-19; the criterion is only decidable on a scored, pre-registered wave).
    lift: isScored ? lift : { ...lift, preliminary: true },
    findingDiversity: diversity, // REQ-EVAL-9 C-f: inter-arm diversity is a first-class metric
    judgeSecondaryMetrics, // REQ-EVAL-9: qualified LLM judges only (disqualified withheld — AC3)
    judgeDesignChecks: checks, // REQ-EVAL-9 C-a…C-g report-blocking checks (all passed to reach here)
    extractionFidelity: fidelity,
    deviations, // REQ-EVAL-10 deviation log is public
    // published baseline prompt / recipe (REQ-EVAL-18) — only for arms whose config carries published=true.
    publishedBaselines: configs
      .filter((c) => c.config.published)
      .map((c) => ({ arm: c.arm, prompt: c.config.prompt ?? null })),
    consentedExamples: input.consentedExamples ?? [],
  };

  // ---- PRIVATE report: per-draft results (never public). ----
  const privateReport: Record<string, unknown> = {
    waveId,
    perDraft: armMetrics.map((a) => ({ arm: a.arm, perDraft: a.perDraft })),
  };

  // guards — AC5: run the headline-no-pairwise check on the ASSEMBLED per-arm headline objects (not just the
  // constant key list), so a pairwise value smuggled into a headline object is actually caught.
  assertHeadlineNoPairwise(HEADLINE_METRICS as unknown as string[]);
  for (const a of publicArms) assertHeadlineNoPairwise(Object.keys(a.headline));
  assertPublicClean(publicReport); // REQ-EVAL-18

  await exec.query(
    `insert into benchmark_wave_reports (wave_id, public_report, private_report, lift, generated_at)
     values ($1,$2,$3,$4,$5)
     on conflict (wave_id) do update set
       public_report = excluded.public_report, private_report = excluded.private_report,
       lift = excluded.lift, generated_at = excluded.generated_at`,
    [waveId, JSON.stringify(publicReport), JSON.stringify(privateReport), JSON.stringify(lift), deps.clock.now()],
  );

  return { public: publicReport, private: privateReport, lift, arms: armMetrics };
}

// ---- consequence log (REQ-EVAL-16, go/no-go) ----
export type ConsequenceOutcome = "pass" | "miss" | "two_consecutive_misses" | "a1_beats_rhema";

/**
 * Record the pre-committed consequence of a scored wave (REQ-EVAL-16). The outcome + disposition are computed by the
 * caller from the LIFT readout + prior-wave history (`priorMiss` = the immediately-preceding scored wave also missed).
 * This append-only trail is the accountability record the program forbids departing from.
 */
export function classifyConsequence(lift: LiftReadout, opts: { a1BeatsRhema?: boolean; priorMiss?: boolean } = {}): {
  outcome: ConsequenceOutcome;
  disposition: string;
} {
  if (opts.a1BeatsRhema) {
    return {
      outcome: "a1_beats_rhema",
      disposition: "reported internally unspun; the §17 roadmap re-opens (REQ-EVAL-16 symmetric honesty)",
    };
  }
  if (lift.meetsThisWave) {
    return {
      outcome: "pass",
      disposition: "criterion met this wave; a superiority claim ships only after TWO consecutive passing waves (REQ-EVAL-18)",
    };
  }
  if (opts.priorMiss) {
    return {
      outcome: "two_consecutive_misses",
      disposition:
        "editorial-quality thesis treated as falsified at current model capability; protocol R&D spend freezes; " +
        "operator disposes (reposition / shelve Full board / wind-down) — never sell rigor the measurement contradicts (REQ-EVAL-16)",
    };
  }
  return {
    outcome: "miss",
    disposition:
      "superiority marketing stays off; Full-board premium re-justified on second-read contribution or re-priced; " +
      "protocol R&D pivots to the exposed recall gaps; re-test next wave (REQ-EVAL-16)",
  };
}

export async function recordConsequence(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; outcome: ConsequenceOutcome; disposition: string; note?: string },
): Promise<string> {
  const id = deps.ids("bmcons");
  await exec.query(
    `insert into benchmark_consequence_log (id, wave_id, outcome, disposition, note, logged_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [id, input.waveId, input.outcome, input.disposition, input.note ?? null, deps.clock.now()],
  );
  return id;
}
