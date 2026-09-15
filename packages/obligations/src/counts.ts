import type { SqlExecutor } from "./types.js";

// REQ-WF-7 (amended v0.3). The re-review's run report states "N carried, M closed, K new" — computed by the
// orchestrator FROM OBLIGATION ROWS at delivery, not from run prose, and reconciled against the Editor's own
// tally in the findings sidecar. A mismatch is a delivery-validation WARNING, never a failure (§11.7): the row
// counts are the truth, the sidecar counts are the Editor's cross-check.

export interface ObligationCounts {
  /** obligations carried forward from a prior round and re-raised (a carried or regression edge this round). */
  readonly carried: number;
  /** obligations closed by this covering review's no-match discharge (REQ-WF-7's "closed" set). */
  readonly closed: number;
  /** obligations newly spawned this delivery (a root edge this round). */
  readonly new: number;
}

/**
 * Compute the carried/closed/new counts for a delivery FROM ROWS (REQ-WF-7): `new` = root lineage edges written
 * this correspondence; `carried` = distinct obligations with a carried/regression edge this correspondence;
 * `closed` = obligations this covering review discharged by no-match (a `no_match` transition on this run).
 */
export async function computeDeliveryCounts(
  exec: SqlExecutor,
  args: { correspondenceId: string; runId: string },
): Promise<ObligationCounts> {
  const spawned = await exec.query(
    `select count(*)::int as n from obligation_findings where correspondence_id = $1 and relation = 'root'`,
    [args.correspondenceId],
  );
  const carried = await exec.query(
    `select count(distinct obligation_id)::int as n from obligation_findings
      where correspondence_id = $1 and relation in ('carried','regression')`,
    [args.correspondenceId],
  );
  const closed = await exec.query(
    `select count(distinct obligation_id)::int as n from obligation_transitions
      where cause = 'no_match' and run_id = $1`,
    [args.runId],
  );
  return {
    new: (spawned.rows[0] as { n: number }).n,
    carried: (carried.rows[0] as { n: number }).n,
    closed: (closed.rows[0] as { n: number }).n,
  };
}

export interface CountReconciliation {
  readonly computed: ObligationCounts;
  readonly sidecar: ObligationCounts | null;
  readonly match: boolean;
}

/**
 * Reconcile the row-computed counts against the Editor's sidecar tally (REQ-WF-7). `match` is true when the
 * sidecar is absent (a first review, or an Editor that did not tally) or every field agrees; a false `match` is
 * a delivery-validation WARNING the caller surfaces, NOT a failure.
 */
export function reconcileCounts(computed: ObligationCounts, sidecar: ObligationCounts | null | undefined): CountReconciliation {
  const s = sidecar ?? null;
  const match = s === null || (s.carried === computed.carried && s.closed === computed.closed && s.new === computed.new);
  return { computed, sidecar: s, match };
}
