// P1.16 — the pricing.json contract test (REQ-GROWTH-4/7/8; §14.2). Pins the single source of truth:
// the plan ladder, top-up packs, trial constants, and the platform rate vs the versioned rate table.
import { describe, expect, it } from "vitest";
import {
  PLATFORM_RATE,
  USD_PER_CREDIT,
  CURRENT_RATE_TABLE_VERSION,
} from "./rates.js";
import { PRICING, planOf, priceCents, topUpPack, modelTierAllowed } from "./pricing.js";

describe("pricing.json (§14.2)", () => {
  it("pegs 1 credit = $0.01 and the platform rate at 1.4× — matching the rate table constants", () => {
    expect(PRICING.usdPerCredit).toBe(USD_PER_CREDIT);
    expect(PRICING.platformRate).toBe(PLATFORM_RATE);
    expect(PRICING.usdPerCredit).toBe(0.01);
    expect(PRICING.platformRate).toBe(1.4);
  });

  it("pins the paid plan ladder (price, annual -15%, included credits)", () => {
    expect(planOf("writer").monthlyUsd).toBe(20);
    expect(planOf("writer").annualMonthlyUsd).toBe(17);
    expect(planOf("writer").includedCreditsMonthly).toBe(2000);
    expect(planOf("studio").monthlyUsd).toBe(100);
    expect(planOf("studio").annualMonthlyUsd).toBe(85);
    expect(planOf("studio").includedCreditsMonthly).toBe(12000);
    expect(planOf("studio_max").monthlyUsd).toBe(200);
    expect(planOf("studio_max").annualMonthlyUsd).toBe(170);
    expect(planOf("studio_max").includedCreditsMonthly).toBe(26000);
    // annual = 15% off: 20×0.85=17, 100×0.85=85, 200×0.85=170 — exactly.
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      const p = planOf(tier);
      expect(p.annualMonthlyUsd).toBeCloseTo(p.monthlyUsd * (1 - PRICING.annualSavingsPct / 100), 2);
    }
    expect(priceCents("writer", "monthly")).toBe(2000);
    expect(priceCents("writer", "annual")).toBe(20400); // $17×12
  });

  it("pins concurrency + the Free-after-trial daily allowance", () => {
    expect(planOf("free").dailyChatCredits).toBe(10);
    expect(planOf("free").concurrency).toBe(0);
    expect(planOf("writer").concurrency).toBe(2);
    expect(planOf("studio").concurrency).toBe(5);
    expect(planOf("studio_max").concurrency).toBe(8);
    expect(planOf("team").concurrencyPerSeat).toBe(true);
    expect(planOf("team").concurrency).toBe(3);
  });

  it("pins the trial spec (one Review ≤6,000 words, Standard, Base + 150-credit pocket)", () => {
    expect(PRICING.trial.windowDays).toBe(14);
    expect(PRICING.trial.entitlement).toEqual({
      kind: "review",
      wordCap: 6000,
      rigor: "standard",
      modelTier: "base",
    });
    expect(PRICING.trial.pocketCredits).toBe(150);
    expect(PRICING.trial.upgradePromoCredits).toBe(800);
    expect(PRICING.trial.concurrency).toBe(1);
    expect(PRICING.trial.projects).toBe(3);
    expect(PRICING.trial.voice).toBe("quick_voice_only");
  });

  it("pins the top-up packs + 12-month expiry", () => {
    expect(topUpPack("topup_10")).toEqual({ id: "topup_10", usd: 10, credits: 1000 });
    expect(topUpPack("topup_50")).toEqual({ id: "topup_50", usd: 50, credits: 5250 });
    expect(topUpPack("topup_200")).toEqual({ id: "topup_200", usd: 200, credits: 22000 });
    expect(PRICING.topUp.expiryMonths).toBe(12);
    // $50 and $200 packs beat the peg (bonus credits); $10 is at-peg.
    expect(topUpPack("topup_50")!.credits).toBeGreaterThan(50 / PRICING.usdPerCredit);
    expect(topUpPack("topup_200")!.credits).toBeGreaterThan(200 / PRICING.usdPerCredit);
    expect(topUpPack("topup_10")!.credits).toBe(10 / PRICING.usdPerCredit);
  });

  it("pins rollover (1 month, cap 2×) and the per-run cap multiplier 1.5×", () => {
    expect(PRICING.rollover).toEqual({ months: 1, balanceCapMultiple: 2 });
    expect(PRICING.controls.perRunCapMultiplier).toBe(1.5);
  });

  it("keeps Team waitlisted (P1.16 lists it; mechanics are out of scope)", () => {
    expect(planOf("team").waitlist).toBe(true);
    expect(planOf("team").pooled).toBe(true);
    expect(planOf("team").topUps).toBe("admin");
  });

  it("exposes every model tier to paid plans and only Base to Free", () => {
    expect(modelTierAllowed("free", "base")).toBe(true);
    expect(modelTierAllowed("free", "frontier")).toBe(false);
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      for (const mt of ["base", "balanced", "frontier"] as const) {
        expect(modelTierAllowed(tier, mt)).toBe(true);
      }
    }
  });

  it("publishes under a versioned contract the current rate table satisfies", () => {
    // The publication's rate-table leg must reference a real, current table (REQ-BILL-19).
    expect(CURRENT_RATE_TABLE_VERSION).toBeGreaterThanOrEqual(1);
  });
});
