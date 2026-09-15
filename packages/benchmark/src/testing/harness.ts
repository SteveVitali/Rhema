import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@rhema/db";
import type { BenchmarkDeps, SqlExecutor } from "../types.js";
import { InMemoryEnclaveBlobStore } from "../enclave.js";

// PGlite-backed test harness for @rhema/benchmark — the chain's deterministic DB-test pattern (real @rhema/db
// migrations applied in-process; no DB service). The benchmark tables are not RLS-scoped, so a bare executor is
// enough; usage_records IS RLS-forced but PGlite's superuser bypasses RLS, so the economics join runs directly.

export interface BenchmarkTestDb {
  readonly pg: PGlite;
  readonly exec: SqlExecutor;
  close(): Promise<void>;
}

export async function createBenchmarkTestDb(): Promise<BenchmarkTestDb> {
  const pg = new PGlite();
  await applyMigrations({
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params),
  });
  const exec: SqlExecutor = { query: (sql, params) => pg.query(sql, params as unknown[]) };
  return { pg, exec, close: () => pg.close() };
}

/** Deterministic id factory (prefix + zero-padded counter) + a fixed clock — like every DI'd package on the chain. */
export function testDeps(seed = 0): BenchmarkDeps {
  let n = seed;
  return {
    ids: (p: string) => `${p}_${(n++).toString().padStart(6, "0")}`,
    clock: { now: () => new Date("2026-09-03T00:00:00.000Z") },
  };
}

export { InMemoryEnclaveBlobStore };

/**
 * Insert a proxy-metered usage_records row (the meter of record) for the economics-join test. Only the columns the
 * economics scorer sums are meaningful; the rest carry benign fixtures. `workspace_id` is required (RLS column) but
 * unscoped here (PGlite superuser).
 */
export async function seedUsageRecord(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: {
    runId: string;
    listCostUsd: number;
    credits: number;
    source?: string;
    workspaceId?: string;
    model?: string;
  },
): Promise<string> {
  const id = deps.ids("usage");
  const ws = input.workspaceId ?? "ws_bench";
  // usage_records FK-references workspaces + billing_accounts — seed them idempotently.
  await exec.query(`insert into billing_accounts(id) values ('ba_bench') on conflict (id) do nothing`);
  await exec.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ($1,'personal','Bench','ba_bench')
       on conflict (id) do nothing`,
    [ws],
  );
  await exec.query(
    `insert into usage_records
       (id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
        rate_table_version, list_cost_usd, credits, source)
     values ($1,$2,$3,$4,$5,1,'agent','anthropic',$6,'base',1,$7,$8,$9)`,
    [
      id,
      deps.clock.now(),
      ws,
      "ba_bench",
      input.runId,
      input.model ?? "claude-3-5-sonnet",
      input.listCostUsd,
      input.credits,
      input.source ?? "proxy",
    ],
  );
  return id;
}
