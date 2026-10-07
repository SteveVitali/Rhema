// ECON.1 (REQ-SPEC-32(a) "charge what we meter"; REQ-BILL-7 "calibrate before charging"; ADR-032) —
// the durable calibration store's read/write seam. Replaces the process-local `INSTRUMENTED_OVERRIDES`
// map as the SOURCE OF TRUTH: `cost_observations` holds one row per admissible proxy-metered leg,
// `cost_card_cells` the derived workflow × rigor × tier × size-band × outcome cards,
// `cap_calibration_reports` the per-bucket cap-refit evidence (p95 ratio → adopted multiplier, with the
// ≤10% in-sample cap-reach target asserted), and `estimator_cells` the folded estimator specs the API
// reads override-first. User role SELECTs; only the system pool writes (migration 0049 — the same
// posture estimator_fits/estimator_config got under SEC.1).
//
// The meter of record is `usage_records.source='proxy'` — proxy credits AND proxy list-cost USD, never
// the sdk_estimate/sdk_stream twins (D-A: the twins are cross-checks, not spend).

import type { SqlClient, IdFactory } from "@rhema/orchestrator";
import { deliveryLabelFromRow, DELIVERY_LABEL_UNVERIFIED } from "@rhema/contracts";
import { CAP_MULTIPLIER_FLOOR, CAP_MULTIPLIER_CEILING } from "./estimator-refit.js";

/** The metered size bands (ECON.1): word-priced cells bucket by the run's input word count; work that
 *  has no word basis (chat_turn, figure iterate, research_burst) lands in 'unit' — one row per unit. */
export type SizeBand = "xs" | "s" | "m" | "l" | "unit";
export const SIZE_BAND_LIMITS = { xs: 1000, s: 4000, m: 12000 } as const;

export function sizeBandFor(inputs: { readonly words?: number | null; readonly claims?: number | null }): SizeBand {
  const words = inputs.words;
  if (typeof words !== "number" || !Number.isFinite(words)) {
    // claim-priced input without a word count still bands (a 25-claim draft ≈ 'm'-sized work).
    const claims = inputs.claims;
    if (typeof claims !== "number") return "unit";
    if (claims <= 4) return "xs";
    if (claims <= 16) return "s";
    if (claims <= 48) return "m";
    return "l";
  }
  if (words < SIZE_BAND_LIMITS.xs) return "xs";
  if (words < SIZE_BAND_LIMITS.s) return "s";
  if (words < SIZE_BAND_LIMITS.m) return "m";
  return "l";
}

/** The cost card's outcome axis — completed / cancelled / failed / platform-fault paths are distinct cells. */
export type RunOutcome = "completed" | "cancelled" | "failed" | "platform_fault";

/**
 * Classify a run's outcome for the card's outcome axis. `platform_fault` covers the two settled
 * platform-fault classes: an Unverified delivery (RES.2 — zero-coverage, refunded under
 * `platform_fault:*`) and a research-preflight failure (RES.1 — the harness never reached tools).
 */
export function outcomeForRun(run: {
  readonly state: string;
  readonly delivery?: unknown;
  readonly failure?: unknown;
}): RunOutcome {
  if (run.state === "completed" && deliveryLabelFromRow(run.delivery) === DELIVERY_LABEL_UNVERIFIED) {
    return "platform_fault";
  }
  if (run.state === "failed") {
    const code =
      run.failure != null && typeof run.failure === "object"
        ? (run.failure as { code?: unknown }).code
        : undefined;
    if (code === "research_preflight_failed") return "platform_fault";
    return "failed";
  }
  if (run.state === "cancelled") return "cancelled";
  return "completed";
}

export interface CostObservation {
  readonly runId: string;
  readonly workspaceId: string;
  readonly workflow: string;
  readonly rigor: string;
  readonly modelTier: string;
  readonly sizeBand: SizeBand;
  readonly outcome: RunOutcome;
  readonly proxyCredits: number;
  readonly proxyListCostUsd: number;
  readonly committedCredits: number;
  readonly estimateCredits?: number;
  readonly words?: number;
  readonly claims?: number;
  readonly phases?: number;
  readonly admissible: boolean;
  readonly inadmissibleReason?: string;
  readonly source: "production" | "stage_b" | "synthetic";
  readonly measuredAt: Date;
}

/** Upsert an observation (reharvest-safe: the run is re-classified as later truth lands). */
export async function recordCostObservation(exec: SqlClient, ids: IdFactory, o: CostObservation): Promise<void> {
  await exec.query(
    `insert into cost_observations
       (id, run_id, workspace_id, workflow, rigor, model_tier, size_band, outcome,
        proxy_credits, proxy_list_cost_usd, committed_credits, estimate_credits,
        words, claims, phases, admissible, inadmissible_reason, source, measured_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     on conflict (run_id) do update set
       outcome = excluded.outcome, proxy_credits = excluded.proxy_credits,
       proxy_list_cost_usd = excluded.proxy_list_cost_usd, committed_credits = excluded.committed_credits,
       admissible = excluded.admissible, inadmissible_reason = excluded.inadmissible_reason,
       measured_at = excluded.measured_at`,
    [
      ids("obs"), o.runId, o.workspaceId, o.workflow, o.rigor, o.modelTier, o.sizeBand, o.outcome,
      o.proxyCredits, o.proxyListCostUsd, o.committedCredits, o.estimateCredits ?? null,
      o.words ?? null, o.claims ?? null, o.phases ?? null,
      o.admissible, o.inadmissibleReason ?? null, o.source, o.measuredAt,
    ],
  );
}

/**
 * Harvest terminal runs into `cost_observations`: proxy-metered truth (meter of record), net committed
 * debits (the divergence datum), and the admissibility verdict an estimator/cap fit applies
 * (completed + not Unverified + not a trial entitlement + actually metered).
 */
export async function harvestCostObservations(
  exec: SqlClient,
  ids: IdFactory,
  args: {
    readonly source?: CostObservation["source"];
    readonly limit?: number;
    /**
     * ECON.1 admissibility (ticket §4): a cap-driving observation must have run on the CURRENT
     * presets — runs ended before this cutover (the §6.5 conformance deploy) are recorded as
     * evidence but marked `pre_preset_fix` so the refit never fits stale behavior. The cutover is
     * wall-clock truth: instrumented Stage-B legs qualify simply by ending after it.
     */
    readonly presetCutover?: Date;
    /**
     * ECON.1 admissibility: a research-bearing run (its workflow has research-class phases) only
     * counts if it ended after RES.1's research restore (`researchAfter`); earlier research legs
     * ran zero-coverage and are marked `pre_res1_research`.
     */
    readonly researchAfter?: Date;
    readonly researchWorkflows?: readonly string[];
  } = {},
): Promise<number> {
  const rows = (
    await exec.query(
      `select r.id, r.workspace_id, r.workflow, coalesce(r.rigor,'standard') as rigor,
              coalesce(r.model_tier,'base') as model_tier, r.state, r.delivery, r.failure,
              r.estimate_credits, r.input_snapshot, r.ended_at, r.entitlement_id,
              coalesce(u.proxy_credits,0)::int as proxy_credits,
              coalesce(u.proxy_usd,0)::float as proxy_usd,
              coalesce(l.net,0)::int as net_debits
         from runs r
         left join (
           select run_id, sum(credits) as proxy_credits, sum(list_cost_usd) as proxy_usd
             from usage_records where source = 'proxy' group by run_id
         ) u on u.run_id = r.id
         left join (
           select run_id,
                  sum(case when kind = 'debit' then credits when kind = 'refund' then -credits else 0 end) as net
             from credit_ledger group by run_id
         ) l on l.run_id = r.id
        where r.state in ('completed','cancelled','failed') and r.ended_at is not null
          and not exists (select 1 from cost_observations o where o.run_id = r.id)
        order by r.ended_at asc
        limit $1`,
      [args.limit ?? 500],
    )
  ).rows as {
    id: string; workspace_id: string; workflow: string; rigor: string; model_tier: string;
    state: string; delivery: unknown; failure: unknown; estimate_credits: number | null;
    input_snapshot: { wordCount?: number; claimCount?: number } | string | null;
    ended_at: string; entitlement_id: string | null;
    proxy_credits: number; proxy_usd: number; net_debits: number;
  }[];

  let written = 0;
  for (const r of rows) {
    const snap = typeof r.input_snapshot === "string" ? JSON.parse(r.input_snapshot) : (r.input_snapshot ?? {});
    const outcome = outcomeForRun({ state: r.state, delivery: r.delivery, failure: r.failure });
    const endedAt = new Date(r.ended_at);
    const researchBearing = args.researchWorkflows?.includes(r.workflow) ?? false;
    let inadmissible: string | null = null;
    if (outcome !== "completed") inadmissible = "not_completed";
    else if (r.entitlement_id != null) inadmissible = "trial";
    else if (r.proxy_credits <= 0) inadmissible = "no_proxy_rows";
    else if (args.presetCutover != null && endedAt < args.presetCutover) inadmissible = "pre_preset_fix";
    else if (researchBearing && args.researchAfter != null && endedAt < args.researchAfter)
      inadmissible = "pre_res1_research";
    await recordCostObservation(exec, ids, {
      runId: r.id,
      workspaceId: r.workspace_id,
      workflow: r.workflow,
      rigor: r.rigor,
      modelTier: r.model_tier,
      sizeBand: sizeBandFor({ words: snap.wordCount, claims: snap.claimCount }),
      outcome,
      proxyCredits: r.proxy_credits,
      proxyListCostUsd: r.proxy_usd,
      committedCredits: r.net_debits,
      estimateCredits: r.estimate_credits ?? undefined,
      words: typeof snap.wordCount === "number" ? snap.wordCount : undefined,
      claims: typeof snap.claimCount === "number" ? snap.claimCount : undefined,
      admissible: inadmissible == null,
      inadmissibleReason: inadmissible ?? undefined,
      source: args.source ?? "production",
      measuredAt: endedAt,
    });
    written += 1;
  }
  return written;
}

/** A cost-card cell (the published `costCard` API — the estimator + price surfaces read these). */
export interface CostCardCell {
  readonly workflow: string;
  readonly rigor: string;
  readonly modelTier: string;
  readonly sizeBand: string;
  readonly outcome: RunOutcome;
  readonly n: number;
  readonly p50Credits: number | null;
  readonly p95Credits: number | null;
  readonly p50Usd: number | null;
  readonly p95Usd: number | null;
  readonly fitVersion: string;
  readonly computedAt: Date;
}

/** Recompute every card cell from the observations (`fit_version` marks the producing recompute). */
export async function recomputeCostCards(exec: SqlClient, fitVersion: string, now: Date): Promise<number> {
  const res = await exec.query(
    `insert into cost_card_cells
       (workflow, rigor, model_tier, size_band, outcome, n,
        p50_credits, p95_credits, p50_usd, p95_usd, fit_version, computed_at)
     select workflow, rigor, model_tier, size_band, outcome, count(*)::int,
            percentile_cont(0.5)  within group (order by proxy_credits),
            percentile_cont(0.95) within group (order by proxy_credits),
            percentile_cont(0.5)  within group (order by proxy_list_cost_usd),
            percentile_cont(0.95) within group (order by proxy_list_cost_usd),
            $1, $2
       from cost_observations
      group by workflow, rigor, model_tier, size_band, outcome
     on conflict (workflow, rigor, model_tier, size_band, outcome) do update set
       n = excluded.n, p50_credits = excluded.p50_credits, p95_credits = excluded.p95_credits,
       p50_usd = excluded.p50_usd, p95_usd = excluded.p95_usd,
       fit_version = excluded.fit_version, computed_at = excluded.computed_at
     returning workflow`,
    [fitVersion, now],
  );
  return res.rows.length;
}

/** Read cost-card cells — the published API downstream pricing surfaces consume (ECON.1). */
export async function costCard(
  exec: SqlClient,
  key: {
    readonly workflow: string;
    readonly rigor?: string;
    readonly modelTier?: string;
    readonly sizeBand?: string;
    readonly outcome?: RunOutcome;
  },
): Promise<CostCardCell[]> {
  const conds: string[] = ["workflow = $1"];
  const params: unknown[] = [key.workflow];
  for (const [col, v] of [
    ["rigor", key.rigor],
    ["model_tier", key.modelTier],
    ["size_band", key.sizeBand],
    ["outcome", key.outcome],
  ] as const) {
    if (v != null) {
      params.push(v);
      conds.push(`${col} = $${params.length}`);
    }
  }
  const rows = (
    await exec.query(
      `select workflow, rigor, model_tier, size_band, outcome, n::int,
              p50_credits::float, p95_credits::float, p50_usd::float, p95_usd::float,
              fit_version, computed_at
         from cost_card_cells where ${conds.join(" and ")}`,
      params,
    )
  ).rows as {
    workflow: string; rigor: string; model_tier: string; size_band: string; outcome: RunOutcome;
    n: number; p50_credits: number | null; p95_credits: number | null;
    p50_usd: number | null; p95_usd: number | null; fit_version: string; computed_at: string;
  }[];
  return rows.map((r) => ({
    workflow: r.workflow,
    rigor: r.rigor,
    modelTier: r.model_tier,
    sizeBand: r.size_band,
    outcome: r.outcome,
    n: r.n,
    p50Credits: r.p50_credits,
    p95Credits: r.p95_credits,
    p50Usd: r.p50_usd,
    p95Usd: r.p95_usd,
    fitVersion: r.fit_version,
    computedAt: new Date(r.computed_at),
  }));
}

// ---- per-bucket cap refit (REQ-BILL-7): p95 metered/estimate → adopted multiplier ----------------------

export const CAP_REACH_TARGET_PCT = 10; // in-sample cap reach must stay ≤10% under metered replay
export const CAP_BREAKER_MULTIPLIER = 2; // the absorbed-overrun circuit breaker (unchanged)
export const CAP_REFIT_MIN_SAMPLE = 5;   // per-bucket evidence floor (cells are narrower than the global fit)
/** REQ-BILL-7 — the per-bucket adaptation is the spec's discrete rule, NOT a free fit: the bucket's
 *  multiplier holds 1.5 while the p95 metered/estimate ratio is ≥ 1.3, drops to 1.35 once evidence shows
 *  headroom, and the shared 1.25 floor bounds every further step. The 2× breaker stays a runtime override
 *  (REQ-SPEC-24(5)) — the refit never writes it. */
export const CAP_REFIT_P95_THRESHOLD = 1.3;
export const CAP_REFIT_BASE_MULTIPLIER = CAP_MULTIPLIER_CEILING; // 1.5 — the hold level
export const CAP_REFIT_TIGHT_MULTIPLIER = 1.35;                  // the drop level once p95 < 1.3
/** REQ-BILL-7's evidence window ("the trailing-30-day p95") — the per-bucket refit reads only
 *  observations measured inside it (ADR-032: 30 days per the spec row; the global weekly refit's
 *  28-day window is a separate, older knob on the singleton). */
export const CAP_REFIT_WINDOW_DAYS = 30;

/** Every adopted multiplier passes the REQ-BILL-7 bounds: floor 1.25 ("never below"), ceiling 1.5 —
 *  the 2× breaker is a runtime override the refit never writes (REQ-SPEC-24(5)). */
export function clampCapMultiplier(v: number): number {
  return Math.min(CAP_MULTIPLIER_CEILING, Math.max(CAP_MULTIPLIER_FLOOR, v));
}

/** REQ-BILL-7's adopted multiplier for one bucket's p95 metered/estimate evidence. */
export function adoptCapMultiplier(p95Ratio: number): number {
  return clampCapMultiplier(
    p95Ratio < CAP_REFIT_P95_THRESHOLD ? CAP_REFIT_TIGHT_MULTIPLIER : CAP_REFIT_BASE_MULTIPLIER,
  );
}

export interface CapCalibrationReport {
  readonly id: string;
  readonly workflow: string;
  readonly rigor: string;
  readonly modelTier: string;
  readonly sizeBand: string;
  readonly sampleRuns: number;
  readonly p95Ratio: number | null;
  readonly capMultiplier: number;
  readonly capReachPct: number | null;
  readonly adopted: boolean;
  readonly note: string;
  readonly computedAt: Date;
}

/**
 * Refit per-bucket cap multipliers from admissible observations (REQ-BILL-7). For each
 * (workflow × rigor × tier × size-band) bucket the p95 metered/estimate ratio decides between the
 * spec's two levels — hold `CAP_REFIT_BASE_MULTIPLIER` (1.5) while p95 ≥ 1.3, drop to
 * `CAP_REFIT_TIGHT_MULTIPLIER` (1.35) once p95 < 1.3 — floored at 1.25 and never written at the 2×
 * breaker (that override stays runtime, REQ-SPEC-24(5)). The report asserts the in-sample cap-reach —
 * the share of bucket runs whose metered burn would have hit `estimate × multiplier` — which must
 * stay ≤10%. Below `CAP_REFIT_MIN_SAMPLE` the bucket reports "insufficient" and adopts nothing (the
 * global `estimator_config` multiplier keeps governing).
 */
export async function refitCapMultipliers(
  exec: SqlClient,
  deps: { ids: IdFactory },
  now: Date,
): Promise<CapCalibrationReport[]> {
  const since = new Date(now.getTime() - CAP_REFIT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const rows = (
    await exec.query(
      `select workflow, rigor, model_tier, size_band,
              count(*)::int as n,
              percentile_cont(0.95) within group (order by proxy_credits::float / estimate_credits) as p95_ratio
         from cost_observations
        where admissible and estimate_credits is not null and estimate_credits > 0
          and measured_at >= $1 and measured_at <= $2
        group by workflow, rigor, model_tier, size_band`,
      [since, now],
    )
  ).rows as {
    workflow: string; rigor: string; model_tier: string; size_band: string;
    n: number; p95_ratio: number | null;
  }[];

  const reports: CapCalibrationReport[] = [];
  for (const b of rows) {
    const p95 = b.p95_ratio != null ? Number(b.p95_ratio) : null;
    // REQ-BILL-7's discrete rule: hold 1.5 while p95 ≥ 1.3, else 1.35 — floored 1.25, capped 1.5.
    // Insufficient samples adopt nothing but still report (the global estimator_config governs).
    const adopted =
      b.n >= CAP_REFIT_MIN_SAMPLE && p95 != null ? adoptCapMultiplier(p95) : null;
    // in-sample reach under the adopted (or floor) multiplier
    const reachRows = adopted != null
      ? ((await exec.query(
          `select 100.0 * count(*) filter (where proxy_credits >= estimate_credits * $5::numeric) / count(*)::float as pct
             from cost_observations
            where admissible and estimate_credits > 0
              and workflow = $1 and rigor = $2 and model_tier = $3 and size_band = $4
              and measured_at >= $6 and measured_at <= $7`,
          [b.workflow, b.rigor, b.model_tier, b.size_band, String(adopted), since, now],
        )).rows[0] as { pct: number | null })
      : null;
    const id = deps.ids("capr");
    const note =
      adopted == null
        ? `insufficient sample (${b.n} < ${CAP_REFIT_MIN_SAMPLE})`
        : `p95 metered/estimate ${p95!.toFixed(3)} → ${adopted} (floor ${CAP_MULTIPLIER_FLOOR}, breaker ${CAP_BREAKER_MULTIPLIER}×); reach ${reachRows?.pct != null ? Number(reachRows.pct).toFixed(1) : "?"}% ≤ ${CAP_REACH_TARGET_PCT}% target`;
    await exec.query(
      `insert into cap_calibration_reports
         (id, workflow, rigor, model_tier, size_band, sample_runs, p95_ratio, cap_multiplier,
          cap_reach_pct, adopted, note, computed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id, b.workflow, b.rigor, b.model_tier, b.size_band, b.n, p95,
        adopted ?? CAP_MULTIPLIER_FLOOR, reachRows?.pct ?? null, adopted != null, note, now,
      ],
    );
    reports.push({
      id, workflow: b.workflow, rigor: b.rigor, modelTier: b.model_tier, sizeBand: b.size_band,
      sampleRuns: b.n, p95Ratio: p95, capMultiplier: adopted ?? CAP_MULTIPLIER_FLOOR,
      capReachPct: reachRows?.pct ?? null, adopted: adopted != null, note, computedAt: now,
    });
  }
  return reports;
}

/**
 * The calibrated cap multiplier for a run's bucket — the latest ADOPTED report for the exact cell, else
 * the latest adopted report for the workflow at any band (evidence thins out per-cell), else null
 * (the caller falls back to the global `estimator_config` singleton — 1.5 until the global refit moves).
 */
export async function capFor(
  exec: SqlClient,
  key: { readonly workflow: string; readonly rigor?: string; readonly modelTier?: string; readonly sizeBand?: string },
): Promise<{ readonly capMultiplier: number; readonly bucket: string } | null> {
  const exact = (
    await exec.query(
      `select cap_multiplier::float as m, workflow||'/'||rigor||'/'||model_tier||'/'||size_band as bucket
         from cap_calibration_reports
        where adopted and workflow = $1
          and ($2::text is null or rigor = $2)
          and ($3::text is null or model_tier = $3)
          and ($4::text is null or size_band = $4)
        order by computed_at desc limit 1`,
      [key.workflow, key.rigor ?? null, key.modelTier ?? null, key.sizeBand ?? null],
    )
  ).rows[0] as { m: number; bucket: string } | undefined;
  if (exact) return { capMultiplier: exact.m, bucket: exact.bucket };
  const wf = (
    await exec.query(
      `select cap_multiplier::float as m, workflow||'/'||rigor||'/'||model_tier||'/'||size_band as bucket
         from cap_calibration_reports
        where adopted and workflow = $1
        order by computed_at desc limit 1`,
      [key.workflow],
    )
  ).rows[0] as { m: number; bucket: string } | undefined;
  return wf ? { capMultiplier: wf.m, bucket: wf.bucket } : null;
}

// ---- estimator cells: the durable INSTRUMENTED_OVERRIDES replacement ----------------------------------

/**
 * Persist a folded estimator spec (the worker's reconcile fold + the calibration sweep write here;
 * `spec` is stored verbatim as JSONB so @rhema/ledger never needs the protocols type).
 */
export async function persistEstimatorCell(
  exec: SqlClient,
  args: { readonly workflow: string; readonly spec: unknown; readonly measuredAt: Date; readonly runsBehind: readonly string[] },
): Promise<void> {
  await exec.query(
    `insert into estimator_cells (workflow, spec, runs_behind, measured_at, updated_at)
     values ($1,$2,$3,$4,$5)
     on conflict (workflow) do update set
       spec = excluded.spec, runs_behind = excluded.runs_behind,
       measured_at = excluded.measured_at, updated_at = excluded.updated_at`,
    [args.workflow, JSON.stringify(args.spec), args.runsBehind, args.measuredAt, new Date()],
  );
}

/** Read the durable estimator cells (the API/worker boot-load — `setInstrumentedOverride` consumes). */
export async function loadEstimatorCells(
  exec: SqlClient,
): Promise<{ readonly workflow: string; readonly spec: unknown }[]> {
  const rows = (
    await exec.query(`select workflow, spec from estimator_cells order by workflow`, [])
  ).rows as { workflow: string; spec: unknown }[];
  return rows;
}
