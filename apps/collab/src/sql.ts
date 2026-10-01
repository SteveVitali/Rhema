// The collab service's database seam (P1.03; REQ-DATA-4/REQ-ARCH-25). `CollabDb` is the minimal
// structural surface the extension + HTTP routes need: an unscoped `query` for the pre-auth session
// read (session/workspace_members/workspaces are NOT tenant-RLS'd — the tenant doesn't exist yet)
// and `scoped(workspaceId, fn)` for EVERYTHING else — a dedicated checked-out connection inside
// `withTenant` so every document/materialization statement runs under RLS with `app.tenant_id` set.
// The live binding connects as the `rhema_collab` role (DATABASE_URL) — grants in migration 0028 —
// never a superuser/owner connection.

import { withTenant, type TenantClient } from "@rhema/db";

export interface CollabDb {
  /** Unscoped query — ONLY for the auth tables (session → workspace resolution). */
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  /** Run `fn` inside a tenant-scoped transaction on a dedicated connection (RLS backstop). */
  scoped<T>(workspaceId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T>;
}

/** The pool surface the live binding needs (pg.Pool satisfies it; tests inject their own). */
export interface CollabPool {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  connect(): Promise<TenantClient & { release(): void }>;
}

/** The live binding: `scoped` checks out a pooled client so concurrent docs never share a tenant tx. */
export function createCollabDb(pool: CollabPool): CollabDb {
  return {
    query: (sql, params) => pool.query(sql, params),
    async scoped<T>(workspaceId: string, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        return await withTenant(client, workspaceId, fn);
      } finally {
        client.release();
      }
    },
  };
}
