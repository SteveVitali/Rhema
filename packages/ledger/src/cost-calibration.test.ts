import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  adoptCapMultiplier,
  capFor,
  clampCapMultiplier,
  costCard,
  harvestCostObservations,
  loadEstimatorCells,
  outcomeForRun,
  persistEstimatorCell,
  recomputeCostCards,
  refitCapMultipliers,
  sizeBandFor,
  CAP_BREAKER_MULTIPLIER,
  CAP_REFIT_MIN_SAMPLE,
  CAP_REFIT_TIGHT_MULTIPLIER,
  CAP_REFIT_BASE_MULTIPLIER,
} from "./cost-calibration.js";
import { CAP_MULTIPLIER_FLOOR as REFIT_FLOOR, CAP_MULTIPLIER_CEILING as REFIT_CEILING } from "./estimator-refit.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// ECON.1 — the durable calibration store: harvest → cost cards → per-bucket cap refit → estimator cells.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const PRJ = "prj_seed";
const NOW = new Date("2026-10-05T00:00:00Z");
const deps = () => testEntryDeps(NOW);

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, projectId: PRJ });
});
afterEach(() => db.close());

/** Terminal run + proxy usage rows (+optional committed debits), ending `daysAgo` days before NOW. */
async function seedMeteredRun(args: {
  runId: string;
  state?: string;
  estimate?: number;
  proxyCredits: number;
  proxyUsd: number;
  debits?: number[];
  refunds?: number[];
  words?: number;
  rigor?: string;
  tier?: string;
  delivery?: unknown;
  entitlement?: string | null;
  daysAgo?: number;
}): Promise<void> {
  await seedRun(db, { runId: args.runId, workspaceId: WS, projectId: PRJ });
  await db.pg.query(
    `update runs set state = $2, estimate_credits = $3, ended_at = $4,
        input_snapshot = $5::jsonb, rigor = $6, model_tier = $7,
        delivery = $8::jsonb, entitlement_id = $9
      where id = $1`,
    [
      args.runId,
      args.state ?? "completed",
      args.estimate ?? 500,
      new Date(NOW.getTime() - (args.daysAgo ?? 1) * 86400_000),
      JSON.stringify({ wordCount: args.words ?? 5180 }),
      args.rigor ?? "standard",
      args.tier ?? "base",
      args.delivery != null ? JSON.stringify(args.delivery) : null,
      args.entitlement ?? null,
    ],
  );
  await db.pg.query(
    `insert into usage_records
       (id, ts, workspace_id, billing_account_id, run_id, role, provider, model, model_tier,
        rate_table_version, list_cost_usd, credits, source)
     values ($1, now(), $2, $3, $4, 'editor', 'anthropic', 'claude', $5, 1, $6, $7, 'proxy')`,
    [`u_${args.runId}`, WS, BA, args.runId, args.tier ?? "base", args.proxyUsd, args.proxyCredits],
  );
  for (const [i, d] of (args.debits ?? []).entries()) {
    await db.pg.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
       values ($1,$2,$3,'debit',$4,'included',$5,'test',$6)`,
      [`cl_${args.runId}_d${i}`, WS, BA, d, args.runId, `ik_${args.runId}_d${i}`],
    );
  }
  for (const [i, d] of (args.refunds ?? []).entries()) {
    await db.pg.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, idempotency_key)
       values ($1,$2,$3,'refund',$4,'included',$5,'test',$6)`,
      [`cl_${args.runId}_r${i}`, WS, BA, d, args.runId, `ik_${args.runId}_r${i}`],
    );
  }
}

describe("sizeBandFor / outcomeForRun — the card axes", () => {
  it("bands words; claims band when words are absent; unit for unit-priced work", () => {
    expect(sizeBandFor({ words: 400 })).toBe("xs");
    expect(sizeBandFor({ words: 2000 })).toBe("s");
    expect(sizeBandFor({ words: 8000 })).toBe("m");
    expect(sizeBandFor({ words: 20000 })).toBe("l");
    expect(sizeBandFor({ claims: 3 })).toBe("xs");
    expect(sizeBandFor({})).toBe("unit");
  });

  it("classifies the four outcome paths (Unverified + preflight = platform_fault)", () => {
    expect(outcomeForRun({ state: "completed" })).toBe("completed");
    expect(outcomeForRun({ state: "cancelled" })).toBe("cancelled");
    expect(outcomeForRun({ state: "failed" })).toBe("failed");
    expect(outcomeForRun({ state: "failed", failure: { code: "research_preflight_failed" } })).toBe("platform_fault");
    expect(outcomeForRun({ state: "completed", delivery: { label: "unverified", checkableClaims: 3, coveredClaims: 0 } })).toBe(
      "platform_fault",
    );
  });
});

describe("harvestCostObservations → recomputeCostCards → costCard", () => {
  it("harvests proxy-metered truth + committed net, marking admissibility", async () => {
    // admissible completed run: proxy 720, committed 586 (the D-PRB.21-1 shape — charge < meter)
    await seedMeteredRun({ runId: "run_a", proxyCredits: 720, proxyUsd: 5.14, debits: [586] });
    // cancelled run: metered burn retained as evidence but inadmissible for the fit
    await seedMeteredRun({ runId: "run_b", state: "cancelled", proxyCredits: 231, proxyUsd: 1.65, debits: [0] });
    // trial entitlement: inadmissible (the free-trial pocket isn't cost evidence)
    await seedMeteredRun({ runId: "run_c", proxyCredits: 400, proxyUsd: 2.86, entitlement: "ent_1" });
    // an Unverified delivery: platform_fault outcome + inadmissible (RES.2 — refunded platform fault)
    await seedMeteredRun({
      runId: "run_d",
      proxyCredits: 300,
      proxyUsd: 2.14,
      delivery: { label: "unverified", checkableClaims: 5, coveredClaims: 0 },
    });

    const written = await harvestCostObservations(db.client, deps().ids, { source: "production" });
    expect(written).toBe(4);

    const obs = (
      await db.client.query("select run_id, outcome, proxy_credits, committed_credits, admissible, inadmissible_reason, size_band from cost_observations order by run_id")
    ).rows as { run_id: string; outcome: string; proxy_credits: number; committed_credits: number; admissible: boolean; inadmissible_reason: string | null; size_band: string }[];
    expect(obs.find((o) => o.run_id === "run_a")).toMatchObject({
      outcome: "completed", proxy_credits: 720, committed_credits: 586, admissible: true, size_band: "m",
    });
    expect(obs.find((o) => o.run_id === "run_b")).toMatchObject({ outcome: "cancelled", admissible: false, inadmissible_reason: "not_completed" });
    expect(obs.find((o) => o.run_id === "run_c")).toMatchObject({ outcome: "completed", admissible: false, inadmissible_reason: "trial" });
    expect(obs.find((o) => o.run_id === "run_d")).toMatchObject({ outcome: "platform_fault", admissible: false });

    // recompute the cells — the completed cell folds run_a + run_c (n=2); outcome axes stay distinct.
    const cells = await recomputeCostCards(db.client, "econ1@test", NOW);
    expect(cells).toBe(3); // completed(n=2), cancelled(n=1), platform_fault(n=1)
    const card = await costCard(db.client, { workflow: "review", outcome: "completed" });
    expect(card.map((c) => c.n)).toEqual([2]); // run_a + run_c (cells count outcomes, not admissibility)
    expect(card[0]!.p50Credits).toBe(560); // percentile_cont midpoint of 400, 720
    // the published API resolves a single cell
    const exact = await costCard(db.client, {
      workflow: "review", rigor: "standard", modelTier: "base", sizeBand: "m", outcome: "platform_fault",
    });
    expect(exact).toHaveLength(1);
    expect(exact[0]!.n).toBe(1);
  });

  it("applies the preset-cutover and RES.1-research admissibility predicates (ticket §4)", async () => {
    const cutover = new Date(NOW.getTime() - 3 * 86400_000); // the §6.5 conformance deploy
    const res1 = new Date(NOW.getTime() - 2 * 86400_000);    // RES.1's research-restore deploy
    // a completed paid run ended BEFORE the preset fix → recorded, never cap-fit input
    await seedMeteredRun({ runId: "run_old", proxyCredits: 700, proxyUsd: 5, daysAgo: 5 });
    // post-cutover completed paid run → admissible
    await seedMeteredRun({ runId: "run_new", proxyCredits: 700, proxyUsd: 5, daysAgo: 1 });
    // a post-preset research-bearing run that STILL predates RES.1's restore → pre_res1_research
    await seedMeteredRun({ runId: "run_mid", proxyCredits: 700, proxyUsd: 5, daysAgo: 2.5 });
    await harvestCostObservations(db.client, deps().ids, {
      presetCutover: cutover,
      researchAfter: res1,
      researchWorkflows: ["review"],
    });
    const obs = (
      await db.client.query("select run_id, admissible, inadmissible_reason from cost_observations order by run_id")
    ).rows as { run_id: string; admissible: boolean; inadmissible_reason: string | null }[];
    expect(obs.find((o) => o.run_id === "run_old")).toMatchObject({ admissible: false, inadmissible_reason: "pre_preset_fix" });
    expect(obs.find((o) => o.run_id === "run_mid")).toMatchObject({ admissible: false, inadmissible_reason: "pre_res1_research" });
    expect(obs.find((o) => o.run_id === "run_new")).toMatchObject({ admissible: true });
  });
});

describe("refitCapMultipliers + capFor — the per-bucket cap calibration (REQ-BILL-7)", () => {
  it("p95 < 1.3 drops the bucket multiplier to 1.35 with in-sample reach ≤10% recorded", async () => {
    // 5 admissible runs (the per-bucket min) with metered/estimate ratios 1.20…1.30 — percentile_cont
    // interpolates p95 ≈ 1.298 < 1.3 → REQ-BILL-7 drops the cap multiplier to 1.35 (the 1.29 marker).
    for (const [i, p] of [600, 620, 640, 645, 650].entries()) {
      await seedMeteredRun({ runId: `run_p${i}`, proxyCredits: p, proxyUsd: 4.64, estimate: 500 });
    }
    const written = await harvestCostObservations(db.client, deps().ids, {});
    expect(written).toBe(CAP_REFIT_MIN_SAMPLE);
    const reports = await refitCapMultipliers(db.client, deps(), NOW);
    const r = reports.find((x) => x.sizeBand === "m")!;
    expect(r.adopted).toBe(true);
    expect(r.capMultiplier).toBe(CAP_REFIT_TIGHT_MULTIPLIER); // 1.35 — the REQ-BILL-7 drop level
    // in-sample reach at 1.35: no run's metered burn reaches estimate×1.35 = 675 → 0% ≤ 10% target.
    expect(r.capReachPct).toBe(0);
    expect(r.note).toContain("p95");

    const cap = await capFor(db.client, { workflow: "review", rigor: "standard", modelTier: "base", sizeBand: "m" });
    expect(cap?.capMultiplier).toBe(CAP_REFIT_TIGHT_MULTIPLIER);
  });

  it("p95 ≥ 1.3 holds the 1.5 multiplier (the REQ-BILL-7 1.31 marker)", async () => {
    // ratios 1.28…1.40 → percentile_cont p95 = 1.32 + 0.8×(1.40−1.32) = 1.384 ≥ 1.3 → hold 1.5.
    for (const [i, p] of [640, 650, 655, 660, 700].entries()) {
      await seedMeteredRun({ runId: `run_h${i}`, proxyCredits: p, proxyUsd: 4.64, estimate: 500 });
    }
    await harvestCostObservations(db.client, deps().ids, {});
    const reports = await refitCapMultipliers(db.client, deps(), NOW);
    const r = reports.find((x) => x.sizeBand === "m")!;
    expect(r.adopted).toBe(true);
    expect(r.capMultiplier).toBe(CAP_REFIT_BASE_MULTIPLIER); // 1.5 — the hold level
  });

  it("the 1.25 floor and the 2× breaker bound every adopted value (REQ-BILL-7 / REQ-SPEC-24(5))", () => {
    // REQ-BILL-7's discrete levels: p95 below the threshold drops to 1.35 (never below the 1.25 floor —
    // the clamp binds any future tighter step), at/above it holds 1.5. The refit can never write the
    // 2× breaker — that stays a runtime override (the circuit breaker's own tests cover the trip path).
    expect(adoptCapMultiplier(1.29)).toBe(CAP_REFIT_TIGHT_MULTIPLIER);
    expect(adoptCapMultiplier(1.31)).toBe(CAP_REFIT_BASE_MULTIPLIER);
    expect(clampCapMultiplier(1.1)).toBe(REFIT_FLOOR); // a below-floor step floors at the shared 1.25
    expect(clampCapMultiplier(2.5)).toBe(REFIT_CEILING); // refit-side ceiling is 1.5, never the breaker
    expect(CAP_REFIT_BASE_MULTIPLIER).toBeLessThan(CAP_BREAKER_MULTIPLIER); // 1.5 < 2× breaker
    expect(REFIT_FLOOR).toBe(1.25);
  });

  it("reports but adopts nothing below the per-bucket minimum sample", async () => {
    await seedMeteredRun({ runId: "run_1", proxyCredits: 700, proxyUsd: 5, estimate: 500 });
    await harvestCostObservations(db.client, deps().ids, {});
    const reports = await refitCapMultipliers(db.client, deps(), NOW);
    expect(reports[0]!.adopted).toBe(false);
    expect(reports[0]!.note).toContain("insufficient");
    // capFor falls through: no adopted report → null → the global estimator_config governs.
    expect(await capFor(db.client, { workflow: "review" })).toBeNull();
  });
});

describe("estimator_cells — the durable INSTRUMENTED_OVERRIDES replacement", () => {
  it("persists a folded spec the estimating process boot-loads", async () => {
    const spec = { workflow: "review", provisional: false, source: "instrumented", calibrationScale: 1.31 };
    await persistEstimatorCell(db.client, {
      workflow: "review", spec, measuredAt: NOW, runsBehind: ["run_a", "run_b"],
    });
    const cells = await loadEstimatorCells(db.client);
    expect(cells).toHaveLength(1);
    expect(cells[0]!.workflow).toBe("review");
    expect(cells[0]!.spec).toMatchObject({ source: "instrumented", calibrationScale: 1.31 });
    // upsert is idempotent — a second persist replaces, never duplicates.
    await persistEstimatorCell(db.client, { workflow: "review", spec, measuredAt: NOW, runsBehind: ["run_c"] });
    expect(await loadEstimatorCells(db.client)).toHaveLength(1);
  });
});
