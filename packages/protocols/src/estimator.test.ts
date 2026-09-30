import { afterEach, describe, expect, it } from "vitest";
import {
  ESTIMATORS,
  MODEL_TIER_MULTIPLIERS,
  RIGOR_MULTIPLIERS,
  rigorMultiplier,
  estimateCredits,
  foldInstrumentedRun,
  estimatorsAreProvisional,
  estimatorSpec,
  recordInstrumentedFold,
  resetInstrumentedOverrides,
  type EstimatorSpec,
} from "./estimator.js";

describe("estimator data (§12.2) — provenance", () => {
  it("every shipped estimator is MODELED and PROVISIONAL until an instrumented run replaces it (§16.3 #1)", () => {
    for (const [key, spec] of Object.entries(ESTIMATORS)) {
      expect(spec.source, key).toBe("modeled");
      expect(spec.provisional, key).toBe(true);
      expect(spec.version, key).toMatch(/^modeled/);
    }
    // the ported workflows are still provisional (the price-card / marketing precondition — §16.4)
    expect(estimatorsAreProvisional()).toBe(true);
  });
});

describe("estimateCredits (§12.2 consumer)", () => {
  it("evaluates the base parametric form at Base tier / Standard rigor (multipliers = 1)", () => {
    // review base: intercept 40 + 0.012*w + 24*claims; addends: discourse (90 + 0.006*w) + second_read (0.005*w)
    const spec = ESTIMATORS.review!;
    // includeAddends:false → just the base form
    const base = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "standard", includeAddends: false });
    expect(base).toBe(Math.ceil(40 + 0.012 * 3000 + 24 * 10)); // 40 + 36 + 240 = 316
  });

  it("adds the per-phase addend terms by default (discourse + second read)", () => {
    const spec = ESTIMATORS.review!;
    const withAddends = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "standard" });
    // base 316 + discourse (90 + 0.006*3000=18 → 108) + second_read (0.005*3000=15) = 316+108+15 = 439
    expect(withAddends).toBe(439);
  });

  it("applies the model-tier multiplier (1× / 2.2× / 4.5×)", () => {
    const spec = ESTIMATORS.fact_check!; // base: 20 + 11*claims
    const claims = { claims: 10 }; // base standard = 20 + 110 = 130
    expect(estimateCredits(spec, claims, { tier: "base", rigor: "standard" })).toBe(130);
    expect(estimateCredits(spec, claims, { tier: "balanced", rigor: "standard" })).toBe(Math.ceil(130 * 2.2)); // 286
    expect(estimateCredits(spec, claims, { tier: "frontier", rigor: "standard" })).toBe(Math.ceil(130 * 4.5)); // 585
  });

  it("applies the §6.1 rigor multiplier (Review Quick 0.6× / Full board 1.2×)", () => {
    const spec = ESTIMATORS.review!;
    const std = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "standard", includeAddends: false });
    const quick = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "quick", includeAddends: false });
    const full = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "full_board", includeAddends: false });
    expect(quick).toBe(Math.ceil(std * 0.6));
    expect(full).toBe(Math.ceil(std * 1.2));
  });

  it("selects a named variant (profile_voice quick vs full)", () => {
    const spec = ESTIMATORS.profile_voice!;
    const quick = estimateCredits(spec, { words: 2000 }, { tier: "base", rigor: "standard", variant: "quick" });
    expect(quick).toBe(Math.ceil(40 + 0.09 * 2000)); // 220 — PRB.16b: recalibrated on the live census burn
    const full = estimateCredits(spec, { wordsRead: 5000, piecesRead: 3, holdouts: 1 }, { tier: "base", rigor: "standard", variant: "full" });
    expect(full).toBe(Math.ceil(120 + 0.009 * 5000 + 40 * 3 + 90 * 1)); // 120+45+120+90 = 375
  });

  it("throws when the requested form is absent (profile_voice has no base)", () => {
    expect(() => estimateCredits(ESTIMATORS.profile_voice!, {}, { tier: "base", rigor: "standard" })).toThrow(/no base form/);
  });
});

describe("rigorMultiplier + RIGOR_MULTIPLIERS", () => {
  it("states the §6.1 values for ported workflows; defaults to 1.0 elsewhere", () => {
    expect(RIGOR_MULTIPLIERS.review).toEqual({ quick: 0.6, standard: 1, full_board: 1.2 });
    expect(RIGOR_MULTIPLIERS.revise).toEqual({ quick: 0.55, standard: 1, full_board: 1.25 });
    expect(rigorMultiplier("review", "quick")).toBe(0.6);
    expect(rigorMultiplier("fact_check", "quick")).toBe(1); // unlisted → 1.0
    expect(rigorMultiplier("review", "standard")).toBe(1);
  });
  it("MODEL_TIER_MULTIPLIERS are the canonical 1 / 2.2 / 4.5", () => {
    expect(MODEL_TIER_MULTIPLIERS).toEqual({ base: 1, balanced: 2.2, frontier: 4.5 });
  });
});

describe("foldInstrumentedRun (§16.3 #1 — measured replaces provisional)", () => {
  it("calibrates the modeled shape to the measured anchor and marks the spec instrumented", () => {
    const spec = ESTIMATORS.fact_check!; // base standard tier=base: 20 + 11*claims
    const inputs = { claims: 10 }; // modeled prediction = 130
    const predicted = estimateCredits(spec, inputs, { tier: "base", rigor: "standard" });
    expect(predicted).toBe(130);

    const measured = 156; // a real proxy-metered run came in 20% higher than the model
    const folded = foldInstrumentedRun(spec, {
      runId: "run_fc_1", tier: "base", rigor: "standard", inputs, measuredCredits: measured,
      measuredAt: "2026-09-03T00:00:00Z",
    });
    expect(folded.provisional).toBe(false);
    expect(folded.source).toBe("instrumented");
    expect(folded.version).toBe("instrumented@2026-09-03");
    expect(folded.runsBehind).toEqual(["run_fc_1"]);
    expect(folded.measuredAt).toBe("2026-09-03T00:00:00Z");
    // the folded spec now reproduces the measured credits at the same inputs
    expect(estimateCredits(folded, inputs, { tier: "base", rigor: "standard" })).toBe(measured);
  });

  it("records phase-aware cache economics (review 13 F8) when captured", () => {
    const spec = ESTIMATORS.review!;
    const folded = foldInstrumentedRun(spec, {
      runId: "run_rev_1", tier: "base", rigor: "standard", inputs: { words: 3000, claims: 10 },
      measuredCredits: 500, measuredAt: new Date("2026-09-03T00:00:00Z"),
      cacheEconomics: { cacheWritePerPhase: 12, cacheReadFraction: 0.35 },
    });
    expect(folded.cacheEconomics).toEqual({ cacheWritePerPhase: 12, cacheReadFraction: 0.35 });
  });

  it("does not mutate the input spec (pure fold)", () => {
    const spec = ESTIMATORS.fact_check!;
    foldInstrumentedRun(spec, { runId: "r", tier: "base", rigor: "standard", inputs: { claims: 5 }, measuredCredits: 100, measuredAt: "2026-09-03" });
    expect(spec.provisional).toBe(true);
    expect(spec.source).toBe("modeled");
  });

  it("composes multiple runs (each folds toward its own measured anchor)", () => {
    const spec: EstimatorSpec = ESTIMATORS.fact_check!;
    const inputs = { claims: 10 };
    const once = foldInstrumentedRun(spec, { runId: "r1", tier: "base", rigor: "standard", inputs, measuredCredits: 150, measuredAt: "2026-09-03" });
    const twice = foldInstrumentedRun(once, { runId: "r2", tier: "base", rigor: "standard", inputs, measuredCredits: 200, measuredAt: "2026-09-04" });
    expect(twice.runsBehind).toEqual(["r1", "r2"]);
    expect(estimateCredits(twice, inputs, { tier: "base", rigor: "standard" })).toBe(200);
  });
});

describe("instrumented-fold registry (§16.3 #1 live call-site — P0.15k)", () => {
  afterEach(() => resetInstrumentedOverrides());

  it("estimatorSpec returns the shipped modeled base until an override is recorded", () => {
    expect(estimatorSpec("fact_check")).toBe(ESTIMATORS.fact_check);
    expect(estimatorSpec("nonexistent")).toBeUndefined();
    expect(estimatorsAreProvisional()).toBe(true);
  });

  it("recordInstrumentedFold flips estimatorsAreProvisional() to false for the ported workflows (AC2 mechanism)", () => {
    // one instrumented run per ported workflow — the shape driveLiveExit records live.
    recordInstrumentedFold("review", { runId: "r_rev", tier: "base", rigor: "standard", inputs: { words: 3000, claims: 10 }, measuredCredits: 500, measuredAt: "2026-09-11" });
    recordInstrumentedFold("revise", { runId: "r_revise", tier: "base", rigor: "standard", inputs: { words: 3000, findings: 5 }, measuredCredits: 300, measuredAt: "2026-09-11" });
    recordInstrumentedFold("fact_check", { runId: "r_fc", tier: "base", rigor: "standard", inputs: { claims: 10 }, measuredCredits: 156, measuredAt: "2026-09-11" });
    recordInstrumentedFold("profile_voice", { runId: "r_pv", tier: "base", rigor: "standard", variant: "full", inputs: { wordsRead: 5000, piecesRead: 3, holdouts: 1 }, measuredCredits: 400, measuredAt: "2026-09-11" });

    expect(estimatorsAreProvisional()).toBe(false);
    const folded = estimatorSpec("fact_check")!;
    expect(folded.provisional).toBe(false);
    expect(folded.source).toBe("instrumented");
    // the override reproduces the measured anchor
    expect(estimateCredits(folded, { claims: 10 }, { tier: "base", rigor: "standard" })).toBe(156);
  });

  it("records the measured phase-aware cache economics on the override (review 13 F8)", () => {
    recordInstrumentedFold("review", {
      runId: "r_rev", tier: "base", rigor: "standard", inputs: { words: 3000, claims: 10 },
      measuredCredits: 500, measuredAt: "2026-09-11",
      cacheEconomics: { cacheWritePerPhase: 14, cacheReadFraction: 0.4 },
    });
    expect(estimatorSpec("review")!.cacheEconomics).toEqual({ cacheWritePerPhase: 14, cacheReadFraction: 0.4 });
  });

  it("composes across recorded folds (a second run further calibrates) and does not mutate ESTIMATORS", () => {
    recordInstrumentedFold("fact_check", { runId: "r1", tier: "base", rigor: "standard", inputs: { claims: 10 }, measuredCredits: 150, measuredAt: "2026-09-11" });
    recordInstrumentedFold("fact_check", { runId: "r2", tier: "base", rigor: "standard", inputs: { claims: 10 }, measuredCredits: 200, measuredAt: "2026-09-12" });
    const spec = estimatorSpec("fact_check")!;
    expect(spec.runsBehind).toEqual(["r1", "r2"]);
    expect(estimateCredits(spec, { claims: 10 }, { tier: "base", rigor: "standard" })).toBe(200);
    // the shipped module const is untouched
    expect(ESTIMATORS.fact_check!.provisional).toBe(true);
    expect(ESTIMATORS.fact_check!.source).toBe("modeled");
  });

  it("resetInstrumentedOverrides restores the provisional baseline", () => {
    recordInstrumentedFold("review", { runId: "r", tier: "base", rigor: "standard", inputs: { words: 3000, claims: 10 }, measuredCredits: 500, measuredAt: "2026-09-11" });
    expect(estimatorsAreProvisional(["review"])).toBe(false);
    resetInstrumentedOverrides();
    expect(estimatorsAreProvisional(["review"])).toBe(true);
    expect(estimatorSpec("review")).toBe(ESTIMATORS.review);
  });
});
