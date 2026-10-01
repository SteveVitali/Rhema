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

  it("prices the verification research addend + the context-churn floor, bound to the toggles (PRB.22/PRB.23/PRB.24)", () => {
    // D-PRB.21-1: verification's web research was unmodeled (PRB.22 addend); the per-turn transcript
    // resend the proxy meters was ALSO unmodeled — PRB.23's `perPhase` term prices it against the
    // ACTIVE phase count, PRB.24 recalibrates it to the measured ordinary-phase churn (100) and adds
    // the measured research-loop churn (140) to the verification addend. Quick's defaults
    // (discourse/second_read off) ⇒ 5 of 7 phases active:
    // base 40 + 8.412 + 72 + 5×100 churn = 620.412, + verification addend (200 + 48) = 868.412 at
    // Base/Standard, ×0.6 rigor = 522 — ≈ the measured failed run's actual 506 metered burn.
    const quick = buildEstimate({ workflow: "review", rigor: "quick", modelTier: "base", inputs: { words: 701 } });
    expect(quick.claimCount).toBe(3);
    expect(quick.estimateCredits).toBe(Math.ceil(868.412 * 0.6)); // 522
    expect(quick.capCredits).toBe(Math.ceil(quick.estimateCredits * 1.5)); // 783

    // fact_check OFF ⇒ no verification phase ⇒ the research addend AND that phase's churn term
    // leave with the per-claim term: 3×24 claims + (200+3×16) research + 100 churn = 420.
    const off = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: false },
    });
    const on = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: true },
    });
    expect(on.estimateCredits - off.estimateCredits).toBe(3 * 24 + 200 + 3 * 16 + 100);
  });

  it("PRB.23/PRB.24 — the phase count follows the resolved toggles (priced set == executed set)", () => {
    // Standard defaults all three toggles on → 7 active phases; turning discourse + second_read
    // off drops the figure by BOTH their addends AND their per-phase churn (2 × 100).
    const all = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 701 } });
    const twoOff = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { discourse: false, second_read: false },
    });
    // discourse addend (230 + 0.006×701) + second_read addend (0.005×701) + 2 phases of churn,
    // under the shared ceil: 1306.123→1307 vs 868.412→869.
    expect(all.estimateCredits - twoOff.estimateCredits).toBe(438);
  });

  it("reflects a folded instrumented spec (override-first) without a code change", () => {
    resetInstrumentedOverrides();
    const modeled = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 }, claimCount: 45 });
    expect(modeled.estimateCredits).toBeGreaterThan(0);
    resetInstrumentedOverrides();
  });
});
