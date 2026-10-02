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
  creditsLabel,
  draftCardCredits,
  pricingFaq,
  pricingMatrix,
  quickReviewLine,
  rangeLabel,
  reviewCardCredits,
  reviewNoFactCheckCredits,
  reviseCardCredits,
  voiceProfileCard,
  type SurfacePricer,
} from "./pricing-page.js";

// EST.1 — the page's figures now flow through an injected `SurfacePricer` (the estimator-facing
// call). Contracts is a leaf — it cannot import the real `surfacePricer()` from @rhema/run-sheet —
// so this file injects a FIXTURE pricer that mirrors the published modelled terms (pricing.json's
// costCardTerms). That keeps the composition assertions honest: a hand-edited figure still fails,
// the injection plumbing is exercised, and the REAL estimator's figure parity is asserted where the
// implementation lives (run-sheet's surface.test.ts). A pricer that cannot price yields "—"/null —
// never a stale number — and a separate test pins that contract.

/** The published modelled terms as a SurfacePricer — a fixture, not the estimator. */
const fixturePricer = (): SurfacePricer => ({
  estimate: (a) => {
    const mult = PRICING.modelTierMultipliers[a.modelTier] ?? 1;
    const t = PRICING.costCardTerms;
    const w = a.inputs.words ?? 0;
    const cl = a.inputs.claims ?? 0;
    const rigorMult = t.quickReview.rigorMultipliers[a.rigor] ?? 1;
    switch (a.workflow) {
      case "review": {
        const perClaim =
          a.toggles?.fact_check === false
            ? t.unverifiedClaimCredits * mult
            : (PRICING.costPerVerifiedClaim.review?.[a.modelTier] ?? 0);
        return (t.reading.intercept + t.reading.perWord * w) * mult * rigorMult + cl * perClaim * rigorMult;
      }
      case "draft":
        return (t.draft.intercept + t.draft.perWord * w + t.draft.perClaim * cl) * mult;
      case "revise": {
        const moves = Math.round(cl * t.revise.researchedMoveShare);
        return (t.revise.intercept + t.revise.perWord * w + t.revise.perClaim * cl + moves * t.revise.perResearchedMove) * mult;
      }
      case "voice_profile":
        return (t.voiceProfile.intercept + t.voiceProfile.perWord * w) * mult;
      default:
        return null;
    }
  },
  perVerifiedClaim: (wf, tier) => PRICING.costPerVerifiedClaim[wf]?.[tier] ?? null,
});
const PRICE = fixturePricer();

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
      expect(reviewCardCredits(PRICE, words, claims, tier)).toBe(expected);
    }
  });

  it("every cost-card figure is a RANGE (low < high) — never a single value", () => {
    for (const shape of PRICING.costCardShapes) {
      const card = costCardFigures(PRICE, shape);
      for (const row of card.rows) {
        expect(row.range!.low).toBeLessThan(row.range!.high);
        expect(row.range!.low).toBeGreaterThan(0);
      }
      // and the full-round row IS the per-tier sum, not a hand-typed total.
      expect(card.fullRoundByTier.base).toBe(
        draftCardCredits(PRICE, shape.words, shape.claims, "base")! +
          reviewCardCredits(PRICE, shape.words, shape.claims, "base")! +
          reviseCardCredits(PRICE, shape.words, shape.claims, "base")!,
      );
      expect(card.rows.find((r) => r.key === "full_round")!.range!.low).toBe(card.fullRoundByTier.base);
      expect(card.rows.find((r) => r.key === "full_round")!.range!.high).toBe(card.fullRoundByTier.frontier);
    }
  });

  it("the ESSAY card leads the cards (the §15.2 ordering rule)", () => {
    const data = buildPricingPageData(undefined, PRICE);
    expect(data.cards.length).toBeGreaterThanOrEqual(1);
    // costCardShapes order is the publication's; the essay shape must be first on the page.
    expect(data.cards[0]!.key).toBe(PRICING.costCardShapes[0]!.key);
    expect(data.cards[0]!.key.toLowerCase()).toMatch(/essay|academic/);
  });

  it("annual saves exactly 15% and renders the saving in DOLLARS per year", () => {
    const data = buildPricingPageData(undefined, PRICE);
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
      expect(reviewNoFactCheckCredits(PRICE, academic.words, academic.claims, tier)!).toBeLessThan(
        reviewCardCredits(PRICE, academic.words, academic.claims, tier)!,
      );
    }
  });

  it("the voice card + quick-review line derive from their published terms", () => {
    const vc = voiceProfileCard(PRICE);
    const t = PRICING.costCardTerms.voiceProfile;
    expect(vc.words).toBe(PRICING.costCardTerms.voiceCorpusWords);
    expect(vc.range!.low).toBe(cardRound((t.intercept + t.perWord * vc.words) * PRICING.modelTierMultipliers.base));

    const qr = quickReviewLine(PRICE);
    expect(qr.wordCap).toBe(PRICING.costCardTerms.quickReview.wordCap);
    expect(qr.byRigor.standard).toBe(reviewCardCredits(PRICE, qr.wordCap, qr.claims, "base"));
    expect(qr.byRigor.quick!).toBeLessThan(qr.byRigor.standard!);
    expect(qr.byRigor.full_board!).toBeGreaterThan(qr.byRigor.standard!);
  });

  it("the FAQ's 8,000-word figure is COMPUTED (not quoted) from the academic shape", () => {
    const academic = PRICING.costCardShapes.find((s) => s.key === "academic")!;
    const faq = pricingFaq(PRICE);
    const q = faq[0]!;
    expect(q.q).toContain(academic.words.toLocaleString("en-US"));
    const reviewBase = reviewCardCredits(PRICE, academic.words, academic.claims, "base")!;
    expect(q.q).toContain(`$${Math.round(cardCreditsToUsd(reviewBase))}`);
    expect(q.a).toContain(reviewBase.toLocaleString("en-US"));
    expect(q.a).toContain(reviewNoFactCheckCredits(PRICE, academic.words, academic.claims, "base")!.toLocaleString("en-US"));
  });

  it("an absent pricer fails CLOSED — every figure is an em-dash/null, never a remembered number", () => {
    const data = buildPricingPageData();
    for (const card of data.cards) {
      for (const row of card.rows) expect(row.range).toBeNull();
      expect(card.fullRoundByTier.base).toBeNull();
    }
    const qr = quickReviewLine(undefined);
    expect(qr.byRigor.standard).toBeNull();
    expect(creditsLabel(null)).toBe("—");
    expect(rangeLabel(null)).toBe("—");
    expect(voiceProfileCard(undefined).range).toBeNull();
    // a priced card's rows are the sweep low→high through the SAME injected call.
    const priced = costCardFigures(PRICE, PRICING.costCardShapes[0]!);
    expect(priced.rows.every((r) => r.range != null)).toBe(true);
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
