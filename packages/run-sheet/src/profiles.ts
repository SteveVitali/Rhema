// The §6.5 rigor → flags mapping for the beta's three verbs (Review / Revise / Fact-check), plus the
// Advanced per-phase toggles each exposes and how a toggle set maps back onto the SAME estimator's inputs
// and per-phase addends (REQ-BILL-5 — one estimator, one figure, signed deltas). Rigor is the one
// first-class lever; Model tier is a consequence of Rigor and is changed only under the collapsed row
// (§5.6 item 2). The full-IDE sheet (P1.6) reuses these profiles unchanged.

import type { ModelTier, Rigor, WorkflowKey } from "@rhema/contracts";
import type { EstimatorInputs } from "@rhema/protocols";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";

/** The Advanced per-phase toggles a sheet may expose (§6.5: fact-check / discourse / second read / …). */
export type ToggleKey =
  | "fact_check"
  | "discourse"
  | "second_read"
  | "repair_research"
  | "gap_check"
  | "grounding"
  | "audit";

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

/**
 * PRB.23 — the bridge from a sheet toggle to the workflow manifest's `optOutFlag` (the flag the
 * orchestrator's `isOptedOut` reads from the run's FROZEN inputs). The toggle names and the flag
 * names diverged (`fact_check` gates the `verification` phase; `repair_research` gates `research`;
 * `gap_check` gates `gap_analysis`) — this is the single mapping both sides read.
 */
export const TOGGLE_OPT_OUT_FLAG: Record<ToggleKey, string> = {
  fact_check: "verification",
  discourse: "discourse",
  second_read: "second_read",
  repair_research: "research",
  gap_check: "gap_analysis",
  grounding: "grounding",
  audit: "audit",
};

/**
 * PRB.23 — resolve a workflow's phase-run flags from a resolved toggle set, driven by the
 * MANIFEST's declared `optOutFlag`s (server-authored: a flag the manifest does not declare is
 * never emitted, a flag with no governing toggle is left unset). Returns `{optOutFlag: bool}`
 * where `false` opts the phase out at runtime (`runspec.isOptedOut` reads exactly this). The
 * estimator and the runtime MUST consume the same output — a quick review's estimate prices five
 * phases only if the frozen inputs also omit discourse + second_read (the D-PRB.21-1 divergence:
 * the web run POST used to freeze `inputs: {}`, so nothing was ever opted out).
 */
export function phaseFlagsForToggles(workflow: WorkflowKey, toggles: ToggleState): Record<string, boolean> {
  const manifest = WORKFLOW_MANIFESTS[workflow];
  const flags: Record<string, boolean> = {};
  for (const phase of manifest?.phases ?? []) {
    if (phase.optOutFlag == null) continue;
    const toggle = (Object.entries(TOGGLE_OPT_OUT_FLAG) as [ToggleKey, string][]).find(
      ([, flag]) => flag === phase.optOutFlag,
    )?.[0];
    if (toggle != null) flags[phase.optOutFlag] = toggles[toggle] ?? true;
  }
  return flags;
}

/**
 * PRB.23 — the number of manifest phases that will actually run under a resolved toggle set
 * (mirrors `runspec`'s opt-out filter: an `optOutFlag`d phase whose frozen flag is `false` does
 * not run). Feeds the estimator's per-phase fixed-overhead term (`inputs.phases`), so the churn
 * floor is priced against the same phase set the pod executes.
 */
export function activePhaseCount(workflow: WorkflowKey, toggles: ToggleState): number | undefined {
  const manifest = WORKFLOW_MANIFESTS[workflow];
  if (!manifest) return undefined;
  const flags = phaseFlagsForToggles(workflow, toggles);
  return manifest.phases.filter((p) => p.optOutFlag == null || flags[p.optOutFlag] !== false).length;
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
    // fact-check on ⇒ the verification phase runs, so its bounded-research addend is priced (PRB.22).
    if (toggles.fact_check) enabledAddends.push("verification");
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

// ---- Draft (§6.2/§12.2; P1.10): grounding / audit are the two rigor-gated phases. Quick drops BOTH
// ([unverified] marks replace verification, no audit) — the manifest's `optional:"quick"` rows; Standard+
// runs both with fresh-only sources. The grounding toggle prices the research-loop churn addend. ----
const DRAFT: WorkflowSheetProfile = {
  workflow: "draft",
  toggles: ["grounding", "audit"],
  rigorDefaults: {
    quick: { modelTier: "base", toggles: { grounding: false, audit: false } },
    standard: { modelTier: "balanced", toggles: { grounding: true, audit: true } },
    full_board: { modelTier: "frontier", toggles: { grounding: true, audit: true } },
  },
  applyToggles(baseInputs, toggles) {
    // grounding off ⇒ the claim-inventory research loop never runs: drop the grounding addend AND the
    // per-claim term (the ledger inherits the outline's unverified claims — nothing is priced per claim).
    const enabledAddends: string[] = toggles.grounding ? ["grounding"] : [];
    const inputs: EstimatorInputs = { ...baseInputs, claims: toggles.grounding ? baseInputs.claims : 0 };
    return { inputs, enabledAddends };
  },
};

/** The beta's three verbs + the persona build (REQ-WF-3; §9.2 Quick Voice — PRB.10) + the Draft verb
 *  (P1.10). Other workflows fall through to a caller error. */
export const WORKFLOW_SHEET_PROFILES: Partial<Record<WorkflowKey, WorkflowSheetProfile>> = {
  review: REVIEW,
  revise: REVISE,
  fact_check: FACT_CHECK,
  profile_voice: PROFILE_VOICE,
  draft: DRAFT,
};

/** Resolve a workflow's sheet profile; throws for a workflow the beta sheet does not launch. */
export function sheetProfile(workflow: WorkflowKey): WorkflowSheetProfile {
  const p = WORKFLOW_SHEET_PROFILES[workflow];
  if (!p) throw new Error(`run sheet: workflow "${workflow}" is not launchable in the beta (REQ-WF-3)`);
  return p;
}
