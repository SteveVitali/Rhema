// The live `TxRunner` binding (D-P0.08-1): one transaction per run, scoped to the RLS tenant, over a
// node-postgres `pg.Pool`. Checks out a dedicated pooled client so `BEGIN` / `SET LOCAL app.tenant_id` /
// `COMMIT` all run on the SAME connection, then releases it. The tenant is set through @rhema/db's `withTenant`
// (the single sanctioned place — REQ-DATA-4), so a state transition and its event append commit or roll back
// together. `pg`'s `PoolClient.query` is structurally the orchestrator's `SqlClient`; a thin adapter narrows it
// to the two-arg shape the seam declares. This is a thin wrapper over a heavy client library — its correctness
// is proven on the wire (a live `pg` round-trip; the offline test skips without `DATABASE_URL`).

import type { Pool, PoolClient } from "pg";
import { withTenant } from "@rhema/db";
import type { SqlClient, TxRunner } from "@rhema/orchestrator";

/** Narrow a `pg` `PoolClient` to the orchestrator's `SqlClient` (query text + params → `{ rows }`). */
export function pgClientToSqlClient(client: Pick<PoolClient, "query">): SqlClient {
  return {
    async query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }> {
      const res = await client.query(sql, params ? [...params] : undefined);
      return { rows: res.rows as unknown[] };
    },
  };
}

/** `TxRunner` over a `pg.Pool` — the deploy binding behind the orchestrator's tx seam. */
export class PgPoolTxRunner implements TxRunner {
  constructor(private readonly pool: Pool) {}

  async run<T>(tenantId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      // withTenant issues BEGIN / SET LOCAL app.tenant_id / COMMIT|ROLLBACK on this one checked-out connection.
      return await withTenant(client, tenantId, () => fn(pgClientToSqlClient(client)));
    } finally {
      client.release();
    }
  }
}
