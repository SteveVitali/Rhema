// HOT.1 — the public-claims visibility config (ADR-019; REQ-SPEC-32(b) interim step). Statements the
// product cannot yet honour stay hidden behind typed claim ids; ACT.1/EST.1 flip an id HERE — never by
// re-introducing the text as parallel copy. Two layers keep a hidden claim unrunnable:
//
//   1. `enabled` — the shipped defaults turn every gated claim OFF. A surface renders claim text only
//      when `publicClaimEnabled(id)` is true.
//   2. `PUBLIC_CLAIM_COPY` — the claim-ON copy for surfaces whose honest fallback lives in the web copy
//      table. It must NOT move into `COPY`: a copy-table string renders even while the claim is off,
//      and the launch-surface sweep asserts the table carries none of these strings. (The plan/trial
//      specs' ON-copy stays in pricing.json — that file is already a typed configuration publication,
//      and the /billing/plans DTO nulls the gated fields before transmission.)

export const PUBLIC_CLAIM_IDS = [
  /**
   * "Your first review is included" / "one included Review, on us" — the 2026-09-30 design review
   * found the launch build cannot yet honour the promise; ACT.1 re-enables it from the entitlement
   * config once the delivered flow proves it.
   */
  "trial.firstReviewIncluded",
  /** The Writer/Studio/Studio Max "≈N essay loop(s)" coverage lines — EST.1 re-enables them derived
   *  from the estimator rather than hand-composed. */
  "plans.whatItCovers",
] as const;

export type PublicClaimId = (typeof PUBLIC_CLAIM_IDS)[number];

export interface PublicClaimsConfig {
  readonly enabled: Readonly<Partial<Record<PublicClaimId, boolean>>>;
}

/** The shipped defaults — every gated claim is OFF until its owning ticket flips it. */
export const PUBLIC_CLAIMS: PublicClaimsConfig = {
  enabled: { "trial.firstReviewIncluded": false, "plans.whatItCovers": false },
};

export function publicClaimEnabled(id: PublicClaimId, cfg: PublicClaimsConfig = PUBLIC_CLAIMS): boolean {
  return cfg.enabled[id] === true;
}

/**
 * The claim-ON copy for surfaces whose fallback lives in the web copy table, keyed by claim id.
 * (`plans.whatItCovers` has no entry — its ON-copy lives in pricing.json's `whatItCovers` fields,
 * marked by `whatItCoversClaimId` on the plan spec.)
 */
export const PUBLIC_CLAIM_COPY = {
  "trial.firstReviewIncluded": {
    /** §15.1 hero — replaces "No card required." when enabled. */
    landingTrialNote: "No card. Your first review is included.",
    /** §15.1 FAQ — replaces the honest "No card is required to start." answer when enabled. */
    landingFaqAnswer: "No card is required to start — your first review is included in the trial window.",
    /** §15.2 trial rule line — replaces the honest fmt when enabled. */
    trialRuleFmt: "One trial per person — {days} days, one included Review, no card.",
  },
} as const;
