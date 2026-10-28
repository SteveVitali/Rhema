// ACT.1 — the trial claim render model's contract tests (§14.3; REQ-SPEC-8; ADR-014/042):
// `deriveTrialWordCap` decides the interim cap from evaluated cost points under the provisional
// absorbed-COGS ceiling; `claimsForAudience`/`trialAudienceAllows` gate every claim render on the
// go-live flag; the generated note lines carry figures only from the typed config.
import { describe, expect, it } from "vitest";
import { PRICING } from "./pricing.js";
import {
  TRIAL_AUDIENCES,
  TRIAL_CAP_FLOOR_WORDS,
  claimsForAudience,
  deriveTrialWordCap,
  sheetEntitlementLine,
  trialAudienceAllows,
  trialIncludedNote,
  trialPostTrialNote,
  type TrialCostPoint,
} from "./trial-claims.js";
import { publicClaimEnabled, type PublicClaimsConfig } from "./public-claims.js";

/** A fixture curve shaped like the ECON.1 measured Review·Standard·Base cost card (post-RES.1):
 *  ~$13.30 list COGS at 1,700 words rising to ~$15.35 at 3,000 — 2,800 is the largest ≤$15 fit. */
const FIXTURE_CARD: TrialCostPoint[] = [
  { words: 1500, p90Usd: 11.9 },
  { words: 1700, p90Usd: 13.3 },
  { words: 2000, p90Usd: 13.71 },
  { words: 2400, p90Usd: 14.51 },
  { words: 2800, p90Usd: 14.95 },
  { words: 2900, p90Usd: 15.33 },
  { words: 3000, p90Usd: 15.35 },
];

describe("deriveTrialWordCap — the $15 interim ceiling", () => {
  it("returns the largest candidate whose p90 fits the ceiling (2800 on the fixture card)", () => {
    const d = deriveTrialWordCap(FIXTURE_CARD, 15);
    expect(d).toEqual({ status: "ok", wordCap: 2800, atUsd: 14.95 });
  });

  it("equals the published `trial.entitlement.wordCap` — the config value IS the derivation", () => {
    const d = deriveTrialWordCap(FIXTURE_CARD, PRICING.trial.capCeilingUsd);
    expect(d.status).toBe("ok");
    expect((d as { wordCap: number }).wordCap).toBe(PRICING.trial.entitlement.wordCap);
  });

  it("a tighter ceiling lands on a lower cap — the ceiling drives the cap, not a constant", () => {
    // $14 excludes the 2,400-word point ($14.51) — 2,000 at $13.71 is the largest fit.
    const d = deriveTrialWordCap(FIXTURE_CARD, 14.0);
    expect(d).toEqual({ status: "ok", wordCap: 2000, atUsd: 13.71 });
  });

  it("under the 1,500-word floor the result is a NAMED pause — never a silent clamp", () => {
    const d = deriveTrialWordCap([{ words: 1200, p90Usd: 9.0 }], 15);
    expect(d).toEqual({ status: "below_floor", largestFit: 1200 });
    // and the empty/no-fit card pauses with null.
    expect(deriveTrialWordCap([{ words: 2800, p90Usd: 16.0 }], 15)).toEqual({
      status: "below_floor",
      largestFit: null,
    });
  });

  it("the floor marker is pinned at §14.3's minimum-useful Review", () => {
    expect(TRIAL_CAP_FLOOR_WORDS).toBe(1500);
  });

  it("non-finite cost points never win the cap", () => {
    const d = deriveTrialWordCap(
      [...FIXTURE_CARD, { words: 3200, p90Usd: Number.NaN }],
      15,
    );
    expect((d as { wordCap: number }).wordCap).toBe(2800);
  });
});

describe("the go-live audience (ADR-042)", () => {
  it("off ⇒ nobody; test_tenants ⇒ flagged only; everyone ⇒ all", () => {
    expect(trialAudienceAllows("off", true)).toBe(false);
    expect(trialAudienceAllows("off", false)).toBe(false);
    expect(trialAudienceAllows("test_tenants", true)).toBe(true);
    expect(trialAudienceAllows("test_tenants", false)).toBe(false);
    expect(trialAudienceAllows("everyone", false)).toBe(true);
    expect(trialAudienceAllows(undefined, true)).toBe(false); // absent flag fails closed
  });

  it("TRIAL_AUDIENCES is the shipped vocabulary", () => {
    expect(TRIAL_AUDIENCES).toEqual(["off", "test_tenants", "everyone"]);
  });

  it("claimsForAudience flips ONLY the trial claim; other claims pass through", () => {
    const cfg: PublicClaimsConfig = {
      enabled: { "trial.firstReviewIncluded": true, "plans.whatItCovers": true },
    };
    const gated = claimsForAudience(cfg, false, { audience: "test_tenants" });
    expect(publicClaimEnabled("trial.firstReviewIncluded", gated)).toBe(false);
    expect(publicClaimEnabled("plans.whatItCovers", gated)).toBe(true);
    // R6LCH.1 — the shipped audience IS `everyone`: the shipped-default fold now opens the claim.
    const open = claimsForAudience(cfg, false);
    expect(publicClaimEnabled("trial.firstReviewIncluded", open)).toBe(true);
  });
});

describe("the generated claim lines", () => {
  it("trialIncludedNote renders the config figures — 2,800-word cap, 150-credit pocket", () => {
    const note = trialIncludedNote();
    expect(note).toBe(PRICING.trial.includedNote);
    expect(note).toContain("2,800");
    expect(note).toContain("150");
  });

  it("trialPostTrialNote resolves the Free daily chat allowance", () => {
    expect(trialPostTrialNote()).toBe("10 credits/day for chat, expiring nightly; no runs.");
  });

  it("sheetEntitlementLine is REQ-BILL-4-honest — 'up to' under cap, 'the first' over cap", () => {
    expect(sheetEntitlementLine({ coveredAll: true })).toBe(
      "Included — your trial run covers up to 2,800 words",
    );
    expect(sheetEntitlementLine({ coveredAll: false })).toBe(
      "Included — your trial run covers the first 2,800 words",
    );
    // the wordCap override exists for tests only — the shipped line reads the config.
    expect(sheetEntitlementLine({ coveredAll: true, wordCap: 999 })).toContain("999");
  });
});
