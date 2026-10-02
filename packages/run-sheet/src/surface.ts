// EST.1 (ADR-034; REQ-SPEC-32(b), REQ-IDE-13, REQ-GROWTH-4/9) — the ONE estimator-facing API every
// pre-run figure reads: the run sheet, the protocol card, the Timeline chip + palette hint, the
// estimate route, the run card's initial ETA, and (through `surfacePricer` — injected into contracts'
// pricing page) every marketing figure. Nothing downstream may carry a second formula: this module
// composes `buildEstimate`'s internals (toggles → estimator inputs → `estimateCredits` → cap), the
// shared duration band (calibrated `cost_card_cells`, else the shared per-phase prior), the
// "Why this estimate?" decomposition, and the rigor/tier default resolution (ADR-035).
//
// FAIL CLOSED: a surface that cannot compute a figure renders "—"/null — never a remembered or
// hand-composed number (the 2026-09-30 incident's 10–20× drift came from exactly that).

import {
  clampModelTierTo,
  durationPriorForPhases,
  MODEL_TIER_DISPLAY,
  MODEL_TIERS,
  RIGOR_DISPLAY,
  RIGORS,
  type DurationBand,
  type Estimate,
  type EstimateWhy,
  type EstimateWhyTerm,
  type ModelTier,
  type Rigor,
  type SurfacePricer,
  type WorkflowKey,
} from "@rhema/contracts";
import {
  evalTermsDetailed,
  MODEL_TIER_MULTIPLIERS,
  rigorMultiplier,
  type EstimatorInputs,
  type EstimatorSpec,
  type EstimatorTerms,
} from "@rhema/protocols";
import { resolveEstimation, type BuildEstimateArgs } from "./estimate.js";
import { activePhaseCount, sheetProfile, type ToggleState } from "./profiles.js";

// ---------------------------------------------------------------------------------------------------------
// Duration bands (EST.1). The calibrated cells are keyed `${rigor}|${modelTier}` and come from
// `cost_card_cells` (p10_ms..p95_ms, gate waits excluded — migration 0050); the API loads the row for
// the workflow + the input's size band and hands the map in. Absent a cell ⇒ the shared per-phase
// prior (`contracts/durations.ts`) — the SAME band the run card's initial ETA falls back to.
// ---------------------------------------------------------------------------------------------------------

/** Calibrated duration cells, keyed `"<rigor>|<modelTier>"` (e.g. `"standard|balanced"`). */
export type DurationCells = Readonly<Record<string, DurationBand>>;

export function durationCellKey(rigor: Rigor, modelTier: ModelTier): string {
  return `${rigor}|${modelTier}`;
}

/** The duration band for a run shape: the calibrated cell if one covers the bucket, else the shared
 *  per-phase prior over the workflow's ACTIVE phase count (toggle-resolved). */
export function durationBandFor(args: {
  workflow: WorkflowKey;
  rigor: Rigor;
  modelTier: ModelTier;
  toggles?: ToggleState;
  durations?: DurationCells;
}): DurationBand {
  const cell = args.durations?.[durationCellKey(args.rigor, args.modelTier)];
  if (cell != null && cell.lowMinutes > 0 && cell.highMinutes >= cell.lowMinutes) return cell;
  const profile = sheetProfile(args.workflow);
  const toggles = { ...profile.rigorDefaults[args.rigor].toggles, ...(args.toggles ?? {}) };
  return durationPriorForPhases(activePhaseCount(args.workflow, toggles) ?? 1);
}

// ---------------------------------------------------------------------------------------------------------
// "Why this estimate?" — the additive decomposition of the SAME figure (terms → subtotal → factors →
// ceil). Σ terms = the pre-multiplier subtotal; Π factors × subtotal = the exact figure the estimate
// ceils to — the block's arithmetic is checkable against the printed total (the incident's
// "4 claims × 40 ≈ 440" shape is impossible here: each term's credits IS quantity × rate).
// ---------------------------------------------------------------------------------------------------------

/** Merge the evaluated terms of the primary form + the enabled addends into one labelled list
 *  (a rate that appears in both — e.g. `perClaim` — shows once at its effective rate). */
function decomposeTerms(resolved: {
  spec: EstimatorSpec;
  variant: string | undefined;
  enabledAddends: readonly string[] | undefined;
  inputs: EstimatorInputs;
}): { terms: EstimateWhyTerm[]; subtotalCredits: number } {
  const merged = new Map<keyof EstimatorTerms, number>();
  const primary = resolved.variant ? resolved.spec.variants?.[resolved.variant] : resolved.spec.base;
  if (!primary) return { terms: [], subtotalCredits: 0 };
  const forms: EstimatorTerms[] = [primary];
  for (const a of resolved.spec.addends ?? []) {
    const include =
      resolved.enabledAddends != null
        ? resolved.enabledAddends.includes(a.phase)
        : true; // no explicit set ⇒ all addends (estimateCredits' default)
    if (include) forms.push(a.terms);
  }
  for (const f of forms) {
    for (const [k, v] of Object.entries(f) as [keyof EstimatorTerms, number][]) {
      merged.set(k, (merged.get(k) ?? 0) + v);
    }
  }
  const mergedTerms: EstimatorTerms = { intercept: 0, ...Object.fromEntries(merged) };
  const terms: EstimateWhyTerm[] = evalTermsDetailed(mergedTerms, resolved.inputs).map((t) => ({
    label: t.inputKey == null ? "Fixed" : `${t.unit}`,
    quantity: t.quantity,
    ...(t.inputKey != null ? { unit: t.unit } : {}),
    rateCredits: t.rateCredits,
    credits: t.credits,
  }));
  return { terms, subtotalCredits: terms.reduce((s, t) => s + t.credits, 0) };
}

/** The multiplicative factors the estimate applies after the terms, in evaluation order. */
function whyFactors(spec: EstimatorSpec, workflow: string, tier: ModelTier, rigor: Rigor) {
  const factors: { label: string; multiplier: number }[] = [];
  const cal = spec.calibrationScale ?? 1;
  if (cal !== 1) factors.push({ label: "calibration", multiplier: cal });
  const cov = spec.meteredCoverage ?? 1;
  if (cov !== 1) factors.push({ label: "metered coverage", multiplier: cov });
  const tm = MODEL_TIER_MULTIPLIERS[tier];
  if (tm !== 1) factors.push({ label: MODEL_TIER_DISPLAY[tier], multiplier: tm });
  const rm = rigorMultiplier(workflow, rigor);
  if (rm !== 1) factors.push({ label: RIGOR_DISPLAY[rigor], multiplier: rm });
  return factors;
}

// ---------------------------------------------------------------------------------------------------------
// The surface estimate — everything a pre-run surface renders, one call.
// ---------------------------------------------------------------------------------------------------------

export interface SurfaceEstimateArgs extends BuildEstimateArgs {
  /** calibrated duration cells (see `DurationCells`) — absent ⇒ the shared per-phase prior. */
  readonly durations?: DurationCells;
}

export interface SurfaceEstimate extends Estimate {
  /** the duration band the surface renders (`~low–high min`). */
  readonly duration: DurationBand;
  /** the "Why this estimate?" decomposition of `estimateCredits` (Σ terms × Π factors ≈ total). */
  readonly why: EstimateWhy;
}

/**
 * The surface-estimator API (ADR-034). Every figure a pre-run surface shows comes through here —
 * `resolveEstimation` computes the estimate/cap exactly as `buildEstimate` always has; the duration
 * band and the why-block decompose the SAME call, so a surface can never drift from the sheet.
 */
export function surfaceEstimate(args: SurfaceEstimateArgs): SurfaceEstimate {
  const r = resolveEstimation(args);
  const { terms, subtotalCredits } = decomposeTerms(r);
  const factors = whyFactors(r.spec, args.workflow, args.modelTier, args.rigor);
  const exact = factors.reduce((v, f) => v * f.multiplier, subtotalCredits);
  return {
    ...r.estimate,
    duration: durationBandFor({
      workflow: args.workflow,
      rigor: args.rigor,
      modelTier: args.modelTier,
      toggles: args.toggles,
      durations: args.durations,
    }),
    why: {
      terms,
      subtotalCredits,
      factors,
      exactCredits: exact,
      totalCredits: r.estimate.estimateCredits,
    },
  };
}

/**
 * The low→high credits range for a shape — low = Base tier, high = Frontier (the marketing card's
 * convention). `null` when the shape cannot be priced (a surface renders "—").
 */
export function surfaceCreditRange(
  args: Omit<SurfaceEstimateArgs, "modelTier">,
): { low: number; high: number } | null {
  try {
    const low = surfaceEstimate({ ...args, modelTier: "base" }).estimateCredits;
    const high = surfaceEstimate({ ...args, modelTier: "frontier" }).estimateCredits;
    return { low, high };
  } catch {
    return null;
  }
}

/**
 * The contracts-facing pricer the marketing pages consume (`buildPricingPageData(claims, price)`).
 * Fails closed: an unpriceable shape returns `null` (the page renders "—"), it never throws and
 * never invents a figure.
 */
export function surfacePricer(): SurfacePricer {
  const est = (a: Parameters<SurfacePricer["estimate"]>[0]): number | null => {
    try {
      return surfaceEstimate({
        workflow: a.workflow as WorkflowKey,
        rigor: a.rigor,
        modelTier: a.modelTier,
        inputs: { ...(a.inputs as EstimatorInputs) },
        ...(a.toggles != null ? { toggles: a.toggles as ToggleState } : {}),
        ...(a.variant != null ? { variant: a.variant } : {}),
      }).estimateCredits;
    } catch {
      return null;
    }
  };
  return {
    estimate: est,
    // A verified claim's marginal cost: Review — the fact-check premium per claim over a
    // representative shape; Fact-check — the marginal claim on the stand-alone run.
    perVerifiedClaim: (workflow, tier) => {
      try {
        if (workflow === "review") {
          const w = 5000;
          const c = 20;
          const on = est({
            workflow: "review",
            rigor: "standard",
            modelTier: tier,
            inputs: { words: w, claims: c },
          });
          const off = est({
            workflow: "review",
            rigor: "standard",
            modelTier: tier,
            inputs: { words: w, claims: c },
            toggles: { fact_check: false },
          });
          return on != null && off != null ? (on - off) / c : null;
        }
        const a = est({ workflow: "fact_check", rigor: "standard", modelTier: tier, inputs: { claims: 9 } });
        const b = est({ workflow: "fact_check", rigor: "standard", modelTier: tier, inputs: { claims: 8 } });
        return a != null && b != null ? a - b : null;
      } catch {
        return null;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------------------
// Rigor/tier default resolution (ADR-035). Order: explicit → project → account → the rigor notch's
// §6.5 model-tier column — then clamped to the plan's permitted tiers. The notch column remains the
// "no default configured" floor; a stored default NEVER makes tier silently follow rigor again
// (BL-58: the user picks within plan rules, the choice freezes onto the run).
// ---------------------------------------------------------------------------------------------------------

export type ResolutionSource = "explicit" | "project" | "account" | "notch" | "default";

export interface SheetConfigResolution {
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  /** where the resolved rigor came from (explicit request → project default → account pref → "standard"). */
  readonly rigorSource: ResolutionSource;
  /** where the resolved tier came from — `"notch"` = the rigor's §6.5 column; when the plan clamp
   *  rewrote the tier, `tierSource` is where the REQUESTED value came from and `requestedModelTier`
   *  records it (the sheet's "Your plan includes Base only — priced on Base" notice reads it). */
  readonly tierSource: ResolutionSource;
  readonly requestedModelTier?: ModelTier;
  readonly allowedModelTiers: readonly ModelTier[];
}

const isRigor = (v: string | null | undefined): v is Rigor =>
  v != null && (RIGORS as readonly string[]).includes(v);
const isModelTier = (v: string | null | undefined): v is ModelTier =>
  v != null && (MODEL_TIERS as readonly string[]).includes(v);

export function resolveSheetConfig(args: {
  workflow: WorkflowKey;
  /** the explicit choice — `?tier=`/`?rigor=` on the sheet URL, or the form's posted values. */
  rigor?: string | null;
  modelTier?: string | null;
  /** the project's stored defaults (projects.rigor_default / model_tier_default). */
  projectRigorDefault?: string | null;
  projectModelTierDefault?: string | null;
  /** the account's prefs (`defaultRigor` / `rigorByWorkflow` / `defaultModelTier`). */
  prefs?: {
    defaultRigor?: Rigor;
    rigorByWorkflow?: Partial<Record<string, Rigor>>;
    defaultModelTier?: ModelTier;
  } | null;
  /** the plan's permitted tiers (default: all — the unconstrained internal case). */
  allowedModelTiers?: readonly ModelTier[];
}): SheetConfigResolution {
  const allowed = args.allowedModelTiers ?? MODEL_TIERS;

  const rigor: Rigor = isRigor(args.rigor)
    ? args.rigor
    : isRigor(args.projectRigorDefault)
      ? args.projectRigorDefault
      : args.prefs?.rigorByWorkflow?.[args.workflow] != null
        ? args.prefs.rigorByWorkflow[args.workflow]!
        : args.prefs?.defaultRigor ?? "standard";
  const rigorSource: ResolutionSource = isRigor(args.rigor)
    ? "explicit"
    : isRigor(args.projectRigorDefault)
      ? "project"
      : args.prefs?.rigorByWorkflow?.[args.workflow] != null || args.prefs?.defaultRigor != null
        ? "account"
        : "default";

  const requested: ModelTier = isModelTier(args.modelTier)
    ? args.modelTier
    : isModelTier(args.projectModelTierDefault)
      ? args.projectModelTierDefault
      : isModelTier(args.prefs?.defaultModelTier)
        ? args.prefs.defaultModelTier
        : sheetProfile(args.workflow).rigorDefaults[rigor].modelTier;
  const tierSource: ResolutionSource = isModelTier(args.modelTier)
    ? "explicit"
    : isModelTier(args.projectModelTierDefault)
      ? "project"
      : isModelTier(args.prefs?.defaultModelTier)
        ? "account"
        : "notch";

  const clamped = clampModelTierTo(requested, allowed);
  return {
    rigor,
    modelTier: clamped,
    rigorSource,
    tierSource,
    ...(clamped !== requested ? { requestedModelTier: requested } : {}),
    allowedModelTiers: allowed,
  };
}
