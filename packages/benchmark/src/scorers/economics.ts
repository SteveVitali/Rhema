import type { SqlExecutor } from "../types.js";

// Economics scorer (REQ-EVAL-14, deterministic): "every quality table carries proxy-metered list cost and
// wall-clock per arm; the report includes recall-per-dollar across arms and rigor levels." The §12.7 proxy is the
// meter of record, so cost is summed from `usage_records` where source='proxy', joined to the arm's run via
// `benchmark_arm_runs.run_id` (REQ-EVAL-20: results are durable rows joinable to run-ledger data). Wall-clock is
// the arm-run's own `latency_ms`. Offline arms (human editors, Grammarly) carry no run_id → no metered cost.
//
// PRODUCTION ROLE: usage_records is FORCE-RLS and tenant-scoped; a wave's Rhema-arm runs can span billing
// workspaces, so this cross-run reporting read runs under the `rhema_benchmark` role, which BYPASSRLS and is granted
// SELECT on usage_records for exactly this join (migration 0013) — it never runs under `rhema_app`'s tenant scope.

export interface ArmEconomics {
  /** arm runs included (Rhema arms with a run_id join usage; excluded / probe-failed runs are omitted). */
  readonly runs: number;
  readonly listCostUsd: number;
  readonly credits: number;
  readonly latencyMs: number;
  /** usage_records rows folded in (proxy source only — the meter of record). */
  readonly usageRows: number;
}

/**
 * Sum proxy-metered list cost + credits and wall-clock for one arm across a wave. Only non-excluded arm runs are
 * counted (a memorization-probe exclusion removes that draft×arm from the arm's numbers — REQ-EVAL-2).
 */
export async function armEconomics(
  exec: SqlExecutor,
  waveId: string,
  arm: string,
): Promise<ArmEconomics> {
  // Cost is summed from usage_records and wall-clock from arm_runs SEPARATELY — a single join would fan out an
  // arm run's latency across its many usage rows (double counting). CTEs keep the two aggregates independent.
  const row = (
    await exec.query(
      `with arm as (
         select id, run_id, latency_ms from benchmark_arm_runs
          where wave_id = $1 and arm = $2 and excluded = false
       ),
       arm_runs as (
         select distinct run_id from arm where run_id is not null
       ),
       usage as (
         select u.list_cost_usd, u.credits from usage_records u
           join arm_runs on arm_runs.run_id = u.run_id
          where u.source = 'proxy'
       )
       select
         (select count(*) from arm)::int as runs,
         coalesce((select sum(list_cost_usd) from usage), 0)::float8 as list_cost_usd,
         coalesce((select sum(credits) from usage), 0)::bigint as credits,
         coalesce((select sum(latency_ms) from arm), 0)::bigint as latency_ms,
         (select count(*) from usage)::int as usage_rows`,
      [waveId, arm],
    )
  ).rows[0] as {
    runs: number;
    list_cost_usd: number;
    credits: number | string;
    latency_ms: number | string;
    usage_rows: number;
  };
  return {
    runs: Number(row.runs),
    listCostUsd: Number(row.list_cost_usd),
    credits: Number(row.credits),
    latencyMs: Number(row.latency_ms),
    usageRows: Number(row.usage_rows),
  };
}

/**
 * Recall-per-dollar (REQ-EVAL-14). `recall` is the arm's material-issue recall in [0,1]; `costUsd` the proxy-metered
 * list cost. Returns null for a zero-cost arm (an offline arm, or a not-yet-metered run) — a ratio over $0 is
 * undefined, never reported as infinite lift.
 */
export function recallPerDollar(recall: number, costUsd: number): number | null {
  if (costUsd <= 0) return null;
  return recall / costUsd;
}
