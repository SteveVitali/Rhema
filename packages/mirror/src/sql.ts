// The minimal structural SQL surface the mirror needs — a `query(sql, params?)` that returns `{ rows }`.
// Kept structural (not a dependency on @rhema/orchestrator's `SqlClient`) so the same code runs against a
// PGlite handle, a `pg` client, or a caller-supplied transaction: materialize/harvest read committed artifact
// rows, and the delivery transaction runs inside the orchestrator's finalize tx (the caller passes its `tx`).

export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}
