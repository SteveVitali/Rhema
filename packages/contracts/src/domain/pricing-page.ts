// P1.17 (§15.2; REQ-GROWTH-4/6/9) — the marketing pricing page's ONE derivation layer. Every figure the
// /pricing route renders is computed HERE from `PRICING` (pricing.json) + an INJECTED `SurfacePricer`
// — the same estimator-facing API the run sheet, Timeline chip, palette and protocol cards read
// (EST.1 / ADR-034: ONE estimate everywhere). Contracts stays a leaf: the pricer is a TYPE here, its
// implementation lives in @rhema/run-sheet (`surfacePricer()`). Nothing on this page may carry a
// second formula — the page never hand-types a number, and a pricer that cannot compute a figure
// renders "—" (fail closed, never stale).
import type { ModelTier, PlanTier, Rigor } from "../vocab.js";
import { PRICING, planOf } from "./pricing.js";
import type { PlanSpec, TrialSpec } from "./pricing.js";
import { PUBLIC_CLAIMS, publicClaimEnabled, type PublicClaimsConfig } from "./public-claims.js";

export const MODEL_TIER_LABELS: Record<ModelTier, string> = {
  base: "Base",
  balanced: "Balanced",
  frontier: "Frontier",
};

/** The estimator-facing call every pricing figure goes through — implemented by `surfacePricer()`. */
export interface SurfaceEstimateArgs {
  readonly workflow: string;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly inputs: {
    readonly words?: number;
    readonly claims?: number;
    readonly findings?: number;
    readonly movesWithResearch?: number;
    readonly priorCredits?: number;
    readonly voiceCorpusWords?: number;
  };
  /** toggle name → on/off (the sheet's names — e.g. `{ fact_check: false }` for Review-off). */
  readonly toggles?: Record<string, boolean>;
  /** variant name inside the workflow's estimator spec (e.g. `"quick"` for the voice fast path). */
  readonly variant?: string;
}

export interface SurfacePricer {
  /** calibrated credits for the shape — `null` ⇒ the figure cannot be computed; the caller renders "—". */
  readonly estimate: (args: SurfaceEstimateArgs) => number | null;
  /**
   * The marginal cost of ONE verified claim for `workflow` at `tier`, computed on representative
   * inputs (Review: the verification premium per claim; Fact-check: the marginal claim). `null` ⇒
   * unknown — the caller renders "—", never a remembered figure.
   */
  readonly perVerifiedClaim?: (workflow: "review" | "fact_check", tier: ModelTier) => number | null;
}

/** A derived credits range (Base → Frontier at Standard rigor) — never a single figure. */
export interface CreditRange {
  readonly low: number;
  readonly high: number;
}

export interface CostCardRow {
  readonly key: "draft" | "review" | "review_no_fact_check" | "revise" | "full_round";
  readonly label: string;
  /** `null` ⇒ the estimator could not price this shape — the page renders "—" for the row. */
  readonly range: CreditRange | null;
}

export interface CostCard {
  readonly key: string;
  readonly label: string;
  readonly words: number;
  readonly claims: number;
  readonly rows: readonly CostCardRow[];
  /** the full-round figure per tier (the expandable line under the card); `null` ⇒ unpriced. */
  readonly fullRoundByTier: Record<ModelTier, number | null>;
}

/** Round a derived figure to the marketing-card convention (nearest 10 credits). */
function cardRound(n: number): number {
  return Math.round(n / 10) * 10;
}

/** The low→high tier sweep for one shape — `null` when either endpoint is unpriced. The range
 *  rounds OUTWARD (low floors, high ceils to the nearest 10): the printed range must always
 *  contain the raw figures it brackets — a nearest-10 low could print ABOVE the true Base figure
 *  (EST.1's N4 caught a live 3-credit leak: card "2,610–11,730" vs the sheet's real 2,607). */
function tierRange(
  price: SurfacePricer | undefined,
  args: Omit<SurfaceEstimateArgs, "modelTier">,
): CreditRange | null {
  const low = price?.estimate({ ...args, modelTier: "base" });
  const high = price?.estimate({ ...args, modelTier: "frontier" });
  if (low == null || high == null) return null;
  return { low: Math.floor(low / 10) * 10, high: Math.ceil(high / 10) * 10 };
}

const STANDARD = "standard" as const;

/** A Draft run's derived credits at `tier`, Standard rigor — through the shared pricer. */
export function draftCardCredits(
  price: SurfacePricer | undefined,
  words: number,
  claims: number,
  tier: ModelTier,
): number | null {
  const est = price?.estimate({
    workflow: "draft",
    rigor: STANDARD,
    modelTier: tier,
    inputs: { words, claims },
  });
  return est == null ? null : cardRound(est);
}

/** A Review's derived credits (fact-check on) for `words`/`claims` at `tier`, Standard rigor. */
export function reviewCardCredits(
  price: SurfacePricer | undefined,
  words: number,
  claims: number,
  tier: ModelTier,
): number | null {
  const est = price?.estimate({
    workflow: "review",
    rigor: STANDARD,
    modelTier: tier,
    inputs: { words, claims },
  });
  return est == null ? null : cardRound(est);
}

/** The same Review with the fact-check toggle off (claims read, not verified). */
export function reviewNoFactCheckCredits(
  price: SurfacePricer | undefined,
  words: number,
  claims: number,
  tier: ModelTier,
): number | null {
  const est = price?.estimate({
    workflow: "review",
    rigor: STANDARD,
    modelTier: tier,
    inputs: { words, claims },
    toggles: { fact_check: false },
  });
  return est == null ? null : cardRound(est);
}

/** A Revise run's derived credits at `tier`, Standard rigor. */
export function reviseCardCredits(
  price: SurfacePricer | undefined,
  words: number,
  claims: number,
  tier: ModelTier,
): number | null {
  const est = price?.estimate({
    workflow: "revise",
    rigor: STANDARD,
    modelTier: tier,
    inputs: { words, claims },
  });
  return est == null ? null : cardRound(est);
}

/** The full round (Draft + Review + Revise) at `tier` — `null` if any leg is unpriced. */
export function fullRoundCredits(
  price: SurfacePricer | undefined,
  words: number,
  claims: number,
  tier: ModelTier,
): number | null {
  const legs = [
    draftCardCredits(price, words, claims, tier),
    reviewCardCredits(price, words, claims, tier),
    reviseCardCredits(price, words, claims, tier),
  ];
  return legs.every((n): n is number => n != null) ? legs.reduce((a, b) => a + b, 0) : null;
}

/** The card rows for one §15.2 cost card — every figure derived, every figure a RANGE. */
export function costCardFigures(
  price: SurfacePricer | undefined,
  shape: { key: string; label: string; words: number; claims: number },
): CostCard {
  const { words, claims } = shape;
  const rows: CostCardRow[] = [
    {
      key: "draft",
      label: "Draft",
      range: tierRange(price, { workflow: "draft", rigor: STANDARD, inputs: { words, claims } }),
    },
    {
      key: "review",
      label: "Review",
      range: tierRange(price, { workflow: "review", rigor: STANDARD, inputs: { words, claims } }),
    },
    {
      key: "review_no_fact_check",
      label: "Review (fact-check off)",
      range: tierRange(price, {
        workflow: "review",
        rigor: STANDARD,
        inputs: { words, claims },
        toggles: { fact_check: false },
      }),
    },
    {
      key: "revise",
      label: "Revise",
      range: tierRange(price, { workflow: "revise", rigor: STANDARD, inputs: { words, claims } }),
    },
  ];
  const fullRoundByTier = {
    base: fullRoundCredits(price, words, claims, "base"),
    balanced: fullRoundCredits(price, words, claims, "balanced"),
    frontier: fullRoundCredits(price, words, claims, "frontier"),
  };
  const [b, f] = [fullRoundByTier.base, fullRoundByTier.frontier];
  rows.push({
    key: "full_round",
    label: "Full round",
    range: b != null && f != null ? { low: b, high: f } : null,
  });
  return { ...shape, rows, fullRoundByTier };
}

/** The voice-profile card (the corpus size is a published term, not a magic number). */
export function voiceProfileCard(price: SurfacePricer | undefined): {
  words: number;
  range: CreditRange | null;
} {
  const words = PRICING.costCardTerms.voiceCorpusWords;
  return {
    words,
    range: tierRange(price, {
      workflow: "voice_profile",
      rigor: STANDARD,
      variant: "quick",
      inputs: { words },
    }),
  };
}

/** The bottom quick-review line (Quick / Standard / Full board on a ≤N-word piece, Base tier). */
export function quickReviewLine(price: SurfacePricer | undefined): {
  wordCap: number;
  claims: number;
  byRigor: Record<Rigor, number | null>;
} {
  const q = PRICING.costCardTerms.quickReview;
  const at = (rigor: Rigor) => {
    const est = price?.estimate({
      workflow: "review",
      rigor,
      modelTier: "base",
      inputs: { words: q.wordCap, claims: q.claims },
    });
    return est == null ? null : cardRound(est);
  };
  return {
    wordCap: q.wordCap,
    claims: q.claims,
    byRigor: { quick: at("quick"), standard: at("standard"), full_board: at("full_board") },
  };
}

/** A derived figure as dollars (credits × usdPerCredit). */
export function cardCreditsToUsd(credits: number): number {
  return Math.round(credits * PRICING.usdPerCredit * 100) / 100;
}

/** "≈1,240 cr · ≈$12.40" — the derived figure in both units; "—" when unpriced. */
export function creditsLabel(credits: number | null): string {
  if (credits == null) return "—";
  return `≈${credits.toLocaleString("en-US")} cr · ≈$${cardCreditsToUsd(credits).toFixed(2)}`;
}

export function rangeLabel(range: CreditRange | null): string {
  if (range == null) return "—";
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
  /** HOT.1 — null while the plan's coverage line is a hidden claim (see `whatItCoversClaimId`);
   *  EST.1 — when the claim IS enabled the line is COMPUTED from the cost cards via `price`; an
   *  uncomputable tier hides the line (never a hand-composed figure). */
  readonly whatItCovers: string | null;
  readonly waitlist: boolean;
  readonly perSeat: boolean;
  /** Free's honesty split: what the account is before vs after the trial window. `trialWindow` is the
   *  included-Review claim — absent while `trial.firstReviewIncluded` is hidden (HOT.1). */
  readonly freeNotes?: { readonly trialWindow?: string; readonly postTrial: string };
}

/**
 * One decimal place, FLOORED, strip a trailing ".0" — the coverage figure's convention.
 * R6MNY.1 (GD-BL13.R6; REQ-LCH-5b) — the "≈N" figure never promises more runs than the credits
 * buy: a true 0.79 prints "0.7", never the nearest-rounded "0.8". Under one honest loop the line
 * hides (`null`) rather than print a figure a full run would contradict.
 */
function coverageFigure(loops: number): string | null {
  if (!(loops > 0)) return null;
  const r = Math.floor(loops * 10) / 10;
  if (r < 0.1) return null;
  return String(r).replace(/\.0$/, "");
}

/**
 * EST.1 — the computed "what it covers" line for a gated plan: each ALLOWED tier's share of the
 * included-credit bundle, priced as full essay Reviews (the essay card's shape at Standard rigor)
 * through the shared pricer. `null` ⇒ the line cannot be computed honestly and stays hidden — a
 * gated plan NEVER falls back to the pricing.json copy.
 * R6MNY.1 (GD-BL13.R6): the divisor is the RAW estimator figure, never the card-rounded one — a
 * rounded-down divisor would quietly promise loops the credits do not buy.
 */
export function planCoverageLine(tier: PlanTier, price: SurfacePricer | undefined): string | null {
  const p = planOf(tier);
  const essay = PRICING.costCardShapes.find((s) => s.key === "essay")!;
  const parts: string[] = [];
  for (const modelTier of p.modelTiers) {
    const raw = price?.estimate({
      workflow: "review",
      rigor: "standard",
      modelTier,
      inputs: { words: essay.words, claims: essay.claims },
    });
    if (raw == null || raw <= 0) return null;
    const loops = coverageFigure(p.includedCreditsMonthly / raw);
    if (loops == null) return null;
    parts.push(
      modelTier === p.modelTiers[0]
        ? `≈${loops} essay Reviews on ${MODEL_TIER_LABELS[modelTier]}`
        : `≈${loops} on ${MODEL_TIER_LABELS[modelTier]}`,
    );
  }
  return parts.join(" · ");
}

/** The gated-coverage value for a plan: factual copy for ungated plans, the COMPUTED line for gated
 *  ones while their claim is enabled — `null` (hidden) otherwise. */
function planCoversValue(
  tier: PlanTier,
  claims: PublicClaimsConfig,
  price: SurfacePricer | undefined,
): string | null {
  const p = planOf(tier);
  if (p.whatItCoversClaimId == null) return p.whatItCovers;
  if (!publicClaimEnabled(p.whatItCoversClaimId, claims)) return null;
  return planCoverageLine(tier, price);
}

/** The plan ladder in display order — Free first (the honesty column), Team last (waitlist).
 *  HOT.1: gated claims null out here so a consumer can't render them by accident.
 *  EST.1: `price` computes the coverage lines through the shared pricer (no pricer ⇒ gated lines hidden). */
export function planLadder(
  claims: PublicClaimsConfig = PUBLIC_CLAIMS,
  price?: SurfacePricer,
): readonly PlanCard[] {
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
      whatItCovers: planCoversValue(tier, claims, price),
      waitlist: p.waitlist === true,
      perSeat: p.perSeat === true,
      ...(tier === "free"
        ? {
            freeNotes: {
              ...(publicClaimEnabled("trial.firstReviewIncluded", claims)
                ? { trialWindow: PRICING.trial.includedNote }
                : {}),
              postTrial: PRICING.trial.postTrialNote,
            },
          }
        : {}),
    };
  });
}

/**
 * HOT.1 — the /billing/plans wire shape after the claims gate: hidden claims transmit `null` on the
 * DTO itself so no client can render (or log) claim text the config has disabled.
 * EST.1 — enabled coverage lines are the COMPUTED ones (`price`); an absent/failed pricer hides them.
 */
export function visiblePlansPublication(
  claims: PublicClaimsConfig = PUBLIC_CLAIMS,
  price?: SurfacePricer,
): {
  readonly plans: Record<PlanTier, Omit<PlanSpec, "whatItCovers"> & { readonly whatItCovers: string | null }>;
  readonly trial: Omit<TrialSpec, "includedNote"> & { readonly includedNote: string | null };
} {
  const plans = Object.fromEntries(
    (Object.keys(PRICING.plans) as PlanTier[]).map((tier) => {
      const p = PRICING.plans[tier];
      return [tier, { ...p, whatItCovers: planCoversValue(tier, claims, price) }];
    }),
  ) as Record<PlanTier, Omit<PlanSpec, "whatItCovers"> & { readonly whatItCovers: string | null }>;
  return {
    plans,
    trial: {
      ...PRICING.trial,
      includedNote: publicClaimEnabled("trial.firstReviewIncluded", claims) ? PRICING.trial.includedNote : null,
    },
  };
}

export interface MatrixRow {
  readonly label: string;
  readonly cells: readonly string[];
}

/**
 * The full §15.2 matrix — rows derived from the plan specs, cells never hand-priced.
 * ACT.1 (PR-U6): the Free column's "Run word cap" cell is the TRIAL entitlement's configured cap
 * while `trial.firstReviewIncluded` renders for the viewer's audience (the Free column IS the
 * trial column, §14.2); a row whose every cell is "—" is omitted — no all-dash rows.
 */
export function pricingMatrix(
  claims: PublicClaimsConfig = PUBLIC_CLAIMS,
): { readonly columns: readonly string[]; readonly rows: readonly MatrixRow[] } {
  const tiers: readonly PlanTier[] = ["free", "writer", "studio", "studio_max", "team"];
  const plans = tiers.map(planOf);
  const cell = (fn: (p: ReturnType<typeof planOf>) => string) => plans.map(fn);
  const credits = (n: number) => (n === 0 ? "—" : n.toLocaleString("en-US"));
  const trialWordCapCell = publicClaimEnabled("trial.firstReviewIncluded", claims)
    ? PRICING.trial.entitlement.wordCap.toLocaleString("en-US")
    : "—";
  const rows: MatrixRow[] = [
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
    {
      label: "Run word cap",
      cells: plans.map((p) =>
        p === planOf("free") ? trialWordCapCell : p.runWordCap != null ? p.runWordCap.toLocaleString("en-US") : "—",
      ),
    },
    { label: "Daily run ceiling", cells: cell((p) => (p.dailyRunCeiling != null ? String(p.dailyRunCeiling) : "—")) },
    {
      label: "Research tools",
      cells: cell((p) => (p.researchTools ? "Yes" : "—")),
      },
    {
      label: "Support",
      cells: cell((p) => (p.priorityQueue ? "Priority" : "Standard")),
    },
  ];
  return {
    columns: tiers.map((t) => planOf(t).display),
    // an all-dash row carries no information (BL-62) — omit it entirely.
    rows: rows.filter((r) => r.cells.some((c) => c !== "—")),
  };
}

export interface FaqItem {
  readonly q: string;
  readonly a: string;
}

/**
 * The §15.2 FAQ — every figure derived through the shared pricer (per-verified-claim and cost-card
 * shapes). The "8,000-word paper" answer computes its figure rather than quoting it, so a rate change
 * moves the page (REQ-GROWTH-9); an unpriced figure renders "—", never a remembered number.
 */
export function pricingFaq(price: SurfacePricer | undefined): readonly FaqItem[] {
  const academic = PRICING.costCardShapes.find((s) => s.key === "academic")!;
  const reviewBase = reviewCardCredits(price, academic.words, academic.claims, "base");
  const reviewOff = reviewNoFactCheckCredits(price, academic.words, academic.claims, "base");
  const usd = (cr: number | null) => (cr == null ? "—" : `$${Math.round(cardCreditsToUsd(cr))}`);
  const cr = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US"));
  const pv = price?.perVerifiedClaim ?? (() => null);
  const pvR = (t: ModelTier) => {
    const n = pv("review", t);
    return n == null ? "—" : String(Math.round(n));
  };
  const pvF = (t: ModelTier) => {
    const n = pv("fact_check", t);
    return n == null ? "—" : String(Math.round(n));
  };
  return [
    {
      q: `Why does a review of my ${academic.words.toLocaleString("en-US")}-word paper cost about ${usd(reviewBase)}?`,
      a: `A review reads the draft several times and fetches the sources behind every checkable claim — each verified claim costs roughly ${pvR("base")} credits on ${MODEL_TIER_LABELS.base} and ${pvR("frontier")} on ${MODEL_TIER_LABELS.frontier} inside a Review (${pvF("base")} and ${pvF("frontier")} in a stand-alone Fact-check); fact-check off drops that paper from ≈${cr(reviewBase)} to ≈${cr(reviewOff)} credits.`,
    },
    {
      q: "What if I run out of credits?",
      // R6MNY.1 — the pocket figure derives from pricing.json (a hand-edited literal would drift).
      a: `Top-ups never expire for ${PRICING.topUp.expiryMonths} months, and the ${PRICING.trial.pocketCredits}-credit trial pocket is yours to spend. Nothing auto-bills — auto-reload is opt-in with your own monthly cap.`,
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

/** The whole derived page model — one call the route + contract test share.
 *  HOT.1: `claims` gates the hidden public claims (default `PUBLIC_CLAIMS` — all off).
 *  EST.1: `price` is the shared surface pricer — every figure on the page goes through it. */
export function buildPricingPageData(
  claims: PublicClaimsConfig = PUBLIC_CLAIMS,
  price?: SurfacePricer,
): {
  readonly usdPerCredit: number;
  readonly annualSavingsPct: number;
  readonly plans: readonly PlanCard[];
  readonly cards: readonly CostCard[];
  readonly voiceCard: { words: number; range: CreditRange | null };
  readonly quickReview: { wordCap: number; claims: number; byRigor: Record<Rigor, number | null> };
  readonly matrix: { columns: readonly string[]; rows: readonly MatrixRow[] };
  readonly faq: readonly FaqItem[];
  readonly trial: typeof PRICING.trial;
  readonly topUpPacks: typeof PRICING.topUpPacks;
  readonly topUp: typeof PRICING.topUp;
} {
  return {
    usdPerCredit: PRICING.usdPerCredit,
    annualSavingsPct: PRICING.annualSavingsPct,
    plans: planLadder(claims, price),
    cards: PRICING.costCardShapes.map((s) => costCardFigures(price, s)),
    voiceCard: voiceProfileCard(price),
    quickReview: quickReviewLine(price),
    matrix: pricingMatrix(claims),
    faq: pricingFaq(price),
    trial: PRICING.trial,
    topUpPacks: PRICING.topUpPacks,
    topUp: PRICING.topUp,
  };
}
