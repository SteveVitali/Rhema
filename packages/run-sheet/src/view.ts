// The launcher-shape RunSheetView (§5.6). A LAUNCHER, not a control panel: the computed, dynamic surface of
// the sheet — the title line, the dollars-first estimate box, the consent decision, the insufficient-balance
// panel, the Advanced toggles with signed deltas, the collapsed-row summary, the "Why this estimate?" line,
// the obligation scope line (REQ-OBJ-6) — plus the lever matrix for in-place recompute. The presentational
// component (@rhema/ui) renders this view + a chrome-labels object; the app's COPY owns the static chrome.

import {
  consentDecision,
  creditsLine,
  estimateLine,
  formatCredits,
  resolveInsufficientBalance,
  MODEL_TIER_DISPLAY,
  RIGOR_DISPLAY,
  type ConsentDecision,
  type InsufficientBalanceResolution,
  type ModelTier,
  type Rigor,
  type WorkflowKey,
} from "@rhema/contracts";
import { estimatorSpec, MODEL_TIER_MULTIPLIERS, rigorMultiplier, type EstimatorInputs } from "@rhema/protocols";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey, type LeverMatrix, type TimeBand } from "./lever-matrix.js";
import { sheetProfile, type ToggleKey, type ToggleState } from "./profiles.js";
import { RIGORS } from "@rhema/contracts";

/** The verb label for a workflow's title line (not reserved vocab; the three beta verbs). */
export const WORKFLOW_VERB_LABEL: Partial<Record<WorkflowKey, string>> = {
  review: "Review",
  revise: "Revise",
  fact_check: "Fact-check",
};

export interface SheetScope {
  /** Essay only at beta (§5.6). */
  readonly protocol: string;
  readonly venue?: string;
  readonly stage?: string;
  readonly voice?: string;
}

export interface RunSheetTitle {
  readonly verbLabel: string;
  readonly targetVersion: string;
  readonly words: number;
  readonly claims?: number;
}

export interface RunSheetEstimateBox {
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  readonly provisional: boolean;
  /** the FIRST, dollars-first line (REQ-BILL-1). */
  readonly dollarsLine: string;
  /** the SECOND, credits/cap/balance-after line (REQ-BILL-1). */
  readonly creditsLine: string;
  readonly time: TimeBand;
}

export interface RigorOption {
  readonly rigor: Rigor;
  readonly display: string;
  readonly selected: boolean;
}

export interface RunSheetView {
  readonly workflow: WorkflowKey;
  readonly title: RunSheetTitle;
  readonly rigor: Rigor;
  readonly rigorOptions: readonly RigorOption[];
  readonly modelTier: ModelTier;
  readonly modelTierDisplay: string;
  readonly estimate: RunSheetEstimateBox;
  readonly consent: ConsentDecision;
  /** non-null ⇒ the estimate box is a resolution panel; the Run button is blocked (§5.6 item 6). */
  readonly insufficient: InsufficientBalanceResolution | null;
  readonly toggleDeltas: LeverMatrix["toggleDeltas"];
  readonly collapsedSummary: string;
  readonly whyLine: string;
  /** the obligation scope line (REQ-OBJ-6), when the caller supplied obligation data. */
  readonly scopeLine?: string;
  /** the client's in-place recompute table (progressive enhancement). */
  readonly leverMatrix: LeverMatrix;
  /** the idempotency key minted at sheet open (§5.6; review 13 F34) — the Run click sends it. */
  readonly idempotencyKey: string;
  /** compact per-rigor recompute payload for the no-bundle inline enhancement (§5.6 item 2). */
  readonly recompute: RecomputePayload;
}

/** The data the inline progressive-enhancement script uses to recompute the estimate box on a Rigor change
 *  (§5.6 item 2) — the one first-class lever. Advanced toggles recompute on submit (under the fold). */
export interface RecomputePayload {
  readonly spendableCredits: number;
  readonly dontAskUnder: number;
  readonly entitlement: boolean;
  /** per-rigor DEFAULT state (§6.5: model tier is a consequence of rigor): estimate/cap/time + the tier. */
  readonly byRigor: Record<Rigor, { estimateCredits: number; capCredits: number; lowMinutes: number; highMinutes: number; modelTier: ModelTier }>;
}

export interface BuildRunSheetViewArgs {
  readonly workflow: WorkflowKey;
  readonly targetVersion: string;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly inputs: EstimatorInputs;
  readonly toggles?: ToggleState;
  readonly variant?: string;
  readonly scope: SheetScope;
  readonly spendableCredits: number;
  readonly dontAskUnder?: number;
  readonly entitlement?: boolean;
  readonly breakerMultiplier?: 1 | 2;
  readonly claimCount?: number;
  /** the obligation scope line (Review/Revise), from @rhema/obligations `runSheetObligations` (REQ-OBJ-6). */
  readonly scopeLine?: string;
  /** the idempotency key minted at sheet open; the caller supplies it so it is stable for the Run click. */
  readonly idempotencyKey: string;
  readonly insufficientMode?: "full" | "beta";
}

/** The "Why this estimate?" breakdown ("21 claims × 24 cr ≈ 500 · 5,180 words ≈ 60"). Approximate by design. */
function whyLine(args: BuildRunSheetViewArgs, claims: number | undefined): string {
  const spec = estimatorSpec(args.workflow);
  const scale = MODEL_TIER_MULTIPLIERS[args.modelTier] * rigorMultiplier(args.workflow, args.rigor) * (spec?.calibrationScale ?? 1);
  const parts: string[] = [];
  const perClaim = spec?.costPerVerifiedClaimBase;
  if (claims != null && perClaim != null) {
    parts.push(`${formatCredits(claims)} claims × ${formatCredits(perClaim)} cr ≈ ${formatCredits(claims * perClaim * scale)}`);
  }
  const perWord = spec?.base?.perWord;
  const words = args.inputs.words;
  if (perWord != null && words) {
    parts.push(`${formatCredits(words)} words ≈ ${formatCredits(words * perWord * scale)}`);
  }
  return parts.join(" · ");
}

/** The collapsed-row summary: Protocol · Venue · Stage · Model tier · Voice (§5.6 collapsed row). */
function collapsedSummary(scope: SheetScope, modelTier: ModelTier): string {
  return [scope.protocol, scope.venue, scope.stage, MODEL_TIER_DISPLAY[modelTier], scope.voice]
    .filter((s): s is string => !!s && s.length > 0)
    .join(" · ");
}

/**
 * Build the RunSheetView (§5.6). One estimate, one lever matrix, one consent decision, one insufficiency
 * check — all from the same estimator and money contract, so the sheet never surprises on money.
 */
export function buildRunSheetView(args: BuildRunSheetViewArgs): RunSheetView {
  const profile = sheetProfile(args.workflow);
  const estimate = buildEstimate({
    workflow: args.workflow,
    rigor: args.rigor,
    modelTier: args.modelTier,
    inputs: args.inputs,
    ...(args.toggles ? { toggles: args.toggles } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
  });

  const leverMatrix = buildLeverMatrix({
    workflow: args.workflow,
    inputs: args.inputs,
    rigor: args.rigor,
    modelTier: args.modelTier,
    ...(args.toggles ? { toggles: args.toggles } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
  });

  const balanceAfterCap = args.spendableCredits - estimate.capCredits;
  const consent = consentDecision({
    estimateCredits: estimate.estimateCredits,
    spendableCredits: args.spendableCredits,
    ...(args.dontAskUnder != null ? { dontAskUnder: args.dontAskUnder } : {}),
    ...(args.entitlement ? { entitlement: args.entitlement } : {}),
  });
  const insufficient = resolveInsufficientBalance({
    capCredits: estimate.capCredits,
    spendableCredits: args.spendableCredits,
    ...(args.insufficientMode ? { mode: args.insufficientMode } : {}),
  });

  const claims = estimate.claimCount;

  // per-rigor DEFAULT state at THAT rigor's default model tier (§6.5: tier is a consequence of rigor) —
  // the inline enhancement's recompute table. Switching rigor moves the tier with it.
  const byRigor = {} as RecomputePayload["byRigor"];
  for (const r of RIGORS) {
    const tier = profile.rigorDefaults[r].modelTier;
    const key = leverKey(r, tier, profile.rigorDefaults[r].toggles);
    const s = leverMatrix.states[key] ?? leverMatrix.current;
    byRigor[r] = { estimateCredits: s.estimateCredits, capCredits: s.capCredits, lowMinutes: s.time.lowMinutes, highMinutes: s.time.highMinutes, modelTier: tier };
  }

  return {
    workflow: args.workflow,
    title: {
      verbLabel: WORKFLOW_VERB_LABEL[args.workflow] ?? args.workflow,
      targetVersion: args.targetVersion,
      words: args.inputs.words ?? 0,
      ...(claims != null ? { claims } : {}),
    },
    rigor: args.rigor,
    rigorOptions: (["quick", "standard", "full_board"] as Rigor[]).map((r) => ({
      rigor: r,
      display: RIGOR_DISPLAY[r],
      selected: r === args.rigor,
    })),
    modelTier: args.modelTier,
    modelTierDisplay: MODEL_TIER_DISPLAY[args.modelTier],
    estimate: {
      estimateCredits: estimate.estimateCredits,
      capCredits: estimate.capCredits,
      rateTableVersion: estimate.rateTableVersion,
      provisional: estimate.provisional,
      dollarsLine: estimateLine(estimate.estimateCredits, estimate.capCredits),
      creditsLine: creditsLine(estimate.estimateCredits, estimate.capCredits, balanceAfterCap),
      time: leverMatrix.current.time,
    },
    consent,
    insufficient,
    toggleDeltas: leverMatrix.toggleDeltas,
    collapsedSummary: collapsedSummary(args.scope, args.modelTier),
    whyLine: whyLine(args, claims),
    ...(args.scopeLine ? { scopeLine: args.scopeLine } : {}),
    leverMatrix,
    idempotencyKey: args.idempotencyKey,
    recompute: {
      spendableCredits: args.spendableCredits,
      dontAskUnder: args.dontAskUnder ?? 0,
      entitlement: !!args.entitlement,
      byRigor,
    },
  };
}

export type { ToggleKey };
