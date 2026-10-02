import { describe, expect, it } from "vitest";
import {
  PRICING,
  PUBLIC_CLAIM_COPY,
  PUBLIC_CLAIMS,
  claimsForAudience,
  planCoverageLine,
  visiblePlansPublication,
  type PublicClaimsConfig,
} from "@rhema/contracts";
import { surfacePricer } from "@rhema/run-sheet";
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

/** The /billing/plans DTO the api transmits under `claims` (redacted fields are null while hidden;
 *  enabled coverage lines are the COMPUTED ones — the api injects `surfacePricer()`). ACT.1 —
 *  the api folds the viewer's audience in FIRST (`claimsForAudience`): `isTest` mirrors
 *  `workspaces.is_test` under the `test_tenants` posture. */
function plansDto(claims: PublicClaimsConfig = PUBLIC_CLAIMS, isTest = false): BillingPlansDto {
  const visible = visiblePlansPublication(claimsForAudience(claims, isTest), surfacePricer());
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

  it("flipping the ids on renders the claim text — the flagged test tenant's ?audience=test preview (ACT.1/EST.1's seam)", async () => {
    // ACT.1 (ADR-042) — the trial claim renders only inside `trial.audience` ('test_tenants'):
    // an enabled flag alone doesn't publish it. The preview belongs to a signed-in JOURNEY.1
    // tenant asking `?audience=test`; everyone else still gets the audience-disabled form.
    const app = createWebApp(
      deps(
        { claims: ALL_ON, session: () => ({}) },
        {
          getSessionPrincipal: async () => ({
            userId: "u_t",
            workspaceId: "ws_t",
            billingAccountId: "ba_t",
            isTest: true,
          }),
        },
      ),
    );
    const landing = await (await app.request("/?audience=test")).text();
    expect(landing).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote);
    expect(landing).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer);
    const pricing = await (await app.request("/pricing?audience=test")).text();
    expect(pricing).toContain("one included Review");
    // EST.1 — the coverage line is COMPUTED through the shared pricer, not the pricing.json copy.
    const covers = planCoverageLine("writer", surfacePricer());
    expect(covers).not.toBeNull();
    expect(pricing).toContain(covers!);
    expect(pricing).toContain(PRICING.trial.includedNote);
    // and an anonymous viewer (or the same tenant without the preview flag) still sees none of it.
    const anon = await (await createWebApp(deps({ claims: ALL_ON })).request("/")).text();
    expect(anon).not.toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote);
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

  it("claim-on DTO (a covered audience's transmission): the included note + computed coverage lines render", async () => {
    // ACT.1 — `isTest: true` is the /billing/plans DTO the api sends a JOURNEY.1 tenant under
    // `test_tenants`; a real viewer's DTO keeps `includedNote` null while the flip is paused.
    const app = createWebApp(
      deps({ session: () => ({}) }, { getPlans: async () => plansDto(ALL_ON, true) }),
    );
    const html = await (await app.request("/settings/billing")).text();
    expect(html).toContain(PRICING.trial.includedNote);
    expect(html).toContain(planCoverageLine("writer", surfacePricer())!);
  });
});
