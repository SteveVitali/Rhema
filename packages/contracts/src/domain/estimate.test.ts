import { describe, it, expect } from "vitest";
import {
  formatUsd,
  formatCredits,
  estimateLine,
  creditsLine,
  capFromEstimate,
  CAP_MULTIPLIER,
  consentDecision,
  clampDontAskUnder,
  DONT_ASK_UNDER_MAX,
  resolveInsufficientBalance,
  creditsToUsd,
} from "./estimate.js";

// AC6 — dollars-first formatting everywhere; credits second line; tokens nowhere.
describe("dollars-first formatting (REQ-BILL-1 amended; §14.1)", () => {
  it("formats credits as dollars at two decimals ($0.01/credit)", () => {
    expect(creditsToUsd(560)).toBeCloseTo(5.6, 6);
    expect(formatUsd(560)).toBe("$5.60");
    expect(formatUsd(840)).toBe("$8.40");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("estimateLine leads with dollars — '≈ $5.60 · never more than $8.40' (never 'you will be billed')", () => {
    const line = estimateLine(560, 840);
    expect(line).toBe("≈ $5.60 · never more than $8.40");
    expect(line).not.toMatch(/billed/i);
    expect(line).not.toMatch(/token/i);
  });

  it("creditsLine is the second line: credits · cap · balance-after, no tokens", () => {
    expect(creditsLine(560, 840, 590)).toBe("560 credits · cap 840 · 590 left after the cap");
    expect(creditsLine(1240, 1860)).toBe("1,240 credits · cap 1,860");
    expect(creditsLine(560, 840, 590)).not.toMatch(/token/i);
  });

  it("formatCredits uses thousands separators", () => {
    expect(formatCredits(1240)).toBe("1,240");
    expect(formatCredits(59)).toBe("59");
  });
});

// §5.6 item 4 — cap = ceil(1.5 × estimate), circuit-breaker scaled.
describe("cap sizing (§5.6 item 4; REQ-BILL-3; REQ-SPEC-24.5)", () => {
  it("cap = ceil(1.5 × estimate)", () => {
    expect(CAP_MULTIPLIER).toBe(1.5);
    expect(capFromEstimate(560)).toBe(840);
    expect(capFromEstimate(561)).toBe(842); // 841.5 → 842
    expect(capFromEstimate(1)).toBe(2);
  });
  it("applies the circuit-breaker 2× for new runs (REQ-SPEC-24.5)", () => {
    expect(capFromEstimate(560, 2)).toBe(1680);
    expect(capFromEstimate(560, 1)).toBe(840);
  });
});

// AC3 — consent second click per the threshold rules incl. the 200-credit floor; don't-ask-under-N ≤ 1000.
describe("consentDecision (REQ-BILL-4 amended; §5.6 item 5)", () => {
  it("above 500 credits always needs a second click (absolute rule)", () => {
    expect(consentDecision({ estimateCredits: 501, spendableCredits: 100000 })).toEqual({
      needsSecondClick: true,
      reason: "absolute",
    });
    expect(consentDecision({ estimateCredits: 500, spendableCredits: 100000 }).needsSecondClick).toBe(false);
  });

  it("above 200 credits AND above 25% of spendable needs a second click (relative rule)", () => {
    // 300 credits, spendable 1000 → 30% > 25% and > 200 ⇒ confirm.
    expect(consentDecision({ estimateCredits: 300, spendableCredits: 1000 })).toEqual({
      needsSecondClick: true,
      reason: "relative",
    });
    // 300 credits, spendable 2000 → 15% < 25% ⇒ no confirm.
    expect(consentDecision({ estimateCredits: 300, spendableCredits: 2000 }).needsSecondClick).toBe(false);
  });

  it("the 200-credit floor: a small account is not asked on a ≤200-credit run even if it is >25% of balance", () => {
    // 200 credits, spendable 400 → 50% > 25% but NOT > 200 ⇒ no confirm (the floor).
    expect(consentDecision({ estimateCredits: 200, spendableCredits: 400 }).needsSecondClick).toBe(false);
    // 199 credits, spendable 100 → 199% of balance but under the floor ⇒ no confirm.
    expect(consentDecision({ estimateCredits: 199, spendableCredits: 100 }).needsSecondClick).toBe(false);
    // 201 credits, spendable 400 → over the floor and > 25% ⇒ confirm.
    expect(consentDecision({ estimateCredits: 201, spendableCredits: 400 }).needsSecondClick).toBe(true);
  });

  it("'don't ask under N' suppresses the confirm below N", () => {
    // estimate 600 > 500 would confirm, but the user opted out under 1000.
    expect(consentDecision({ estimateCredits: 600, spendableCredits: 100000, dontAskUnder: 1000 })).toEqual({
      needsSecondClick: false,
      reason: "suppressed",
    });
    // estimate exactly at N still confirms (removed BELOW N only).
    expect(consentDecision({ estimateCredits: 600, spendableCredits: 100000, dontAskUnder: 600 }).needsSecondClick).toBe(true);
  });

  it("clamps 'don't ask under N' to [0, 1000]", () => {
    expect(clampDontAskUnder(5000)).toBe(DONT_ASK_UNDER_MAX);
    expect(clampDontAskUnder(1000)).toBe(1000);
    expect(clampDontAskUnder(-5)).toBe(0);
    expect(clampDontAskUnder(undefined)).toBe(0);
    expect(clampDontAskUnder(NaN)).toBe(0);
    // even a huge opt-out cannot suppress a run above the max.
    expect(consentDecision({ estimateCredits: 1500, spendableCredits: 1e9, dontAskUnder: 999999 }).needsSecondClick).toBe(true);
  });

  it("never asks on an entitlement (trial) run", () => {
    expect(consentDecision({ estimateCredits: 9999, spendableCredits: 0, entitlement: true })).toEqual({
      needsSecondClick: false,
      reason: null,
    });
  });
});

// AC4 — insufficient balance: the three sentences render; cheapest-fitting primary.
describe("resolveInsufficientBalance (§5.6 item 6; §14.6)", () => {
  it("returns null when the run fits (cap ≤ spendable)", () => {
    expect(resolveInsufficientBalance({ capCredits: 840, spendableCredits: 840 })).toBeNull();
    expect(resolveInsufficientBalance({ capCredits: 840, spendableCredits: 900 })).toBeNull();
  });

  it("renders the canonical three sentences (§14.6, verbatim) and never 'you will be billed'", () => {
    const r = resolveInsufficientBalance({ capCredits: 840, spendableCredits: 590 });
    expect(r).not.toBeNull();
    expect(r!.sentences).toEqual([
      "This run's cap (840) is more than your spendable balance (590).",
      "Lower the rigor, switch to Base, or turn off fact-check to fit.",
      "Or add credits / upgrade.",
    ]);
    expect(r!.sentences.join(" ")).not.toMatch(/you will be billed/i);
  });

  it("beta mode drops the upgrade upsell for a house-credit ask (REQ-BETA-14/19)", () => {
    const r = resolveInsufficientBalance({ capCredits: 840, spendableCredits: 590, mode: "beta" });
    expect(r!.sentences[2]).toBe("Or ask for more credits.");
    expect(r!.sentences[2]).not.toMatch(/upgrade/i);
  });

  it("marks the cheapest-fitting option primary (turn off fact-check), add-credits last", () => {
    const r = resolveInsufficientBalance({ capCredits: 840, spendableCredits: 590 })!;
    expect(r.options[0]).toEqual({ action: "turn_off_fact_check", primary: true });
    expect(r.options.filter((o) => o.primary)).toHaveLength(1);
    expect(r.options[r.options.length - 1]!.action).toBe("add_credits");
  });
});
