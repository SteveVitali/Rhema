// The read half of the analytics pipeline (PRB.12). `listAnalyticsEvents` is the ONE read seam over
// `analytics_events` for reporting: it re-applies the opt-out at read time (a join on
// `"user".analytics_opt_out`), so a user who opts out today is excluded from every downstream view —
// not just future writes (REQ-PROD-15). Operator callers pass the system exec (RLS-free); a
// tenant-scoped tx sees only its own workspace either way.

import type { SqlClient } from "@rhema/orchestrator";

export interface AnalyticsRow {
  readonly id: string;
  readonly userId: string | null;
  readonly workspaceId: string;
  readonly projectId: string | null;
  readonly runId: string | null;
  readonly event: string;
  readonly props: Record<string, unknown>;
  readonly at: Date;
}

export interface AnalyticsQuery {
  /** inclusive window bounds on `analytics_events.at`. */
  readonly from?: Date;
  readonly to?: Date;
  readonly event?: string;
  readonly workspaceId?: string;
  readonly limit?: number;
}

/**
 * Read analytics events in a window, excluding every event whose user is currently opted out
 * (defense in depth — `recordAnalyticsEvent` already refuses the write; this join makes a row
 * written before the flag flipped disappear too).
 */
export async function listAnalyticsEvents(
  exec: SqlClient,
  q: AnalyticsQuery = {},
): Promise<AnalyticsRow[]> {
  const params: unknown[] = [];
  const where: string[] = [];
  if (q.from) {
    params.push(q.from);
    where.push(`ae.at >= $${params.length}`);
  }
  if (q.to) {
    params.push(q.to);
    where.push(`ae.at < $${params.length}`);
  }
  if (q.event) {
    params.push(q.event);
    where.push(`ae.event = $${params.length}`);
  }
  if (q.workspaceId) {
    params.push(q.workspaceId);
    where.push(`ae.workspace_id = $${params.length}`);
  }
  params.push(q.limit ?? 5000);
  const res = await exec.query(
    `select ae.id, ae.user_id as "userId", ae.workspace_id as "workspaceId",
            ae.project_id as "projectId", ae.run_id as "runId", ae.event, ae.props, ae.at
       from analytics_events ae
       left join "user" u on u.id = ae.user_id
      where coalesce(u.analytics_opt_out, false) = false
      ${where.length ? `and ${where.join(" and ")}` : ""}
      order by ae.at, ae.id
      limit $${params.length}`,
    params,
  );
  return res.rows as AnalyticsRow[];
}
