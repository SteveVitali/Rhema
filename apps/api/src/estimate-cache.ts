// The live `EstimateCacheStore` binding (DEF.2 F6; closes the cache half of D-PRB.03-1). Backs the
// estimate route's cache seam with the Postgres `estimate_cache` table (0002 + 0017's
// claim_count/provisional). The table carries NO tenant key — a cache row is keyed by the
// `(draft sha, workflow, rigor, tier[, variant][, scope])` tuple, an unguessable content hash is the
// access boundary, and the row is derived data — so it needs no RLS scope and `rhema_app` holds full
// DML on it (0025). Bind it on the ordinary app pool.

import type { IdFactory } from "@rhema/orchestrator";
import type { CachedEstimate, EstimateCacheStore } from "./estimate-routes.js";

/** The minimal executor surface — a pg.Pool, a scoped client, or a PGlite handle all satisfy it. */
export interface SqlExecutor {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

interface CacheRow {
  readonly estimate_credits: number;
  readonly cap_credits: number;
  readonly rate_table_version: number;
  readonly claim_count: number | null;
  readonly provisional: boolean;
}

export class SqlEstimateCacheStore implements EstimateCacheStore {
  constructor(
    private readonly db: SqlExecutor,
    private readonly ids: IdFactory,
  ) {}

  async get(cacheKey: string): Promise<CachedEstimate | null> {
    const row = (
      await this.db.query(
        `select estimate_credits, cap_credits, rate_table_version, claim_count, provisional
           from estimate_cache where cache_key = $1`,
        [cacheKey],
      )
    ).rows[0] as CacheRow | undefined;
    if (!row) return null;
    return {
      estimateCredits: row.estimate_credits,
      capCredits: row.cap_credits,
      rateTableVersion: row.rate_table_version,
      claimCount: row.claim_count ?? null,
      provisional: row.provisional,
    };
  }

  async put(cacheKey: string, row: CachedEstimate): Promise<void> {
    // `cache_key` is unique — two racing refine calls for the same draft tuple collapse into one row
    // (last write wins on the figures; never a duplicate-key 500).
    await this.db.query(
      `insert into estimate_cache(id, cache_key, estimate_credits, cap_credits, rate_table_version, claim_count, provisional)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (cache_key) do update set
         estimate_credits = excluded.estimate_credits,
         cap_credits = excluded.cap_credits,
         rate_table_version = excluded.rate_table_version,
         claim_count = excluded.claim_count,
         provisional = excluded.provisional`,
      [
        this.ids("ec"),
        cacheKey,
        row.estimateCredits,
        row.capCredits,
        row.rateTableVersion,
        row.claimCount,
        row.provisional,
      ],
    );
  }
}
