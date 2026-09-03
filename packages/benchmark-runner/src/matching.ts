import type { BenchmarkArm, BenchmarkDeps, Finding, SqlExecutor } from "./types.js";
import type { GoldFinding, MatchRecord, MatchVerdict } from "@rhema/benchmark";

// Blind-to-arm human matching (REQ-EVAL-8): trained humans decide whether an arm finding matches a gold finding,
// or adjudicate an unmatched arm finding as novelty (`valid_but_missed_by_gold`) or `invalid`. Automated matchers
// may only SUGGEST — the binding `verdict` is a human's (`decided_by`). This module owns the match-task workflow
// (persist an undecided record per arm finding, optionally seeded with an automated suggestion) and the recording
// of the human decision. The recall/FP scorer (P0.13) consumes the DECIDED records mapped to its `MatchRecord`
// shape. Senior novelty confirmation + post-revision pairwise preference are in `adjudication.ts`.

export type { MatchRecord, MatchVerdict };

/**
 * An automated matcher — SUGGEST ONLY (REQ-EVAL-8). Given a blind arm finding + the gold set, it may propose a
 * verdict (+ the gold finding for a match); the human is free to override. Returning `null` means "no suggestion."
 * A binding decision NEVER comes from here.
 */
export interface AutomatedMatcher {
  readonly id: string;
  suggest(input: {
    armFinding: Finding;
    goldFindings: readonly GoldFinding[];
  }): { verdict: MatchVerdict; goldFindingId?: string } | null;
}

/** Collapse to a form for the default matcher's overlap heuristic. */
function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

/**
 * A deterministic default suggester (SUGGEST ONLY): proposes the highest-overlap gold finding as a `matched` when
 * body/title token overlap clears a threshold; otherwise abstains (returns `null`, leaving the human to adjudicate
 * novelty vs invalid). It exists so the workshop tool can pre-seed suggestions; it is never the decision.
 */
export function defaultMatcher(threshold = 0.3): AutomatedMatcher {
  return {
    id: "jaccard-suggester",
    suggest({ armFinding, goldFindings }) {
      const armTokens = tokens(`${armFinding.title} ${armFinding.body}`);
      let best: { goldFindingId: string; score: number } | null = null;
      for (const g of goldFindings) {
        const score = jaccard(armTokens, tokens(`${g.finding.title} ${g.finding.body}`));
        if (!best || score > best.score) best = { goldFindingId: g.finding.id, score };
      }
      if (best && best.score >= threshold) return { verdict: "matched", goldFindingId: best.goldFindingId };
      return null;
    },
  };
}

export interface CreateMatchTaskInput {
  readonly waveId: string;
  readonly draftId: string;
  readonly arm: BenchmarkArm;
  readonly armFindingId: string;
  readonly armFinding: Finding;
  readonly goldFindings: readonly GoldFinding[];
  /** An optional automated matcher to SEED a suggestion (never a decision). */
  readonly matcher?: AutomatedMatcher;
}

/**
 * Create an undecided, blind-to-arm match task for one arm finding (REQ-EVAL-8). If a matcher is supplied its
 * suggestion is stored (`suggested_verdict` / `suggested_by`) but `verdict` stays NULL until a human decides. The
 * task record is `blind_to_arm = true` — the human matcher sees the finding, not the arm. Returns the record id.
 */
export async function createMatchTask(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: CreateMatchTaskInput,
): Promise<string> {
  const id = deps.ids("bmmatch");
  const suggestion = input.matcher?.suggest({ armFinding: input.armFinding, goldFindings: input.goldFindings }) ?? null;
  await exec.query(
    `insert into benchmark_match_records
       (id, wave_id, draft_id, arm, arm_finding_id, suggested_verdict, suggested_by, blind_to_arm, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
    [
      id,
      input.waveId,
      input.draftId,
      input.arm,
      input.armFindingId,
      suggestion?.verdict ?? null,
      suggestion ? (input.matcher?.id ?? null) : null,
      deps.clock.now(),
    ],
  );
  return id;
}

/** Raised when a match decision is inconsistent (a `matched` verdict without the gold finding it matched). */
export class MatchDecisionError extends Error {
  constructor(detail: string) {
    super(`benchmark-runner: invalid match decision — ${detail}`);
    this.name = "MatchDecisionError";
  }
}

export interface RecordDecisionInput {
  readonly armFindingId: string;
  readonly verdict: MatchVerdict;
  /** required iff verdict = 'matched'. */
  readonly goldFindingId?: string;
  readonly decidedBy: string;
}

/**
 * Record a human's BINDING match decision on an arm finding (REQ-EVAL-8). A `matched` verdict MUST name the gold
 * finding it matched. Overwrites any prior decision (a re-decision is legitimate — the latest human call stands).
 */
export async function recordMatchDecision(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: RecordDecisionInput,
): Promise<void> {
  if (input.verdict === "matched" && !input.goldFindingId) {
    throw new MatchDecisionError("a 'matched' verdict must name the gold finding it matched");
  }
  const res = (await exec.query(
    `update benchmark_match_records
        set verdict = $2, gold_finding_id = $3, decided_by = $4, decided_at = $5
      where arm_finding_id = $1
      returning id`,
    [
      input.armFindingId,
      input.verdict,
      input.verdict === "matched" ? input.goldFindingId : null,
      input.decidedBy,
      deps.clock.now(),
    ],
  )) as { rows: unknown[] };
  if (res.rows.length === 0) {
    throw new MatchDecisionError(`no match task exists for arm finding ${input.armFindingId} (create it first)`);
  }
}

/**
 * Load the DECIDED match records for one arm × draft in a wave, mapped to P0.13's `MatchRecord` shape for the
 * recall/FP scorer. Undecided tasks (verdict still null) are excluded — a suggestion is not a decision.
 */
export async function loadMatchRecords(
  exec: SqlExecutor,
  input: { waveId: string; draftId: string; arm: BenchmarkArm },
): Promise<MatchRecord[]> {
  const rows = (
    await exec.query(
      `select arm_finding_id, gold_finding_id, verdict from benchmark_match_records
        where wave_id = $1 and draft_id = $2 and arm = $3 and verdict is not null
        order by arm_finding_id`,
      [input.waveId, input.draftId, input.arm],
    )
  ).rows as { arm_finding_id: string; gold_finding_id: string | null; verdict: MatchVerdict }[];
  return rows.map((r) => ({
    armFindingId: r.arm_finding_id,
    goldFindingId: r.gold_finding_id ?? undefined,
    verdict: r.verdict,
  }));
}
