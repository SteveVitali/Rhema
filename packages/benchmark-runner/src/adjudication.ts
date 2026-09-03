import type { BenchmarkArm, BenchmarkDeps, SqlExecutor } from "./types.js";

// Senior adjudication + post-revision pairwise preference (REQ-EVAL-8, REQ-EVAL-11). Two pieces:
//   (1) novelty confirmation — a senior adjudicator confirms an unmatched arm finding the human matcher ruled
//       `valid_but_missed_by_gold` is genuinely novel-and-valid (panel-confirmed novelty — REQ-EVAL-11);
//   (2) post-revision pairwise preference — blinded editors prefer one arm's revised manuscript over another's,
//       judged in BOTH presentation orders; a disagreement across orders is scored a TIE (C-a). This is the
//       REQ-EVAL-15 guard rail (Rhema-revised preferred over A1-revised in ≥60% of judgments).

/** Raised when a novelty confirmation targets a record that is not a `valid_but_missed_by_gold` decision. */
export class NoveltyAdjudicationError extends Error {
  constructor(detail: string) {
    super(`benchmark-runner: novelty adjudication — ${detail}`);
    this.name = "NoveltyAdjudicationError";
  }
}

/**
 * Senior confirmation of a novelty (REQ-EVAL-8/11): the match record must already be a human `valid_but_missed_by_gold`
 * decision; the adjudicator confirms (or denies) that it is genuinely novel-and-valid. Only confirmed novelties earn
 * the novelty-credit reported in the metrics.
 */
export async function confirmNovelty(
  exec: SqlExecutor,
  _deps: BenchmarkDeps,
  input: { armFindingId: string; adjudicator: string; confirmed: boolean },
): Promise<void> {
  const rows = (
    await exec.query(`select verdict from benchmark_match_records where arm_finding_id = $1`, [input.armFindingId])
  ).rows as { verdict: string | null }[];
  const record = rows[0];
  if (!record) throw new NoveltyAdjudicationError(`no match record for arm finding ${input.armFindingId}`);
  if (record.verdict !== "valid_but_missed_by_gold") {
    throw new NoveltyAdjudicationError(
      `arm finding ${input.armFindingId} is not a novelty (verdict=${record.verdict ?? "undecided"})`,
    );
  }
  await exec.query(
    `update benchmark_match_records set novelty_confirmed = $2, adjudicator = $3 where arm_finding_id = $1`,
    [input.armFindingId, input.confirmed, input.adjudicator],
  );
}

/** The count of senior-confirmed novelties for an arm × draft (the novelty metric's numerator). */
export async function confirmedNovelties(
  exec: SqlExecutor,
  input: { waveId: string; draftId: string; arm: BenchmarkArm },
): Promise<number> {
  const rows = (
    await exec.query(
      `select count(*)::int n from benchmark_match_records
        where wave_id = $1 and draft_id = $2 and arm = $3
          and verdict = 'valid_but_missed_by_gold' and novelty_confirmed = true`,
      [input.waveId, input.draftId, input.arm],
    )
  ).rows as { n: number }[];
  return rows[0]?.n ?? 0;
}

export type Presentation = "ab" | "ba";
export type Preferred = "a" | "b" | "tie";

/**
 * Record one post-revision pairwise preference (REQ-EVAL-8/11). `preferred` refers to the FIXED arm labels
 * (`armA`/`armB`), not display order; `presentation` records which arm was shown first (the position swap). Both
 * orders are recorded for a pair so `pairwisePreference` can resolve a disagreement to a tie (C-a). `judgeKind`
 * distinguishes the human guard-rail judgment (REQ-EVAL-15) from a secondary LLM judgment (REQ-EVAL-9).
 */
export async function recordPairwisePreference(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: {
    waveId: string;
    draftId: string;
    armA: BenchmarkArm;
    armB: BenchmarkArm;
    presentation: Presentation;
    preferred: Preferred;
    judgeKind: "human" | "llm";
    judgeId: string;
  },
): Promise<string> {
  const id = deps.ids("bmpref");
  await exec.query(
    `insert into benchmark_pairwise_preferences
       (id, wave_id, draft_id, arm_a, arm_b, presentation, preferred, judge_kind, judge_id, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [id, input.waveId, input.draftId, input.armA, input.armB, input.presentation, input.preferred, input.judgeKind, input.judgeId, deps.clock.now()],
  );
  return id;
}

interface PrefRow {
  draft_id: string;
  judge_id: string;
  presentation: Presentation;
  preferred: Preferred;
}

export interface PairwisePreference {
  /** resolved both-order judgments (a (draft, judge) pair with both presentations recorded). */
  readonly judgments: number;
  /** judgments resolving in favour of armA. */
  readonly aWins: number;
  /** judgments resolving in favour of armB. */
  readonly bWins: number;
  /** judgments resolving to a tie (incl. cross-order disagreement — C-a). */
  readonly ties: number;
  /** fraction of resolved judgments preferring armA (ties in the denominator) — the REQ-EVAL-15 ≥60% guard rail. */
  readonly preferredAFraction: number;
  /** fraction of judgments consistent across presentation orders (C-a, reported). */
  readonly positionConsistency: number;
}

/**
 * Resolve post-revision pairwise preference between two arms with the position-swap rule (C-a). For each (draft,
 * judge) with BOTH presentation orders recorded: if both orders prefer the same fixed arm → that arm wins; a tie in
 * either order, or a cross-order disagreement, → a TIE. A (draft, judge) with only one order recorded is not a
 * resolved judgment (excluded). Position consistency is the fraction of resolved judgments whose two orders agreed.
 */
export async function pairwisePreference(
  exec: SqlExecutor,
  input: { waveId: string; armA: BenchmarkArm; armB: BenchmarkArm; judgeKind: "human" | "llm" },
): Promise<PairwisePreference> {
  const rows = (
    await exec.query(
      `select draft_id, judge_id, presentation, preferred from benchmark_pairwise_preferences
        where wave_id = $1 and arm_a = $2 and arm_b = $3 and judge_kind = $4`,
      [input.waveId, input.armA, input.armB, input.judgeKind],
    )
  ).rows as PrefRow[];

  // group by (draft, judge) → the two orders
  const groups = new Map<string, { ab?: Preferred; ba?: Preferred }>();
  for (const r of rows) {
    const key = `${r.draft_id}|${r.judge_id}`;
    const g = groups.get(key) ?? {};
    g[r.presentation] = r.preferred;
    groups.set(key, g);
  }

  let judgments = 0;
  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  let consistent = 0;
  for (const g of groups.values()) {
    if (g.ab === undefined || g.ba === undefined) continue; // both orders required
    judgments += 1;
    const agree = g.ab === g.ba && g.ab !== "tie";
    if (agree) consistent += 1;
    if (agree && g.ab === "a") aWins += 1;
    else if (agree && g.ab === "b") bWins += 1;
    else ties += 1; // any tie or cross-order disagreement (C-a)
  }
  return {
    judgments,
    aWins,
    bWins,
    ties,
    preferredAFraction: judgments === 0 ? 0 : aWins / judgments,
    positionConsistency: judgments === 0 ? 1 : consistent / judgments,
  };
}
