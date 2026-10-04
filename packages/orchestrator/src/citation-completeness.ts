// CITE.1 (REQ-VIS-9; ADR-084/085) — the cross-tenant citation-completeness aggregate. The mirror
// persists the per-run record on `runs.citation_completeness` (migration 0057); THIS module is the
// system-pool reporting path: a trailing-window rollup over flagged-test-tenant-excluded runs, then
// an upsert into `citation_completeness_daily` (one row per sweep day — the time series the weekly
// review and ECON.2 read).
//
// Everything here is counts and rates — never urls, never tenant data beyond aggregates (invariant
// 10). The per-run missed-url identifiers stay on the run row; the aggregate never carries them.
// It is a REPORTED signal, deliberately not a §13.5 SLO row: CITE.1 measures the rate; the
// threshold-setting decision waits on baseline evidence.

import type { SqlClient } from "./tx.js";

// JOURNEY.1 — flagged test tenants never count toward the aggregate (same NOT-EXISTS fragment the
// slo probes use): a workspace flagged `is_test` drops its runs out of every window.
const TEST_TENANT_FREE =
  `not exists (select 1 from workspaces w where w.id = r.workspace_id and w.is_test)`;

/** One aggregate reading over a trailing window. `rate` is covered÷cited (null when nothing cited). */
export interface CitationCompletenessAggregate {
  /** runs in the window carrying a completeness record (research-bearing deliveries). */
  readonly runs: number;
  readonly cited: number;
  readonly covered: number;
  readonly missed: number;
  /** occurrence-level Path-B strips across the window. */
  readonly stripped: number;
  /** runs whose coverage came partly through mechanism-A backfill traffic. */
  readonly backfillRanRuns: number;
  /** cited urls rescued by backfill fetches across the window. */
  readonly backfillResolved: number;
  /** cited urls covered by search-hit rows only (snippet evidence). */
  readonly searchCovered: number;
  /** covered ÷ cited; null when `cited = 0` (nothing to measure — never fabricated). */
  readonly rate: number | null;
}

const AGGREGATE_SQL = (window: string) => `
  select
    count(*)::int                                                       as runs,
    coalesce(sum((r.citation_completeness->>'cited')::int), 0)::int     as cited,
    coalesce(sum((r.citation_completeness->>'covered')::int), 0)::int   as covered,
    coalesce(sum((r.citation_completeness->>'missed')::int), 0)::int    as missed,
    coalesce(sum((r.citation_completeness->>'stripped')::int), 0)::int  as stripped,
    count(*) filter (
      where coalesce((r.citation_completeness->>'backfillRan')::boolean, false)
    )::int                                                            as backfill_ran_runs,
    coalesce(sum((r.citation_completeness->>'backfillResolved')::int), 0)::int
                                                                      as backfill_resolved,
    coalesce(sum((r.citation_completeness->>'searchCovered')::int), 0)::int
                                                                      as search_covered
    from runs r
   where r.citation_completeness is not null
     and r.ended_at > now() - ${window}
     and ${TEST_TENANT_FREE}`;

/**
 * Read the cross-tenant aggregate over a trailing window on the SYSTEM executor (BYPASSRLS — the
 * SEC.1 system pool; a tenant-scoped read would see only the caller's own rows and lie). A probe
 * that throws (a not-yet-migrated column on a partial deploy) propagates — the caller decides.
 */
export async function citationCompletenessAggregate(
  system: SqlClient,
  window = "interval '7 days'",
): Promise<CitationCompletenessAggregate> {
  const res = await system.query(AGGREGATE_SQL(window), []);
  const row = res.rows[0] as
    | {
        runs: number;
        cited: number;
        covered: number;
        missed: number;
        stripped: number;
        backfill_ran_runs: number;
        backfill_resolved: number;
        search_covered: number;
      }
    | undefined;
  const agg = {
    runs: row?.runs ?? 0,
    cited: row?.cited ?? 0,
    covered: row?.covered ?? 0,
    missed: row?.missed ?? 0,
    stripped: row?.stripped ?? 0,
    backfillRanRuns: row?.backfill_ran_runs ?? 0,
    backfillResolved: row?.backfill_resolved ?? 0,
    searchCovered: row?.search_covered ?? 0,
  };
  return { ...agg, rate: agg.cited > 0 ? agg.covered / agg.cited : null };
}

/**
 * The daily reporting sweep: compute the trailing-7-day aggregate and upsert it under the given
 * UTC day. Returns the aggregate so the caller can log the `[cite]` line as well (the durable
 * artifact is the table row; the log line is the alert/metric seam).
 */
export async function recordCitationCompletenessDaily(
  system: SqlClient,
  day?: Date,
): Promise<CitationCompletenessAggregate> {
  const agg = await citationCompletenessAggregate(system, "interval '7 days'");
  const d = (day ?? new Date()).toISOString().slice(0, 10);
  await system.query(
    `insert into citation_completeness_daily
       (day, runs, cited, covered, missed, stripped, backfill_ran_runs, backfill_resolved, search_covered, rate)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     on conflict (day) do update set
       runs = excluded.runs, cited = excluded.cited, covered = excluded.covered,
       missed = excluded.missed, stripped = excluded.stripped,
       backfill_ran_runs = excluded.backfill_ran_runs,
       backfill_resolved = excluded.backfill_resolved,
       search_covered = excluded.search_covered, rate = excluded.rate,
       computed_at = now()`,
    [
      d,
      agg.runs,
      agg.cited,
      agg.covered,
      agg.missed,
      agg.stripped,
      agg.backfillRanRuns,
      agg.backfillResolved,
      agg.searchCovered,
      agg.rate,
    ],
  );
  return agg;
}
