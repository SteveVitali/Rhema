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
import {
  estimateCredits,
  estimatorSpec,
  type EstimatorInputs,
  type EstimatorSpec,
} from "@rhema/protocols";
import {
  activePhaseCount,
  resolveToggles,
  sheetProfile,
  type ToggleState,
  type WorkflowSheetProfile,
} from "./profiles.js";

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

/** The claim density in force for a workflow: the calibrated spec's `claimDensity` (ECON.1's
 *  `estimator_cells` JSONB) outranks the shipped `CLAIMS_PER_WORD` table (EST.1 — the calibration
 *  store's density IS part of the cost card the surfaces share). */
export function claimDensity(workflow: WorkflowKey, spec?: EstimatorSpec): number | undefined {
  return spec?.claimDensity ?? CLAIMS_PER_WORD[workflow];
}

/** Derive the provisional claim count for a claim-priced workflow from the word count (§5.6 item 1). */
export function provisionalClaimCount(
  workflow: WorkflowKey,
  words: number | undefined,
  spec?: EstimatorSpec,
): number | undefined {
  const density = claimDensity(workflow, spec);
  if (density == null) return undefined;
  return Math.max(0, Math.round((words ?? 0) * density));
}

/** EST.1 — the resolved internals of `buildEstimate`, exposed so the surface API can decompose the
 *  SAME figure into the "Why this estimate?" terms without a second formula (ADR-034). */
export interface ResolvedEstimation {
  readonly estimate: Estimate;
  readonly spec: EstimatorSpec;
  readonly profile: WorkflowSheetProfile;
  /** the toggle set in force (rigor defaults + user overrides). */
  readonly toggles: ToggleState;
  /** the estimator inputs AFTER toggle application (the figure's actual inputs). */
  readonly inputs: EstimatorInputs;
  /** the addend phase names the estimate included. */
  readonly enabledAddends: readonly string[] | undefined;
  /** the estimator variant evaluated (profile's, else the caller's). */
  readonly variant: string | undefined;
}

/**
 * Compute an estimate (REQ-SPEC-16). Resolves the workflow's toggle set for the rigor, folds the toggles
 * onto the estimator inputs/addends, evaluates the (override-first) estimator spec, and sizes the cap
 * (`ceil(1.5 × estimate)`, breaker-scaled). `provisional` is true until a real claim count is supplied.
 */
export function resolveEstimation(args: BuildEstimateArgs): ResolvedEstimation {
  const profile = sheetProfile(args.workflow);
  const toggles = resolveToggles(profile, args.rigor, args.toggles);
  const spec = estimatorSpec(args.workflow);
  if (!spec) throw new Error(`buildEstimate: no estimator spec for "${args.workflow}"`);

  // Resolve the claim count: an explicit refined count, else the caller's input, else the derived density
  // (the calibrated spec's `claimDensity` outranks the shipped table).
  let provisional = false;
  let claims = args.claimCount ?? args.inputs.claims;
  if (claims == null) {
    const derived = provisionalClaimCount(args.workflow, args.inputs.words, spec);
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
  const variant = args.variant ?? profile.variant;

  const estimate = estimateCredits(spec, inputs, {
    tier: args.modelTier,
    rigor: args.rigor,
    ...(variant ? { variant } : {}),
    enabledAddends,
  });
  const cap = capFromEstimate(estimate, args.breakerMultiplier ?? 1);

  return {
    estimate: {
      estimateCredits: estimate,
      capCredits: cap,
      rateTableVersion: CURRENT_RATE_TABLE_VERSION,
      provisional,
      ...(claims != null && claimDensity(args.workflow, spec) != null ? { claimCount: claims } : {}),
    },
    spec,
    profile,
    toggles,
    inputs,
    enabledAddends,
    variant,
  };
}

/** The estimate-only view of `resolveEstimation` (the historical signature every caller keeps). */
export function buildEstimate(args: BuildEstimateArgs): Estimate {
  return resolveEstimation(args).estimate;
}
