// The lever matrix (§5.6 item 2; REQ-BILL-5). Every lever change — rigor, model tier, an Advanced per-phase
// toggle — recomputes estimate / cap / time from the cached constants in well under 100 ms, and each
// Advanced toggle shows a SIGNED credit delta from the same estimator. The matrix precomputes the full
// (small, discrete) lever cross-product so a client with no bundle can recompute in place by lookup; the
// server builds it once per estimate response and embeds it (progressive enhancement).
//
// EST.1 — two corrections:
//  * durations come from the SAME band the sheet/Timeline/card render (`durationBandFor`: a calibrated
//    `cost_card_cells` cell when one covers the bucket, else the shared per-phase prior) — the old
//    `credits/25…credits/15` derivation is gone, so a bigger estimate no longer reads as a longer run.
//  * the toggle cross-product is computed ONCE and shared across rigor × tier cells (a toggle's state is
//    toggle-keyed, not rigor-keyed, so three identical passes were wasted work) — this keeps the matrix
//    linear in the number of DISTINCT states, which is what the <100 ms budget actually buys.

import { MODEL_TIERS, RIGORS, formatCredits, type DurationBand, type ModelTier, type Rigor, type WorkflowKey } from "@rhema/contracts";
import type { EstimatorInputs } from "@rhema/protocols";
import { buildEstimate } from "./estimate.js";
import { resolveToggles, sheetProfile, type ToggleKey, type ToggleState } from "./profiles.js";
import { durationBandFor, durationCellKey, type DurationCells } from "./surface.js";

export type TimeBand = DurationBand;

export interface LeverState {
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly toggles: ToggleState;
  readonly estimateCredits: number;
  readonly capCredits: number;
  /** the duration band — `DurationBand` since EST.1 (calibrated cell, else the shared prior). */
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
  /** EST.1 — the calibrated duration cells (`cost_card_cells` → `${rigor}|${tier}` bands). Absent ⇒
   *  the shared per-phase prior on every state. */
  readonly durations?: DurationCells;
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
    time:
      args.durations?.[durationCellKey(rigor, tier)] ??
      durationBandFor({ workflow: args.workflow, rigor, modelTier: tier, toggles }),
  };
}

/**
 * Every DISTINCT on/off toggle combination of the workflow, once (EST.1 — the set no longer depends
 * on the rigor's defaults, so the cross-product is computed a single time and re-keyed per cell).
 */
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
  const combos = toggleCombos(profile.toggles);

  for (const rigor of RIGORS) {
    for (const tier of MODEL_TIERS) {
      for (const toggles of combos) {
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
