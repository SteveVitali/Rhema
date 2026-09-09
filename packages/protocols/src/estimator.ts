import type { WorkflowKey } from "@rhema/contracts";

// Estimator constants as versioned data (§12.2 shapes). **PROVISIONAL** — every constant is replaced by
// the instrumented runs of §16.3 #1 (P0.15) before any price card is frozen; `provisional: true` marks
// that. Credits are stated at **Base tier, Standard rigor** (§12.2). Model-tier multipliers 1× / 2.2× /
// 4.5× and the rigor multipliers of §6.1 apply on top; the estimator is phase-aware (a cache write per
// phase, review 13 F8) — that phase weighting lives in each manifest's `budgetShare`.

export interface EstimatorTerms {
  /** fixed credits. */
  intercept: number;
  perWord?: number;
  perClaim?: number;
  perFinding?: number;
  perMoveWithResearch?: number;
  perWordRead?: number;
  perPieceRead?: number;
  perHoldout?: number;
}

export interface EstimatorSpec {
  workflow: WorkflowKey;
  /** the primary parametric form (Base/Standard). */
  base?: EstimatorTerms;
  /** rigor/tier variants where one shape does not fit (e.g. Quick vs Full persona profiling). */
  variants?: Record<string, EstimatorTerms>;
  /** per-phase additive terms (e.g. Review's discourse / second-read add-ons). */
  addends?: { phase: string; terms: EstimatorTerms }[];
  /** the named cost-per-verified-claim constant where §12.2 gives one (Base). */
  costPerVerifiedClaimBase?: number;
  provisional: true;
}

export const MODEL_TIER_MULTIPLIERS = { base: 1, balanced: 2.2, frontier: 4.5 } as const;

export const ESTIMATORS: Record<string, EstimatorSpec> = {
  review: {
    workflow: "review",
    base: { intercept: 40, perWord: 0.012, perClaim: 24 },
    addends: [
      { phase: "discourse", terms: { intercept: 90, perWord: 0.006 } },
      { phase: "second_read", terms: { intercept: 0, perWord: 0.005 } },
    ],
    costPerVerifiedClaimBase: 24,
    provisional: true,
  },
  revise: {
    workflow: "revise",
    base: { intercept: 50, perWord: 0.03, perFinding: 4, perMoveWithResearch: 20 },
    provisional: true,
  },
  fact_check: {
    workflow: "fact_check",
    base: { intercept: 20, perClaim: 11 },
    costPerVerifiedClaimBase: 11,
    provisional: true,
  },
  profile_voice: {
    workflow: "profile_voice",
    variants: {
      // Quick Voice tier.
      quick: { intercept: 40, perWord: 0.012 },
      // Full Profile.
      full: { intercept: 120, perWordRead: 0.009, perPieceRead: 40, perHoldout: 90 },
    },
    provisional: true,
  },
  refresh_voice: {
    workflow: "refresh_voice",
    // Refresh costs only the delta (REQ-WF-11): the Full-Profile shape over the changed pieces only.
    variants: { full: { intercept: 120, perWordRead: 0.009, perPieceRead: 40, perHoldout: 90 } },
    provisional: true,
  },
  calibrate_voice: {
    workflow: "calibrate_voice",
    base: { intercept: 90, perHoldout: 90 },
    provisional: true,
  },
};
