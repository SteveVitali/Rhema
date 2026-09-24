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
  /**
   * P1.11 — per-SOURCE credits (`research_burst`'s §12.2 `5·sources` term): the fetch + card write per
   * planned source inside the burst's source budget.
   */
  perSource?: number;
  /**
   * P1.11 — per-FETCHED-TOKEN credits (the `0.002·fetched_tokens` term): content the metered egress
   * path pages into context, bounded by the proxy's per-run fetch budget + `max_content_tokens`.
   */
  perFetchedToken?: number;
  /**
   * P1.12 — per-THREAD-TOKEN credits (the Outline row's `0.004·thread_tokens` term): the promoted
   * thread the harvest phase reads + classifies.
   */
  perThreadToken?: number;
  /**
   * P1.12 — per-URL-REFETCHED credits (the Outline row's `6·urls_refetched` term): the re-fetch of
   * exactly the thread's URL set through the metered path.
   */
  perUrlRefetched?: number;
  /**
   * PRB.23 — per-ACTIVE-PHASE fixed overhead (`inputs.phases`): the context-churn floor the
   * proxy meters but the parametric form never modeled — every Messages request re-reads the
   * fixed request envelope (tool schemas + skill corpus + roster ≈ 30K tokens; ~16K after the
   * `tools` restriction) PLUS the session's accumulated transcript. Measured on prod run
   * `01M35Q8M…`: 34 requests × ~151K-token avg context = 5.14M cache-read tokens ≈ ~144
   * platform credits of pure churn on a run that died mid-flight. Multiply by the number of
   * phase sessions the run executes.
   */
  perPhase?: number;
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
  /**
   * PRB.25 — the metered-vs-committed coverage multiplier. The cap is enforced on
   * PROXY-metered burn (the meter of record), while the committed-debit channel
   * (`sdk_stream` step rollups) under-reports the research loop: the PRB.24 fan-out's
   * subagent sessions' token usage (+277K cache-write in one verification phase) and the
   * web-search request fees never reach the committed rollup — prod run `01M36663…`
   * committed 586 but metered 720, and `01M364236…` died `cap_reached` at exactly its
   * 783 derived cap. Absent ⇒ 1 (no uplift — e.g. specs already calibrated to
   * proxy-metered figures, like `profile_voice`'s PRB.16b quick variant). After a fold,
   * `calibrationScale` absorbs any residual error (`predicted` already includes this
   * multiplier), so the field composes cleanly with instrumented anchors.
   */
  meteredCoverage?: number;
  /** measured phase-aware cache economics (review 13 F8), recorded when instrumented. */
  cacheEconomics?: CacheEconomics;
}

export const MODEL_TIER_MULTIPLIERS: Record<ModelTier, number> = { base: 1, balanced: 2.2, frontier: 4.5 };

// §6.1 rigor multipliers relative to Standard (PROVISIONAL — replaced by the instrumented runs of §16.3 #1). Only the
// ported workflows are given values the spec states: Review Quick 0.6× / Full board 1.2×; Revise Quick 0.55× / Full
// board 1.25×; Draft Quick 0.5× / Full board 1.3× (P1.10 lands the port). Profile voice has no rigor
// multiplier — Quick Voice is its OWN estimator variant (§9.2), not a Standard-relative scale. Unlisted → 1.0.
export const RIGOR_MULTIPLIERS: Record<string, Partial<Record<Rigor, number>>> = {
  review: { quick: 0.6, standard: 1, full_board: 1.2 },
  revise: { quick: 0.55, standard: 1, full_board: 1.25 },
  draft: { quick: 0.5, standard: 1, full_board: 1.3 },
};
/** True until the §6.1 rigor multipliers are replaced by measured values (§16.3 #1). */
export const RIGOR_MULTIPLIERS_PROVISIONAL = true;

/** The rigor multiplier for a workflow (Standard = 1.0; unlisted rigor/workflow → 1.0). */
export function rigorMultiplier(workflow: string, rigor: Rigor): number {
  return RIGOR_MULTIPLIERS[workflow]?.[rigor] ?? 1;
}

// PRB.22 — the verification/discourse phases do REAL web research per claim (Anthropic server web_search /
// web_fetch), and that burn was UNMODELED: five live `review` runs died `cap_reached` on 2026-09-22 because
// metered spend outran every `ceil(1.5×estimate)` cap (D-PRB.21-1). The research channel is now BOUNDED at the
// egress proxy (per-run fetch/search budgets + `max_content_tokens` page truncation — see `authorWebToolPolicy`
// in @rhema/orchestrator and `WebToolPolicy` in apps/egress-proxy), and these constants price the BOUNDED
// residual: a fetched page is truncated to ≤8k tokens, held in context ~10 subsequent turns ≈ $0.036 list ≈
// ~5 credits per fetch (Sonnet-rate). `RESEARCH_PER_CLAIM` ≈ 3 fetches + 1 search per claim (~16 cr);
// `RESEARCH_FLOOR` ≈ ~10 baseline fetches + ~7 searches a verification phase does regardless of count (~60 cr).
export const RESEARCH_PER_CLAIM_CREDITS = 16 as const;
export const RESEARCH_FLOOR_CREDITS = 60 as const;

// PRB.23/PRB.24 — the context-churn floor. The proxy bills every request's FULL context each turn
// (cache-read at 0.1× input). First measured: run `01M35Q8M…` (quick/base, 701-word doc, ZERO
// research calls) metered 34 requests × ~151K-token avg context ≈ 5.14M cache-read tokens ≈
// ~144 platform credits — and died at cap without finishing. PRB.24's measured calibration (run
// `01M35Y9BH…`, review/quick, same 701-word draft): intake committed 96cr, craft committed 63cr —
// the flat per-PHASE churn term is therefore set at the LOW end of the measured ordinary-phase
// band (~100–140): the term multiplies EVERY active phase, so mid-band would compound over-price
// the judge/generate phases. Provisional like every constant here — the first instrumented run
// that delivers recalibrates it via `foldInstrumentedRun`.
export const CONTEXT_CHURN_PER_PHASE_CREDITS = 100 as const;

// PRB.24 — the RESEARCH-LOOP churn premium. Ordinary phases churn ~100cr; a research-class phase
// (verification, discourse) ran its whole per-claim loop inside ONE session context, so every
// request resent an unboundedly growing transcript on top of the envelope: run `01M35Y9BH…`
// metered ~40 verification requests averaging ~60K cache-read tokens each ≈ 2.4M tokens ≈ 347cr
// of UNCOMMITTED burn in that one phase — minus its ~100cr perPhase share and ~60cr research
// floor + ~48cr per-claim fetch/search, the TRANSCRIPT-ACCUMULATION residual is ~140cr. Folded
// into the `verification`/`discourse` addend intercepts and the `fact_check` base (whose 2-phase
// workflow IS intake + verification). The PRB.24 bound (bounded-batch researcher fan-out +
// `autoCompactWindow`) attacks exactly this term; `foldInstrumentedRun` re-derives it from the
// first post-bound delivered run.
export const RESEARCH_LOOP_CHURN_CREDITS = 140 as const;

// PRB.25 — the metered-vs-committed coverage multiplier. The cap accountant (the egress
// proxy, meter of record) bills burn the committed-debit channel never sees: subagent-session
// token usage from the research fan-out and web-search request fees escape the `sdk_stream`
// step rollup. Measured on prod run `01M36663…` (delivered review/quick): committed 586 vs
// metered 720 → whole-run ratio 1.23; non-research phases reconcile to ±1 while verification
// ran +112 (and +196 on `01M364236…`'s less-fanned-out loop). `METERED_VS_COMMITTED_COVERAGE`
// = 1.25 — the measured ratio plus headroom. `RESEARCH_WORKFLOW_METERED_COVERAGE` = 1.5 for
// `fact_check`, whose whole shape IS the research loop (intake + verification): measured
// verification-phase ratios were 345/233 = 1.48 and 419/223 = 1.88. Provisional like every
// constant here — `foldInstrumentedRun` re-derives the residual post-Stage-B.
export const METERED_VS_COMMITTED_COVERAGE = 1.25 as const;
export const RESEARCH_WORKFLOW_METERED_COVERAGE = 1.5 as const;

export const ESTIMATORS: Record<string, EstimatorSpec> = {
  review: {
    workflow: "review",
    base: { intercept: 40, perWord: 0.012, perClaim: 24, perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS },
    addends: [
      // The verification phase's web-research burn (PRB.22) PLUS the research-loop transcript
      // churn (PRB.24 — verification metered ~347cr in run `01M35Y9BH…`; priced here ≈ 100 perPhase
      // share + 200 intercept + 16/claim ≈ 350 at ~3 claims). Bound to the `fact_check` sheet toggle —
      // when verification is toggled off, no claim research runs and no research is priced.
      { phase: "verification", terms: { intercept: RESEARCH_FLOOR_CREDITS + RESEARCH_LOOP_CHURN_CREDITS, perClaim: RESEARCH_PER_CLAIM_CREDITS } },
      // PRB.24 — discourse runs the SAME unbounded research-loop shape (per-topic search/fetch in
      // one session); the loop-churn premium is folded in pending its own instrumented run.
      { phase: "discourse", terms: { intercept: 90 + RESEARCH_LOOP_CHURN_CREDITS, perWord: 0.006 } },
      { phase: "second_read", terms: { intercept: 0, perWord: 0.005 } },
    ],
    costPerVerifiedClaimBase: 24 + RESEARCH_PER_CLAIM_CREDITS,
    // PRB.25 — the cap meters proxy burn; the committed channel under-reports the research
    // loop (subagent sessions + search fees). Measured 720/586 ≈ 1.23 → 1.25.
    meteredCoverage: METERED_VS_COMMITTED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  revise: {
    workflow: "revise",
    // Same SDK-session churn physics as review (7 manifest phases, per-phase transcripts resent
    // every turn) — the constant is measured on review, applied here pending a revise
    // instrumented run (provisional like everything else).
    base: { intercept: 50, perWord: 0.03, perFinding: 4, perMoveWithResearch: 20, perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS },
    // PRB.25 — same metered-vs-committed mechanism wherever research runs
    // (`perMoveWithResearch`); derived-by-similarity pending a revise instrumented run.
    meteredCoverage: METERED_VS_COMMITTED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  fact_check: {
    workflow: "fact_check",
    // Fact-check IS the verification phase — the same bounded research constants fold into its base
    // (PRB.22: the floor is the claim-independent research the phase does; perClaim adds the per-claim
    // fetch/search cost on top of the 11-cr verification work). PRB.23: its 2-phase session churns
    // the same way — the only "completed" comparable run metered 41 reqs / 5.8M cache-read / ~430cr.
    // PRB.24: the research-loop transcript churn folds in too — fact_check's whole workflow IS
    // intake + verification.
    base: {
      intercept: 20 + RESEARCH_FLOOR_CREDITS + RESEARCH_LOOP_CHURN_CREDITS,
      perClaim: 11 + RESEARCH_PER_CLAIM_CREDITS,
      perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS,
    },
    costPerVerifiedClaimBase: 11 + RESEARCH_PER_CLAIM_CREDITS,
    // PRB.25 — fact_check's whole shape IS intake + verification, where the delta
    // concentrates: measured verification-phase metered/committed ratios 1.48 / 1.88.
    meteredCoverage: RESEARCH_WORKFLOW_METERED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  profile_voice: {
    workflow: "profile_voice",
    variants: {
      // Quick Voice tier. PRB.16b recalibration (modeled → first live measurement): the 0.012/word
      // modeled figure under-priced the build ~5× — the census phase ALONE metered 123–146 proxy
      // credits against a 5,380-word corpus on prod runs 01M2T2BG…/01M2T3P3… (≈0.025/word for ~20%
      // of the 4-phase run) and both runs died `cap_reached` at cap 158. 0.09/word sizes the estimate
      // to the measured burn rate of the whole run; the 1.5× cap multiplier still rides on top.
      quick: { intercept: 40, perWord: 0.09 },
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
  draft: {
    workflow: "draft",
    // §12.2 Draft row: `a + b·target_words + c·inherited_claims` (a≈60, b≈0.05, c≈11) at Base/Standard.
    // PRB.23's per-phase churn term applies on top — the same session physics as the other ported skills.
    base: { intercept: 60, perWord: 0.05, perClaim: 11, perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS },
    variants: {
      // §7.6 / REQ-CHAT-30 — the trial first-section preview ("Draft the first section, ≈60 cr"):
      // intake → plan → one drafted section → delivery, no grounding churn, no audit. The intercept is
      // pre-coverage: 48 × 1.25 metered-coverage lands at the spec'd ≈60-cr preview price (Base/Standard).
      preview: { intercept: 48 },
    },
    addends: [
      // Grounding (Phase 3) is a research-class phase: the bounded web-research burn (PRB.22) PLUS the
      // research-loop transcript churn (PRB.24 `RESEARCH_LOOP_CHURN_CREDITS` — §12.2 says it applies to
      // Draft's grounding). Toggled off at Quick rigor (or the sheet's grounding toggle) ⇒ not priced.
      {
        phase: "grounding",
        terms: { intercept: RESEARCH_FLOOR_CREDITS + RESEARCH_LOOP_CHURN_CREDITS, perClaim: RESEARCH_PER_CLAIM_CREDITS },
      },
    ],
    costPerVerifiedClaimBase: 11 + RESEARCH_PER_CLAIM_CREDITS,
    // PRB.25 — grounding runs the same subagent fan-out + web-search fees the committed channel under-reports.
    meteredCoverage: METERED_VS_COMMITTED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  // ---- P1.11 — the Assistant seat's Rhema-owned workflows (§6.2 Research row; §7.1) ----
  research_burst: {
    workflow: "research_burst",
    // §12.2 Research row, verbatim: `15 + 5·sources + 0.002·fetched_tokens` (Base/Standard). The burst
    // is a research-loop shape — the same metered-vs-committed coverage the other research workflows
    // carry (PRB.25); `foldInstrumentedRun` re-derives the residual post-Stage-B.
    base: { intercept: 15, perSource: 5, perFetchedToken: 0.002, perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS },
    meteredCoverage: RESEARCH_WORKFLOW_METERED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  chat_turn: {
    workflow: "chat_turn",
    // §7.1: one bounded turn — a flat modeled intercept + the fetched-content term. The §7.1 per-turn
    // budgets (≤40 cr / ≤5 searches / ≤10 fetches, enforced on metered rows) are the real ceiling; the
    // estimate only sizes the run row's cap, which the plan card never exceeds.
    base: { intercept: 12, perFetchedToken: 0.002 },
    meteredCoverage: METERED_VS_COMMITTED_COVERAGE,
    provisional: true,
    source: "modeled",
    version: "modeled-1",
  },
  // ---- P1.12 — the Outline promotion run (§7.3; §12.2 Outline row) ----
  outline: {
    workflow: "outline",
    // §12.2 Outline row, verbatim: `20 + 0.004·thread_tokens + 6·urls_refetched` (Base/Standard).
    // The re-fetch leg is the same metered-egress shape research_burst prices (PRB.25 coverage), so
    // the workflow carries the research coverage multiplier pending its instrumented run.
    base: { intercept: 20, perThreadToken: 0.004, perUrlRefetched: 6, perPhase: CONTEXT_CHURN_PER_PHASE_CREDITS },
    meteredCoverage: RESEARCH_WORKFLOW_METERED_COVERAGE,
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
  /** P1.11 — the planned source count N (research_burst's `5·sources` term; the plan card's lever). */
  sources?: number;
  /** P1.11 — tokens the metered fetches page into context (the `0.002·fetched_tokens` term). */
  fetchedTokens?: number;
  /** P1.12 — tokens in the promoted thread (the `0.004·thread_tokens` term). */
  threadTokens?: number;
  /** P1.12 — URLs the outline run re-fetches (the `6·urls_refetched` term; exactly the thread's set). */
  urlsRefetched?: number;
  /** PRB.23 — the count of ACTIVE manifest phases under the resolved toggle set (computed by the
   *  sheet from the manifest's opt-out flags — the same phases the pod executes). Feeds the
   *  `perPhase` fixed-overhead term; absent ⇒ that term contributes 0. */
  phases?: number;
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
    (t.perHoldout ?? 0) * (inp.holdouts ?? 0) +
    (t.perSource ?? 0) * (inp.sources ?? 0) +
    (t.perFetchedToken ?? 0) * (inp.fetchedTokens ?? 0) +
    (t.perThreadToken ?? 0) * (inp.threadTokens ?? 0) +
    (t.perUrlRefetched ?? 0) * (inp.urlsRefetched ?? 0) +
    (t.perPhase ?? 0) * (inp.phases ?? 0)
  );
}

/**
 * Compute an estimate in credits (§12.2). Evaluates the base (or a named variant) parametric form over `inputs`, adds
 * the per-phase addend terms (unless `includeAddends: false`), then applies the calibration scale, the
 * metered-vs-committed coverage (PRB.25 — the estimate predicts the proxy-metered platform cost the cap
 * is enforced on, matching `InstrumentedMeasurement.measuredCredits`), the model-tier multiplier and the
 * §6.1 rigor multiplier, rounding UP once (the sheet's estimate line; the cap is sized from it).
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
  const scaled = base * (spec.calibrationScale ?? 1) * (spec.meteredCoverage ?? 1);
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
