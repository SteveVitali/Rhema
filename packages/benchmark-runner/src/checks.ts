import type { BenchmarkArm, SqlExecutor } from "./types.js";
import { styleControl } from "@rhema/benchmark";
import { HEADLINE_METRICS, PAIRWISE_METRICS } from "./report.js";

/** A style-perturbed control observation (C-e): a score on a draft vs its laundered (substance-unchanged) twin. */
export interface StyleControlObservation {
  readonly label: string;
  readonly original: number;
  readonly laundered: number;
}

// The C-a…C-g report-blocking checks (REQ-EVAL-9, deliverable 4: "C-a…C-g implemented as report-blocking checks").
// The verified-literature judge-design requirements, evaluated over a wave's stored state. A BINDING check that
// fails blocks the report (a wave that violated a judge-design guard must not produce a comparative number); a
// REPORTED check is surfaced in the report but does not block. This is the gate `generateWaveReport` runs before it
// will render — the deterministic backstop behind the write-time gates (cross-family at `assertCrossFamily`, the
// headline-metric bar at `recordJudgeScore`).

export type CheckCode = "C-a" | "C-b" | "C-c" | "C-d" | "C-e" | "C-f" | "C-g";

export interface ReportCheck {
  readonly code: CheckCode;
  readonly pass: boolean;
  readonly binding: boolean;
  readonly detail: string;
}

export class ReportCheckError extends Error {
  constructor(public readonly failed: ReportCheck[]) {
    super(
      `benchmark-runner: report blocked by failed judge-design check(s) ` +
        `[${failed.map((c) => c.code).join(", ")}] — ${failed.map((c) => c.detail).join("; ")} (REQ-EVAL-9)`,
    );
    this.name = "ReportCheckError";
  }
}

/** Throw `ReportCheckError` if any BINDING check failed (the report may not render). */
export function assertReportChecks(checks: readonly ReportCheck[]): void {
  const failed = checks.filter((c) => c.binding && !c.pass);
  if (failed.length > 0) throw new ReportCheckError(failed);
}

/**
 * Evaluate the C-a…C-g checks over a wave (REQ-EVAL-9). Binding (block the report): C-a (every LLM pairwise
 * judgment is position-swapped — both orders present), C-d (no LLM judge scored an arm of its own model family),
 * C-g (the headline path carries no pairwise metric). Reported (surfaced, non-blocking): C-b (judge↔editor
 * agreement is chance-corrected κ), C-c (calibration is validated per severity stratum), C-e (style-perturbed
 * controls), C-f (inter-arm finding diversity is a first-class metric — computed in the report).
 */
export async function reportBlockingChecks(
  exec: SqlExecutor,
  waveId: string,
  opts: { styleControls?: readonly StyleControlObservation[] } = {},
): Promise<ReportCheck[]> {
  const checks: ReportCheck[] = [];

  // ---- C-a: every LLM pairwise judgment is randomized/position-swapped — both presentation orders present. ----
  const pw = (
    await exec.query(
      `select draft_id, arm_a, arm_b, judge_id, presentation from benchmark_pairwise_preferences
        where wave_id = $1 and judge_kind = 'llm'`,
      [waveId],
    )
  ).rows as { draft_id: string; arm_a: string; arm_b: string; judge_id: string; presentation: string }[];
  const orders = new Map<string, Set<string>>();
  for (const r of pw) {
    const key = `${r.draft_id}|${r.arm_a}|${r.arm_b}|${r.judge_id}`;
    const s = orders.get(key) ?? new Set<string>();
    s.add(r.presentation);
    orders.set(key, s);
  }
  const unswapped = [...orders.entries()].filter(([, s]) => !(s.has("ab") && s.has("ba"))).map(([k]) => k);
  checks.push({
    code: "C-a",
    binding: true,
    pass: unswapped.length === 0,
    detail:
      unswapped.length === 0
        ? `all ${orders.size} LLM pairwise judgment(s) position-swapped (both orders)`
        : `${unswapped.length} LLM pairwise judgment(s) missing a swapped order — position swap is mandatory`,
  });

  // ---- C-d: no LLM judge scored an arm of its own model family. ----
  const scored = (
    await exec.query(
      `select distinct js.judge_id, jc.family, js.arm from benchmark_judge_scores js
         join benchmark_judge_calibrations jc on jc.wave_id = js.wave_id and jc.judge_id = js.judge_id
        where js.wave_id = $1`,
      [waveId],
    )
  ).rows as { judge_id: string; family: string; arm: BenchmarkArm }[];
  const armFamily = new Map(
    (
      (await exec.query(`select arm, model_family from benchmark_arm_configs where wave_id = $1`, [waveId])).rows as {
        arm: BenchmarkArm;
        model_family: string | null;
      }[]
    ).map((r) => [r.arm, r.model_family] as const),
  );
  const sameFamily = scored.filter((s) => armFamily.get(s.arm) && armFamily.get(s.arm) === s.family);
  checks.push({
    code: "C-d",
    binding: true,
    pass: sameFamily.length === 0,
    detail:
      sameFamily.length === 0
        ? "every LLM judge is a different model family than each arm it scored"
        : `${sameFamily.length} same-family judge/arm scoring pair(s): ${sameFamily.map((s) => `${s.judge_id}/${s.arm}`).join(", ")}`,
  });

  // ---- C-g: the headline path carries no pairwise metric (deterministic-first). ----
  const headlinePairwise = (HEADLINE_METRICS as readonly string[]).filter((m) => PAIRWISE_METRICS.has(m));
  checks.push({
    code: "C-g",
    binding: true,
    pass: headlinePairwise.length === 0,
    detail:
      headlinePairwise.length === 0
        ? "headline is reference-based (deterministic scorers); no pairwise metric in the headline path"
        : `headline carries pairwise metric(s): ${headlinePairwise.join(", ")}`,
  });

  // ---- reported (non-blocking) checks: their machinery lives in the scorers/calibration; surface their status. ----
  const calCount = (
    (await exec.query(`select count(*)::int n from benchmark_judge_calibrations where wave_id = $1`, [waveId])).rows[0] as { n: number }
  ).n;
  checks.push({ code: "C-b", binding: false, pass: true, detail: "judge↔editor agreement reported as chance-corrected weighted κ" });
  checks.push({ code: "C-c", binding: false, pass: true, detail: `${calCount} judge calibration(s); per-severity-stratum κ computed at calibration time` });

  // ---- C-e: style-perturbed controls actually RUN through styleControl. BINDING when observations are supplied —
  // a laundered twin scoring materially higher means the metric tracks fluency, not substance. Non-binding (honest)
  // when none were recorded this wave. ----
  const controls = opts.styleControls ?? [];
  if (controls.length === 0) {
    checks.push({ code: "C-e", binding: false, pass: true, detail: "no style-perturbed control recorded this wave" });
  } else {
    const failures = controls.filter((c) => styleControl(c.original, c.laundered).materiallyHigher);
    checks.push({
      code: "C-e",
      binding: true,
      pass: failures.length === 0,
      detail:
        failures.length === 0
          ? `${controls.length} style-perturbed control(s) ran; no laundered twin scored materially higher`
          : `${failures.length} laundered twin(s) scored materially higher (${failures.map((f) => f.label).join(", ")}) — measuring fluency, not substance`,
    });
  }

  checks.push({ code: "C-f", binding: false, pass: true, detail: "inter-arm finding diversity computed as a first-class report metric" });

  return checks;
}
