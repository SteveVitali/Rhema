// R6MNY.1 (REQ-LCH-5 a′ + b; GD-BL13.R6) — the prod READ-ONLY money-flip readiness reads over the
// system-role DSN (never the app login — FORCE RLS would read the money tables as empty/$0, the
// STB.5b lesson). Nothing here writes.
//
//   DATABASE_URL   postgres://postgres:…@127.0.0.1:15433/rhema  (system role via the IAP tunnel)
//
// Emits one JSON report on stdout — aggregates only (bucket keys + figures; never a user id, an
// email, or a workspace id — Manifest #10):
//
//   1. cap_calibration_reports — the debit-mode-flip runbook's preconditions 1–2: adopted=true
//      rows must exist for the cells that drive paid surfaces, with in-sample cap_reach_pct ≤ 10%
//      (CAP_REACH_TARGET_PCT). An unmet precondition is a finding for an operator ruling — the
//      report never recommends flipping past it.
//   2. the "what it covers" coverage lines recomputed under the MEASURED estimator specs —
//      estimator_cells are boot-loaded into the override map exactly as api/worker do at boot, so
//      `planCoverageLine(…, surfacePricer())` prices with the instrumented folds, not the shipped
//      modeled base.
//   3. the measured cost-card cross-check: cost_card_cells p95 credits for the essay card's band
//      per tier → the floor of loops the credits actually buy at the p95 — the printed claim must
//      never exceed it ("no plan promises more runs than its credits buy").

import pg from "pg";
import type { SqlClient } from "@rhema/orchestrator";
import {
  CAP_REACH_TARGET_PCT,
  CAP_REFIT_MIN_SAMPLE,
  capFor,
  loadEstimatorCells,
  sizeBandFor,
} from "@rhema/ledger";
import { setInstrumentedOverride, type EstimatorSpec } from "@rhema/protocols";
import { planCoverageLine, PRICING, type ModelTier, type PlanTier } from "@rhema/contracts";
import { surfacePricer } from "@rhema/run-sheet";

function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[money-flip-readiness] missing env ${name}`);
    process.exit(1);
  }
  return v;
}

interface CapReportRow {
  workflow: string;
  rigor: string;
  modelTier: string;
  sizeBand: string;
  sampleRuns: number;
  p95Ratio: number | null;
  capMultiplier: number;
  capReachPct: number | null;
  adopted: boolean;
  computedAt: string;
}

/** The workflows a paying user can launch — the cells whose caps guard real debits. */
const PAID_SURFACES = ["review", "revise", "fact_check", "draft", "profile_voice"] as const;

async function main(): Promise<number> {
  const pool = new pg.Pool({ connectionString: need("DATABASE_URL"), max: 1 });
  const exec: SqlClient = { query: (t, p) => pool.query(t, p as never[]) };
  try {
    // ---- precondition read (a′) -----------------------------------------------------
    const reportRows = (
      await exec.query(
        `select workflow, rigor, model_tier, size_band,
                sample_runs::int, p95_ratio::float, cap_multiplier::float,
                cap_reach_pct::float, adopted, computed_at
           from cap_calibration_reports order by computed_at desc`,
        [],
      )
    ).rows as {
      workflow: string; rigor: string; model_tier: string; size_band: string;
      sample_runs: number; p95_ratio: number | null; cap_multiplier: number;
      cap_reach_pct: number | null; adopted: boolean; computed_at: string;
    }[];
    const rows: CapReportRow[] = reportRows.map((r) => ({
      workflow: r.workflow, rigor: r.rigor, modelTier: r.model_tier, sizeBand: r.size_band,
      sampleRuns: r.sample_runs, p95Ratio: r.p95_ratio, capMultiplier: r.cap_multiplier,
      capReachPct: r.cap_reach_pct, adopted: r.adopted, computedAt: r.computed_at,
    }));
    const adopted = rows.filter((r) => r.adopted);
    // per paid-surface workflow: the adopted multiplier `capFor` would resolve at Standard — the
    // exact lookup the run path's cap sizing performs.
    const surfaceCaps: Record<string, unknown> = {};
    for (const wf of PAID_SURFACES) {
      surfaceCaps[wf] = await capFor(exec, { workflow: wf, rigor: "standard" });
    }
    const adoptedReach = adopted
      .map((r) => r.capReachPct)
      .filter((v): v is number => v != null);
    const preconditions = {
      reports: rows.length,
      adopted: adopted.length,
      adoptedForPaidSurfaces: PAID_SURFACES.filter((w) =>
        adopted.some((r) => r.workflow === w),
      ),
      adoptedReachPctMax: adoptedReach.length ? Math.max(...adoptedReach) : null,
      // precondition 1: adopted rows exist for the cells that drive paid surfaces.
      precondition1_met:
        adopted.length > 0 &&
        PAID_SURFACES.every((w) => adopted.some((r) => r.workflow === w)),
      // precondition 2: in-sample cap reach ≤ 10% on the adopted buckets.
      precondition2_met:
        adoptedReach.length > 0 &&
        adoptedReach.every((v) => v <= CAP_REACH_TARGET_PCT),
      surfaceCaps,
      minSample: CAP_REFIT_MIN_SAMPLE,
      reachTargetPct: CAP_REACH_TARGET_PCT,
      rows,
    };

    // ---- the measured what-it-covers recompute (b) -----------------------------------
    const cells = await loadEstimatorCells(exec);
    for (const c of cells) setInstrumentedOverride(c.workflow, c.spec as EstimatorSpec);
    const price = surfacePricer();
    const essay = PRICING.costCardShapes.find((s) => s.key === "essay")!;
    const essayBand = sizeBandFor({ words: essay.words, claims: essay.claims });
    const gatedTiers = (Object.keys(PRICING.plans) as PlanTier[]).filter(
      (t) => PRICING.plans[t].whatItCoversClaimId != null,
    );
    const measuredCells = (
      await exec.query(
        `select rigor, model_tier, size_band, outcome, n::int,
                p50_credits::float, p95_credits::float
           from cost_card_cells where workflow = 'review' order by model_tier, size_band`,
        [],
      )
    ).rows as {
      rigor: string; model_tier: string; size_band: string; outcome: string; n: number;
      p50_credits: number | null; p95_credits: number | null;
    }[];
    const coverage = gatedTiers.map((tier) => {
      const plan = PRICING.plans[tier];
      const printed = planCoverageLine(tier, price);
      // the line renders one ≈N per allowed tier, in modelTiers order — zip, don't re-parse.
      const printedLoopsAll = printed
        ? [...printed.matchAll(/≈([\d.]+)/g)].map((m) => Number(m[1]))
        : [];
      const perTier = plan.modelTiers.map((mt: ModelTier, i: number) => {
        const cell = measuredCells.find(
          (c) =>
            c.rigor === "standard" && c.model_tier === mt &&
            c.size_band === essayBand && c.outcome === "completed",
        );
        const printedLoops = printedLoopsAll[i] ?? null;
        const p95 = cell?.p95_credits ?? null;
        return {
          modelTier: mt,
          printedLoops,
          // the honest floor: included / measured p95 credits, floored to the printed convention.
          measuredLoopsFloor:
            p95 != null && p95 > 0
              ? Math.floor((plan.includedCreditsMonthly / p95) * 10) / 10
              : null,
          cellRuns: cell?.n ?? 0,
          p95Credits: p95,
        };
      });
      return {
        tier,
        includedCreditsMonthly: plan.includedCreditsMonthly,
        printed,
        perTier,
        // never over-promise: every printed figure ≤ the measured floor for its tier.
        overPromises: perTier.some(
          (t) => t.printedLoops != null && t.measuredLoopsFloor != null && t.printedLoops > t.measuredLoopsFloor,
        ),
      };
    });

    const report = {
      readAt: new Date().toISOString(),
      estimatorCellsLoaded: cells.map((c) => c.workflow),
      calibrations: preconditions,
      coverage,
      note: "read-only; counts + figures only — no PII; an unmet precondition is a finding, never flipped past",
    };
    console.log(JSON.stringify(report, null, 2));
    return 0;
  } finally {
    await pool.end();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error("[money-flip-readiness] failed:", err);
    process.exit(1);
  });
