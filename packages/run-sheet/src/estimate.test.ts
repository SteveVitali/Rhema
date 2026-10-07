import { describe, it, expect } from "vitest";
import { resetInstrumentedOverrides } from "@rhema/protocols";
import { buildEstimate, provisionalClaimCount, CLAIMS_PER_WORD } from "./estimate.js";

// AC1 — estimate returns immediately with a provisional figure; refines in place; a run launched
// pre-refinement is capped from the provisional estimate.
describe("buildEstimate — provisional then refined (REQ-SPEC-16; §5.6 item 1)", () => {
  it("derives a provisional claim count from words × density when no claim count is known", () => {
    // 5,180 words at the review density → the §5.6 mock's ~21 claims.
    expect(provisionalClaimCount("review", 5180)).toBe(21);
    expect(CLAIMS_PER_WORD.review).toBe(0.004);
    expect(provisionalClaimCount("revise", 5180)).toBeUndefined(); // revise is not claim-priced
  });

  it("returns an immediate provisional figure (provisional: true) from the word count alone", () => {
    const est = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 } });
    expect(est.provisional).toBe(true);
    expect(est.claimCount).toBe(21);
    expect(est.estimateCredits).toBeGreaterThan(0);
    expect(est.capCredits).toBe(Math.ceil(est.estimateCredits * 1.5));
    expect(est.rateTableVersion).toBe(1);
  });

  it("refines in place when the pre-pass supplies the real claim count (provisional: false)", () => {
    const provisional = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 } });
    const refined = buildEstimate({
      workflow: "review",
      rigor: "standard",
      modelTier: "base",
      inputs: { words: 5180 },
      claimCount: 45, // the pre-pass found more claims than the density predicted
    });
    expect(refined.provisional).toBe(false);
    expect(refined.claimCount).toBe(45);
    // more claims ⇒ a higher figure than the provisional one.
    expect(refined.estimateCredits).toBeGreaterThan(provisional.estimateCredits);
  });

  it("caps a pre-refinement run from the PROVISIONAL estimate (§5.6 item 1)", () => {
    // A run launched before the refine returns uses the provisional estimate/cap; the refined cap is
    // larger but is NOT what the launched run is bound to.
    const provisional = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 } });
    const refined = buildEstimate({
      workflow: "review",
      rigor: "standard",
      modelTier: "base",
      inputs: { words: 5180 },
      claimCount: 45,
    });
    expect(provisional.capCredits).toBe(Math.ceil(provisional.estimateCredits * 1.5));
    expect(provisional.capCredits).toBeLessThan(refined.capCredits);
  });

  it("prices the verification research addend + the context-churn floor, bound to the toggles (PRB.22/PRB.23/PRB.24/PRB.25)", () => {
    // D-PRB.21-1: verification's web research was unmodeled (PRB.22 addend); the per-turn transcript
    // resend the proxy meters was ALSO unmodeled — PRB.23's `perPhase` term prices it against the
    // ACTIVE phase count, PRB.24 recalibrates it to the measured ordinary-phase churn (100) and adds
    // the measured research-loop churn (140) to the verification addend, and PRB.25 applies the
    // metered-vs-committed coverage (×1.25 — the cap meters proxy burn the debit channel misses).
    // Quick's defaults (discourse/second_read off) ⇒ 5 of 7 phases active:
    // base 40 + 8.412 + 72 + 5×100 churn = 620.412, + verification addend (200 + 48) = 868.412 at
    // Base/Standard, ×1.25 coverage ×0.6 rigor = 651.309 → 652; cap 978 — covering the delivered
    // run's real 720 metered burn (and the ~830 trajectory that died at 783).
    const quick = buildEstimate({ workflow: "review", rigor: "quick", modelTier: "base", inputs: { words: 701 } });
    expect(quick.claimCount).toBe(3);
    expect(quick.estimateCredits).toBe(Math.ceil(868.412 * 1.25 * 0.6)); // 652
    expect(quick.capCredits).toBe(Math.ceil(quick.estimateCredits * 1.5)); // 978
    expect(quick.capCredits).toBeGreaterThanOrEqual(720); // covers the delivered run's metered total

    // fact_check OFF ⇒ no verification phase ⇒ the research addend AND that phase's churn term
    // leave with the per-claim term: (3×24 claims + (200+3×16) research + 100 churn) ×1.25 = 525.
    const off = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: false },
    });
    const on = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: true },
    });
    expect(on.estimateCredits - off.estimateCredits).toBe(Math.ceil(1306.123 * 1.25) - Math.ceil(886.123 * 1.25)); // 1633 − 1108 = 525
  });

  it("PRB.23/PRB.24/PRB.25 — the phase count follows the resolved toggles (priced set == executed set)", () => {
    // Standard defaults all three toggles on → 7 active phases; turning discourse + second_read
    // off drops the figure by BOTH their addends AND their per-phase churn (2 × 100).
    const all = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 701 } });
    const twoOff = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { discourse: false, second_read: false },
    });
    // discourse addend (230 + 0.006×701) + second_read addend (0.005×701) + 2 phases of churn,
    // under the shared ceil, ×1.25 coverage: 1632.654→1633 vs 1085.515→1086.
    expect(all.estimateCredits - twoOff.estimateCredits).toBe(547);
  });

  it("ECON.1 §6.5 — Quick Review clamps the priced claim count to the five load-bearing claims", () => {
    // 23 real claims under a Quick rigor: the estimate, the claimCount the snapshot freezes, and the
    // claim-scaled budgets all bound on 5 — one number, server-derived.
    const capped = buildEstimate({
      workflow: "review", rigor: "quick", modelTier: "base",
      inputs: { words: 5180 }, claimCount: 23,
    });
    expect(capped.claimCount).toBe(5);
    const exact = buildEstimate({
      workflow: "review", rigor: "quick", modelTier: "base",
      inputs: { words: 5180 }, claimCount: 5,
    });
    expect(capped.estimateCredits).toBe(exact.estimateCredits);
    expect(capped.capCredits).toBe(exact.capCredits);

    // The density-derived provisional count clamps too (21 → 5), staying provisional.
    const provisional = buildEstimate({ workflow: "review", rigor: "quick", modelTier: "base", inputs: { words: 5180 } });
    expect(provisional.provisional).toBe(true);
    expect(provisional.claimCount).toBe(5);

    // Standard/Full Board price the FULL inventory — no cap.
    const standard = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 5180 }, claimCount: 23,
    });
    expect(standard.claimCount).toBe(23);
    expect(standard.estimateCredits).toBeGreaterThan(capped.estimateCredits);

    // A draft under the cap is untouched.
    const small = buildEstimate({
      workflow: "review", rigor: "quick", modelTier: "base",
      inputs: { words: 701 }, claimCount: 3,
    });
    expect(small.claimCount).toBe(3);
  });

  it("reflects a folded instrumented spec (override-first) without a code change", () => {
    resetInstrumentedOverrides();
    const modeled = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 }, claimCount: 45 });
    expect(modeled.estimateCredits).toBeGreaterThan(0);
    resetInstrumentedOverrides();
  });
});
