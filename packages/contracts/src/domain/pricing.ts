// P1.16 — the plan ladder + pricing publication contract (§14.2; REQ-GROWTH-4/7/8). `pricing.json`
// (colocated) is the single source of truth: the pricing page, rate-table publication, entitlements,
// and failure-state tests all read through these types. "What it covers" lines and §15.2 cost cards are
// generated at publication time — nothing downstream hand-edits a number.
import type { ModelTier, PlanTier } from "../vocab.js";
import type { PublicClaimId } from "./public-claims.js";
import { PUBLIC_CLAIM_IDS } from "./public-claims.js";
import { PLAN_TIERS } from "../vocab.js";
import pricingJson from "./pricing.json" with { type: "json" };

export type BillingCycle = "monthly" | "annual";

export interface PlanSpec {
  display: string;
  monthlyUsd: number;
  annualMonthlyUsd: number | null;
  includedCreditsMonthly: number;
  dailyChatCredits: number | null;
  concurrency: number;
  priorityQueue?: boolean;
  modelTiers: readonly ModelTier[];
  chatOnly: boolean;
  researchTools: boolean;
  runWordCap: number | null;
  topUps: boolean | "admin";
  projects: number | "unlimited";
  voices: number | "unlimited" | "shared";
  exportFormats: readonly string[] | "all";
  sharing: string;
  dailyRunCeiling?: number;
  perSeat?: boolean;
  pooled?: boolean;
  concurrencyPerSeat?: boolean;
  waitlist?: boolean;
  whatItCovers: string;
  /**
   * HOT.1 — when set, `whatItCovers` is a gated public claim: surfaces render it (and the
   * /billing/plans DTO transmits it) only while `publicClaimEnabled(whatItCoversClaimId)` holds.
   * Absent ⇒ the line is factual coverage copy and renders unconditionally.
   */
  whatItCoversClaimId?: PublicClaimId;
}

export interface TrialSpec {
  windowDays: number;
  entitlement: { kind: "review"; wordCap: number; rigor: "standard"; modelTier: ModelTier };
  pocketCredits: number;
  upgradePromoCredits: number;
  projects: number;
  concurrency: number;
  voice: "quick_voice_only";
  draftPreviewCredits: number;
  dailySpendCeilingCredits: number;
  includedNote: string;
  postTrialNote: string;
  eligibilityLine: string;
}

export interface TopUpPack {
  id: string;
  usd: number;
  credits: number;
}

export interface PricingPublication {
  version: number;
  issuedAt: string;
  usdPerCredit: number;
  platformRate: number;
  annualSavingsPct: number;
  rollover: { months: number; balanceCapMultiple: number };
  plans: Record<PlanTier, PlanSpec>;
  trial: TrialSpec;
  topUpPacks: readonly TopUpPack[];
  topUp: { expiryMonths: number; firstMonthCapUsd: number; threeDsDailyThresholdUsd: number };
  controls: {
    perRunCapMultiplier: number;
    softAlertPcts: readonly number[];
    dailyRunCeiling: Record<string, number>;
  };
  autoReload: {
    defaultThresholdCredits: number;
    defaultPackId: string;
    defaultMonthlyCapUsd: number;
  };
  costCardShapes: readonly { key: string; label: string; words: number; claims: number }[];
  costPerVerifiedClaim: Record<string, Record<ModelTier, number>>;
  /**
   * P1.17 (§15.2) — the per-tier multipliers the marketing cost cards apply on top of the Base
   * parametric terms (mirrors MODEL_TIER_MULTIPLIERS; kept here so the page derives from ONE file).
   */
  modelTierMultipliers: Record<ModelTier, number>;
  /**
   * P1.17 (§15.2) — the parametric terms the marketing cost cards + FAQ derive from (Base/Standard,
   * §12.2 public forms). `costCardFigures` in pricing-page.ts consumes ONLY this + costPerVerifiedClaim
   * — a hand-edited figure on the page fails the contract test.
   */
  costCardTerms: {
    comment: string;
    /** the non-claim reading overhead inside a Review (intake + discourse + second read). */
    reading: { intercept: number; perWord: number };
    /** credits a claim costs when fact-check is OFF (read, not verified). */
    unverifiedClaimCredits: number;
    draft: { intercept: number; perWord: number; perClaim: number };
    revise: {
      intercept: number;
      perWord: number;
      perClaim: number;
      researchedMoveShare: number;
      perResearchedMove: number;
    };
    voiceProfile: { intercept: number; perWord: number };
    /** the corpus size the voice-profile card prices. */
    voiceCorpusWords: number;
    quickReview: {
      wordCap: number;
      /** the claim inventory the ≤-word-cap quick-review line prices. */
      claims: number;
      rigorMultipliers: { quick: number; standard: number; full_board: number };
    };
  };
}

const raw = pricingJson as unknown as PricingPublication;

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`pricing.json: ${msg}`);
}

// Structural validation at module load — a malformed pricing.json fails any process that imports it.
function validate(p: PricingPublication): PricingPublication {
  assert(p.usdPerCredit === 0.01, "1 credit = $0.01 (§14.2)");
  assert(p.platformRate === 1.4, "platform rate = 1.4× (§14.2/§14.5)");
  for (const tier of PLAN_TIERS) assert(p.plans[tier] != null, `missing plan ${tier}`);
  for (const tier of ["writer", "studio", "studio_max"] as const) {
    const p_ = p.plans[tier];
    assert(p_.includedCreditsMonthly > 0, `${tier}: included credits required`);
    assert(p_.annualMonthlyUsd != null && p_.annualMonthlyUsd < p_.monthlyUsd, `${tier}: annual saves 15%`);
  }
  const expected: Record<string, [number, number, number]> = {
    writer: [20, 17, 2000],
    studio: [100, 85, 12000],
    studio_max: [200, 170, 26000],
    team: [40, 34, 4000],
  };
  for (const [tier, [mo, ann, cr]] of Object.entries(expected)) {
    const plan = p.plans[tier as PlanTier];
    assert(plan.monthlyUsd === mo, `${tier}.monthlyUsd=${plan.monthlyUsd} expected ${mo}`);
    assert(plan.includedCreditsMonthly === cr, `${tier}.includedCreditsMonthly expected ${cr}`);
    if (tier !== "team") assert(plan.annualMonthlyUsd === ann, `${tier}.annualMonthlyUsd expected ${ann}`);
    // HOT.1 — a gated coverage line must name a real claim id (typo ⇒ the gate can't fire).
    assert(plan.whatItCoversClaimId == null || (PUBLIC_CLAIM_IDS as readonly string[]).includes(plan.whatItCoversClaimId),
      `${tier}: unknown whatItCoversClaimId`);
  }
  assert(p.trial.windowDays === 14 && p.trial.pocketCredits === 150 && p.trial.upgradePromoCredits === 800,
    "trial constants (14d, 150-credit pocket, 800-credit promo)");
  assert(p.trial.entitlement.wordCap === 6000, "trial word cap 6,000");
  const packs = p.topUpPacks.map((t) => `${t.usd}:${t.credits}`).join(",");
  assert(packs === "10:1000,50:5250,200:22000", "top-up packs 1000/5250/22000");
  // P1.17 — the cost-card derivation inputs must exist and be sane (the page derives from them).
  for (const tier of ["base", "balanced", "frontier"] as const) {
    assert(p.costPerVerifiedClaim.review![tier]! > 0, `costPerVerifiedClaim.review.${tier} required`);
    assert(p.costPerVerifiedClaim.fact_check![tier]! > 0, `costPerVerifiedClaim.fact_check.${tier} required`);
    assert(p.modelTierMultipliers[tier] > 0, `modelTierMultipliers.${tier} required`);
  }
  assert(p.modelTierMultipliers.base === 1, "modelTierMultipliers.base === 1");
  assert(p.costCardTerms.reading.intercept >= 0 && p.costCardTerms.reading.perWord >= 0,
    "costCardTerms.reading terms required");
  assert(p.costCardTerms.unverifiedClaimCredits >= 0, "costCardTerms.unverifiedClaimCredits required");
  assert(p.costCardTerms.voiceCorpusWords > 0, "costCardTerms.voiceCorpusWords required");
  assert(p.costCardTerms.quickReview.wordCap > 0, "costCardTerms.quickReview.wordCap required");
  return p;
}

export const PRICING: PricingPublication = validate(raw);

export function planOf(tier: PlanTier | string): PlanSpec {
  return PRICING.plans[tier as PlanTier] ?? PRICING.plans.free;
}

/** The price Stripe charges: cents, per the billing cycle. */
export function priceCents(tier: PlanTier, cycle: BillingCycle): number {
  const plan = planOf(tier);
  const monthly = cycle === "annual" ? (plan.annualMonthlyUsd ?? plan.monthlyUsd) : plan.monthlyUsd;
  return Math.round(monthly * (cycle === "annual" ? 12 : 1) * 100);
}

export function topUpPack(id: string): TopUpPack | undefined {
  return PRICING.topUpPacks.find((p) => p.id === id);
}

/** Tier gate: may `accountTier` run `modelTier`? (REQ-PERSONA-5 / REQ-DATA-42 — the gate reads here.) */
export function modelTierAllowed(accountTier: PlanTier | string, modelTier: ModelTier): boolean {
  return planOf(accountTier).modelTiers.includes(modelTier);
}

/** Effective concurrency: trial window reads the trial spec, post-trial/paid read the plan. */
export function effectiveConcurrency(tier: PlanTier | string, inTrialWindow: boolean): number {
  if (inTrialWindow) return PRICING.trial.concurrency;
  return planOf(tier).concurrency;
}
