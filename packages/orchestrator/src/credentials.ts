// Per-run proxy credential revocation (REQ-SPEC-11). Rotation (per attempt) and terminal revocation both flow
// through here. `proxy_credentials` is NOT under RLS, so revocation works under any tenant scope. Kept in its
// own module so both provisioning (rotation) and the internal API's terminal transitions (finalize/fail) use
// it without an import cycle.

import type { SqlClient } from "./tx.js";

/** Revoke every live credential for a run, inside the caller's transaction.
 *
 * SEC.1 (REQ-SPEC-30): the write crosses the proxy-table grant boundary through
 * `rhema_revoke_run_credentials` — a 0045 SECURITY DEFINER function the `rhema_app` role may EXECUTE.
 * The function additionally enforces tenant scope: a user-pool transaction (app.tenant_id = a real
 * workspace) may only revoke credentials on ITS OWN runs; the system scope (__system__ or unset)
 * revokes unconditionally. The row-level update itself stays atomic with the caller's transition.
 */
export async function revokeRunCredentials(tx: SqlClient, runId: string, now: Date): Promise<void> {
  await tx.query("select public.rhema_revoke_run_credentials($1, $2)", [runId, now]);
}
