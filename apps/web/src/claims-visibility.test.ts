import { describe, expect, it } from "vitest";
import {
  PRICING,
  PUBLIC_CLAIM_COPY,
  PUBLIC_CLAIMS,
  visiblePlansPublication,
  type PublicClaimsConfig,
} from "@rhema/contracts";
import type { BillingPlansDto, BillingSubscriptionDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// HOT.1 (AC: claims) — the rendered landing/pricing/billing pages carry NO hidden claim's text, and
// a test config flipping the ids renders the claim copy without any copy-table change. The marketing
// surfaces read the gate from `deps.claims` (→ PageData.claims); the billing page reads the
// /billing/plans DTO — `visiblePlansPublication` is what the api transmits, so the hidden fixture is
// the real redacted payload.

const CLAIM_TEXTS = [
  PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote, // "…first review is included."
  PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer,
  "one included Review", // the trialRuleFmt claim phrase
  PRICING.trial.includedNote, // "…on us, plus a 150-credit pocket."
  PRICING.plans.writer.whatItCovers, // "≈3 essay loops…"
  PRICING.plans.studio.whatItCovers,
  PRICING.plans.studio_max.whatItCovers,
];

const ALL_ON: PublicClaimsConfig = {
  enabled: { "trial.firstReviewIncluded": true, "plans.whatItCovers": true },
};

/** The /billing/plans DTO the api transmits under `claims` (redacted fields are null while hidden). */
function plansDto(claims: PublicClaimsConfig = PUBLIC_CLAIMS): BillingPlansDto {
  const visible = visiblePlansPublication(claims);
  return {
    version: String(PRICING.version),
    issuedAt: PRICING.issuedAt,
    usdPerCredit: PRICING.usdPerCredit,
    platformRate: PRICING.platformRate,
    annualSavingsPct: PRICING.annualSavingsPct,
    plans: visible.plans,
    trial: visible.trial,
    topUpPacks: PRICING.topUpPacks,
    autoReloadDefaults: PRICING.autoReload,
  } as unknown as BillingPlansDto;
}

function deps(over: Partial<WebDeps> = {}, dsOver: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => [],
      getSubscription: async (): Promise<BillingSubscriptionDto> => ({
        tier: "free",
        subscription: null,
        trial: {
          state: "trial_active",
          entitlement: { id: "te_1", state: "active", wordCap: 6000, expiresAt: null },
        },
        autoReload: { enabled: false, thresholdCredits: null, packId: null, monthlyCapUsd: null },
        hasStripeCustomer: false,
      }),
      getPlans: async () => plansDto(),
      ...dsOver,
    } as DataSource,
    session: () => null,
    ...over,
  };
}

describe("the landing + pricing pages hide every gated claim (default config)", () => {
  it.each(["/", "/pricing"])("%s renders none of the hidden claim strings", async (path) => {
    const html = await (await createWebApp(deps()).request(path)).text();
    for (const s of CLAIM_TEXTS) expect(html).not.toContain(s);
    // the honest fallbacks render instead ("No card required." / "…no card.")
    expect(html.toLowerCase()).toContain("no card");
    expect(html).not.toContain("≈3 essay loops");
  });

  it("flipping the ids on renders the claim text — no copy-table change (ACT.1/EST.1's seam)", async () => {
    const app = createWebApp(deps({ claims: ALL_ON }));
    const landing = await (await app.request("/")).text();
    expect(landing).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote);
    expect(landing).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer);
    const pricing = await (await app.request("/pricing")).text();
    expect(pricing).toContain("one included Review");
    expect(pricing).toContain(PRICING.plans.writer.whatItCovers);
    expect(pricing).toContain(PRICING.trial.includedNote);
  });
});

describe("the billing page renders the DTO the api redacted", () => {
  it("hidden claims: trial_active shows the factual window line; no ≈-loop lines", async () => {
    const app = createWebApp(deps({ session: () => ({}) }));
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain('data-trial-state="active"');
    expect(html).toContain("Trial window — 14 days.");
    for (const s of CLAIM_TEXTS) expect(html).not.toContain(s);
    // the "Included" badge rides with the claim text — neither renders while hidden
    expect(html).not.toContain("Included");
    for (const s of [PRICING.plans.writer.whatItCovers, PRICING.plans.studio_max.whatItCovers])
      expect(html).not.toContain(s);
  });

  it("claim-on DTO: the included note + coverage lines render", async () => {
    const app = createWebApp(
      deps({ session: () => ({}) }, { getPlans: async () => plansDto(ALL_ON) }),
    );
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain(PRICING.trial.includedNote);
    expect(html).toContain(PRICING.plans.writer.whatItCovers);
  });
});
