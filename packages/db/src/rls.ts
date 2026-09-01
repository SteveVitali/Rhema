// RLS wrapper (skeleton, P0.01). Tenancy uses FORCE ROW LEVEL SECURITY with `SET LOCAL` only
// (REQ-ARCH-25/26/27; REQ-DATA-4). The actual policies land in P0.02; here we fix the wrapper shape
// every tenant-scoped query must go through so no later ticket forgets the `SET LOCAL tenant`.

export interface TenantTx {
  /** Execute raw SQL within the transaction (Drizzle/pg transaction handle in P0.02). */
  execute(sql: string): Promise<unknown>;
}

/**
 * Run `fn` inside a transaction with `SET LOCAL app.tenant_id = <tenantId>` so RLS scopes every
 * statement to the tenant. Skeleton: P0.02 wires the real Drizzle transaction + policies.
 */
export async function withTenant<T>(
  tx: TenantTx,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error("withTenant requires a tenantId (RLS scope)");
  // SET LOCAL is transaction-scoped; a parameterized form replaces this string build in P0.02.
  await tx.execute(`SET LOCAL app.tenant_id = '${tenantId.replace(/'/g, "''")}'`);
  return fn(tx);
}
