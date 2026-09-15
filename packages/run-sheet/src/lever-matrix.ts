// The lever matrix (§5.6 item 2; REQ-BILL-5). Every lever change — rigor, model tier, an Advanced per-phase
// toggle — recomputes estimate / cap / time from the cached constants in well under 100 ms, and each
// Advanced toggle shows a SIGNED credit delta from the same estimator. The matrix precomputes the full
// (small, discrete) lever cross-product so a client with no bundle can recompute in place by lookup; the
// server builds it once per estimate response and embeds it (progressive enhancement).

import { MODEL_TIERS, RIGORS, formatCredits, type ModelTier, type Rigor, type WorkflowKey } from "@rhema/contracts";
import type { EstimatorInputs } from "@rhema/protocols";
import { buildEstimate } from "./estimate.js";
import { resolveToggles, sheetProfile, type ToggleKey, type ToggleState } from "./profiles.js";

export interface TimeBand {
  readonly lowMinutes: number;
  readonly highMinutes: number;
}

/** An illustrative time band derived from the estimate (no spec formula — refined by instrumented runs). */
export function timeBandFor(estimateCredits: number): TimeBand {
  const low = Math.max(5, Math.round(estimateCredits / 25));
  const high = Math.max(low + 5, Math.round(estimateCredits / 15));
  return { lowMinutes: low, highMinutes: high };
}

export interface LeverState {
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly toggles: ToggleState;
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly time: TimeBand;
}

export interface ToggleDelta {
  readonly toggle: ToggleKey;
  readonly enabled: boolean;
  /** signed credits if this toggle were FLIPPED from its current state (turning off is negative). */
  readonly deltaCredits: number;
  /** the display label with an explicit sign — "−1,080" / "+90" (REQ-BILL-5). */
  readonly deltaLabel: string;
}

export interface LeverMatrix {
  readonly workflow: WorkflowKey;
  readonly current: LeverState;
  /** every precomputed lever combination, keyed by `leverKey` — the client's in-place recompute table. */
  readonly states: Readonly<Record<string, LeverState>>;
  /** the signed delta for flipping each Advanced toggle from the current state (§5.6; REQ-BILL-5). */
  readonly toggleDeltas: readonly ToggleDelta[];
}

/** A stable key for a lever combination (rigor · tier · sorted enabled toggles). */
export function leverKey(rigor: Rigor, tier: ModelTier, toggles: ToggleState): string {
  const on = Object.keys(toggles)
    .filter((k) => toggles[k as ToggleKey])
    .sort()
    .join(",");
  return `${rigor}|${tier}|${on}`;
}

/** Format a signed credit delta ("+90" / "−1,080"; "0" has no sign). */
export function signedCredits(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded === 0) return "0";
  return `${rounded > 0 ? "+" : "−"}${formatCredits(Math.abs(rounded))}`;
}

export interface BuildLeverMatrixArgs {
  readonly workflow: WorkflowKey;
  readonly inputs: EstimatorInputs;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly toggles?: ToggleState;
  readonly variant?: string;
  readonly breakerMultiplier?: 1 | 2;
  /** a refined claim count from the pre-pass (kept constant across lever changes). */
  readonly claimCount?: number;
}

function stateFor(args: BuildLeverMatrixArgs, rigor: Rigor, tier: ModelTier, toggles: ToggleState): LeverState {
  const est = buildEstimate({
    workflow: args.workflow,
    rigor,
    modelTier: tier,
    inputs: args.inputs,
    toggles,
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
  });
  return {
    rigor,
    modelTier: tier,
    toggles,
    estimateCredits: est.estimateCredits,
    capCredits: est.capCredits,
    time: timeBandFor(est.estimateCredits),
  };
}

/** Every on/off combination of a workflow's toggles (2^n; n ≤ 3 for the beta verbs). */
function toggleCombos(toggleKeys: readonly ToggleKey[]): ToggleState[] {
  const combos: ToggleState[] = [];
  for (let mask = 0; mask < 1 << toggleKeys.length; mask++) {
    const s: ToggleState = {};
    toggleKeys.forEach((k, i) => {
      s[k] = (mask & (1 << i)) !== 0;
    });
    combos.push(s);
  }
  return combos;
}

/**
 * Build the lever matrix for a sheet configuration (§5.6 item 2; REQ-BILL-5). Precomputes every rigor ×
 * tier × toggle combination and the current state's signed toggle deltas. Pure arithmetic over cached
 * constants — trivially under the 100 ms recompute budget.
 */
export function buildLeverMatrix(args: BuildLeverMatrixArgs): LeverMatrix {
  const profile = sheetProfile(args.workflow);
  const currentToggles = resolveToggles(profile, args.rigor, args.toggles);
  const states: Record<string, LeverState> = {};

  for (const rigor of RIGORS) {
    for (const tier of MODEL_TIERS) {
      for (const combo of toggleCombos(profile.toggles)) {
        // start from the rigor's defaults so a state carries a full toggle set, then apply the combo.
        const toggles = { ...profile.rigorDefaults[rigor].toggles, ...combo };
        const key = leverKey(rigor, tier, toggles);
        if (!states[key]) states[key] = stateFor(args, rigor, tier, toggles);
      }
    }
  }

  const current = stateFor(args, args.rigor, args.modelTier, currentToggles);
  const toggleDeltas: ToggleDelta[] = profile.toggles.map((toggle) => {
    const flipped = { ...currentToggles, [toggle]: !currentToggles[toggle] };
    const flippedState = stateFor(args, args.rigor, args.modelTier, flipped);
    const delta = flippedState.estimateCredits - current.estimateCredits;
    return {
      toggle,
      enabled: !!currentToggles[toggle],
      deltaCredits: delta,
      deltaLabel: signedCredits(delta),
    };
  });

  return { workflow: args.workflow, current, states, toggleDeltas };
}
