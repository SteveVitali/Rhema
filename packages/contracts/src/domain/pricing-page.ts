// P1.17 (§15.2; REQ-GROWTH-4/6/9) — the marketing pricing page's ONE derivation layer. Every figure the
// /pricing route renders is computed HERE from `PRICING` (pricing.json) + `costCardTerms` — the page
// never hand-types a number, and this module is the contract test's target: hand-edit a rendered figure
// and the test fails. The terms are the §12.2 public forms at Base/Standard (modeled figures, like the
// estimator's — the run sheet's live estimate is authoritative for a real run).
import type { ModelTier, PlanTier, Rigor } from "../vocab.js";
import { PRICING, planOf } from "./pricing.js";

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  base: "Base",
  balanced: "Balanced",
  frontier: "Frontier",
};

/** A derived credits range (Base → Frontier at Standard rigor) — never a single figure. */
export interface CreditRange {
  readonly low: number;
  readonly high: number;
}

export interface CostCardRow {
  readonly key: "draft" | "review" | "review_no_fact_check" | "revise" | "full_round";
  readonly label: string;
  readonly range: CreditRange;
}

export interface CostCard {
  readonly key: string;
  readonly label: string;
  readonly words: number;
  readonly claims: number;
  readonly rows: readonly CostCardRow[];
  /** the full-round figure per tier (the expandable line under the card). */
  readonly fullRoundByTier: Record<ModelTier, number>;
}

/** Round a derived figure to the marketing-card convention (nearest 10 credits). */
function cardRound(n: number): number {
  return Math.round(n / 10) * 10;
}

/** The non-claim reading overhead inside a Review (intake + discourse + second read), per tier. */
function readingCredits(words: number, tier: ModelTier): number {
  const t = PRICING.costCardTerms.reading;
  return (t.intercept + t.perWord * words) * PRICING.modelTierMultipliers[tier];
}

/** A Review's derived credits (fact-check on) for `words`/`claims` at `tier`, Standard rigor. */
export function reviewCardCredits(words: number, claims: number, tier: ModelTier): number {
  return cardRound(readingCredits(words, tier) + claims * PRICING.costPerVerifiedClaim.review![tier]!);
}

/** The same Review with the fact-check toggle off (claims read, not verified). */
export function reviewNoFactCheckCredits(words: number, claims: number, tier: ModelTier): number {
  return cardRound(
    readingCredits(words, tier) + claims * PRICING.costCardTerms.unverifiedClaimCredits * PRICING.modelTierMultipliers[tier],
  );
}

/** A Draft run's derived credits (§12.2 Draft form) at `tier`, Standard rigor. */
export function draftCardCredits(words: number, claims: number, tier: ModelTier): number {
  const t = PRICING.costCardTerms.draft;
  return cardRound((t.intercept + t.perWord * words + t.perClaim * claims) * PRICING.modelTierMultipliers[tier]);
}

/** A Revise run's derived credits (§12.2 Revise form; researched-move share published in the terms). */
export function reviseCardCredits(words: number, claims: number, tier: ModelTier): number {
  const t = PRICING.costCardTerms.revise;
  const moves = Math.round(claims * t.researchedMoveShare);
  return cardRound(
    (t.intercept + t.perWord * words + t.perClaim * claims + moves * t.perResearchedMove) *
      PRICING.modelTierMultipliers[tier],
  );
}

/** The full round (Draft + Review + Revise) at `tier`. */
export function fullRoundCredits(words: number, claims: number, tier: ModelTier): number {
  return (
    draftCardCredits(words, claims, tier) +
    reviewCardCredits(words, claims, tier) +
    reviseCardCredits(words, claims, tier)
  );
}

/** The card rows for one §15.2 cost card — every figure derived, every figure a RANGE. */
export function costCardFigures(shape: { key: string; label: string; words: number; claims: number }): CostCard {
  const { words, claims } = shape;
  const rows: CostCardRow[] = [
    {
      key: "draft",
      label: "Draft",
      range: { low: draftCardCredits(words, claims, "base"), high: draftCardCredits(words, claims, "frontier") },
    },
    {
      key: "review",
      label: "Review",
      range: {
        low: reviewCardCredits(words, claims, "base"),
        high: reviewCardCredits(words, claims, "frontier"),
      },
    },
    {
      key: "review_no_fact_check",
      label: "Review (fact-check off)",
      range: {
        low: reviewNoFactCheckCredits(words, claims, "base"),
        high: reviewNoFactCheckCredits(words, claims, "frontier"),
      },
    },
    {
      key: "revise",
      label: "Revise",
      range: {
        low: reviseCardCredits(words, claims, "base"),
        high: reviseCardCredits(words, claims, "frontier"),
      },
    },
  ];
  const fullRoundByTier = {
    base: fullRoundCredits(words, claims, "base"),
    balanced: fullRoundCredits(words, claims, "balanced"),
    frontier: fullRoundCredits(words, claims, "frontier"),
  };
  rows.push({
    key: "full_round",
    label: "Full round",
    range: { low: fullRoundByTier.base, high: fullRoundByTier.frontier },
  });
  return { ...shape, rows, fullRoundByTier };
}

/** The voice-profile card (the corpus size is a published term, not a magic number). */
export function voiceProfileCard(): { words: number; range: CreditRange } {
  const words = PRICING.costCardTerms.voiceCorpusWords;
  const t = PRICING.costCardTerms.voiceProfile;
  const at = (tier: ModelTier) =>
    cardRound((t.intercept + t.perWord * words) * PRICING.modelTierMultipliers[tier]);
  return { words, range: { low: at("base"), high: at("frontier") } };
}

/** The bottom quick-review line (Quick / Standard / Full board on a ≤N-word piece, Base tier). */
export function quickReviewLine(): { wordCap: number; claims: number; byRigor: Record<Rigor, number> } {
  const q = PRICING.costCardTerms.quickReview;
  const standard = reviewCardCredits(q.wordCap, q.claims, "base");
  return {
    wordCap: q.wordCap,
    claims: q.claims,
    byRigor: {
      quick: cardRound(standard * q.rigorMultipliers.quick),
      standard,
      full_board: cardRound(standard * q.rigorMultipliers.full_board),
    },
  };
}

/** A derived figure as dollars (credits × usdPerCredit). */
export function cardCreditsToUsd(credits: number): number {
  return Math.round(credits * PRICING.usdPerCredit * 100) / 100;
}

/** "≈1,240 cr · ≈$12.40" — the derived figure in both units. */
export function creditsLabel(credits: number): string {
  return `≈${credits.toLocaleString("en-US")} cr · ≈$${cardCreditsToUsd(credits).toFixed(2)}`;
}

export function rangeLabel(range: CreditRange): string {
  return `${range.low.toLocaleString("en-US")} – ${range.high.toLocaleString("en-US")}`;
}

export interface PlanCard {
  readonly tier: PlanTier;
  readonly display: string;
  readonly monthlyUsd: number;
  /** the annual-cycle per-month price (null on Team — waitlist, no annual). */
  readonly annualMonthlyUsd: number | null;
  /** the 15% saving rendered in DOLLARS (per year at the annual rate). */
  readonly annualSavingsUsdPerYear: number | null;
  readonly includedCreditsMonthly: number;
  readonly whatItCovers: string;
  readonly waitlist: boolean;
  readonly perSeat: boolean;
  /** Free's honesty split: what the account is before vs after the trial window. */
  readonly freeNotes?: { readonly trialWindow: string; readonly postTrial: string };
}

/** The plan ladder in display order — Free first (the honesty column), Team last (waitlist). */
export function planLadder(): readonly PlanCard[] {
  const order: readonly PlanTier[] = ["free", "writer", "studio", "studio_max", "team"];
  return order.map((tier) => {
    const p = planOf(tier);
    return {
      tier,
      display: p.display,
      monthlyUsd: p.monthlyUsd,
      annualMonthlyUsd: p.annualMonthlyUsd,
      annualSavingsUsdPerYear:
        p.annualMonthlyUsd != null ? (p.monthlyUsd - p.annualMonthlyUsd) * 12 : null,
      includedCreditsMonthly: p.includedCreditsMonthly,
      whatItCovers: p.whatItCovers,
      waitlist: p.waitlist === true,
      perSeat: p.perSeat === true,
      ...(tier === "free"
        ? {
            freeNotes: {
              trialWindow: PRICING.trial.includedNote,
              postTrial: PRICING.trial.postTrialNote,
            },
          }
        : {}),
    };
  });
}

export interface MatrixRow {
  readonly label: string;
  readonly cells: readonly string[];
}

/** The full §15.2 matrix — rows derived from the plan specs, cells never hand-priced. */
export function pricingMatrix(): { readonly columns: readonly string[]; readonly rows: readonly MatrixRow[] } {
  const tiers: readonly PlanTier[] = ["free", "writer", "studio", "studio_max", "team"];
  const plans = tiers.map(planOf);
  const cell = (fn: (p: ReturnType<typeof planOf>) => string) => plans.map(fn);
  const credits = (n: number) => (n === 0 ? "—" : n.toLocaleString("en-US"));
  return {
    columns: tiers.map((t) => planOf(t).display),
    rows: [
      { label: "Price (monthly)", cells: cell((p) => (p.monthlyUsd === 0 ? "$0" : `$${p.monthlyUsd}${p.perSeat ? "/seat" : ""}/mo`)) },
      {
        label: "Price (annual, per month)",
        cells: cell((p) => (p.annualMonthlyUsd != null ? `$${p.annualMonthlyUsd}/mo` : "—")),
      },
      { label: "Included credits / mo", cells: cell((p) => credits(p.includedCreditsMonthly)) },
      { label: "Model tiers", cells: cell((p) => p.modelTiers.map((t) => MODEL_TIER_LABELS[t]).join(" · ")) },
      {
        label: "Concurrency",
        cells: cell((p) => (p.concurrency === 0 ? "—" : `${p.concurrency}${p.concurrencyPerSeat ? "/seat" : ""}`)),
      },
      { label: "Daily chat credits", cells: cell((p) => (p.dailyChatCredits != null ? String(p.dailyChatCredits) : "—")) },
      { label: "Top-ups", cells: cell((p) => (p.topUps === true ? "Yes" : p.topUps === "admin" ? "Admin" : "—")) },
      {
        label: "Rollover",
        cells: cell(() =>
          `≤${PRICING.rollover.balanceCapMultiple}× monthly · expires at reset`,
        ),
      },
      { label: "Run word cap", cells: cell((p) => (p.runWordCap != null ? p.runWordCap.toLocaleString("en-US") : "—")) },
      { label: "Daily run ceiling", cells: cell((p) => (p.dailyRunCeiling != null ? String(p.dailyRunCeiling) : "—")) },
      {
        label: "Research tools",
        cells: cell((p) => (p.researchTools ? "Yes" : "—")),
      },
      {
        label: "Support",
        cells: cell((p) => (p.priorityQueue ? "Priority" : "Standard")),
      },
    ],
  };
}

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

/**
 * The §15.2 FAQ — every figure derived from costPerVerifiedClaim / costCardTerms / the plan specs.
 * The "8,000-word paper" answer computes its figure rather than quoting it, so a rate change moves
 * the page (REQ-GROWTH-9).
 */
export function pricingFaq(): readonly FaqItem[] {
  const academic = PRICING.costCardShapes.find((s) => s.key === "academic")!;
  const reviewBase = reviewCardCredits(academic.words, academic.claims, "base");
  const reviewOff = reviewNoFactCheckCredits(academic.words, academic.claims, "base");
  const cpv = PRICING.costPerVerifiedClaim;
  return [
    {
      q: `Why does a review of my ${academic.words.toLocaleString("en-US")}-word paper cost about $${Math.round(cardCreditsToUsd(reviewBase))}?`,
      a: `A review reads the draft several times and fetches the sources behind every checkable claim — each verified claim costs roughly ${cpv.review!.base} credits on ${MODEL_TIER_LABELS.base} and ${cpv.review!.frontier} on ${MODEL_TIER_LABELS.frontier} inside a Review (${cpv.fact_check!.base} and ${cpv.fact_check!.frontier} in a stand-alone Fact-check); fact-check off drops that paper from ≈${reviewBase.toLocaleString("en-US")} to ≈${reviewOff.toLocaleString("en-US")} credits.`,
    },
    {
      q: "What if I run out of credits?",
      a: `Top-ups never expire for ${PRICING.topUp.expiryMonths} months, and the 150-credit trial pocket is yours to spend. Nothing auto-bills — auto-reload is opt-in with your own monthly cap.`,
    },
    {
      q: "Do unused credits roll over?",
      a: `Included credits roll over up to ${PRICING.rollover.balanceCapMultiple}× your monthly amount; the excess expires at reset with a 7-day warning.`,
    },
    {
      q: "What happens after the trial?",
      a: `After day ${PRICING.trial.windowDays} the account is Free: ${PRICING.trial.postTrialNote}`,
    },
    {
      q: "Is my text used to train models?",
      a: "No. Drafts, letters, and telemetry never train models, and providers are bound by the same zero-retention terms.",
    },
    {
      q: "What's not included yet?",
      a: "The Team plan is a waitlist; single sign-on, retention controls, and mobile editing are on the roadmap — everything on this page works today.",
    },
  ];
}

/** The whole derived page model — one call the route + contract test share. */
export function buildPricingPageData(): {
  readonly usdPerCredit: number;
  readonly annualSavingsPct: number;
  readonly plans: readonly PlanCard[];
  readonly cards: readonly CostCard[];
  readonly voiceCard: { words: number; range: CreditRange };
  readonly quickReview: { wordCap: number; claims: number; byRigor: Record<Rigor, number> };
  readonly matrix: { columns: readonly string[]; rows: readonly MatrixRow[] };
  readonly faq: readonly FaqItem[];
  readonly trial: typeof PRICING.trial;
  readonly topUpPacks: typeof PRICING.topUpPacks;
  readonly topUp: typeof PRICING.topUp;
} {
  return {
    usdPerCredit: PRICING.usdPerCredit,
    annualSavingsPct: PRICING.annualSavingsPct,
    plans: planLadder(),
    cards: PRICING.costCardShapes.map(costCardFigures),
    voiceCard: voiceProfileCard(),
    quickReview: quickReviewLine(),
    matrix: pricingMatrix(),
    faq: pricingFaq(),
    trial: PRICING.trial,
    topUpPacks: PRICING.topUpPacks,
    topUp: PRICING.topUp,
  };
}
