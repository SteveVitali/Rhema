import type { Finding, Severity } from "@rhema/contracts";

// Shared types for @rhema/benchmark — the §18 comparative-benchmark data layer + deterministic scorers.
// The scorers are pure functions over the §5.7 Finding schema, the adjudicated gold set, human-decided match
// records, and the §12.7 proxy-metering rows. Human matching/adjudication itself is P0.14 (the scorers only
// consume its records); LLM-judge machinery is P0.14 (this ticket is deterministic-only — C-g).

/** The minimal structural SQL surface (a `query(sql, params?)` → `{ rows }`) — PGlite, `pg`, or a caller tx. Defined
 *  locally (structurally identical to @rhema/mirror's) to keep @rhema/benchmark free of a @rhema/mirror dependency. */
export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Injected id factory + clock (deterministic in tests), like every DI'd package on the chain. */
export interface BenchmarkDeps {
  readonly ids: (prefix: string) => string;
  readonly clock: { now(): Date };
}

/** The six benchmark arms (REQ-EVAL-6). A4/A5 are the Rhema arms (carry a run_id → run-ledger). */
export const BENCHMARK_ARMS = ["A1", "A2", "A3", "A4", "A5", "A6"] as const;
export type BenchmarkArm = (typeof BENCHMARK_ARMS)[number];

/** The four shipped protocols the corpus is stratified across (REQ-EVAL-1). */
export const CORPUS_PROTOCOLS = ["essay", "academic", "op_ed", "memo"] as const;
export type CorpusProtocol = (typeof CORPUS_PROTOCOLS)[number];

/** Corpus length strata (REQ-EVAL-1). */
export const LENGTH_BANDS = ["2k", "5k", "8k"] as const;
export type LengthBand = (typeof LENGTH_BANDS)[number];

/** Severity as an ORDINAL scale (least→most severe), for weighted-κ severity calibration + IAA (§5.7 severities). */
export const SEVERITY_LEVELS = ["note", "minor", "major", "blocking"] as const;

/**
 * A gold finding: an adjudicated §5.7 Finding plus the REQ-EVAL-4 `material` flag ("a competent editor would
 * require this addressed before publication"). The recall headline is over material major/blocking gold findings.
 */
export interface GoldFinding {
  readonly finding: Finding;
  readonly material: boolean;
}

/**
 * A human-adjudicated match record (REQ-EVAL-8): trained humans decide whether an arm finding matches a gold
 * finding, and adjudicate an unmatched arm finding as novelty (`valid_but_missed_by_gold`) or `invalid` (a false
 * positive). Automated matchers may only *suggest* (P0.14) — the scorers here consume the human decisions.
 */
export type MatchVerdict = "matched" | "valid_but_missed_by_gold" | "invalid";
export interface MatchRecord {
  readonly armFindingId: string;
  /** the gold finding this arm finding was matched to (present iff verdict === 'matched'). */
  readonly goldFindingId?: string;
  readonly verdict: MatchVerdict;
}

export type { Finding, Severity };
