import type { ModelTier, Rigor, WorkflowKey } from "@rhema/contracts";

// Estimator constants as versioned data (§12.2 shapes). Credits are stated at **Base tier, Standard rigor**; the
// model-tier multipliers 1× / 2.2× / 4.5× (`MODEL_TIER_MULTIPLIERS`) and the §6.1 rigor multipliers
// (`RIGOR_MULTIPLIERS`) apply on top, and the estimator is phase-aware (a cache write per phase, review 13 F8) — the
// phase weighting lives in each manifest's `budgetShare`.
//
// **Provisional vs instrumented (§16.3 #1 / P0.15).** Every figure here is a MODELED output of research/10's
// parametric model, calibrated to one operator data point; it is `provisional` until **one instrumented, proxy-metered
// run per workflow** replaces it (§16.3 #1, the Phase-0 exit / price-card precondition). `foldInstrumentedRun` folds a
// measured run into a spec — flipping `provisional → false`, `source → "instrumented"`, bumping `version`, and
// recording the run behind it and a `calibrationScale` so `estimateCredits` matches the measured anchor. Until a real
// proxy-metered run exists (a live GCP + Anthropic run, deferred on H0), the shipped specs below stay `provisional`.

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

/** The per-phase cache economics (review 13 F8): the phase split writes a fresh cache per phase, so the 75% cache-read
 *  assumption of single-session runs does not carry over. Recorded as measured data by `foldInstrumentedRun`. */
export interface CacheEconomics {
  /** measured cache-write credits amortized per phase (the F8 correction). */
  readonly cacheWritePerPhase: number;
  /** measured fraction of input tokens served from cache within a phase (0–1). */
  readonly cacheReadFraction: number;
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
  /** true while the figures are MODELED; flipped to false once an instrumented run replaces them (§16.3 #1). */
  provisional: boolean;
  /** provenance of the current figures. */
  source: "modeled" | "instrumented";
  /** the estimator-data version (bumped when an instrumented run folds in). */
  version: string;
  /** when the instrumented run(s) behind these figures were metered (source === "instrumented"). */
  measuredAt?: string;
  /** the run ids of the instrumented, proxy-metered runs folded into these figures (§16.3 #1). */
  runsBehind?: readonly string[];
  /** a multiplier applied on top of the modeled shape to match the measured anchor (1 while purely modeled). */
  calibrationScale?: number;
  /** measured phase-aware cache economics (review 13 F8), recorded when instrumented. */
  cacheEconomics?: CacheEconomics;
}

export const MODEL_TIER_MULTIPLIERS: Record<ModelTier, number> = { base: 1, balanced: 2.2, frontier: 4.5 };

// §6.1 rigor multipliers relative to Standard (PROVISIONAL — replaced by the instrumented runs of §16.3 #1). Only the
// ported workflows are given values the spec states: Review Quick 0.6× / Full board 1.2×; Revise Quick 0.55× / Full
// board 1.25×. Draft's multipliers (0.5× / 1.3×) are spec'd but its port defers (§17). Profile voice has no rigor
// multiplier — Quick Voice is its OWN estimator variant (§9.2), not a Standard-relative scale. Unlisted → 1.0.
export const RIGOR_MULTIPLIERS: Record<string, Partial<Record<Rigor, number>>> = {
  review: { quick: 0.6, standard: 1, full_board: 1.2 },
  revise: { quick: 0.55, standard: 1, full_board: 1.25 },
};
/** True until the §6.1 rigor multipliers are replaced by measured values (§16.3 #1). */
export const RIGOR_MULTIPLIERS_PROVISIONAL = true;

/** The rigor multiplier for a workflow (Standard = 1.0; unlisted rigor/workflow → 1.0). */
export function rigorMultiplier(workflow: string, rigor: Rigor): number {
  return RIGOR_MULTIPLIERS[workflow]?.[rigor] ?? 1;
}

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
    source: "modeled",
    version: "modeled-1",
  },
  revise: {
    workflow: "revise",
    base: { intercept: 50, perWord: 0.03, perFinding: 4, perMoveWithResearch: 20 },
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  fact_check: {
    workflow: "fact_check",
    base: { intercept: 20, perClaim: 11 },
    costPerVerifiedClaimBase: 11,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
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
    source: "modeled",
    version: "modeled-1",
  },
  refresh_voice: {
    workflow: "refresh_voice",
    // Refresh costs only the delta (REQ-WF-11): the Full-Profile shape over the changed pieces only.
    variants: { full: { intercept: 120, perWordRead: 0.009, perPieceRead: 40, perHoldout: 90 } },
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  calibrate_voice: {
    workflow: "calibrate_voice",
    base: { intercept: 90, perHoldout: 90 },
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
};

/** The parametric inputs an estimate reads (§12.2). All optional — a term absent from a spec ignores its input. */
export interface EstimatorInputs {
  words?: number;
  claims?: number;
  findings?: number;
  movesWithResearch?: number;
  wordsRead?: number;
  piecesRead?: number;
  holdouts?: number;
}

export interface EstimateOptions {
  readonly tier: ModelTier;
  readonly rigor: Rigor;
  /** select a named variant (e.g. "quick" / "full" for profile_voice) instead of `base`. */
  readonly variant?: string;
  /** include the per-phase addend terms (default true); Quick review runs pass false (discourse/second read off). */
  readonly includeAddends?: boolean;
  /**
   * When set, include ONLY the named addend phases (an Advanced per-phase toggle set — REQ-BILL-5). Overrides
   * `includeAddends`; an addend whose phase is absent is excluded. This is how the run sheet computes a signed
   * delta for one phase toggle (e.g. discourse off) from the SAME estimator rather than a second formula.
   */
  readonly enabledAddends?: readonly string[];
}

function evalTerms(t: EstimatorTerms, inp: EstimatorInputs): number {
  return (
    t.intercept +
    (t.perWord ?? 0) * (inp.words ?? 0) +
    (t.perClaim ?? 0) * (inp.claims ?? 0) +
    (t.perFinding ?? 0) * (inp.findings ?? 0) +
    (t.perMoveWithResearch ?? 0) * (inp.movesWithResearch ?? 0) +
    (t.perWordRead ?? 0) * (inp.wordsRead ?? 0) +
    (t.perPieceRead ?? 0) * (inp.piecesRead ?? 0) +
    (t.perHoldout ?? 0) * (inp.holdouts ?? 0)
  );
}

/**
 * Compute an estimate in credits (§12.2). Evaluates the base (or a named variant) parametric form over `inputs`, adds
 * the per-phase addend terms (unless `includeAddends: false`), then applies the calibration scale, the model-tier
 * multiplier and the §6.1 rigor multiplier, rounding UP once (the sheet's estimate line; the cap is sized from it).
 * This is the single consumer of the versioned estimator data — the same function the run sheet and cap sizing use.
 */
export function estimateCredits(spec: EstimatorSpec, inputs: EstimatorInputs, opts: EstimateOptions): number {
  const primary = opts.variant ? spec.variants?.[opts.variant] : spec.base;
  if (!primary) {
    throw new Error(
      `estimateCredits: ${spec.workflow} has no ${opts.variant ? `variant "${opts.variant}"` : "base"} form`,
    );
  }
  let base = evalTerms(primary, inputs);
  if (spec.addends) {
    const enabled = opts.enabledAddends;
    for (const a of spec.addends) {
      const include = enabled ? enabled.includes(a.phase) : opts.includeAddends !== false;
      if (include) base += evalTerms(a.terms, inputs);
    }
  }
  const scaled = base * (spec.calibrationScale ?? 1);
  return Math.ceil(scaled * MODEL_TIER_MULTIPLIERS[opts.tier] * rigorMultiplier(spec.workflow, opts.rigor));
}

/** A single instrumented, proxy-metered run's measured cost, for folding into the estimator (§16.3 #1). */
export interface InstrumentedMeasurement {
  /** the proxy-metered run id (the meter of record — §12.7). */
  readonly runId: string;
  readonly tier: ModelTier;
  readonly rigor: Rigor;
  readonly variant?: string;
  readonly inputs: EstimatorInputs;
  /** the run's measured platform credits (proxy-metered × 1.4, per §14.1). */
  readonly measuredCredits: number;
  /** when the run was metered (ISO or Date). */
  readonly measuredAt: Date | string;
  /** measured phase-aware cache economics for the run (review 13 F8), if captured. */
  readonly cacheEconomics?: CacheEconomics;
}

/**
 * Fold an instrumented run into an estimator spec (§16.3 #1). Single-point calibration: scale the modeled shape so
 * `estimateCredits` reproduces the measured credits at the run's inputs/tier/rigor, then mark the spec instrumented
 * (`provisional: false`), bump the version, and record the run behind it. Additional runs compose (each further scales
 * toward its measured anchor). Pure — returns a NEW spec; the caller persists the versioned data.
 */
export function foldInstrumentedRun(spec: EstimatorSpec, m: InstrumentedMeasurement): EstimatorSpec {
  const predicted = estimateCredits(spec, m.inputs, { tier: m.tier, rigor: m.rigor, variant: m.variant });
  const measuredAt = typeof m.measuredAt === "string" ? m.measuredAt : m.measuredAt.toISOString();
  // predicted already includes the current calibrationScale; newTotalScale = current × (measured / predicted) so the
  // model reproduces the measured anchor exactly.
  const currentScale = spec.calibrationScale ?? 1;
  const calibrationScale = predicted > 0 ? currentScale * (m.measuredCredits / predicted) : currentScale;
  return {
    ...spec,
    provisional: false,
    source: "instrumented",
    version: `instrumented@${measuredAt.slice(0, 10)}`,
    measuredAt,
    runsBehind: [...(spec.runsBehind ?? []), m.runId],
    calibrationScale,
    cacheEconomics: m.cacheEconomics ?? spec.cacheEconomics,
  };
}

// --- Instrumented-fold registry (§16.3 #1 live call-site — P0.15k) ---------------------------------------
// `foldInstrumentedRun` is PURE (it returns a new spec and never touches `ESTIMATORS`), so on its own it can
// never flip `estimatorsAreProvisional()` — nothing reads its result. That is the missing call-site the live
// exit needs: for AC2 / the price-card precondition (§16.4), a live instrumented run must make
// `estimatorsAreProvisional()` false. This registry is where a folded spec is RECORDED so the provisional
// check (and any estimate consumer via `estimatorSpec`) reflects it: a process-local, override-first,
// test-resettable map. It is the in-process reflection the live-exit driver asserts against; the DURABLE
// persistence — writing the measured constants into the shipped estimator source / a price-card table — is the
// follow-up the operator lands from the driver's emitted folds (ADR-005).
const INSTRUMENTED_OVERRIDES = new Map<string, EstimatorSpec>();

/** The current spec for a workflow: the recorded instrumented override if one exists, else the shipped modeled base. */
export function estimatorSpec(workflow: string): EstimatorSpec | undefined {
  return INSTRUMENTED_OVERRIDES.get(workflow) ?? ESTIMATORS[workflow];
}

/**
 * Fold an instrumented measurement into the workflow's CURRENT spec (an existing override if present, else the
 * shipped modeled base) and RECORD the result so `estimatorSpec`/`estimatorsAreProvisional` reflect it (§16.3 #1).
 * Returns the folded spec — the caller also EMITS it so the measured constants can be persisted durably. Composes:
 * a second call for the same workflow folds toward its own measured anchor on top of the first.
 */
export function recordInstrumentedFold(workflow: string, m: InstrumentedMeasurement): EstimatorSpec {
  const current = estimatorSpec(workflow);
  if (!current) throw new Error(`recordInstrumentedFold: unknown workflow "${workflow}"`);
  const folded = foldInstrumentedRun(current, m);
  INSTRUMENTED_OVERRIDES.set(workflow, folded);
  return folded;
}

/** Clear all recorded instrumented overrides (a fresh driver process; test isolation). */
export function resetInstrumentedOverrides(): void {
  INSTRUMENTED_OVERRIDES.clear();
}

/** Are the ported-workflow estimator figures still provisional? (the price card / marketing precondition — §16.4).
 *  Reads the recorded instrumented override first (so a folded live run flips this to false), else the shipped base. */
export function estimatorsAreProvisional(workflows: readonly string[] = ["review", "revise", "fact_check", "profile_voice"]): boolean {
  return workflows.some((w) => estimatorSpec(w)?.provisional !== false);
}
