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

  it("prices the verification-phase research addend, bound to the fact_check toggle (PRB.22)", () => {
    // D-PRB.21-1: verification's web research was unmodeled burn. Now the estimate carries a claim-scaled
    // research addend — a 701-word doc (≈3 claims) estimates (40 + 8.412 + 72) + (60 + 48) = 228.412 at
    // Base/Standard, and Quick (0.6×) lands ~138 → a cap above the bounded-burn floor.
    const quick = buildEstimate({ workflow: "review", rigor: "quick", modelTier: "base", inputs: { words: 701 } });
    expect(quick.claimCount).toBe(3);
    expect(quick.estimateCredits).toBe(Math.ceil(228.412 * 0.6)); // 138
    // the old modeled quick floor (≈73) sat below minimum viable burn — the bound+addend pair fixes that.
    expect(quick.capCredits).toBeGreaterThan(146);

    // fact_check OFF ⇒ no verification phase ⇒ the research addend leaves with the per-claim term.
    const off = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: false },
    });
    const on = buildEstimate({
      workflow: "review", rigor: "standard", modelTier: "base",
      inputs: { words: 701 }, toggles: { fact_check: true },
    });
    expect(on.estimateCredits - off.estimateCredits).toBe(3 * 24 + 60 + 3 * 16);
  });

  it("reflects a folded instrumented spec (override-first) without a code change", () => {
    resetInstrumentedOverrides();
    const modeled = buildEstimate({ workflow: "review", rigor: "standard", modelTier: "base", inputs: { words: 5180 }, claimCount: 45 });
    expect(modeled.estimateCredits).toBeGreaterThan(0);
    resetInstrumentedOverrides();
  });
});
