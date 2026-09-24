import { afterEach, describe, expect, it } from "vitest";
import {
  ESTIMATORS,
  METERED_VS_COMMITTED_COVERAGE,
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
    // 40 + 36 + 240 = 316, ×1.25 metered-vs-committed coverage (PRB.25) = 395
    expect(base).toBe(Math.ceil(316 * 1.25));
  });

  it("adds the per-phase addend terms by default (verification research + discourse + second read)", () => {
    const spec = ESTIMATORS.review!;
    const withAddends = estimateCredits(spec, { words: 3000, claims: 10 }, { tier: "base", rigor: "standard" });
    // base 316 + verification research (PRB.22 floor 60 + PRB.24 loop churn 140 + 16*10 = 360) +
    // discourse (90 + 140 loop churn + 0.006*3000=18 → 248) + second_read (0.005*3000=15)
    // = 316+360+248+15 = 939, ×1.25 coverage (PRB.25) = 1173.75 → 1174
    expect(withAddends).toBe(1174);
  });

  it("applies the model-tier multiplier (1× / 2.2× / 4.5×)", () => {
    const spec = ESTIMATORS.fact_check!; // base: 220 + 27*claims (PRB.22 research + PRB.24 loop churn folded in)
    const claims = { claims: 10 }; // base standard = 220 + 270 = 490, ×1.5 research-workflow coverage = 735
    expect(estimateCredits(spec, claims, { tier: "base", rigor: "standard" })).toBe(735);
    expect(estimateCredits(spec, claims, { tier: "balanced", rigor: "standard" })).toBe(Math.ceil(735 * 2.2)); // 1617
    expect(estimateCredits(spec, claims, { tier: "frontier", rigor: "standard" })).toBe(Math.ceil(735 * 4.5)); // 3308
  });

  it("applies the metered-vs-committed coverage (PRB.25) — absent from a spec ⇒ ×1", () => {
    // review carries 1.25: the estimate predicts the proxy-metered cost the cap is enforced on.
    const review = estimateCredits(ESTIMATORS.review!, { words: 3000, claims: 10 }, { tier: "base", rigor: "standard", includeAddends: false });
    expect(review).toBe(Math.ceil(316 * METERED_VS_COMMITTED_COVERAGE)); // 395
    // profile_voice carries none — its quick variant was already calibrated to PROXY-metered
    // credits (PRB.16b), so coverage would double-count.
    const pv = estimateCredits(ESTIMATORS.profile_voice!, { words: 2000 }, { tier: "base", rigor: "standard", variant: "quick" });
    expect(pv).toBe(220);
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
    const spec = ESTIMATORS.fact_check!; // base standard tier=base: 220 + 27*claims (PRB.22 research + PRB.24 loop churn)
    const inputs = { claims: 10 }; // modeled prediction = 490 ×1.5 coverage = 735
    const predicted = estimateCredits(spec, inputs, { tier: "base", rigor: "standard" });
    expect(predicted).toBe(735);

    const measured = 420; // a real proxy-metered run came in ~20% higher than the model
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
    expect(estimateCredits(folded, inputs, { tier: "base", rigor: "standard" })).toBe(420);
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

describe("ESTIMATORS.draft (§12.2 Draft row; P1.10)", () => {
  const spec = ESTIMATORS.draft!;

  it("evaluates `60 + 0.05·target_words + 11·inherited_claims + per-phase churn` at Base/Standard", () => {
    // 2000-word target, 10 inherited claims, 6 active phases (grounding+audit off at Quick — priced by the
    // caller's `phases` input; here we price the full 8-phase shape + the grounding addend separately).
    const base = estimateCredits(spec, { words: 2000, claims: 10, phases: 8 }, { tier: "base", rigor: "standard", includeAddends: false });
    // 60 + 0.05*2000 + 11*10 + 100*8 = 60 + 100 + 110 + 800 = 1070; ×1.25 metered coverage = 1337.5 → 1338
    expect(base).toBe(1338);
  });

  it("the grounding addend carries the research floor + research-loop churn + per-claim fetch cost (PRB.22/24/25)", () => {
    const withGrounding = estimateCredits(spec, { words: 2000, claims: 10, phases: 8 }, { tier: "base", rigor: "standard", enabledAddends: ["grounding"] });
    // 1070 + (60 + 140 + 16*10) = 1070 + 360 = 1430; ×1.25 = 1787.5 → 1788
    expect(withGrounding).toBe(1788);
    // grounding off (Quick rigor / the sheet toggle) — the addend is not priced.
    const noGrounding = estimateCredits(spec, { words: 2000, claims: 10, phases: 6 }, { tier: "base", rigor: "quick", enabledAddends: [] });
    // (60 + 100 + 110 + 100*6) = 870; ×1.25 = 1087.5 → 1088; ×0.5 rigor = 544
    expect(noGrounding).toBe(544);
  });

  it("applies the Draft rigor multipliers (Quick 0.5× / Full board 1.3×)", () => {
    const inputs = { words: 2000, claims: 10, phases: 8 };
    const std = estimateCredits(spec, inputs, { tier: "base", rigor: "standard", includeAddends: false });
    const quick = estimateCredits(spec, inputs, { tier: "base", rigor: "quick", includeAddends: false });
    const full = estimateCredits(spec, inputs, { tier: "base", rigor: "full_board", includeAddends: false });
    expect(quick).toBe(Math.ceil(1070 * 1.25 * 0.5));
    expect(full).toBe(Math.ceil(1070 * 1.25 * 1.3));
    expect(quick).toBeLessThan(std);
    expect(full).toBeGreaterThan(std);
  });

  it("the `preview` variant prices the trial first-section preview at ≈60 cr (§7.6; REQ-CHAT-30)", () => {
    const preview = estimateCredits(spec, {}, { tier: "base", rigor: "standard", variant: "preview", enabledAddends: [] });
    // 48 intercept × 1.25 coverage = 60 exactly at Base/Standard.
    expect(preview).toBe(60);
  });

  it("a folded instrumented Draft run overrides the spec without a code change (§16.3 #1)", () => {
    try {
      recordInstrumentedFold("draft", {
        runId: "r_draft",
        tier: "base",
        rigor: "standard",
        inputs: { words: 2000, claims: 10 },
        measuredCredits: 1400,
        measuredAt: "2026-09-15",
      });
      const folded = estimatorSpec("draft")!;
      expect(folded.source).toBe("instrumented");
      expect(estimateCredits(folded, { words: 2000, claims: 10 }, { tier: "base", rigor: "standard" })).toBe(1400);
    } finally {
      resetInstrumentedOverrides();
    }
  });
});
