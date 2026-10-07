// The stateless estimate (REQ-SPEC-16; §5.6 item 1). Two figures from the SAME estimator: an IMMEDIATE
// provisional figure from the word count and the protocol's typical claim density, and a REFINED figure
// once the cached claim pre-pass supplies the real claim count. A run launched before the refinement is
// capped from the provisional estimate (§5.6 item 1). This reads `estimatorSpec` (override-first) so a
// folded instrumented run (P0.15k) is reflected without a code change.

import {
  capFromEstimate,
  CURRENT_RATE_TABLE_VERSION,
  type Estimate,
  type ModelTier,
  type Rigor,
  type WorkflowKey,
} from "@rhema/contracts";
import { estimateCredits, estimatorSpec, type EstimatorInputs } from "@rhema/protocols";
import { activePhaseCount, resolveToggles, sheetProfile, type ToggleState } from "./profiles.js";

/**
 * The protocol's typical claim density (claims per word) for the immediate figure, per workflow with a
 * per-claim cost. ≈ 1 claim / 250 words — the density behind the §5.6 mock's "5,180 words · 21 claims".
 * Provisional (§16.3 #1): the cached pre-pass replaces the derived count with the measured one.
 */
export const CLAIMS_PER_WORD: Partial<Record<WorkflowKey, number>> = {
  review: 0.004,
  fact_check: 0.004,
  // P1.10 — Draft prices `c·inherited_claims`; absent a real outline-claim count the provisional figure
  // derives from the same ~1-claim/250-word density against the target word count.
  draft: 0.004,
};

export interface BuildEstimateArgs {
  readonly workflow: WorkflowKey;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly inputs: EstimatorInputs;
  /** an estimator variant (profile_voice "quick"/"full"). */
  readonly variant?: string;
  /** user toggle overrides on top of the rigor defaults. */
  readonly toggles?: ToggleState;
  /** the platform circuit-breaker cap multiplier for a NEW run (REQ-SPEC-24.5). */
  readonly breakerMultiplier?: 1 | 2;
  /**
   * The claim count from the cached pre-pass. When present the figure is REFINED (`provisional: false`);
   * when absent and the workflow is claim-priced, the count is derived from words × density (provisional).
   */
  readonly claimCount?: number;
}

/** Derive the provisional claim count for a claim-priced workflow from the word count (§5.6 item 1). */
export function provisionalClaimCount(workflow: WorkflowKey, words: number | undefined): number | undefined {
  const density = CLAIMS_PER_WORD[workflow];
  if (density == null) return undefined;
  return Math.max(0, Math.round((words ?? 0) * density));
}

/**
 * Compute an estimate (REQ-SPEC-16). Resolves the workflow's toggle set for the rigor, folds the toggles
 * onto the estimator inputs/addends, evaluates the (override-first) estimator spec, and sizes the cap
 * (`ceil(1.5 × estimate)`, breaker-scaled). `provisional` is true until a real claim count is supplied.
 */
export function buildEstimate(args: BuildEstimateArgs): Estimate {
  const profile = sheetProfile(args.workflow);
  const toggles = resolveToggles(profile, args.rigor, args.toggles);

  // Resolve the claim count: an explicit refined count, else the caller's input, else the derived density.
  let provisional = false;
  let claims = args.claimCount ?? args.inputs.claims;
  if (claims == null) {
    const derived = provisionalClaimCount(args.workflow, args.inputs.words);
    if (derived != null) {
      claims = derived;
      provisional = true;
    }
  }
  // ECON.1 (§6.5; ADR-033) — a rigor notch's server-authored claim cap clamps the priced claim count:
  // Quick Review fact-checks "the five load-bearing claims", so a 23-claim draft prices five. The SAME
  // effective count rides the `claimCount` output into `input_snapshot.claimCount`, so the claim-scaled
  // egress budgets (`authorWebToolPolicy`) bound on it too. fact_check-off zeroes claims below anyway.
  const claimCap = profile.rigorDefaults[args.rigor]?.claimCap;
  if (claimCap != null && claims != null) claims = Math.min(claims, claimCap);
  // PRB.23 — the per-phase fixed-overhead term reads `inputs.phases`: the count of manifest
  // phases that will ACTUALLY run under the resolved toggles (the same opt-out rule the
  // orchestrator's runspec applies to the frozen inputs). Estimate and runtime consume one
  // derivation — a quick review prices five phase sessions, not seven.
  const phases = activePhaseCount(args.workflow, toggles);
  const baseInputs: EstimatorInputs = {
    ...args.inputs,
    ...(claims != null ? { claims } : {}),
    ...(phases != null ? { phases } : {}),
  };

  const { inputs, enabledAddends } = profile.applyToggles(baseInputs, toggles);
  const spec = estimatorSpec(args.workflow);
  if (!spec) throw new Error(`buildEstimate: no estimator spec for "${args.workflow}"`);

  const estimate = estimateCredits(spec, inputs, {
    tier: args.modelTier,
    rigor: args.rigor,
    ...(profile.variant ? { variant: profile.variant } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    enabledAddends,
  });
  const cap = capFromEstimate(estimate, args.breakerMultiplier ?? 1);

  return {
    estimateCredits: estimate,
    capCredits: cap,
    rateTableVersion: CURRENT_RATE_TABLE_VERSION,
    provisional,
    ...(claims != null && CLAIMS_PER_WORD[args.workflow] != null ? { claimCount: claims } : {}),
  };
}
