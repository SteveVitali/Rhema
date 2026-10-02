// @rhema/contracts — the estimate/cap money contract: dollars-first formatting, cap sizing, the consent
// threshold rule, and the insufficient-balance resolution (§5.6, §14.1, §14.4, §14.6). PURE and
// protocols-free (contracts is a leaf): the estimator that turns levers into a credit figure lives in
// `@rhema/run-sheet` (which depends on both this and `@rhema/protocols`); this module owns everything that
// is money vocabulary rather than estimator math, so the run sheet, the run card, the approval card and the
// mobile sheet all format money one way (REQ-BILL-1 amended). The full-IDE sheet (P1.6) reuses these
// contracts verbatim — no re-derivation.

import { USD_PER_CREDIT } from "./rates.js";
import type { DurationBand } from "./durations.js";
import type { ModelTier, Rigor } from "../vocab.js";
import type { WorkflowKey } from "../enums.js";

// ---------------------------------------------------------------------------------------------------------
// Dollars-first formatting (REQ-BILL-1 amended; §14.1). 1 credit = $0.01. Dollars lead at every decision
// moment; credits, cap and balance-after are the second line; raw tokens NEVER appear here (they live only
// behind the Advanced disclosure, which this module does not render).
// ---------------------------------------------------------------------------------------------------------

/** Convert a credit figure to its dollar value ($0.01 / credit). */
export function creditsToUsd(credits: number): number {
  return credits * USD_PER_CREDIT;
}

/** Format a credit figure as dollars, two decimals ("$5.60"). The decision-moment unit (REQ-BILL-1). */
export function formatUsd(credits: number): string {
  return `$${creditsToUsd(credits).toFixed(2)}`;
}

/** Format a whole-credit count with thousands separators ("1,240"). */
export function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

/**
 * The estimate box's FIRST (dollars-first) line: "≈ $5.60 · never more than $8.40" (§5.6 item 5; §14.1).
 * The `≈` marks the estimate; "never more than" is the cap, framed as a ceiling the user is never charged
 * past — never "you will be billed" (§14.6).
 */
export function estimateLine(estimateCredits: number, capCredits: number): string {
  return `≈ ${formatUsd(estimateCredits)} · never more than ${formatUsd(capCredits)}`;
}

/**
 * The estimate box's SECOND line: credits, cap and balance-after ("560 credits · cap 840 · 590 left after
 * the cap"). Credits are the second unit (REQ-BILL-1). When `balanceAfterCap` is omitted the balance clause
 * is dropped (an estimate with no known balance).
 */
export function creditsLine(estimateCredits: number, capCredits: number, balanceAfterCap?: number): string {
  const parts = [`${formatCredits(estimateCredits)} credits`, `cap ${formatCredits(capCredits)}`];
  if (balanceAfterCap != null) parts.push(`${formatCredits(balanceAfterCap)} left after the cap`);
  return parts.join(" · ");
}

// ---------------------------------------------------------------------------------------------------------
// Cap sizing (§5.6 item 4; §14.4 REQ-BILL-3). cap = ceil(1.5 × estimate), editable upward only, scaled by
// the platform circuit-breaker multiplier for NEW runs (REQ-SPEC-24.5; D-P0.11-1). The 1.5× floor is
// REQ-BILL-7's; a run never gets a cap below its estimate.
// ---------------------------------------------------------------------------------------------------------

/** The default per-run cap multiplier (§5.6 item 4). */
export const CAP_MULTIPLIER = 1.5 as const;

/** `cap = ceil(capMultiplier × breakerMultiplier × estimate)` (§5.6 item 4; REQ-SPEC-24.5). */
export function capFromEstimate(estimateCredits: number, breakerMultiplier: 1 | 2 = 1): number {
  return Math.ceil(estimateCredits * CAP_MULTIPLIER * breakerMultiplier);
}

// ---------------------------------------------------------------------------------------------------------
// Consent (REQ-BILL-4 amended; §5.6 item 5). A second, deliberate click ("Confirm and run") is required
// when the run is expensive in absolute or relative terms; the per-user "Don't ask under N" removes it
// below N (N ≤ 1,000); an entitlement (trial) run never asks.
// ---------------------------------------------------------------------------------------------------------

/** Consent absolute threshold: above this many credits, always confirm (§5.6 item 5). */
export const CONSENT_ABSOLUTE_CREDITS = 500 as const;
/** Consent relative threshold: above this fraction of the spendable balance, confirm — subject to the floor. */
export const CONSENT_BALANCE_FRACTION = 0.25 as const;
/** The 200-credit floor on the percentage rule so small accounts do not double-click everything (review 12 #27). */
export const CONSENT_PCT_FLOOR_CREDITS = 200 as const;
/** The maximum the per-user "Don't ask under N" may be set to (§5.6 item 5). */
export const DONT_ASK_UNDER_MAX = 1000 as const;

/** Clamp a user's "don't ask under N" into `[0, 1000]` (a non-number ⇒ 0 = ask by the rule). */
export function clampDontAskUnder(n: number | undefined): number {
  if (n == null || !Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.floor(n)), DONT_ASK_UNDER_MAX);
}

export interface ConsentInput {
  /** the run's estimate in credits. */
  readonly estimateCredits: number;
  /** the account's spendable balance in credits. */
  readonly spendableCredits: number;
  /** the per-user "don't ask under N" setting (clamped to ≤ 1,000); absent ⇒ 0. */
  readonly dontAskUnder?: number;
  /** an entitlement (trial) run never asks (REQ-BILL-4: "never on an entitlement run"). */
  readonly entitlement?: boolean;
}

export interface ConsentDecision {
  /** true ⇒ the button reads "Confirm and run" and needs a second click (a client-side step, not a gate). */
  readonly needsSecondClick: boolean;
  /** which rule fired: the absolute >500 rule, the relative >200-and-25% rule, suppressed by the opt-out, or none. */
  readonly reason: "absolute" | "relative" | "suppressed" | null;
}

/**
 * Decide whether the run needs a consent second click (REQ-BILL-4 amended; §5.6 item 5). Order: an
 * entitlement run never asks; the opt-out suppresses below N; then the absolute >500 rule; then the
 * relative rule (>200 credits AND >25% of spendable). The consent second click is a client-side step, not
 * a `confirm_cost` gate (§5.6: gates exist only for sheet-less runs).
 */
export function consentDecision(input: ConsentInput): ConsentDecision {
  const { estimateCredits: est, spendableCredits: bal, entitlement } = input;
  if (entitlement) return { needsSecondClick: false, reason: null };
  const n = clampDontAskUnder(input.dontAskUnder);
  if (est < n) return { needsSecondClick: false, reason: "suppressed" };
  if (est > CONSENT_ABSOLUTE_CREDITS) return { needsSecondClick: true, reason: "absolute" };
  if (est > CONSENT_PCT_FLOOR_CREDITS && est > CONSENT_BALANCE_FRACTION * bal) {
    return { needsSecondClick: true, reason: "relative" };
  }
  return { needsSecondClick: false, reason: null };
}

// ---------------------------------------------------------------------------------------------------------
// Insufficient balance (§5.6 item 6; §14.6). When cap > spendable the estimate box becomes a resolution
// panel: the three sentences, cheapest-fitting option first, and NEVER a silent bill. The plan-naming
// upsell line and "upgrade" are a beta out-of-scope (REQ-BETA-19 / house credits, REQ-BETA-14): the `beta`
// mode drops them for a house-credit ask, keeping the canonical three-sentence shape.
// ---------------------------------------------------------------------------------------------------------

/** A resolution the user can take to make the run fit (§5.6 item 6), cheapest-fitting first. */
export type ResolutionAction = "lower_rigor" | "use_base" | "turn_off_fact_check" | "add_credits";

export interface ResolutionOption {
  readonly action: ResolutionAction;
  /** true for the cheapest-fitting option — the primary button (§5.6 item 6). */
  readonly primary: boolean;
}

export interface InsufficientBalanceResolution {
  readonly capCredits: number;
  readonly spendableCredits: number;
  /** the three sentences, in order (§14.6). Sentence 1 states the gap; 2 lists the levers; 3 the credits ask. */
  readonly sentences: readonly [string, string, string];
  /** the resolution options, cheapest-fitting first (`primary`). */
  readonly options: readonly ResolutionOption[];
}

/**
 * Build the insufficient-balance resolution (§14.6) when `cap > spendable`; returns `null` when the run
 * fits. The three sentences are verbatim §14.6 in `full` mode; `beta` mode replaces the "/ upgrade" clause
 * with a house-credit ask (REQ-BETA-14/19 — no plan upsell). Never says "you will be billed" (§14.6).
 */
export function resolveInsufficientBalance(args: {
  capCredits: number;
  spendableCredits: number;
  mode?: "full" | "beta";
  /**
   * EST.1 — the model tiers the caller's plan permits (§14.6's "switch to Base" advice may only name
   * tiers the sheet could actually select). Absent ⇒ all tiers selectable (the historical default).
   */
  allowedModelTiers?: readonly ModelTier[];
  /** the tier the run is currently priced at (absent ⇒ treated as already-Base — no Base option). */
  currentModelTier?: ModelTier;
}): InsufficientBalanceResolution | null {
  const { capCredits: cap, spendableCredits: bal } = args;
  if (cap <= bal) return null;
  const mode = args.mode ?? "full";
  // EST.1 — "switch to Base" only appears when the plan actually permits it AND the run isn't already
  // priced at it (the old fixed sentence advised a Base tier a Free/trial account was already on — or
  // couldn't pick). When the plan is Base-only the levers sentence names rigor/fact-check only.
  const allowed = args.allowedModelTiers ?? ["base", "balanced", "frontier"];
  const canDrop = allowed.includes("base") && args.currentModelTier !== "base";
  const leverSentence = canDrop
    ? "Lower the rigor, switch to Base, or turn off fact-check to fit."
    : "Lower the rigor or turn off fact-check to fit.";
  const third = mode === "beta" ? "Or ask for more credits." : "Or add credits / upgrade.";
  const sentences: [string, string, string] = [
    `This run's cap (${formatCredits(cap)}) is more than your spendable balance (${formatCredits(bal)}).`,
    leverSentence,
    third,
  ];
  // Cheapest-fitting first: dropping fact-check usually removes the most credits, then Base, then rigor;
  // adding credits is always last (it costs the user money). The sheet marks the first as primary.
  const options: ResolutionOption[] = [{ action: "turn_off_fact_check", primary: true }];
  if (canDrop) options.push({ action: "use_base", primary: false });
  options.push({ action: "lower_rigor", primary: false }, { action: "add_credits", primary: false });
  return { capCredits: cap, spendableCredits: bal, sentences, options };
}

// ---------------------------------------------------------------------------------------------------------
// Read models (design/4 §6.3, normative by reference §0.1; REQ-BILL-13). The estimate request/response the
// stateless endpoint speaks. `QualityTier` was renamed `ModelTier` and `Rigor` narrowed to the three
// notches (REQ-IDE-50); these carry no tokens (REQ-BILL-8).
// ---------------------------------------------------------------------------------------------------------

/** The parametric inputs a caller may pass; a missing input is derived (words) or defaulted (claims density). */
export interface EstimateInputs {
  readonly words?: number;
  readonly claims?: number;
  readonly findings?: number;
  readonly movesWithResearch?: number;
  readonly wordsRead?: number;
  readonly piecesRead?: number;
  readonly holdouts?: number;
}

/** `POST /projects/:id/estimates` request (REQ-SPEC-16). */
export interface EstimateRequest {
  readonly workflow: WorkflowKey;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  /** the draft version content hash the claim pre-pass caches against (`estimate_cache` key). */
  readonly draftSha?: string;
  readonly inputs: EstimateInputs;
  /** a named estimator variant (e.g. "quick"/"full" for profile_voice). */
  readonly variant?: string;
  readonly entitlement?: boolean;
}

/** `POST /projects/:id/estimates` response (REQ-SPEC-16): `{estimate, cap, levers, claimCount?}`. */
export interface Estimate {
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  /** true until the cached claim pre-pass has refined the figure (§5.6 item 1). */
  readonly provisional: boolean;
  /** the pre-pass's claim count once refined (absent while provisional / for claim-free workflows). */
  readonly claimCount?: number;
  /** EST.1 — the shared duration band (calibrated cell, else the shared per-phase prior). */
  readonly duration?: DurationBand;
  /** EST.1 — the "Why this estimate?" decomposition (one term per addend, summed subtotal, factors). */
  readonly why?: EstimateWhy;
}

/**
 * EST.1 — one additive line of the "Why this estimate?" block: `quantity` units at `rateCredits`
 * credits each summing to `credits` (`quantity` is null on the fixed/intercept line — its `credits`
 * IS the rate).
 */
export interface EstimateWhyTerm {
  readonly label: string;
  readonly quantity: number | null;
  /** the quantity's unit noun ("words", "claims", "phases") — absent on the fixed line. */
  readonly unit?: string;
  readonly rateCredits: number;
  readonly credits: number;
}

/** EST.1 — the decomposition the sheet's "Why this estimate?" block renders: additive terms, their
 *  subtotal, the multiplicative factors (calibration/metered coverage/tier/rigor), the stated rounding
 *  to the printed total. Sum-checkable: Σ terms × Π factors ≈ totalCredits within the stated rounding. */
export interface EstimateWhy {
  readonly terms: readonly EstimateWhyTerm[];
  readonly subtotalCredits: number;
  readonly factors: readonly { label: string; multiplier: number }[];
  /** the un-rounded figure the estimate ceils (Σ terms × Π factors). */
  readonly exactCredits: number;
  /** the printed total — identical to `estimateCredits`. */
  readonly totalCredits: number;
}
