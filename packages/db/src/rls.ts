// RLS transaction wrapper (REQ-DATA-4 amended; REQ-ARCH-25/26/27). Tenancy uses FORCE ROW LEVEL SECURITY with
// the tenant set ONLY here, via `SET LOCAL app.tenant_id` — expressed as parameterized `set_config(…, true)` so
// the tenant id can never be string-concatenated into SQL. This is the single sanctioned place to scope a
// connection to a tenant; a lint (eslint-plugin-rhema/no-raw-set-tenant) forbids a raw `SET app.tenant_id`
// anywhere else. The pooled connection is authenticated as a NON-OWNER application role, so the policies bind
// even though the wrapper itself issues no GRANT; SET LOCAL is transaction-scoped, so a reused pooled
// connection carries no tenant across `withTenant` calls (the two-tenant isolation test proves it).

/** The minimal pg-style connection the wrapper needs (both node-postgres Client and PGlite satisfy it). */
export interface TenantClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * Run `fn` inside a transaction scoped to `tenantId` (a workspace id). Sets `app.tenant_id` with `SET LOCAL`
 * semantics via parameterized `set_config`, so RLS filters every statement to the tenant; commits on success,
 * rolls back on error. Passing an empty tenant is a programming error (it would disable the policy → deny-all).
 */
export async function withTenant<T>(
  client: TenantClient,
  tenantId: string,
  fn: (tx: TenantClient) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error("withTenant requires a non-empty tenantId (RLS scope)");
  await client.query("begin");
  try {
    // SET LOCAL app.tenant_id = $tenantId — parameterized, transaction-local (the `true` third arg).
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback");
    throw err;
  }
}
