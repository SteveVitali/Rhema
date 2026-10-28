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
 *  `workspaces.is_test`; under R6LCH.1's shipped `everyone` audience every viewer is covered. */
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

describe("the landing + pricing pages publish the launched claim (shipped audience: everyone)", () => {
  it("R6LCH.1 — an anonymous / now carries the trial claim copy (audience=everyone covers them)", async () => {
    const html = await (await createWebApp(deps()).request("/")).text();
    expect(html).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote);
    expect(html).toContain(PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer);
    // the honest qualifier still rides the claim — "no card required" is the trial's terms.
    expect(html.toLowerCase()).toContain("no card");
    // the retired hand-typed coverage phrase never returns — only the computed line may render.
    expect(html).not.toContain("≈3 essay loops");
  });

  it("R6LCH.1 — an anonymous /pricing carries the generated figures + the computed coverage", async () => {
    const html = await (await createWebApp(deps()).request("/pricing")).text();
    expect(html).toContain("one included Review");
    expect(html).toContain(PRICING.trial.includedNote);
    const covers = planCoverageLine("writer", surfacePricer());
    expect(covers).not.toBeNull();
    expect(html).toContain(covers!);
    expect(html).not.toContain("≈3 essay loops");
  });

  it("the flagged test tenant's ?audience=test preview still renders config-equal claims (ACT.1/EST.1's seam)", async () => {
    // ACT.1 (ADR-042) — the preview leg stays: a signed-in JOURNEY.1 tenant asking
    // `?audience=test` sees the same config-equal render everyone now gets.
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
  });
});

// SPA.27 — the redacted-DTO rendering is leaf paint now: the twin ships the api's verbatim
// `plans` DTO, and the claims-visibility invariant (a hidden claim never reaches the payload) is
// what survives on the server.
describe("the billing twin ships the DTO the api redacted", () => {
  const plansOf = async (app: ReturnType<typeof createWebApp>) =>
    (
      (await (await app.request("/bff/settings/billing")).json()) as {
        billing: { plans: { trial?: { includedNote?: string | null }; plans?: Record<string, { whatItCovers?: string | null }> } } | null;
      }
    ).billing?.plans;

  it("the launched DTO: the plans payload now carries includedNote for an unflagged viewer (R6LCH.1)", async () => {
    // audience `everyone` covers this (non-test) viewer — the claim transmits verbatim.
    const plans = await plansOf(createWebApp(deps({ session: () => ({}) })));
    expect(plans?.trial?.includedNote).toBe(PRICING.trial.includedNote);
  });

  it("a disabled claim still redacts to null — the machinery stays armed", async () => {
    const hidden: PublicClaimsConfig = {
      enabled: { "trial.firstReviewIncluded": false, "plans.whatItCovers": false },
    };
    const plans = await plansOf(
      createWebApp(deps({ session: () => ({}) }, { getPlans: async () => plansDto(hidden, true) })),
    );
    expect(plans?.trial?.includedNote ?? null).toBeNull();
    // no claim text reaches the payload while the flag is off — the leaf can never paint it.
    const serialized = JSON.stringify(plans);
    for (const s of CLAIM_TEXTS) expect(serialized).not.toContain(s);
    expect(serialized).not.toContain("Included");
  });

  it("claim-on DTO (a covered audience's transmission): the included note reaches the twin verbatim", async () => {
    // ACT.1 — under the shipped `everyone` audience a real viewer's DTO carries `includedNote`;
    // the ALL_ON seam stays as the explicit claim-on transmission leg.
    const plans = await plansOf(
      createWebApp(deps({ session: () => ({}) }, { getPlans: async () => plansDto(ALL_ON, true) })),
    );
    expect(plans?.trial?.includedNote).toBe(PRICING.trial.includedNote);
    // the computed coverage line the leaf paints still resolves through the shared pricer.
    expect(planCoverageLine("writer", surfacePricer())).not.toBeNull();
  });
});
