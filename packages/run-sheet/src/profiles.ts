// The §6.5 rigor → flags mapping for the beta's three verbs (Review / Revise / Fact-check), plus the
// Advanced per-phase toggles each exposes and how a toggle set maps back onto the SAME estimator's inputs
// and per-phase addends (REQ-BILL-5 — one estimator, one figure, signed deltas). Rigor is the one
// first-class lever; Model tier is a consequence of Rigor and is changed only under the collapsed row
// (§5.6 item 2). The full-IDE sheet (P1.6) reuses these profiles unchanged.

import type { ModelTier, Rigor, WorkflowKey } from "@rhema/contracts";
import type { EstimatorInputs } from "@rhema/protocols";

/** The Advanced per-phase toggles a sheet may expose (§6.5: fact-check / discourse / second read / …). */
export type ToggleKey =
  | "fact_check"
  | "discourse"
  | "second_read"
  | "repair_research"
  | "gap_check";

export type ToggleState = Partial<Record<ToggleKey, boolean>>;

/** Resolved rigor defaults (§6.5): the model tier, the default toggle set, and the second-read model family. */
export interface RigorDefault {
  readonly modelTier: ModelTier;
  readonly toggles: ToggleState;
  /** Full board's second read uses a DIFFERENT model family (§6.5). Purely informational on the sheet. */
  readonly secondReadDifferentModel?: boolean;
}

export interface WorkflowSheetProfile {
  readonly workflow: WorkflowKey;
  /** an estimator variant to select (profile_voice: "quick"/"full"); absent ⇒ the base form. */
  readonly variant?: string;
  /** the Advanced toggles this workflow exposes, in display order. */
  readonly toggles: readonly ToggleKey[];
  /** the §6.5 defaults per rigor notch. */
  readonly rigorDefaults: Record<Rigor, RigorDefault>;
  /**
   * Map a toggle set onto the estimator: the (possibly overridden) inputs + the addend phases to include.
   * This is the single bridge from levers to the estimator — the sheet never re-derives a cost formula.
   */
  applyToggles(baseInputs: EstimatorInputs, toggles: ToggleState): {
    readonly inputs: EstimatorInputs;
    readonly enabledAddends: readonly string[];
  };
}

/** Merge a rigor's default toggles with any user overrides (override wins where present). */
export function resolveToggles(profile: WorkflowSheetProfile, rigor: Rigor, overrides?: ToggleState): ToggleState {
  return { ...profile.rigorDefaults[rigor].toggles, ...(overrides ?? {}) };
}

// ---- Review (§6.5): fact-check / discourse / second read. fact-check off drops the claim-verification cost
// (the perClaim term); discourse / second read are the two per-phase addends. ---------------------------
const REVIEW: WorkflowSheetProfile = {
  workflow: "review",
  toggles: ["fact_check", "discourse", "second_read"],
  rigorDefaults: {
    quick: { modelTier: "base", toggles: { fact_check: true, discourse: false, second_read: false } },
    standard: { modelTier: "balanced", toggles: { fact_check: true, discourse: true, second_read: true } },
    full_board: {
      modelTier: "frontier",
      toggles: { fact_check: true, discourse: true, second_read: true },
      secondReadDifferentModel: true,
    },
  },
  applyToggles(baseInputs, toggles) {
    const enabledAddends: string[] = [];
    if (toggles.discourse) enabledAddends.push("discourse");
    if (toggles.second_read) enabledAddends.push("second_read");
    // fact-check off removes the claim-verification cost (the perClaim term) — the dominant Review lever.
    const inputs: EstimatorInputs = { ...baseInputs, claims: toggles.fact_check ? baseInputs.claims : 0 };
    return { inputs, enabledAddends };
  },
};

// ---- Revise (§6.5): repair research / gap check. repair-research off zeroes the research-move cost. -----
const REVISE: WorkflowSheetProfile = {
  workflow: "revise",
  toggles: ["repair_research", "gap_check"],
  rigorDefaults: {
    quick: { modelTier: "base", toggles: { repair_research: false, gap_check: false } },
    standard: { modelTier: "balanced", toggles: { repair_research: true, gap_check: true } },
    full_board: { modelTier: "frontier", toggles: { repair_research: true, gap_check: true } },
  },
  applyToggles(baseInputs, toggles) {
    // repair research off ⇒ no research-backed moves priced; gap check has no modeled term yet (provisional).
    const inputs: EstimatorInputs = {
      ...baseInputs,
      movesWithResearch: toggles.repair_research ? baseInputs.movesWithResearch : 0,
    };
    return { inputs, enabledAddends: [] };
  },
};

// ---- Fact-check (§6.5): the workflow IS the fact-check; rigor scopes claim depth, no phase toggles. ------
const FACT_CHECK: WorkflowSheetProfile = {
  workflow: "fact_check",
  toggles: [],
  rigorDefaults: {
    quick: { modelTier: "base", toggles: {} },
    standard: { modelTier: "balanced", toggles: {} },
    full_board: { modelTier: "frontier", toggles: {} },
  },
  applyToggles(baseInputs) {
    return { inputs: baseInputs, enabledAddends: [] };
  },
};

// ---- Profile voice (§9.2; PRB.10): the build TIER (quick/full) is the estimator VARIANT the caller
// passes (`args.variant`), not a rigor notch — profile_voice carries no rigor multiplier (§6.1/§12.2).
// The voice sheet's lever is the corpus word count; the estimator is `40 + 0.09 × words` at Base
// (×2.2 Balanced, ×4.5 Frontier). Model tier defaults to Base at every rigor notch (the beta's Quick
// Voice runs on Base); the caller may still pass a higher modelTier — the estimator multiplies. ------
const PROFILE_VOICE: WorkflowSheetProfile = {
  workflow: "profile_voice",
  toggles: [],
  rigorDefaults: {
    quick: { modelTier: "base", toggles: {} },
    standard: { modelTier: "base", toggles: {} },
    full_board: { modelTier: "base", toggles: {} },
  },
  applyToggles(baseInputs) {
    return { inputs: baseInputs, enabledAddends: [] };
  },
};

/** The beta's three verbs + the persona build (REQ-WF-3; §9.2 Quick Voice — PRB.10). Other workflows
 *  fall through to a caller error. */
export const WORKFLOW_SHEET_PROFILES: Partial<Record<WorkflowKey, WorkflowSheetProfile>> = {
  review: REVIEW,
  revise: REVISE,
  fact_check: FACT_CHECK,
  profile_voice: PROFILE_VOICE,
};

/** Resolve a workflow's sheet profile; throws for a workflow the beta sheet does not launch. */
export function sheetProfile(workflow: WorkflowKey): WorkflowSheetProfile {
  const p = WORKFLOW_SHEET_PROFILES[workflow];
  if (!p) throw new Error(`run sheet: workflow "${workflow}" is not launchable in the beta (REQ-WF-3)`);
  return p;
}
