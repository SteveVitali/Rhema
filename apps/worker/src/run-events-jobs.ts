// Run-event maintenance jobs (§12.5): the two cron consumers that keep the event store healthy. Thin handlers
// over @rhema/orchestrator's pure DB functions; the live pg-boss registration + a SYSTEM db connection are
// wired at deploy. Both are SYSTEM-scoped (not tenant-scoped): retention sweeps `run_events_internal` across
// all runs (that table is deliberately not under RLS); partition maintenance is DDL on the `run_events` parent.

import {
  deleteExpiredInternalEvents,
  ensureRunEventsPartition,
  eventDay,
  nextDay,
  type SqlClient,
  type Clock,
} from "@rhema/orchestrator";

/** The run-event maintenance queue names (registered in WORKER_QUEUES; handlers below). */
export const RUN_EVENT_JOBS = {
  /** daily: delete internal-visibility rows older than 30 days (user rows survive for the project's lifetime). */
  retention: "run_events.retention",
  /** daily: pre-create the upcoming daily `run_events` partitions so appends land in a named partition. */
  partition: "run_events.partition",
} as const;
export type RunEventJobName = (typeof RUN_EVENT_JOBS)[keyof typeof RUN_EVENT_JOBS];

/** A system db connection + clock (no tenant scope — these jobs act across all runs). */
export interface RunEventsJobDeps {
  readonly db: SqlClient;
  readonly clock: Clock;
}

/**
 * `run_events.retention` — delete internal-visibility rows older than the 30-day window. User rows are in a
 * separate, partitioned table and are untouched (project-lifetime retention). Returns the rows deleted.
 */
export async function handleRunEventsRetention(
  deps: RunEventsJobDeps,
  opts: { retentionDays?: number } = {},
): Promise<{ deleted: number; sloSamplesDeleted?: number }> {
  const deleted = await deleteExpiredInternalEvents(deps.db, deps.clock.now(), opts.retentionDays);
  // STB.2 / D-P1.22-1 — `slo_samples` (0042) expires at 7 days (the probes read 10-minute windows).
  // A deploy before 0042 has no table — the delete just fails and is dropped.
  const slo = await deps.db
    .query(`delete from slo_samples where at < now() - interval '7 days'`, [])
    .then((r) => ({ rows: r.rows }))
    .catch(() => ({ rows: [] as unknown[] }));
  return { deleted, sloSamplesDeleted: slo.rows.length };
}

/**
 * `run_events.partition` — ensure today's and the next `daysAhead` daily `run_events` partitions exist, so an
 * append lands in a named daily partition rather than the DEFAULT safety-net partition. Idempotent. Returns the
 * partition names ensured.
 */
export async function handleRunEventsPartition(
  deps: RunEventsJobDeps,
  opts: { daysAhead?: number } = {},
): Promise<{ ensured: string[] }> {
  const daysAhead = opts.daysAhead ?? 1; // today + tomorrow by default
  const ensured: string[] = [];
  let day = eventDay(deps.clock.now());
  for (let i = 0; i <= daysAhead; i++) {
    ensured.push(await ensureRunEventsPartition(deps.db, day));
    day = nextDay(day);
  }
  return { ensured };
}
