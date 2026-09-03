// The SQL + transaction seams the orchestrator writes through.
//
// `SqlClient` is the structural query interface node-postgres (pg.Pool/PoolClient) and PGlite both satisfy
// (the same shape @rhema/db's `TenantClient` and egress-proxy's `SqlExecutor` use). `TxRunner.run` opens one
// transaction, sets the RLS tenant (`app.tenant_id`) for it, and runs the callback with the transaction's
// client — so a state transition and its event append (REQ-DATA-33) commit or roll back together.

export interface SqlClient {
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: unknown[] }>;
}

export interface TxRunner {
  /**
   * Run `fn` inside one transaction scoped to `tenantId` (RLS). Commits on resolve, rolls back on throw.
   * A single-run guarantee: everything `fn` does is atomic.
   */
  run<T>(tenantId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T>;
}
