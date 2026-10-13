// ECON.2 (ADR-087; REQ-SPEC-32(c)) — the pre-registered OFFLINE accounting pass. Mandatory before
// any paid Stage-B leg, and itself a $0 leg: it reads nothing live and calls no provider. It
// computes the modeled delta each lever arm would produce on the committed 6,000-word fixture at
// the protocol's canonical arm (Standard rigor, Base tier), using only:
//   · the lever constants in @rhema/contracts (cogs-levers.ts);
//   · the real authored webTools policy (@rhema/orchestrator's authorWebToolPolicy);
//   · Anthropic LIST prices (provider-side COGS — the proxy rate table in @rhema/contracts is the
//     meter-of-record for billing; list price is what the provider actually charges);
//   · the PRB.23/PRB.24 live measurements (fixed request envelope, subagent seed, verification
//     request cadence) cited where each is used.
// Every figure is emitted as a range with its assumption named — the point is a sanity ceiling on
// what the paid arms could possibly save, so a measurement that "beats" the model by an order of
// magnitude reads as a metering error, not a win. The verdict line states plainly whether the
// modeled deltas can reach the REQ-SPEC-8 restore target (~$6 p90 list COGS at 6,000 words).

import {
  COGS_FANOUT_BASELINE,
  COGS_FANOUT_TUNED,
  COGS_L5_FETCH_MAX_CONTENT_TOKENS,
  COGS_PHASE_COMPACT_WINDOWS,
  DEFAULT_COGS_LEVERS,
  type CogsLevers,
} from "@rhema/contracts";
import {
  authorWebToolPolicy,
  FETCH_MAX_CONTENT_TOKENS,
  RESEARCH_SEARCH_BASE,
  RESEARCH_FETCH_MIN,
} from "@rhema/orchestrator";

// ---- modeled constants (each cites its measurement) ------------------------------------------------

/**
 * PRB.22/ECON.1's provisional density — the estimator's claim count for a review fixture
 * (`CLAIMS_PER_WORD.review` in @rhema/run-sheet; duplicated here as a constant rather than a new
 * package edge, the accounting is illustrative not billing).
 */
const CLAIMS_PER_WORD = 0.004;

/**
 * PRB.23 (measured on the vendored CLI, loopback mock): the fixed request envelope after
 * BASE_TOOLS is ~65.1 KB total; the advertised tool schemas alone were ~77.8 KB (~19K tokens)
 * before the tools: reduction. The seed figure used for the fan-out accounting is the researcher
 * spawn's fixed context (roster prompt + inherited envelope) — modeled at 18K tokens, the figure
 * ADR-087's pre-registration carried for the ~5-item batch amortization math.
 */
const RESEARCHER_SEED_TOKENS = 18_000;

/**
 * PRB.24 live measurement (run 01M35Y9BH…): the unbounded verification loop averaged ~60K
 * cache-read tokens per Messages request across ~40 requests at the flat 80K window. Judge-class
 * phases are modeled at the same observed average resend — a generous upper bound (intake/craft
 * read artifacts, not fetched pages, so their true resend is smaller and so is L1's effect).
 */
const OBSERVED_RESEND_TOKENS_PER_REQUEST = 60_000;
const OBSERVED_RESEARCH_REQUESTS = 40;
const MODELED_JUDGE_PACKAGE_REQUESTS = 20;

/** Anthropic LIST price per million tokens (provider COGS, 2026-10; not the proxy billing rate). */
const LIST_PRICE = {
  sonnet: { input: 3, output: 15, cacheRead: 0.3, cacheWrite5m: 3.75, cacheWrite1h: 6 },
  opus: { input: 15, output: 75, cacheRead: 1.5, cacheWrite5m: 18.75, cacheWrite1h: 30 },
  haiku: { input: 1, output: 5, cacheRead: 0.1, cacheWrite5m: 1.25, cacheWrite1h: 2 },
} as const;

/** The accounting's canonical arm: Standard rigor, Base tier, the committed 6,000-word fixture. */
export interface AccountingArm {
  readonly words: number;
  readonly claims: number;
  readonly tier: "base" | "balanced" | "frontier";
}

export interface LeverDelta {
  readonly lever: keyof CogsLevers;
  /** modeled saving range in USD (provider list); hi/lo bounds both reported. */
  readonly lowUsd: number;
  readonly highUsd: number;
  /** the modeled mechanism + named assumptions — an arm outside this range indicts the metering. */
  readonly model: string;
}

export interface AccountingReport {
  readonly fixtureWords: number;
  readonly claims: number;
  readonly tier: string;
  readonly policyDelta: {
    readonly untuned: ReturnType<typeof authoredPolicyShape>;
    readonly tuned: ReturnType<typeof authoredPolicyShape>;
  };
  readonly levers: readonly LeverDelta[];
  /** sum of the per-lever HIGH bounds — the offline ceiling on Stage-B savings. */
  readonly modeledCeilingUsd: number;
  /** the restore evaluation's headline: can these levers reach ~$6 p90 list at 6,000 words? */
  readonly restoreAssessment: {
    readonly baselineEstimateUsd: number;
    readonly targetUsd: number;
    readonly reachable: boolean;
    readonly gapUsd: number;
  };
  readonly notes: readonly string[];
}

function authoredPolicyShape(p: ReturnType<typeof authorWebToolPolicy>) {
  return {
    fetchBudget: p.fetchBudget,
    searchBudget: p.searchBudget,
    fetchFloor: p.fetchFloor,
    searchFloor: p.searchFloor,
    fetchMaxContentTokens: p.fetchMaxContentTokens,
    backfillFetchBudget: p.backfillFetchBudget,
  };
}

const usd = (tokens: number, perMTok: number) => (tokens / 1_000_000) * perMTok;
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

/**
 * The offline accounting for one arm. `baselineEstimateUsd` is the stateless estimate already
 * derived from pricing.json + the estimator ($20.25 at Standard/Base/6,000 — recorded in the run
 * ledger's ground-truth section); passed in so the accounting module never re-implements the
 * estimator's own math.
 */
export function offlineAccounting(args: {
  readonly words: number;
  readonly tier: AccountingArm["tier"];
  readonly baselineEstimateUsd: number;
  readonly restoreTargetUsd: number;
}): AccountingReport {
  const claims = Math.max(1, Math.round(args.words * CLAIMS_PER_WORD));
  const untuned = authorWebToolPolicy({ claims });
  const tuned = authorWebToolPolicy({ claims, l5ResearchEnvelope: true });
  const price = LIST_PRICE.sonnet; // the canonical arm is Base → Sonnet main + Haiku research subs

  // ---- L2 — fan-out shape: fewer researcher spawns × the fixed per-spawn seed -------------------
  // Spawns = ceil(claims / batch). Each spawn repays the ~18K-token seed; modeled at cache-read
  // price (lo — the seed is mostly a cacheable prefix) through fresh-input price (hi).
  const spawnsOff = Math.ceil(claims / COGS_FANOUT_BASELINE.batchSize);
  const spawnsOn = Math.ceil(claims / COGS_FANOUT_TUNED.batchSize);
  const seedSaved = (spawnsOff - spawnsOn) * RESEARCHER_SEED_TOKENS;
  const l2: LeverDelta = {
    lever: "l2FanoutShape",
    lowUsd: r4(usd(seedSaved, LIST_PRICE.haiku.cacheRead)),
    highUsd: r4(usd(seedSaved, LIST_PRICE.haiku.input)),
    model:
      `${spawnsOff}→${spawnsOn} researcher spawns for ${claims} claims (batch ${COGS_FANOUT_BASELINE.batchSize}→` +
      `${COGS_FANOUT_TUNED.batchSize}); ${seedSaved} seed tokens at Haiku cache-read..input. ` +
      `Concurrency ${COGS_FANOUT_BASELINE.maxConcurrent}→${COGS_FANOUT_TUNED.maxConcurrent} changes wave ` +
      `shape, not total seed — modeled $0. Independent per-item contexts are preserved (each spawn ` +
      `verifies only its batch — REQ-SPEC-31(3) unchanged).`,
  };

  // ---- L1 — per-phase autoCompactWindow ----------------------------------------------------------
  // Savings only where the tuned window drops below the OBSERVED resend (judge/package); research
  // holds 80K (the bounded-batch working-set floor — never tighter); generate widens to 120K.
  const judgeDelta = Math.max(0, OBSERVED_RESEND_TOKENS_PER_REQUEST - COGS_PHASE_COMPACT_WINDOWS.judge!);
  const packageDelta = Math.max(0, OBSERVED_RESEND_TOKENS_PER_REQUEST - COGS_PHASE_COMPACT_WINDOWS.package!);
  const l1SavedTokens = Math.ceil(MODELED_JUDGE_PACKAGE_REQUESTS / 2) * (judgeDelta + packageDelta);
  const l1: LeverDelta = {
    lever: "l1PerPhaseWindow",
    lowUsd: 0,
    highUsd: r4(usd(l1SavedTokens, price.cacheRead)),
    model:
      `per-class windows research:${COGS_PHASE_COMPACT_WINDOWS.research} judge:${COGS_PHASE_COMPACT_WINDOWS.judge} ` +
      `generate:${COGS_PHASE_COMPACT_WINDOWS.generate} package:${COGS_PHASE_COMPACT_WINDOWS.package} vs flat 80K. ` +
      `Savings = (observed 60K resend − window) × ~${MODELED_JUDGE_PACKAGE_REQUESTS} judge+package requests ` +
      `at cache-read; generate's wider window is a quality guard, modeled +$0. Lo bound $0 — if the ` +
      `working sets never reach 48K the windows bind nothing.`,
  };

  // ---- L3 — per-phase model routing --------------------------------------------------------------
  // At Base every §12.3 cell is Sonnet — no in-table cheaper route (the ticket's own prediction:
  // $0 at the canonical arm). Balanced/Frontier save on research+package main-context tokens.
  const researchTokens = OBSERVED_RESEND_TOKENS_PER_REQUEST * OBSERVED_RESEARCH_REQUESTS;
  const l3Model =
    args.tier === "base"
      ? "Base routes every §12.3 cell to Sonnet — no in-table saving exists at the canonical arm ($0)."
      : `${args.tier} research/package main ${args.tier === "balanced" ? "Opus→Sonnet" : "Fable→Opus"}; ` +
        `~${researchTokens} research-context tokens re-priced at the cheaper cell's input/cache-read rates.`;
  const l3: LeverDelta = {
    lever: "l3PhaseRouting",
    lowUsd: 0,
    highUsd:
      args.tier === "base"
        ? 0
        : r4(usd(researchTokens, LIST_PRICE.opus.cacheRead) - usd(researchTokens, price.cacheRead)),
    model: l3Model,
  };

  // ---- L4 — cache TTL: the ADR-087-registered session-level model ----------------------------------
  // Writes are per-SESSION-activation, not per-request: each phase is a fresh CLI session, and the
  // provider cache is keyed on prompt prefix — a phase N first request cache-READS phase N−1's
  // ~16.3K envelope write only if still inside TTL. Phases run minutes apart (plus queue/gate
  // gaps): 1h spans the whole run; 5m expires between sessions AND on any intra-phase wait >5m.
  //   1h arm:  1 envelope write at 2× + 6 cross-phase cache-reads of the envelope.
  //   5m arm:  ~7 per-phase envelope writes at 1.25× (each phase re-writes what expired).
  // The counter-effect — intra-phase incremental writes bill at 2× not 1.25× — is modeled as the
  // low bound's credit; the registered verdict is ≈$0.20/run WORSE at 5m, inside the 23% noise
  // floor ⇒ the paid leg is pre-registered SKIPPED unless later legs reopen it.
  const ENVELOPE_TOKENS = 16_300; // PRB.23 measured ≈65.1 KB
  const PHASES_PER_RUN = 7; // the Standard review manifest
  const l4_1h = usd(ENVELOPE_TOKENS, price.cacheWrite1h) + usd(ENVELOPE_TOKENS * (PHASES_PER_RUN - 1), price.cacheRead);
  const l4_5m = usd(ENVELOPE_TOKENS * PHASES_PER_RUN, price.cacheWrite5m);
  // intra-phase write-premium credit (the one thing 5m wins): incremental transcript writes inside
  // a session bill 1.25× instead of 2× — modeled at ~30K written tokens/phase.
  const l4PremiumCredit = usd(30_000 * PHASES_PER_RUN, price.cacheWrite1h - price.cacheWrite5m);
  const l4: LeverDelta = {
    lever: "l4CacheTtl5m",
    lowUsd: r4(l4_1h - l4_5m), // ≈ −$0.14: the registered prediction (negative = 5m costs MORE)
    highUsd: r4(l4_1h - l4_5m + l4PremiumCredit), // ceiling once the write-premium credit is added
    model:
      `ADR-087 session-level model: 1h arm = 1 envelope write @2× ($${r4(usd(ENVELOPE_TOKENS, price.cacheWrite1h))}) ` +
      `+ ${PHASES_PER_RUN - 1} cross-phase reads; 5m arm = ~${PHASES_PER_RUN} envelope writes @1.25× ` +
      `(phases run >5m apart ⇒ the entry expires between sessions). Predicted ≈$${r4(l4_5m - l4_1h)} ` +
      `WORSE/run — inside the 23% noise ⇒ the paid leg is pre-registered SKIPPED (ADR-087 stop rule d); ` +
      `the hi bound adds the intra-phase write-premium credit (~$${r4(l4PremiumCredit)}) if in-session ` +
      `writes dominate. Skill TEXT untouched — the flag only.`,
  };

  // ---- L5 — research envelope above the floor ------------------------------------------------------
  // Two modeled pieces: (a) the per-page cap 8K→4K halves fetched-page context on every page the
  // run actually fetches — the certain component; (b) the headroom-bound reduction only bites if
  // research would have spent above the tuned budget — modeled at $0 low (a run within the tuned
  // budget is untouched) and bounded by the cut headroom at high.
  const modeledFetches = Math.min(tuned.fetchBudget!, OBSERVED_RESEARCH_REQUESTS); // a fetch per turn
  const l5PageSaved = modeledFetches * (FETCH_MAX_CONTENT_TOKENS - COGS_L5_FETCH_MAX_CONTENT_TOKENS);
  const l5: LeverDelta = {
    lever: "l5ResearchEnvelope",
    lowUsd: r4(usd(Math.min(modeledFetches, 20) * 4_000, price.cacheRead)),
    highUsd: r4(usd(l5PageSaved, price.cacheRead)),
    model:
      `per-page cap ${FETCH_MAX_CONTENT_TOKENS}→${COGS_L5_FETCH_MAX_CONTENT_TOKENS} tokens × ~${modeledFetches} ` +
      `fetches at cache-read. Floors absolute-preserved (${tuned.searchFloor}/${tuned.fetchFloor} = ` +
      `untuned ${untuned.searchFloor}/${untuned.fetchFloor}); budgets ${untuned.searchBudget}→` +
      `${tuned.searchBudget} search / ${untuned.fetchBudget}→${tuned.fetchBudget} fetch — the non-reserved ` +
      `headroom halved (bases ${RESEARCH_SEARCH_BASE}/${RESEARCH_FETCH_MIN} unchanged). Coverage/Unverified ` +
      `semantics are the Stage-B gate, not modeled savings.`,
  };

  const levers = [l1, l2, l3, l4, l5];
  const modeledCeilingUsd = r2(levers.reduce((s, l) => s + l.highUsd, 0));
  return {
    fixtureWords: args.words,
    claims,
    tier: args.tier,
    policyDelta: { untuned: authoredPolicyShape(untuned), tuned: authoredPolicyShape(tuned) },
    levers,
    modeledCeilingUsd,
    restoreAssessment: {
      baselineEstimateUsd: args.baselineEstimateUsd,
      targetUsd: args.restoreTargetUsd,
      reachable: args.baselineEstimateUsd - modeledCeilingUsd <= args.restoreTargetUsd,
      gapUsd: r2(args.baselineEstimateUsd - modeledCeilingUsd - args.restoreTargetUsd),
    },
    notes: [
      "OFF arms are bit-identical to the pre-ECON.2 pipeline (DEFAULT_COGS_LEVERS all-false); every " +
        "modeled delta is an upper bound — the Stage-B arms measure, this pass bounds.",
      `DEFAULT_COGS_LEVERS: ${JSON.stringify(DEFAULT_COGS_LEVERS)}`,
      "Proxy ledger rows remain the meter of record for every paid leg (sdk_stream/sdk_estimate " +
        "rows are cross-checks only — ADR-087 §meter-of-record).",
    ],
  };
}

/** CLI entry — prints the report as JSON. $0: no provider call, no DB, no network. */
export function main(): void {
  const report = offlineAccounting({
    words: 6_000,
    tier: "base",
    // the stateless estimate derived from pricing.json + the estimator (run ledger §ground truth):
    // Standard/Base 6,000-word Review ≈ 2,835 credits ≈ $20.25 list.
    baselineEstimateUsd: 20.25,
    restoreTargetUsd: 6,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

// live-driver convention (scripts/live/econ2-accounting.mjs → this file): main runs on import,
// except under Vitest where the unit tests import the pure functions only.
if (!process.env.VITEST) main();
