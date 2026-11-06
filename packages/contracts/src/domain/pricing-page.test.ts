import { describe, expect, it } from "vitest";
import { PRICING, planOf } from "./pricing.js";
import { HERO_HEADLINE, COMPARATIVE_WAVE_MET, lintGrowthCopy } from "../growth-lint.js";
import { assertShowcaseFixture } from "./showcase.js";
import {
  buildPricingPageData,
  cardCreditsToUsd,
  costCardFigures,
  creditsLabel,
  draftCardCredits,
  planCoverageLine,
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
        return (
          (t.reading.intercept + t.reading.perWord * w) * mult * rigorMult +
          cl * perClaim * rigorMult
        );
      }
      case "draft":
        return (t.draft.intercept + t.draft.perWord * w + t.draft.perClaim * cl) * mult;
      case "revise": {
        const moves = Math.round(cl * t.revise.researchedMoveShare);
        return (
          (t.revise.intercept +
            t.revise.perWord * w +
            t.revise.perClaim * cl +
            moves * t.revise.perResearchedMove) *
          mult
        );
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
// EST.1 (N4 live catch): a printed RANGE must round outward — the low floors, the high ceils —
// so the card's bracket always contains the raw figure (a nearest-10 low can sit above it).
const cardFloor = (n: number) => Math.floor(n / 10) * 10;
const cardCeil = (n: number) => Math.ceil(n / 10) * 10;

describe("§15.2 pricing derivation (REQ-GROWTH-6/9)", () => {
  it("a Review's credits recompute from reading terms + per-verified-claim constants", () => {
    const t = PRICING.costCardTerms.reading;
    const words = 8_000,
      claims = 40;
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
      for (const row of card.rows.filter((r) => r.key !== "full_round")) {
        // outward rounding: the printed bracket always CONTAINS the raw Base/Frontier endpoints.
        const args = {
          workflow: (row.key === "review_no_fact_check" ? "review" : row.key) as "draft",
          rigor: "standard",
          inputs: { words: card.words, claims: card.claims },
          ...(row.key === "review_no_fact_check" ? { toggles: { fact_check: false } } : {}),
        };
        const baseRaw = PRICE.estimate({ ...args, modelTier: "base" })!;
        const frontierRaw = PRICE.estimate({ ...args, modelTier: "frontier" })!;
        expect(row.range!.low, `${card.key}/${row.key} low`).toBe(cardFloor(baseRaw));
        expect(row.range!.low, `${card.key}/${row.key} low ≤ raw`).toBeLessThanOrEqual(baseRaw);
        expect(row.range!.high, `${card.key}/${row.key} high`).toBe(cardCeil(frontierRaw));
        expect(row.range!.high, `${card.key}/${row.key} high ≥ raw`).toBeGreaterThanOrEqual(
          frontierRaw,
        );
      }
      // and the full-round row IS the per-tier sum, not a hand-typed total.
      expect(card.fullRoundByTier.base).toBe(
        draftCardCredits(PRICE, shape.words, shape.claims, "base")! +
          reviewCardCredits(PRICE, shape.words, shape.claims, "base")! +
          reviseCardCredits(PRICE, shape.words, shape.claims, "base")!,
      );
      expect(card.rows.find((r) => r.key === "full_round")!.range!.low).toBe(
        card.fullRoundByTier.base,
      );
      expect(card.rows.find((r) => r.key === "full_round")!.range!.high).toBe(
        card.fullRoundByTier.frontier,
      );
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
      expect(plan.annualSavingsUsdPerYear).toBeCloseTo(
        (p0.monthlyUsd - p0.annualMonthlyUsd!) * 12,
        6,
      );
      // the saving is real dollars, not a rounded zero
      expect(plan.annualSavingsUsdPerYear!).toBeGreaterThan(0);
    }
    // Team (waitlist) + Free carry no annual price.
    expect(data.plans.find((p) => p.tier === "team")!.annualSavingsUsdPerYear).toBeNull();
    expect(data.plans.find((p) => p.tier === "free")!.annualMonthlyUsd).toBe(
      planOf("free").annualMonthlyUsd,
    );
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
    const vcBase = (t.intercept + t.perWord * vc.words) * PRICING.modelTierMultipliers.base;
    expect(vc.range!.low).toBe(cardFloor(vcBase));
    expect(vc.range!.low).toBeLessThanOrEqual(vcBase);

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
    expect(q.a).toContain(
      reviewNoFactCheckCredits(PRICE, academic.words, academic.claims, "base")!.toLocaleString(
        "en-US",
      ),
    );
  });

  it("the FAQ's trial-pocket figure is DERIVED from PRICING.trial.pocketCredits — no literal", () => {
    const faq = pricingFaq(PRICE);
    const q = faq.find((f) => f.q === "What if I run out of credits?")!;
    expect(q.a).toContain(
      `${PRICING.trial.pocketCredits.toLocaleString("en-US")}-credit trial pocket`,
    );
    // no other digit-claim slips in — every figure the answer carries traces to a constant
    expect(q.a).toContain(`${PRICING.topUp.expiryMonths} months`);
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
    expect(m.columns).toEqual(
      ["free", "writer", "studio", "studio_max", "team"].map((t) => planOf(t).display),
    );
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

// R6MNY.1 (REQ-LCH-5b; GD-BL13.R6 "Keep anchors, metered") — the "≈N essay Reviews" coverage lines
// are recomputed from the estimator's RAW figure and floored, so a plan never promises more loops
// than its included credits buy. These tests pin that invariant against the real estimator path AND
// an adversarial pricer whose figures land on rounding boundaries; a hand-edited figure (a stale
// loop count, a non-derived claim) fails them.
describe("R6MNY.1 — 'what it covers' never over-promises (GD-BL13.R6)", () => {
  const gatedTiers = (Object.keys(PRICING.plans) as (keyof typeof PRICING.plans)[]).filter(
    (t) => PRICING.plans[t].whatItCoversClaimId != null,
  );
  const essay = PRICING.costCardShapes.find((s) => s.key === "essay")!;

  it("every printed loop figure × the raw per-loop estimate ≤ the plan's included credits", () => {
    for (const tier of gatedTiers) {
      const line = planCoverageLine(tier, PRICE)!;
      expect(line, `${tier} computes`).not.toBeNull();
      const p = planOf(tier);
      // REQ-KIT-4 (D8/RV-28): the line is one part per allowed tier — an "≈N" floored figure
      // for a ratio ≥ 1, "less than 1 a month" below it. Every part is verifiably within budget.
      const parts = line.split(" · ");
      expect(parts.length).toBe(p.modelTiers.length);
      for (const [i, mt] of p.modelTiers.entries()) {
        const raw = PRICE.estimate({
          workflow: "review",
          rigor: "standard",
          modelTier: mt,
          inputs: { words: essay.words, claims: essay.claims },
        })!;
        const ratio = p.includedCreditsMonthly / raw;
        if (ratio < 1) {
          expect(parts[i], `${tier}/${mt}`).toMatch(/^less than 1 /);
          expect(raw, `${tier}/${mt}: one full review exceeds the bundle`).toBeGreaterThan(
            p.includedCreditsMonthly,
          );
          continue;
        }
        const printed = parseFloat(parts[i]!.match(/≈([\d.]+)/)![1]!);
        // floored-to-0.1 ⇒ printed ≤ true ratio ⇒ printed × raw ≤ included, always.
        expect(printed, `${tier}/${mt}: ${printed} × ${raw}`).toBeLessThanOrEqual(ratio + 1e-9);
        expect(printed * raw, `${tier}/${mt}`).toBeLessThanOrEqual(p.includedCreditsMonthly + 1e-9);
      }
    }
  });

  it("a figure below one honest loop prints 'less than 1 …' — the floored truth, not ≈0.x (D8/RV-28)", () => {
    // 240_R7KIT.3a (REQ-KIT-4; spec §8.2) — Writer's Frontier tier prices at ≈0.7 loops today:
    // the line must say "less than 1 a month", never "≈0.7" (the audit's rounded-up read).
    const line = planCoverageLine("writer", PRICE)!;
    const parts = line.split(" · ");
    const rawFrontier = PRICE.estimate({
      workflow: "review",
      rigor: "standard",
      modelTier: "frontier",
      inputs: { words: essay.words, claims: essay.claims },
    })!;
    const writer = planOf("writer");
    if (writer.includedCreditsMonthly / rawFrontier < 1) {
      expect(parts[2]).toBe("less than 1 a month on Frontier");
    }
    // The same truth on a synthetic just-under-one pricer — the wording fires on the <1 ratio,
    // never on the printed decimal.
    const justDear: SurfacePricer = {
      estimate: () => writer.includedCreditsMonthly * 1.5,
      perVerifiedClaim: () => null,
    };
    const under = planCoverageLine("writer", justDear)!;
    expect(under).toContain("less than 1 essay review a month on Base");
    expect(under).not.toContain("≈0");
    expect(under).not.toMatch(/≈0\.\d/);
    // And a deeply-overpriced pricer prints the same honest words (never hides a gated plan).
    const wayDear: SurfacePricer = {
      estimate: () => writer.includedCreditsMonthly * 20,
      perVerifiedClaim: () => null,
    };
    expect(planCoverageLine("writer", wayDear)).toContain(
      "less than 1 essay review a month on Base",
    );
  });

  it("floors — a true 1.49-loop ratio prints ≈1.4, not ≈1.5 (never the generous rounding)", () => {
    // An adversarial pricer: Base costs just over `included/1.5` so the true ratio is 1.49 —
    // a nearest-round implementation would print ≈1.5 and promise loops the credits don't buy.
    const p = planOf("writer");
    const rawBase = Math.ceil(p.includedCreditsMonthly / 1.49);
    const adversarial: SurfacePricer = {
      estimate: () => rawBase,
      perVerifiedClaim: () => null,
    };
    const line = planCoverageLine("writer", adversarial)!;
    expect(line).toContain("≈1.4 ");
    expect(line).not.toContain("≈1.5");
    // and the printed figure is verifiably within budget on the same raw figure.
    expect(parseFloat(line.match(/≈([\d.]+)/)![1]!) * rawBase).toBeLessThanOrEqual(
      p.includedCreditsMonthly,
    );
  });

  it("null/non-computable stays hidden — an absent pricer or a non-positive raw never prints", () => {
    expect(planCoverageLine("writer", undefined)).toBeNull();
    const dead: SurfacePricer = { estimate: () => null, perVerifiedClaim: () => null };
    expect(planCoverageLine("writer", dead)).toBeNull();
    const zero: SurfacePricer = { estimate: () => 0, perVerifiedClaim: () => null };
    expect(planCoverageLine("writer", zero)).toBeNull();
  });

  it("no remembered figure — a pricer returning different numbers changes the rendered line", () => {
    const doubled: SurfacePricer = {
      estimate: (a) => PRICE.estimate(a)! * 2,
      perVerifiedClaim: () => null,
    };
    for (const tier of gatedTiers) {
      expect(planCoverageLine(tier, doubled)).not.toBe(planCoverageLine(tier, PRICE));
    }
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
    expect(
      lint("landing.hero.sub", "Rhēma writes your draft for you").some(
        (v) => v.rule === "generation_promise",
      ),
    ).toBe(true);
    expect(
      lint("landing.proof.body", "It generates the whole essay").some(
        (v) => v.rule === "generation_promise",
      ),
    ).toBe(true);
    expect(
      lint("landing.workflow.note", "Rhēma writes your draft for you").some(
        (v) => v.rule === "generation_promise",
      ),
    ).toBe(false);
  });

  it("detection-evasion language fails EVERYWHERE — any key", () => {
    expect(
      lint("footer.note", "undetectable by any AI detector").some(
        (v) => v.rule === "detection_evasion",
      ),
    ).toBe(true);
    expect(
      lint("pricing.faq.a", "beats Turnitin scans").some((v) => v.rule === "detection_evasion"),
    ).toBe(true);
  });

  it("placeholder logos/testimonials fail; unbuilt assets need a forward-looking marker", () => {
    expect(
      lint("landing.proof.logos", "As featured in the Times — logos").some(
        (v) => v.rule === "placeholder_logo",
      ),
    ).toBe(true);
    expect(
      lint("landing.seat.body", "Our mobile app syncs your drafts").some(
        (v) => v.rule === "unbuilt_asset_claim",
      ),
    ).toBe(true);
    expect(
      lint("pricing.faq.a", "The mobile app is on the roadmap").some(
        (v) => v.rule === "unbuilt_asset_claim",
      ),
    ).toBe(false);
  });

  it("comparative claims fail until the pre-registered wave flips the gate", () => {
    expect(COMPARATIVE_WAVE_MET).toBe(false);
    expect(
      lint("landing.proof.body", "Better than Grammarly at finding errors").some(
        (v) => v.rule === "comparative_claim",
      ),
    ).toBe(true);
    expect(lint("landing.proof.body", "Better than Grammarly at finding errors", true)).toEqual([]);
  });

  it("non-funnel keys are outside the asset/comparative scope (evasion still applies)", () => {
    expect(lint("editor.note", "faster than the previous build")).toEqual([]);
  });
});

describe("the Showcase fixture contract (§15.4; REQ-POS-3)", () => {
  it("passes with a contradicted Tier-1 claim + fetched URL; fails every honest shape otherwise", () => {
    const good = {
      claims: [{ tier: 1, verdict: "contradicted", sources: [{ url: "https://x.test/a" }] }],
    };
    expect(() => assertShowcaseFixture(good)).not.toThrow();
    expect(() => assertShowcaseFixture({ claims: [] })).toThrow(/contradicted tier-1/);
    expect(() =>
      assertShowcaseFixture({ claims: [{ tier: 1, verdict: "contradicted", sources: [] }] }),
    ).toThrow(); // contradicted but no fetched URL
    expect(() =>
      assertShowcaseFixture({
        claims: [{ tier: 2, verdict: "contradicted", sources: [{ url: "https://x.test" }] }],
      }),
    ).toThrow(); // tier-2 does not satisfy the tier-1 rule
    expect(() =>
      assertShowcaseFixture({
        claims: [
          { tier: 1, verdict: "substantially_accurate", sources: [{ url: "https://x.test" }] },
        ],
      }),
    ).toThrow(); // accurate does not satisfy the contradicted rule
  });
});
