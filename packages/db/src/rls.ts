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
 * The user-serving LOGIN role (0045; REQ-SPEC-30): a NOBYPASSRLS member of `rhema_app` that the api's and
 * worker's `DATABASE_URL` pools authenticate as. `withTenant`'s `role` option + the test harnesses bind it so
 * the suite exercises the exact privilege/RLS posture prod runs; a mispointed `DATABASE_URL` at a bypass role
 * still cannot see cross-tenant rows on the tenant path.
 */
export const USER_SERVING_ROLE = "rhema_app_login";

export interface WithTenantOpts {
  /**
   * Run the transaction's statements AS this role (`set_config('role', …, true)` — the parameterized,
   * transaction-local form of `SET LOCAL ROLE`). Defense in depth: the pool authenticates as the role
   * already, so this pin makes a wrongly-privileged connection string fail closed instead of silently
   * bypassing RLS. Requires the session user to hold the role (a superuser holds all).
   */
  readonly role?: string;
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
  opts: WithTenantOpts = {},
): Promise<T> {
  if (!tenantId) throw new Error("withTenant requires a non-empty tenantId (RLS scope)");
  await client.query("begin");
  try {
    // SET LOCAL ROLE <user-serving role> — before the tenant GUC so every statement (the GUC set included)
    // runs under the role's privileges. Parameterized set_config: the role name can never be concatenated.
    if (opts.role) await client.query("select set_config('role', $1, true)", [opts.role]);
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
