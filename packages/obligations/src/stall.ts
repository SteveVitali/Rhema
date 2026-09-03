import type { Actor } from "@rhema/contracts";
import type { ObligationDeps, ObligationRow, SqlExecutor } from "./types.js";
import { rowToObligation } from "./queries.js";
import { createDecisionRequest } from "./routing.js";

// Stall detection (§6.8; REQ-OBJ-5, REQ-WF-15 amended). Because obligations are project ROWS (not loop-log
// rows), the §6.8 stall criterion is a QUERY that works identically for hand-run Review → Revise rounds at MVP,
// not only under the 1.x Run-rounds loop — and the Convergence report (REQ-PROD-12, 1.x) reads the same rows.
// The criterion: a blocking/major obligation still open after two consecutive covering rounds
// (`roundsOpen ≥ 2`), not rebutted and not deferred (an in-horizon deferral is a recorded snooze — it re-enters
// only when its horizon returns it to `open`). Closed obligations (discharged/mooted/rebutted carry `closed_at`)
// are excluded. Stall ⇒ escalate to the Decisions inbox.

const STALL_PREDICATE = `severity in ('blocking','major')
  and rounds_open >= 2
  and state not in ('rebutted','deferred')
  and closed_at is null`;

const OBLIGATION_COLUMNS =
  "id, project_id, source, finding_id, severity, kind, title, state, state_since, opened_on_draft_id, rationale, defer_horizon, rounds_open, discharged_by, created_by, created_at, closed_at";

/**
 * The §6.8 stall query over obligation rows: the blocking/major obligations on a project that have been open ≥ 2
 * consecutive covering rounds and are neither rebutted nor deferred (nor closed). Non-empty ⇒ the loop (or the
 * hand-run rounds) has stalled. Deterministic; identical for hand-run and Run-rounds.
 */
export async function findStalledObligations(exec: SqlExecutor, projectId: string): Promise<ObligationRow[]> {
  const res = await exec.query(
    `select ${OBLIGATION_COLUMNS} from revision_obligations where project_id = $1 and ${STALL_PREDICATE} order by created_at, id`,
    [projectId],
  );
  // rowToObligation is imported via queries (kept internal there); re-map the raw rows here.
  return (res.rows as Parameters<typeof rowToObligation>[0][]).map(rowToObligation);
}

/** True iff the project has at least one stalled blocking/major obligation (§6.8). */
export async function isStalled(exec: SqlExecutor, projectId: string): Promise<boolean> {
  const res = await exec.query(
    `select 1 from revision_obligations where project_id = $1 and ${STALL_PREDICATE} limit 1`,
    [projectId],
  );
  return res.rows.length > 0;
}

export interface EscalateStallsResult {
  readonly stalled: readonly ObligationRow[];
  /** obligation id → the decision_request id created (or re-used) for it. */
  readonly escalated: ReadonlyMap<string, string>;
}

/**
 * Escalate every stalled obligation to the Decisions inbox (§6.8; REQ-OBJ-5). Idempotent per obligation within
 * a run: an obligation already carrying an open escalation decision_request from this run is not re-escalated.
 * Returns the stalled set and the decision_request id per obligation.
 */
export async function escalateStalls(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { projectId: string; runId?: string | null; byActor?: Actor },
): Promise<EscalateStallsResult> {
  const stalled = await findStalledObligations(exec, args.projectId);
  const escalated = new Map<string, string>();
  for (const ob of stalled) {
    const decisionRequestId = await createDecisionRequest(exec, deps, {
      obligationId: ob.id,
      runId: args.runId ?? null,
      text: `Stalled ${ob.severity} obligation (open ${ob.roundsOpen} rounds): ${ob.title}`,
      options: ["decide", "re-defer", "drop"],
    });
    escalated.set(ob.id, decisionRequestId);
  }
  return { stalled, escalated };
}

/**
 * Whether any rubric dimension improved between a project's two most recent reviews — the second §6.8 conjunct
 * (a stall is "no rubric-dimension improvement" AND the obligation predicate). Exposed for the Run-rounds loop
 * (1.x) to AND in; the MVP hand-run escalation triggers on the obligation predicate alone (ticket In-scope 4).
 * Returns true when there are fewer than two reviews to compare (treat as "improved" — do not force a stall).
 */
export async function rubricImprovedSinceLastRound(exec: SqlExecutor, projectId: string): Promise<boolean> {
  const res = await exec.query(
    `select rubric from correspondence_items
      where project_id = $1 and kind = 'review' and rubric is not null
      order by delivered_at desc, ordinal desc limit 2`,
    [projectId],
  );
  if (res.rows.length < 2) return true;
  const parse = (r: unknown): Record<string, number> => {
    const rub = (r as { rubric: unknown }).rubric;
    const obj = (typeof rub === "string" ? JSON.parse(rub) : rub) as { dimensions?: Array<{ dimension: string; score: number }> };
    return Object.fromEntries((obj.dimensions ?? []).map((d) => [d.dimension, d.score]));
  };
  const [latest, prior] = [parse(res.rows[0]), parse(res.rows[1])];
  return Object.keys(latest).some((dim) => prior[dim] !== undefined && latest[dim]! > prior[dim]!);
}
