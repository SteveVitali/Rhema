import { describe, expect, it } from "vitest";
import { PRICING, planOf } from "./pricing.js";
import {
  HERO_HEADLINE,
  COMPARATIVE_WAVE_MET,
  lintGrowthCopy,
} from "../growth-lint.js";
import { assertShowcaseFixture } from "./showcase.js";
import {
  buildPricingPageData,
  cardCreditsToUsd,
  costCardFigures,
  draftCardCredits,
  pricingFaq,
  pricingMatrix,
  quickReviewLine,
  rangeLabel,
  reviewCardCredits,
  reviewNoFactCheckCredits,
  reviseCardCredits,
  voiceProfileCard,
} from "./pricing-page.js";

// P1.17 (§15.2) — AC: every figure on /pricing derives from pricing.json + the cost terms; ranges stay
// ranges; the essay card leads; annual shows the 15% saving in dollars; a hand-edited figure fails
// these tests (the assertions recompute from PRICING, never quote a literal that could drift with it —
// the literal assertions pin only the PUBLISHED constants' shape).

const cardRound = (n: number) => Math.round(n / 10) * 10;

describe("§15.2 pricing derivation (REQ-GROWTH-6/9)", () => {
  it("a Review's credits recompute from reading terms + per-verified-claim constants", () => {
    const t = PRICING.costCardTerms.reading;
    const words = 8_000, claims = 40;
    for (const tier of ["base", "balanced", "frontier"] as const) {
      const expected = cardRound(
        (t.intercept + t.perWord * words) * PRICING.modelTierMultipliers[tier] +
          claims * PRICING.costPerVerifiedClaim.review![tier]!,
      );
      expect(reviewCardCredits(words, claims, tier)).toBe(expected);
    }
  });

  it("every cost-card figure is a RANGE (low < high) — never a single value", () => {
    for (const shape of PRICING.costCardShapes) {
      const card = costCardFigures(shape);
      for (const row of card.rows) {
        expect(row.range.low).toBeLessThan(row.range.high);
        expect(row.range.low).toBeGreaterThan(0);
      }
      // and the full-round row IS the per-tier sum, not a hand-typed total.
      expect(card.fullRoundByTier.base).toBe(
        draftCardCredits(shape.words, shape.claims, "base") +
          reviewCardCredits(shape.words, shape.claims, "base") +
          reviseCardCredits(shape.words, shape.claims, "base"),
      );
      expect(card.rows.find((r) => r.key === "full_round")!.range.low).toBe(card.fullRoundByTier.base);
      expect(card.rows.find((r) => r.key === "full_round")!.range.high).toBe(card.fullRoundByTier.frontier);
    }
  });

  it("the ESSAY card leads the cards (the §15.2 ordering rule)", () => {
    const data = buildPricingPageData();
    expect(data.cards.length).toBeGreaterThanOrEqual(1);
    // costCardShapes order is the publication's; the essay shape must be first on the page.
    expect(data.cards[0]!.key).toBe(PRICING.costCardShapes[0]!.key);
    expect(data.cards[0]!.key.toLowerCase()).toMatch(/essay|academic/);
  });

  it("annual saves exactly 15% and renders the saving in DOLLARS per year", () => {
    const data = buildPricingPageData();
    expect(data.annualSavingsPct).toBe(15);
    for (const plan of data.plans.filter((p) => !p.waitlist && p.tier !== "free")) {
      const p0 = planOf(plan.tier);
      expect(plan.annualMonthlyUsd).toBe(p0.annualMonthlyUsd);
      expect(plan.annualSavingsUsdPerYear).toBeCloseTo((p0.monthlyUsd - p0.annualMonthlyUsd!) * 12, 6);
      // the saving is real dollars, not a rounded zero
      expect(plan.annualSavingsUsdPerYear!).toBeGreaterThan(0);
    }
    // Team (waitlist) + Free carry no annual price.
    expect(data.plans.find((p) => p.tier === "team")!.annualSavingsUsdPerYear).toBeNull();
    expect(data.plans.find((p) => p.tier === "free")!.annualMonthlyUsd).toBe(planOf("free").annualMonthlyUsd);
  });

  it("credits convert at the published $0.01 rate — a rate change moves every dollar figure", () => {
    expect(PRICING.usdPerCredit).toBe(0.01);
    expect(cardCreditsToUsd(1240)).toBeCloseTo(1240 * PRICING.usdPerCredit, 6);
    expect(cardCreditsToUsd(1240)).toBe(12.4);
  });

  it("the fact-check-off row is strictly cheaper than fact-check-on at every tier", () => {
    const academic = PRICING.costCardShapes.find((s) => s.key === "academic")!;
    for (const tier of ["base", "balanced", "frontier"] as const) {
      expect(reviewNoFactCheckCredits(academic.words, academic.claims, tier)).toBeLessThan(
        reviewCardCredits(academic.words, academic.claims, tier),
      );
    }
  });

  it("the voice card + quick-review line derive from their published terms", () => {
    const vc = voiceProfileCard();
    const t = PRICING.costCardTerms.voiceProfile;
    expect(vc.words).toBe(PRICING.costCardTerms.voiceCorpusWords);
    expect(vc.range.low).toBe(cardRound((t.intercept + t.perWord * vc.words) * PRICING.modelTierMultipliers.base));

    const qr = quickReviewLine();
    expect(qr.wordCap).toBe(PRICING.costCardTerms.quickReview.wordCap);
    expect(qr.byRigor.standard).toBe(reviewCardCredits(qr.wordCap, qr.claims, "base"));
    expect(qr.byRigor.quick).toBeLessThan(qr.byRigor.standard);
    expect(qr.byRigor.full_board).toBeGreaterThan(qr.byRigor.standard);
  });

  it("the FAQ's 8,000-word figure is COMPUTED (not quoted) from the academic shape", () => {
    const academic = PRICING.costCardShapes.find((s) => s.key === "academic")!;
    const faq = pricingFaq();
    const q = faq[0]!;
    expect(q.q).toContain(academic.words.toLocaleString("en-US"));
    const reviewBase = reviewCardCredits(academic.words, academic.claims, "base");
    expect(q.q).toContain(`$${Math.round(cardCreditsToUsd(reviewBase))}`);
    expect(q.a).toContain(reviewBase.toLocaleString("en-US"));
    expect(q.a).toContain(reviewNoFactCheckCredits(academic.words, academic.claims, "base").toLocaleString("en-US"));
  });

  it("the matrix's cells are the plan specs' — including the waitlist + per-seat rows", () => {
    const m = pricingMatrix();
    expect(m.columns).toEqual(["free", "writer", "studio", "studio_max", "team"].map((t) => planOf(t).display));
    const priceRow = m.rows.find((r) => r.label === "Price (monthly)")!;
    expect(priceRow.cells[0]).toBe("$0");
    expect(priceRow.cells[4]).toContain("/seat");
    const annual = m.rows.find((r) => r.label === "Price (annual, per month)")!;
    expect(annual.cells[4]).toBe("—"); // Team waitlist — no annual price
    const rollover = m.rows.find((r) => r.label === "Rollover")!;
    expect(rollover.cells[0]).toContain(`${PRICING.rollover.balanceCapMultiple}×`);
  });

  it("rangeLabel renders the Base→Frontier span, not a midpoint", () => {
    expect(rangeLabel({ low: 1200, high: 3400 })).toBe("1,200 – 3,400");
  });
});

describe("the §15.1 growth lints (REQ-POS-4/5/11/12/13; REQ-GROWTH-5; REQ-EVAL-19)", () => {
  const lint = (key: string, text: string, comparativeWaveMet?: boolean) =>
    lintGrowthCopy([{ key, text }], comparativeWaveMet === undefined ? {} : { comparativeWaveMet });

  it("the hero headline is locked to the §15.1 string", () => {
    expect(HERO_HEADLINE).toBe("An editorial board for everything you write.");
    expect(lint("landing.hero.headline", HERO_HEADLINE)).toEqual([]);
    const v = lint("landing.hero.headline", "We write your essays for you");
    expect(v.some((x) => x.rule === "hero_headline")).toBe(true);
  });

  it("generation promises fail in the hero/proof zones but not in a neutral key", () => {
    expect(lint("landing.hero.sub", "Rhēma writes your draft for you").some((v) => v.rule === "generation_promise")).toBe(true);
    expect(lint("landing.proof.body", "It generates the whole essay").some((v) => v.rule === "generation_promise")).toBe(true);
    expect(lint("landing.workflow.note", "Rhēma writes your draft for you").some((v) => v.rule === "generation_promise")).toBe(false);
  });

  it("detection-evasion language fails EVERYWHERE — any key", () => {
    expect(lint("footer.note", "undetectable by any AI detector").some((v) => v.rule === "detection_evasion")).toBe(true);
    expect(lint("pricing.faq.a", "beats Turnitin scans").some((v) => v.rule === "detection_evasion")).toBe(true);
  });

  it("placeholder logos/testimonials fail; unbuilt assets need a forward-looking marker", () => {
    expect(lint("landing.proof.logos", "As featured in the Times — logos").some((v) => v.rule === "placeholder_logo")).toBe(true);
    expect(lint("landing.seat.body", "Our mobile app syncs your drafts").some((v) => v.rule === "unbuilt_asset_claim")).toBe(true);
    expect(lint("pricing.faq.a", "The mobile app is on the roadmap").some((v) => v.rule === "unbuilt_asset_claim")).toBe(false);
  });

  it("comparative claims fail until the pre-registered wave flips the gate", () => {
    expect(COMPARATIVE_WAVE_MET).toBe(false);
    expect(lint("landing.proof.body", "Better than Grammarly at finding errors").some((v) => v.rule === "comparative_claim")).toBe(true);
    expect(lint("landing.proof.body", "Better than Grammarly at finding errors", true)).toEqual([]);
  });

  it("non-funnel keys are outside the asset/comparative scope (evasion still applies)", () => {
    expect(lint("editor.note", "faster than the previous build")).toEqual([]);
  });
});

describe("the Showcase fixture contract (§15.4; REQ-POS-3)", () => {
  it("passes with a contradicted Tier-1 claim + fetched URL; fails every honest shape otherwise", () => {
    const good = { claims: [{ tier: 1, verdict: "contradicted", sources: [{ url: "https://x.test/a" }] }] };
    expect(() => assertShowcaseFixture(good)).not.toThrow();
    expect(() => assertShowcaseFixture({ claims: [] })).toThrow(/contradicted tier-1/);
    expect(() =>
      assertShowcaseFixture({ claims: [{ tier: 1, verdict: "contradicted", sources: [] }] }),
    ).toThrow(); // contradicted but no fetched URL
    expect(() =>
      assertShowcaseFixture({ claims: [{ tier: 2, verdict: "contradicted", sources: [{ url: "https://x.test" }] }] }),
    ).toThrow(); // tier-2 does not satisfy the tier-1 rule
    expect(() =>
      assertShowcaseFixture({ claims: [{ tier: 1, verdict: "substantially_accurate", sources: [{ url: "https://x.test" }] }] }),
    ).toThrow(); // accurate does not satisfy the contradicted rule
  });
});
