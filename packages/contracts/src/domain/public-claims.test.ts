import { describe, expect, it } from "vitest";
import {
  PUBLIC_CLAIM_IDS,
  PUBLIC_CLAIM_COPY,
  PUBLIC_CLAIMS,
  publicClaimEnabled,
  type PublicClaimsConfig,
} from "./public-claims.js";
import { PRICING } from "./pricing.js";
import {
  buildPricingPageData,
  planCoverageLine,
  planLadder,
  visiblePlansPublication,
  type SurfacePricer,
} from "./pricing-page.js";

// HOT.1 — the public-claims visibility config (ADR-019): the pricing-page model and the
// /billing/plans publication null claim text out while an id is off, and a test config flips ids on
// without touching copy. ACT.1 re-enables `trial.firstReviewIncluded` from the entitlement config;
// EST.1 SHIPPED `plans.whatItCovers` — but the line is now COMPUTED through the injected pricer, so
// an enabled claim with no pricer still renders nothing (fail-closed, never the stale
// pricing.json string).

const ALL_ON: PublicClaimsConfig = {
  enabled: { "trial.firstReviewIncluded": true, "plans.whatItCovers": true },
};

const COVERAGES_OFF: PublicClaimsConfig = {
  enabled: { "plans.whatItCovers": false },
};

/** A test-local pricer (contracts is a leaf — the real `surfacePricer()` lives in @rhema/run-sheet). */
const fixturePricer = (): SurfacePricer => ({
  estimate: (a) => {
    if (a.workflow !== "review") return null;
    const t = PRICING.costCardTerms;
    return (
      (t.reading.intercept + t.reading.perWord * (a.inputs.words ?? 0)) *
        (PRICING.modelTierMultipliers[a.modelTier] ?? 1) +
      (a.inputs.claims ?? 0) * (PRICING.costPerVerifiedClaim.review?.[a.modelTier] ?? 0)
    );
  },
});
const PRICE = fixturePricer();

describe("the claims config", () => {
  it("names both HOT.1 claim ids; only the EST.1 coverage claim ships enabled", () => {
    expect(PUBLIC_CLAIM_IDS).toEqual(["trial.firstReviewIncluded", "plans.whatItCovers"]);
    expect(publicClaimEnabled("trial.firstReviewIncluded")).toBe(false); // ACT.1's flip
    expect(publicClaimEnabled("plans.whatItCovers")).toBe(true); // EST.1's flip
  });

  it("publicClaimEnabled treats only explicit `true` as on (absent ⇒ off)", () => {
    expect(publicClaimEnabled("trial.firstReviewIncluded", { enabled: {} })).toBe(false);
    expect(publicClaimEnabled("trial.firstReviewIncluded", { enabled: { "trial.firstReviewIncluded": true } })).toBe(true);
  });
});

describe("planLadder — the gated coverage lines", () => {
  it("nulls the ≈-loop lines while `plans.whatItCovers` is hidden", () => {
    const cards = planLadder(COVERAGES_OFF, PRICE);
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      expect(cards.find((c) => c.tier === tier)!.whatItCovers).toBeNull();
    }
    // the ungated lines (Free/Team are factual) still render.
    expect(cards.find((c) => c.tier === "team")!.whatItCovers).toContain("Pooled credits");
  });

  it("fails CLOSED while enabled but unpriced — no pricer ⇒ null, never the stale pricing.json copy", () => {
    const cards = planLadder(ALL_ON); // claim on, no pricer
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      expect(cards.find((c) => c.tier === tier)!.whatItCovers).toBeNull();
    }
    const stale = [PRICING.plans.writer.whatItCovers, PRICING.plans.studio.whatItCovers];
    for (const c of cards) expect(stale).not.toContain(c.whatItCovers);
  });

  it("renders the COMPUTED line once enabled + priced — the shared pricer's figure, no parallel copy", () => {
    const cards = planLadder(ALL_ON, PRICE);
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      const line = cards.find((c) => c.tier === tier)!.whatItCovers;
      expect(line).toBe(planCoverageLine(tier, PRICE));
      expect(line).toMatch(/^≈[\d.]+ essay Reviews on Base/);
      // and it is NOT the retired pricing.json string (a stale hand-composed figure would differ).
      expect(line).not.toBe(PRICING.plans[tier].whatItCovers);
    }
    // a pricer that cannot price a tier's shape hides that plan's line even while enabled.
    const partial = planLadder(ALL_ON, { estimate: () => null });
    expect(partial.find((c) => c.tier === "writer")!.whatItCovers).toBeNull();
  });
});

describe("the Free card's trialWindow — the included-Review claim", () => {
  it("omits the trial-window claim while hidden; the post-trial honesty line stays", () => {
    const free = buildPricingPageData().plans.find((p) => p.tier === "free")!;
    expect(free.freeNotes?.trialWindow).toBeUndefined();
    expect(free.freeNotes?.postTrial).toBe(PRICING.trial.postTrialNote);
  });

  it("renders the pricing.json includedNote verbatim when enabled", () => {
    const free = buildPricingPageData(ALL_ON, PRICE).plans.find((p) => p.tier === "free")!;
    expect(free.freeNotes?.trialWindow).toBe(PRICING.trial.includedNote);
  });
});

describe("visiblePlansPublication — the /billing/plans DTO redaction", () => {
  it("transmits null for every hidden claim field", () => {
    const { plans, trial } = visiblePlansPublication(COVERAGES_OFF, PRICE);
    expect(plans.writer.whatItCovers).toBeNull();
    expect(plans.studio.whatItCovers).toBeNull();
    expect(plans.studio_max.whatItCovers).toBeNull();
    expect(trial.includedNote).toBeNull();
    // ungated fields pass through.
    expect(plans.free.whatItCovers).toBe(PRICING.plans.free.whatItCovers);
    expect(trial.postTrialNote).toBe(PRICING.trial.postTrialNote);
  });

  it("the shipped defaults transmit the COMPUTED coverage (claim on, priced) — never the stale copy", () => {
    const { plans } = visiblePlansPublication(PUBLIC_CLAIMS, PRICE);
    expect(plans.writer.whatItCovers).toBe(planCoverageLine("writer", PRICE));
    expect(plans.writer.whatItCovers).not.toBe(PRICING.plans.writer.whatItCovers);
    // and an absent pricer still redacts an ENABLED claim.
    const bare = visiblePlansPublication(PUBLIC_CLAIMS);
    expect(bare.plans.writer.whatItCovers).toBeNull();
  });

  it("transmits the claim text once the ids are enabled", () => {
    const { plans, trial } = visiblePlansPublication(ALL_ON, PRICE);
    expect(plans.writer.whatItCovers).toBe(planCoverageLine("writer", PRICE));
    expect(trial.includedNote).toBe(PRICING.trial.includedNote);
  });
});

describe("the claim-ON copy's home", () => {
  it("PUBLIC_CLAIM_COPY holds the gated variants (so the web copy table can stay claim-free)", () => {
    expect(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote).toContain("first review is included");
    expect(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer).toContain("first review is included");
    expect(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].trialRuleFmt).toContain("included Review");
  });
});
