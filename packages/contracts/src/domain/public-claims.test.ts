import { describe, expect, it } from "vitest";
import {
  PUBLIC_CLAIM_IDS,
  PUBLIC_CLAIM_COPY,
  publicClaimEnabled,
  type PublicClaimsConfig,
} from "./public-claims.js";
import { PRICING } from "./pricing.js";
import { buildPricingPageData, planLadder, visiblePlansPublication } from "./pricing-page.js";

// HOT.1 — the public-claims visibility config (ADR-019): the shipped defaults hide every gated
// claim, the pricing-page model and the /billing/plans publication null claim text out while an id
// is off, and a test config flips ids on without touching copy. ACT.1 re-enables
// `trial.firstReviewIncluded` from the entitlement config; EST.1 `plans.whatItCovers` from the
// estimator — never as parallel copy.

const ALL_ON: PublicClaimsConfig = {
  enabled: { "trial.firstReviewIncluded": true, "plans.whatItCovers": true },
};

describe("the claims config", () => {
  it("names both HOT.1 claim ids and ships with every one disabled", () => {
    expect(PUBLIC_CLAIM_IDS).toEqual(["trial.firstReviewIncluded", "plans.whatItCovers"]);
    for (const id of PUBLIC_CLAIM_IDS) expect(publicClaimEnabled(id)).toBe(false);
  });

  it("publicClaimEnabled treats only explicit `true` as on (absent ⇒ off)", () => {
    expect(publicClaimEnabled("trial.firstReviewIncluded", { enabled: {} })).toBe(false);
    expect(publicClaimEnabled("trial.firstReviewIncluded", { enabled: { "trial.firstReviewIncluded": true } })).toBe(true);
  });
});

describe("planLadder — the gated coverage lines", () => {
  it("nulls the ≈-loop lines while `plans.whatItCovers` is hidden", () => {
    const cards = planLadder();
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      expect(cards.find((c) => c.tier === tier)!.whatItCovers).toBeNull();
    }
    // the ungated lines (Free/Team are factual) still render.
    expect(cards.find((c) => c.tier === "team")!.whatItCovers).toContain("Pooled credits");
  });

  it("renders them once the id is enabled — the SAME pricing.json text, no parallel copy", () => {
    const cards = planLadder(ALL_ON);
    for (const tier of ["writer", "studio", "studio_max"] as const) {
      expect(cards.find((c) => c.tier === tier)!.whatItCovers).toBe(PRICING.plans[tier].whatItCovers);
    }
  });
});

describe("the Free card's trialWindow — the included-Review claim", () => {
  it("omits the trial-window claim while hidden; the post-trial honesty line stays", () => {
    const free = buildPricingPageData().plans.find((p) => p.tier === "free")!;
    expect(free.freeNotes?.trialWindow).toBeUndefined();
    expect(free.freeNotes?.postTrial).toBe(PRICING.trial.postTrialNote);
  });

  it("renders the pricing.json includedNote verbatim when enabled", () => {
    const free = buildPricingPageData(ALL_ON).plans.find((p) => p.tier === "free")!;
    expect(free.freeNotes?.trialWindow).toBe(PRICING.trial.includedNote);
  });
});

describe("visiblePlansPublication — the /billing/plans DTO redaction", () => {
  it("transmits null for every hidden claim field", () => {
    const { plans, trial } = visiblePlansPublication();
    expect(plans.writer.whatItCovers).toBeNull();
    expect(plans.studio.whatItCovers).toBeNull();
    expect(plans.studio_max.whatItCovers).toBeNull();
    expect(trial.includedNote).toBeNull();
    // ungated fields pass through.
    expect(plans.free.whatItCovers).toBe(PRICING.plans.free.whatItCovers);
    expect(trial.postTrialNote).toBe(PRICING.trial.postTrialNote);
  });

  it("transmits the claim text once the ids are enabled", () => {
    const { plans, trial } = visiblePlansPublication(ALL_ON);
    expect(plans.writer.whatItCovers).toBe(PRICING.plans.writer.whatItCovers);
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
